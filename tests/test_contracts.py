import json
import unittest
from pathlib import Path

from contracts.models import (
    CaseExtraction,
    ClinicalNoteInput,
    EvaluationReport,
    OptimizationRequest,
    OptimizationResult,
    PriorityAssessment,
)


ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "samples" / "v1"


class ContractSampleTests(unittest.TestCase):
    def validate_sample(self, filename, model):
        payload = json.loads((SAMPLES / filename).read_text(encoding="utf-8"))
        validated = model.model_validate(payload)
        self.assertEqual(validated.contract_version, "v1")

    def test_all_v1_samples(self):
        cases = [
            ("clinical-note-input.json", ClinicalNoteInput),
            ("case-extraction.json", CaseExtraction),
            ("priority-assessment.json", PriorityAssessment),
            ("optimization-request.json", OptimizationRequest),
            ("optimization-result.json", OptimizationResult),
            ("evaluation-report.json", EvaluationReport),
        ]
        for filename, model in cases:
            with self.subTest(filename=filename):
                self.validate_sample(filename, model)

    def test_unknown_fields_are_rejected(self):
        payload = json.loads((SAMPLES / "clinical-note-input.json").read_text(encoding="utf-8"))
        payload["unexpected_field"] = True
        with self.assertRaises(Exception):
            ClinicalNoteInput.model_validate(payload)


if __name__ == "__main__":
    unittest.main()
