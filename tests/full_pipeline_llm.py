"""LLM-generated end-to-end validation for all four TheatreFlow modules.

The generator creates synthetic, de-identified English notes with reference labels.
Those labels are used only for evaluation; the four services receive the note text.
No API key or real patient data is written to the test artifact.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "tests" / "artifacts"
URGENCY_RANK = {"UNKNOWN": 0, "ROUTINE": 1, "EXPEDITED": 2, "URGENT": 3, "EMERGENCY": 4}
SIGNIFICANT_WORDS = {
    "the", "and", "for", "with", "from", "open", "surgery", "surgical", "procedure"
}


GENERATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "cases": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "note_text": {"type": "string"},
                    "expected_procedure": {"type": "string"},
                    "expected_speciality": {"type": "string"},
                    "expected_urgency": {
                        "type": "string",
                        "enum": ["ROUTINE", "EXPEDITED", "URGENT", "EMERGENCY"],
                    },
                    "expected_duration_minutes": {"type": "integer", "minimum": 30, "maximum": 360},
                    "expected_doctor_roles": {"type": "array", "items": {"type": "string"}},
                    "expected_nurses": {"type": "integer", "minimum": 0, "maximum": 4},
                    "expected_theatre_type": {"type": "string"},
                    "expected_bed_type": {
                        "type": ["string", "null"],
                    },
                },
                "required": [
                    "note_text",
                    "expected_procedure",
                    "expected_speciality",
                    "expected_urgency",
                    "expected_duration_minutes",
                    "expected_doctor_roles",
                    "expected_nurses",
                    "expected_theatre_type",
                    "expected_bed_type",
                ],
            },
        }
    },
    "required": ["cases"],
}


def _response_output_text(payload: dict) -> str | None:
    if payload.get("output_text"):
        return payload["output_text"]
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                return content["text"]
    return None


def generate_cases(count: int) -> tuple[list[dict], str]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not available to the pipeline test process")
    model = os.environ.get("NLP_OPENAI_MODEL", "gpt-5.6-luna").strip()
    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    prompt = f"""Generate exactly {count} fictional English surgical scheduling notes for software testing.
The cases must be diverse in procedure, speciality, age, urgency and resource needs. Include at
least one case in each urgency category: ROUTINE, EXPEDITED, URGENT and EMERGENCY. Every note
must explicitly state the procedure, speciality, urgency/time window, estimated operating time,
doctor roles, nurse count, theatre type and any postoperative bed type. Make the reference fields
exactly match the facts stated in the note. Use only generic descriptions such as 'a 67-year-old
patient': no names, addresses, hospital numbers, NHS numbers, phone numbers, emails or exact dates.
These are synthetic test cases, not medical advice. Return only the requested schema."""
    body = {
        "model": model,
        "instructions": "Create diverse, internally consistent synthetic healthcare test data.",
        "input": prompt,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "synthetic_surgical_cases",
                "strict": True,
                "schema": GENERATION_SCHEMA,
            }
        },
    }
    request = Request(
        f"{base_url}/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=120) as response:
            payload = json.load(response)
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"LLM generation failed with HTTP {error.code}: {detail}") from error
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"LLM generation failed: {error}") from error
    output_text = _response_output_text(payload)
    if not output_text:
        raise RuntimeError("LLM generation response did not contain output_text")
    generated = json.loads(output_text)
    cases = generated.get("cases", [])
    if len(cases) != count:
        raise RuntimeError(f"LLM returned {len(cases)} cases; expected {count}")
    return cases, model


def post_json(url: str, payload: dict, timeout: int = 90) -> dict:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"{url} returned HTTP {error.code}: {detail}") from error


def get_json(url: str) -> dict:
    with urlopen(url, timeout=5) as response:
        return json.load(response)


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", value.upper()).strip("_")
    return cleaned[:40] or "GENERIC"


def _next_half_hour(now: datetime) -> datetime:
    rounded = now.replace(second=0, microsecond=0, minute=0) + timedelta(
        hours=1 if now.minute >= 30 else 0,
        minutes=0 if now.minute >= 30 else 30,
    )
    return rounded


def _procedure_similarity(expected: str, actual: str) -> float:
    tokens = lambda value: {
        token for token in re.findall(r"[a-z0-9]+", value.lower())
        if len(token) > 2 and token not in SIGNIFICANT_WORDS
    }
    expected_tokens = tokens(expected)
    actual_tokens = tokens(actual)
    return len(expected_tokens & actual_tokens) / len(expected_tokens) if expected_tokens else 1.0


def validate_generated_cases(cases: list[dict]) -> tuple[list[str], dict]:
    failures: list[str] = []
    urgencies = Counter(case["expected_urgency"] for case in cases)
    for urgency in ("ROUTINE", "EXPEDITED", "URGENT", "EMERGENCY"):
        if not urgencies[urgency]:
            failures.append(f"generation: missing required urgency category {urgency}")
    notes = [case["note_text"].strip() for case in cases]
    if len(set(notes)) != len(notes):
        failures.append("generation: duplicate note_text values")
    pii_patterns = {
        "email": r"\b[\w.+-]+@[\w.-]+\.\w+\b",
        "phone": r"\b(?:\+?\d[\d ()-]{7,}\d)\b",
        "NHS-like number": r"\b\d{3}\s?\d{3}\s?\d{4}\b",
    }
    for index, note in enumerate(notes, start=1):
        for label, pattern in pii_patterns.items():
            if re.search(pattern, note):
                failures.append(f"generation case {index}: possible {label} detected")
    return failures, {"urgency_distribution": dict(urgencies), "unique_notes": len(set(notes))}


def build_resources(extractions: list[dict], start: datetime, end: datetime) -> list[dict]:
    resources: list[dict] = []
    interval = {"available_from": start.isoformat(), "available_to": end.isoformat()}
    doctor_roles = sorted({role for case in extractions for role in case["required_doctors"]})
    for role in doctor_roles:
        resources.append(
            {
                "resource_type": "doctor",
                "resource_code": f"DOC_{_slug(role)}_1",
                "speciality": None,
                **interval,
                "attributes": {"role": role},
            }
        )
    nurse_count = max((case["required_nurses"] for case in extractions), default=0)
    for index in range(1, max(nurse_count, 1) + 1):
        resources.append(
            {
                "resource_type": "nurse",
                "resource_code": f"NURSE_GENERAL_{index}",
                "speciality": None,
                **interval,
                "attributes": {},
            }
        )
    theatre_types = sorted(
        {case["required_theatre_type"] for case in extractions if case["required_theatre_type"]}
    )
    for theatre_type in theatre_types:
        resources.append(
            {
                "resource_type": "theatre",
                "resource_code": f"THEATRE_{_slug(theatre_type)}",
                "speciality": None,
                **interval,
                "attributes": {"theatre_type": theatre_type},
            }
        )
    for speciality in sorted({case["speciality"] for case in extractions}):
        resources.append(
            {
                "resource_type": "theatre",
                "resource_code": f"THEATRE_SPEC_{_slug(speciality)}",
                "speciality": speciality,
                **interval,
                "attributes": {},
            }
        )
    bed_types = sorted({case["required_bed_type"] for case in extractions if case["required_bed_type"]})
    for bed_type in bed_types:
        resources.append(
            {
                "resource_type": "bed",
                "resource_code": f"BED_{_slug(bed_type)}_1",
                "speciality": None,
                **interval,
                "attributes": {"bed_type": bed_type},
            }
        )
    return resources


def independent_conflicts(allocations: list[dict]) -> int:
    occupied: dict[tuple[str, str], list[tuple[str, datetime, datetime]]] = defaultdict(list)
    conflicts = 0
    for allocation in allocations:
        if allocation["status"] != "SCHEDULED":
            continue
        start = datetime.fromisoformat(allocation["start_datetime"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(allocation["end_datetime"].replace("Z", "+00:00"))
        for resource in allocation["resources"]:
            key = (resource["resource_type"], resource["resource_code"])
            for other_case, other_start, other_end in occupied[key]:
                if other_case != allocation["case_id"] and start < other_end and other_start < end:
                    conflicts += 1
            occupied[key].append((allocation["case_id"], start, end))
    return conflicts


def independent_fairness(allocations: list[dict]) -> float:
    workload: dict[str, float] = defaultdict(float)
    for allocation in allocations:
        if allocation["status"] != "SCHEDULED":
            continue
        start = datetime.fromisoformat(allocation["start_datetime"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(allocation["end_datetime"].replace("Z", "+00:00"))
        minutes = (end - start).total_seconds() / 60
        for resource in allocation["resources"]:
            if resource["resource_type"] == "doctor":
                workload[resource["resource_code"]] += minutes
    values = list(workload.values())
    squares = sum(value * value for value in values)
    return round((sum(values) ** 2) / (len(values) * squares), 4) if squares else 1.0


def run(count: int, cases_file: Path | None = None) -> dict:
    service_urls = {
        "nlp": os.environ.get("NLP_SERVICE_URL", "http://127.0.0.1:8101").rstrip("/"),
        "priority": os.environ.get("PRIORITY_SERVICE_URL", "http://127.0.0.1:8102").rstrip("/"),
        "optimizer": os.environ.get("OPTIMIZER_SERVICE_URL", "http://127.0.0.1:8103").rstrip("/"),
        "evaluation": os.environ.get("EVALUATION_SERVICE_URL", "http://127.0.0.1:8104").rstrip("/"),
    }
    health = {name: get_json(f"{url}/health") for name, url in service_urls.items()}
    if cases_file is None:
        generated, generator_model = generate_cases(count)
    else:
        fixture = json.loads(cases_file.read_text(encoding="utf-8"))
        generated = fixture.get("cases", [])
        generator_model = fixture.get("generator_model", "llm-fixture")
        if len(generated) != count:
            raise RuntimeError(f"LLM fixture contains {len(generated)} cases; expected {count}")
    failures, generation_checks = validate_generated_cases(generated)
    warnings: list[str] = []

    now = datetime.now(timezone.utc)
    planning_start = _next_half_hour(now)
    extractions: list[dict] = []
    priorities: list[dict] = []
    case_results: list[dict] = []
    for index, expected in enumerate(generated, start=1):
        case_id = f"LLM-E2E-{now:%Y%m%d%H%M%S}-{index:02d}"
        extracted = post_json(
            f"{service_urls['nlp']}/extract",
            {
                "contract_version": "v1",
                "case_id": case_id,
                "note_text": expected["note_text"],
                "language": "en",
                "source": "llm-e2e-test",
                "deidentified": True,
                "submitted_at": planning_start.isoformat(),
            },
        )
        priority = post_json(f"{service_urls['priority']}/score", extracted)
        extractions.append(extracted)
        priorities.append(priority)

        urgency_match = extracted["urgency"] == expected["expected_urgency"]
        speciality_match = _slug(extracted["speciality"]) == _slug(expected["expected_speciality"])
        procedure_similarity = round(
            _procedure_similarity(expected["expected_procedure"], extracted["procedure"]), 3
        )
        duration_error = abs(extracted["estimated_duration_minutes"] - expected["expected_duration_minutes"])
        duration_tolerance = max(30, expected["expected_duration_minutes"] * 0.35)
        openai_used = extracted["extractor_version"].startswith("openai:")
        priority_not_downgraded = (
            URGENCY_RANK[priority["priority_level"]] >= URGENCY_RANK[extracted["urgency"]]
            or extracted["urgency"] == "UNKNOWN"
        )
        if not openai_used:
            failures.append(f"{case_id}: NLP used {extracted['extractor_version']} instead of OpenAI")
        if not urgency_match:
            warnings.append(
                f"{case_id}: expected urgency {expected['expected_urgency']}, NLP returned {extracted['urgency']}"
            )
        if not speciality_match:
            warnings.append(
                f"{case_id}: speciality wording differs ({expected['expected_speciality']} vs {extracted['speciality']})"
            )
        if procedure_similarity < 0.5:
            warnings.append(f"{case_id}: low procedure token recall {procedure_similarity}")
        if duration_error > duration_tolerance:
            warnings.append(f"{case_id}: duration error {duration_error} minutes")
        if not priority_not_downgraded:
            failures.append(f"{case_id}: priority service downgraded clinical urgency")
        case_results.append(
            {
                "case_id": case_id,
                "expected": expected,
                "extraction": extracted,
                "priority": priority,
                "checks": {
                    "openai_used": openai_used,
                    "urgency_match": urgency_match,
                    "speciality_match": speciality_match,
                    "procedure_token_recall": procedure_similarity,
                    "duration_error_minutes": duration_error,
                    "priority_not_downgraded": priority_not_downgraded,
                },
            }
        )

    horizon_start = planning_start
    horizon_end = horizon_start + timedelta(hours=12)
    resources = build_resources(extractions, horizon_start, horizon_end)
    optimization_request = {
        "contract_version": "v1",
        "run_id": f"LLM-E2E-RUN-{now:%Y%m%d%H%M%S}",
        "horizon_start": horizon_start.isoformat(),
        "horizon_end": horizon_end.isoformat(),
        "slot_minutes": 30,
        "max_solve_seconds": 30,
        "cases": [
            {"case": extracted, "priority": priority}
            for extracted, priority in zip(extractions, priorities)
        ],
        "resources": resources,
        "locked_assignments": [],
        "objective_weights": {
            "unscheduled_penalty": 1000,
            "priority": 10,
            "weighted_delay": 2,
        },
    }
    optimized = post_json(f"{service_urls['optimizer']}/solve", optimization_request, timeout=120)
    evaluated = post_json(f"{service_urls['evaluation']}/evaluate", optimized)

    allocations = optimized["allocations"]
    allocation_by_case = {allocation["case_id"]: allocation for allocation in allocations}
    if set(allocation_by_case) != {case["case_id"] for case in extractions}:
        failures.append("optimizer: allocation case IDs do not match input cases")
    independent_conflict_count = independent_conflicts(allocations)
    if independent_conflict_count:
        failures.append(f"optimizer: independently detected {independent_conflict_count} resource conflicts")
    scheduled_count = sum(allocation["status"] == "SCHEDULED" for allocation in allocations)
    expected_rate = round(scheduled_count / len(allocations), 4)
    if evaluated["metrics"]["total_conflicts"] != independent_conflict_count:
        failures.append("evaluation: conflict total does not match independent recalculation")
    if abs(evaluated["metrics"]["scheduled_rate"] - expected_rate) > 0.0001:
        failures.append("evaluation: scheduled rate does not match independent recalculation")
    fairness = independent_fairness(allocations)
    if abs(evaluated["workload_summary"]["jain_fairness_index"] - fairness) > 0.0001:
        failures.append("evaluation: Jain fairness does not match independent recalculation")

    extraction_by_case = {case["case_id"]: case for case in extractions}
    independent_deadline_breaches = 0
    independent_waiting_hours: list[float] = []
    for allocation in allocations:
        if allocation["status"] != "SCHEDULED":
            continue
        extracted = extraction_by_case[allocation["case_id"]]
        requested = datetime.fromisoformat(extracted["requested_datetime"].replace("Z", "+00:00"))
        start = datetime.fromisoformat(allocation["start_datetime"].replace("Z", "+00:00"))
        waiting = max(0.0, (start - requested).total_seconds() / 3600)
        independent_waiting_hours.append(waiting)
        if waiting > extracted["maximum_delay_hours"]:
            independent_deadline_breaches += 1
    if optimized["metrics"].get("deadline_breaches") != independent_deadline_breaches:
        failures.append("optimizer: deadline breach metric does not match independent recalculation")
    if evaluated["metrics"].get("deadline_breaches") != independent_deadline_breaches:
        failures.append("evaluation: deadline breach metric was not propagated correctly")
    if independent_deadline_breaches:
        failures.append(
            f"optimizer hard constraint: {independent_deadline_breaches} scheduled case(s) exceeded their clinical deadline"
        )
    for allocation in allocations:
        if allocation["status"] == "UNSCHEDULED" and not allocation.get("rejection_code"):
            failures.append(f"{allocation['case_id']}: unscheduled allocation has no rejection_code")

    for extracted in extractions:
        allocation = allocation_by_case.get(extracted["case_id"])
        if not allocation or allocation["status"] != "SCHEDULED":
            continue
        start = datetime.fromisoformat(allocation["start_datetime"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(allocation["end_datetime"].replace("Z", "+00:00"))
        if start < horizon_start or end > horizon_end:
            failures.append(f"{extracted['case_id']}: allocation lies outside the horizon")
        scheduled_minutes = (end - start).total_seconds() / 60
        required_minutes = math.ceil(extracted["estimated_duration_minutes"] / 30) * 30
        if scheduled_minutes != required_minutes:
            failures.append(f"{extracted['case_id']}: scheduled duration does not match slot-rounded duration")
        resource_counts = Counter(resource["resource_type"] for resource in allocation["resources"])
        if resource_counts["doctor"] < len(extracted["required_doctors"]):
            failures.append(f"{extracted['case_id']}: insufficient doctors in allocation")
        if resource_counts["nurse"] < extracted["required_nurses"]:
            failures.append(f"{extracted['case_id']}: insufficient nurses in allocation")
        if resource_counts["theatre"] != 1:
            failures.append(f"{extracted['case_id']}: allocation must contain exactly one theatre")
        if extracted["required_bed_type"] and resource_counts["bed"] != 1:
            failures.append(f"{extracted['case_id']}: required bed was not allocated")

    summary = {
        "status": "FAIL" if failures else ("PASS_WITH_WARNINGS" if warnings else "PASS"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator_model": generator_model,
        "case_count": count,
        "services": {
            name: health_payload["implementation_status"] for name, health_payload in health.items()
        },
        "generation_checks": generation_checks,
        "nlp_quality": {
            "openai_extractions": sum(case["checks"]["openai_used"] for case in case_results),
            "urgency_accuracy": round(
                sum(case["checks"]["urgency_match"] for case in case_results) / count, 4
            ),
            "speciality_accuracy": round(
                sum(case["checks"]["speciality_match"] for case in case_results) / count, 4
            ),
            "mean_procedure_token_recall": round(
                sum(case["checks"]["procedure_token_recall"] for case in case_results) / count, 4
            ),
            "mean_duration_error_minutes": round(
                sum(case["checks"]["duration_error_minutes"] for case in case_results) / count, 2
            ),
        },
        "priority_distribution": dict(Counter(priority["priority_level"] for priority in priorities)),
        "optimization": {
            "algorithm": optimized["algorithm"],
            "solver_status": optimized["solver_status"],
            "scheduled_cases": scheduled_count,
            "unscheduled_cases": len(allocations) - scheduled_count,
            "independent_conflicts": independent_conflict_count,
            "average_waiting_hours": optimized["metrics"].get("average_waiting_hours"),
            "independent_average_waiting_hours": round(
                sum(independent_waiting_hours) / len(independent_waiting_hours), 2
            ) if independent_waiting_hours else 0.0,
            "independent_deadline_breaches": independent_deadline_breaches,
            "theatre_utilisation_percent": optimized["metrics"].get("theatre_utilisation_percent"),
        },
        "evaluation": {
            "scheduled_rate": evaluated["metrics"]["scheduled_rate"],
            "total_conflicts": evaluated["metrics"]["total_conflicts"],
            "deadline_breaches": evaluated["metrics"].get("deadline_breaches"),
            "doctor_workload_cv": evaluated["workload_summary"]["doctor_workload_cv"],
            "jain_fairness_index": evaluated["workload_summary"]["jain_fairness_index"],
        },
        "failures": failures,
        "warnings": warnings,
    }
    artifact = {
        "summary": summary,
        "cases": case_results,
        "optimization_request": optimization_request,
        "optimization_result": optimized,
        "evaluation_report": evaluated,
    }
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    artifact_path = ARTIFACTS / f"llm_pipeline_{now:%Y%m%d_%H%M%S}.json"
    artifact_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    summary["artifact_path"] = str(artifact_path)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Run all four modules with LLM-generated cases")
    parser.add_argument("--cases", type=int, default=6, choices=range(4, 13))
    parser.add_argument("--cases-file", type=Path, help="Use an existing LLM-generated reference fixture")
    args = parser.parse_args()
    try:
        summary = run(args.cases, args.cases_file)
    except Exception as error:
        print(json.dumps({"status": "ERROR", "error": str(error)}, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if summary["status"].startswith("PASS") else 1


if __name__ == "__main__":
    sys.exit(main())
