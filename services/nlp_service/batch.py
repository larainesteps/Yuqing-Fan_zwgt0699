"""Batch extraction for ClinicalNoteInput JSONL files."""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from contextlib import contextmanager
from pathlib import Path

from contracts.models import ClinicalNoteInput
from services.nlp_service.providers import extract_case


@contextmanager
def provider_mode(mode: str):
    previous = os.environ.get("NLP_PROVIDER")
    os.environ["NLP_PROVIDER"] = mode
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("NLP_PROVIDER", None)
        else:
            os.environ["NLP_PROVIDER"] = previous


def process_jsonl(source: Path, target: Path, provider: str = "rules", limit: int | None = None) -> dict:
    if provider not in {"rules", "auto", "openai"}:
        raise ValueError("provider must be rules, auto, or openai")
    target.parent.mkdir(parents=True, exist_ok=True)
    urgency_counts: Counter[str] = Counter()
    extractor_counts: Counter[str] = Counter()
    processed = 0
    review_count = 0

    with provider_mode(provider), source.open("r", encoding="utf-8") as source_handle, target.open(
        "w", encoding="utf-8", newline=""
    ) as target_handle:
        for line_number, line in enumerate(source_handle, start=1):
            if not line.strip():
                continue
            try:
                note = ClinicalNoteInput.model_validate_json(line)
            except Exception as error:
                raise ValueError(f"Invalid ClinicalNoteInput at line {line_number}: {error}") from error
            result = extract_case(note)
            target_handle.write(result.model_dump_json() + "\n")
            processed += 1
            urgency_counts[result.urgency.value] += 1
            extractor_counts[result.extractor_version] += 1
            review_count += int(result.human_review_required)
            if limit is not None and processed >= limit:
                break

    return {
        "processed": processed,
        "human_review_required": review_count,
        "human_review_rate": round(review_count / processed, 4) if processed else 0.0,
        "urgency_counts": dict(sorted(urgency_counts.items())),
        "extractor_counts": dict(sorted(extractor_counts.items())),
        "target": str(target),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--provider", choices=["rules", "auto", "openai"], default="rules")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")
    print(json.dumps(process_jsonl(args.source, args.target, args.provider, args.limit), indent=2))


if __name__ == "__main__":
    main()
