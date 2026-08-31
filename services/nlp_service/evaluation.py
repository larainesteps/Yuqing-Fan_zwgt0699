"""Evaluate procedure, speciality, urgency, duration, and time-window extraction."""

from __future__ import annotations

import argparse
import json
import math
import re
import time
from collections import Counter
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from contracts.models import CaseExtraction, ClinicalNoteInput, Urgency
from services.nlp_service.batch import provider_mode
from services.nlp_service.providers import extract_case


URGENCY_CLASSES = ("ROUTINE", "EXPEDITED", "URGENT", "EMERGENCY")
IGNORED_TOKENS = {"the", "and", "for", "with", "surgery", "surgical", "procedure"}


def _normalise(value: str | None) -> str | None:
    return " ".join(value.casefold().split()) if value is not None else None


def _accuracy(correct: int, labelled: int) -> float | None:
    return round(correct / labelled, 4) if labelled else None


def _tokens(value: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-z0-9]+", value.casefold())
        if len(token) > 2 and token not in IGNORED_TOKENS
    }


def _token_recall(expected: str, actual: str) -> float:
    expected_tokens = _tokens(expected)
    return len(expected_tokens & _tokens(actual)) / len(expected_tokens) if expected_tokens else 1.0


def _macro_f1(confusion: Counter[tuple[str, str]]) -> float | None:
    scores: list[float] = []
    for label in URGENCY_CLASSES:
        true_positive = confusion[(label, label)]
        false_positive = sum(count for (gold, predicted), count in confusion.items() if predicted == label and gold != label)
        false_negative = sum(count for (gold, predicted), count in confusion.items() if gold == label and predicted != label)
        denominator = (2 * true_positive) + false_positive + false_negative
        scores.append((2 * true_positive) / denominator if denominator else 0.0)
    return round(sum(scores) / len(scores), 4) if scores else None


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(percentile * len(ordered)) - 1))
    return round(ordered[index], 2)


def _endpoint_extract(endpoint: str, note: ClinicalNoteInput) -> CaseExtraction:
    request = Request(
        endpoint,
        data=note.model_dump_json().encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=120) as response:
            return CaseExtraction.model_validate_json(response.read())
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"NLP endpoint returned HTTP {error.code}: {detail}") from error
    except (URLError, TimeoutError) as error:
        raise RuntimeError(f"NLP endpoint request failed: {error}") from error


def evaluate_jsonl(
    source: Path,
    provider: str = "rules",
    predictions_path: Path | None = None,
    endpoint: str | None = None,
) -> dict:
    totals = Counter()
    confusion: Counter[tuple[str, str]] = Counter()
    duration_errors: list[int] = []
    window_errors: list[int] = []
    procedure_recalls: list[float] = []
    latencies_ms: list[float] = []
    extractor_counts = Counter()
    records: list[dict] = []

    with provider_mode(provider), source.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
                note = ClinicalNoteInput.model_validate(row["input"])
                expected = row["expected"]
            except Exception as error:
                raise ValueError(f"Invalid evaluation row at line {line_number}: {error}") from error

            totals["cases"] += 1
            started = time.perf_counter()
            try:
                result = _endpoint_extract(endpoint, note) if endpoint else extract_case(note)
            except Exception as error:
                latency = round((time.perf_counter() - started) * 1000, 2)
                latencies_ms.append(latency)
                totals["failed"] += 1
                records.append({
                    "case_id": note.case_id,
                    "provider_requested": provider,
                    "latency_ms": latency,
                    "expected": expected,
                    "error": str(error),
                })
                continue

            latency = round((time.perf_counter() - started) * 1000, 2)
            latencies_ms.append(latency)
            totals["successful"] += 1
            totals["review"] += int(result.human_review_required)
            extractor_counts[result.extractor_version] += 1

            field_checks: dict[str, bool | float | int | None] = {}
            for field, actual in (("procedure", result.procedure), ("speciality", result.speciality)):
                gold = expected.get(field)
                if gold is None:
                    continue
                matched = _normalise(actual) == _normalise(gold)
                totals[f"{field}_labelled"] += 1
                totals[f"{field}_correct"] += int(matched)
                field_checks[f"{field}_exact"] = matched

            gold_procedure = expected.get("procedure")
            if gold_procedure is not None:
                recall = _token_recall(str(gold_procedure), result.procedure)
                procedure_recalls.append(recall)
                field_checks["procedure_token_recall"] = round(recall, 4)

            gold_urgency = expected.get("urgency")
            if gold_urgency is not None:
                gold_value = Urgency(gold_urgency).value
                matched = result.urgency.value == gold_value
                totals["urgency_labelled"] += 1
                totals["urgency_correct"] += int(matched)
                confusion[(gold_value, result.urgency.value)] += 1
                field_checks["urgency_match"] = matched

            gold_duration = expected.get("duration_minutes")
            if gold_duration is not None:
                error = abs(result.estimated_duration_minutes - int(gold_duration))
                duration_errors.append(error)
                field_checks["duration_error_minutes"] = error

            gold_window = expected.get("time_window_hours")
            if gold_window is not None:
                totals["window_labelled"] += 1
                if result.recommended_time_window_hours is not None:
                    error = abs(result.recommended_time_window_hours - int(gold_window))
                    window_errors.append(error)
                    totals["window_extracted"] += 1
                    field_checks["time_window_error_hours"] = error
                else:
                    field_checks["time_window_error_hours"] = None

            records.append({
                "case_id": note.case_id,
                "provider_requested": provider,
                "extractor_version": result.extractor_version,
                "latency_ms": latency,
                "expected": expected,
                "actual": {
                    "procedure": result.procedure,
                    "speciality": result.speciality,
                    "urgency": result.urgency.value,
                    "duration_minutes": result.estimated_duration_minutes,
                    "time_window_hours": result.recommended_time_window_hours,
                    "human_review_required": result.human_review_required,
                },
                "checks": field_checks,
            })

    cases = totals["cases"]
    successful = totals["successful"]
    report = {
        "provider": provider,
        "endpoint": endpoint,
        "cases": cases,
        "successful_cases": successful,
        "failed_cases": totals["failed"],
        "schema_valid_rate": round(successful / cases, 4) if cases else 0.0,
        "procedure_accuracy": _accuracy(totals["procedure_correct"], totals["procedure_labelled"]),
        "procedure_mean_token_recall": round(sum(procedure_recalls) / len(procedure_recalls), 4) if procedure_recalls else None,
        "speciality_accuracy": _accuracy(totals["speciality_correct"], totals["speciality_labelled"]),
        "urgency_accuracy": _accuracy(totals["urgency_correct"], totals["urgency_labelled"]),
        "urgency_macro_f1": _macro_f1(confusion),
        "duration_mae_minutes": round(sum(duration_errors) / len(duration_errors), 2) if duration_errors else None,
        "time_window_mae_hours": round(sum(window_errors) / len(window_errors), 2) if window_errors else None,
        "time_window_coverage": _accuracy(totals["window_extracted"], totals["window_labelled"]),
        "human_review_rate": round(totals["review"] / successful, 4) if successful else 0.0,
        "mean_latency_ms": round(sum(latencies_ms) / len(latencies_ms), 2) if latencies_ms else None,
        "p95_latency_ms": _percentile(latencies_ms, 0.95),
        "urgency_confusion": {
            f"{gold}->{predicted}": count
            for (gold, predicted), count in sorted(confusion.items())
        },
        "extractor_counts": dict(sorted(extractor_counts.items())),
    }
    if predictions_path:
        predictions_path.parent.mkdir(parents=True, exist_ok=True)
        predictions_path.write_text(
            "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
            encoding="utf-8",
        )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--provider", choices=["rules", "auto", "openai"], default="rules")
    parser.add_argument("--endpoint", help="Optional running NLP /extract endpoint; provider is recorded as the requested mode.")
    parser.add_argument("--predictions", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = evaluate_jsonl(args.source, args.provider, args.predictions, args.endpoint)
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
