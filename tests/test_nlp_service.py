import csv
import io
import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from contracts.models import ClinicalNoteInput, Urgency
from services.nlp_service.annotations import create_annotation_template
from services.nlp_service.batch import process_jsonl
from services.nlp_service.evaluation import evaluate_jsonl
from services.nlp_service.extractor import RuleBasedExtractor, to_case_extraction
from services.nlp_service.pmc_patients import build_subset
from services.nlp_service.providers import OpenAIExtractor, ProviderError, extract_case
from services.nlp_service.synthetic_benchmark import write_benchmark


ROOT = Path(__file__).resolve().parents[1]


class RuleBasedExtractionTests(unittest.TestCase):
    def test_explicit_emergency_and_procedure_are_extracted(self):
        note = ClinicalNoteInput(
            case_id="CASE-001",
            language="en",
            submitted_at=datetime.fromisoformat("2026-08-20T09:00:00+01:00"),
            note_text=(
                "The patient has acute appendicitis. Emergency laparoscopic appendectomy "
                "is required immediately and must start within 6 hours. "
                "The expected operating time is 75 minutes."
            ),
        )
        draft = RuleBasedExtractor().extract(note)
        result = to_case_extraction(note, draft, "test-rules")

        self.assertEqual(result.procedure, "Laparoscopic appendectomy")
        self.assertEqual(result.speciality, "General Surgery")
        self.assertEqual(result.urgency, Urgency.EMERGENCY)
        self.assertEqual(result.recommended_time_window_hours, 6)
        self.assertEqual(result.estimated_duration_minutes, 75)
        self.assertEqual(result.urgency_source, "explicit")
        self.assertGreaterEqual(result.urgency_confidence, 0.9)
        self.assertFalse(result.human_review_required)

    def test_missing_urgency_is_not_silently_called_elective(self):
        note = ClinicalNoteInput(
            case_id="CASE-002",
            language="en",
            note_text="The patient reports intermittent abdominal discomfort.",
        )
        draft = RuleBasedExtractor().extract(note)
        result = to_case_extraction(note, draft, "test-rules")

        self.assertEqual(result.urgency, Urgency.UNKNOWN)
        self.assertEqual(result.urgency_source, "unknown")
        self.assertTrue(result.human_review_required)
        self.assertTrue(result.warnings)


class PmcPatientsPreprocessorTests(unittest.TestCase):
    def test_only_surgical_rows_are_written(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "pmc.csv"
            target = Path(temp_dir) / "subset.jsonl"
            with source.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=["patient_uid", "patient"])
                writer.writeheader()
                writer.writerow({"patient_uid": "1-1", "patient": "The patient underwent appendectomy."})
                writer.writerow({"patient_uid": "2-1", "patient": "The patient received oral medication."})

            count = build_subset(source, target, limit=10)
            rows = [json.loads(line) for line in target.read_text(encoding="utf-8").splitlines()]

        self.assertEqual(count, 1)
        self.assertEqual(rows[0]["case_id"], "PMC-1-1")
        self.assertEqual(rows[0]["language"], "en")

    def test_annotation_template_and_batch_output(self):
        note = ClinicalNoteInput(
            case_id="PMC-TEST-1",
            note_text="Urgent appendectomy is required within 24 hours.",
            language="en",
            source="PMC-Patients",
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "input.jsonl"
            annotation_target = Path(temp_dir) / "annotations.csv"
            extraction_target = Path(temp_dir) / "extractions.jsonl"
            source.write_text(note.model_dump_json() + "\n", encoding="utf-8")

            annotation_count = create_annotation_template(source, annotation_target, limit=10)
            summary = process_jsonl(source, extraction_target, provider="rules")
            extraction = json.loads(extraction_target.read_text(encoding="utf-8"))

        self.assertEqual(annotation_count, 1)
        self.assertEqual(summary["processed"], 1)
        self.assertEqual(extraction["urgency"], "URGENT")


class EvaluationTests(unittest.TestCase):
    def test_reference_evaluation_dataset_is_perfect_for_rules_baseline(self):
        report = evaluate_jsonl(ROOT / "samples" / "v1" / "nlp-evaluation.jsonl", "rules")

        self.assertEqual(report["cases"], 4)
        self.assertEqual(report["procedure_accuracy"], 1.0)
        self.assertEqual(report["speciality_accuracy"], 1.0)
        self.assertEqual(report["urgency_accuracy"], 1.0)
        self.assertEqual(report["duration_mae_minutes"], 0.0)

    def test_synthetic_benchmark_has_100_balanced_reference_cases(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "synthetic-gold.jsonl"
            manifest = write_benchmark(target, 100)
            rows = [json.loads(line) for line in target.read_text(encoding="utf-8").splitlines()]

        self.assertEqual(manifest["cases"], 100)
        self.assertEqual(manifest["urgency_distribution"], {
            "EMERGENCY": 25,
            "EXPEDITED": 25,
            "ROUTINE": 25,
            "URGENT": 25,
        })
        self.assertEqual(len({row["input"]["case_id"] for row in rows}), 100)
        self.assertTrue(all(row["expected"]["reference_origin"] == "deterministic-template" for row in rows))


class OpenAIProviderTests(unittest.TestCase):
    def test_structured_response_is_parsed_without_network_access(self):
        draft_payload = {
            "procedure": "Laparoscopic appendectomy",
            "speciality": "General Surgery",
            "urgency": "EMERGENCY",
            "urgency_confidence": 0.96,
            "urgency_source": "explicit",
            "recommended_time_window_hours": 6,
            "estimated_duration_minutes": 75,
            "required_doctors": [],
            "required_nurses": None,
            "required_theatre_type": None,
            "required_bed_type": None,
            "evidence": ["Emergency laparoscopic appendectomy is required."],
            "urgency_evidence": ["Emergency laparoscopic appendectomy is required."],
            "warnings": [],
            "confidence": 0.94,
        }
        api_payload = {
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": json.dumps(draft_payload)}],
                }
            ]
        }
        fake_response = io.BytesIO(json.dumps(api_payload).encode("utf-8"))
        note = ClinicalNoteInput(case_id="OPENAI-MOCK-1", note_text="Emergency appendectomy.")

        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-placeholder"}, clear=False), patch(
            "services.nlp_service.providers.urlopen", return_value=fake_response
        ) as mocked_urlopen:
            result = OpenAIExtractor().extract(note)

        self.assertEqual(result.urgency, Urgency.EMERGENCY)
        self.assertEqual(result.procedure, "Laparoscopic appendectomy")
        request = mocked_urlopen.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/responses"))
        self.assertNotIn("sk-test-placeholder", request.data.decode("utf-8"))

    def test_provider_failure_uses_rules_and_records_warning(self):
        note = ClinicalNoteInput(
            case_id="OPENAI-MOCK-2",
            note_text="Emergency appendectomy is required immediately.",
        )
        environment = {
            "OPENAI_API_KEY": "sk-test-placeholder",
            "NLP_PROVIDER": "openai",
            "NLP_ALLOW_RULE_FALLBACK": "true",
        }
        with patch.dict(os.environ, environment, clear=False), patch.object(
            OpenAIExtractor, "extract", side_effect=ProviderError("simulated provider failure")
        ):
            result = extract_case(note)

        self.assertEqual(result.extractor_version, "rules-v1:openai-fallback")
        self.assertTrue(any("simulated provider failure" in warning for warning in result.warnings))


if __name__ == "__main__":
    unittest.main()
