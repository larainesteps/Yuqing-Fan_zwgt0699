"""Create a human-annotation CSV template from ClinicalNoteInput JSONL."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from contracts.models import ClinicalNoteInput


FIELDS = [
    "case_id",
    "note_text",
    "gold_procedure",
    "gold_speciality",
    "gold_urgency",
    "gold_time_window_hours",
    "gold_duration_minutes",
    "urgency_evidence",
    "annotator",
    "annotation_notes",
]


def create_annotation_template(source: Path, target: Path, limit: int = 200) -> int:
    target.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with source.open("r", encoding="utf-8") as source_handle, target.open(
        "w", encoding="utf-8-sig", newline=""
    ) as target_handle:
        writer = csv.DictWriter(target_handle, fieldnames=FIELDS)
        writer.writeheader()
        for line_number, line in enumerate(source_handle, start=1):
            if not line.strip():
                continue
            try:
                note = ClinicalNoteInput.model_validate_json(line)
            except Exception as error:
                raise ValueError(f"Invalid ClinicalNoteInput at line {line_number}: {error}") from error
            writer.writerow({"case_id": note.case_id, "note_text": note.note_text})
            written += 1
            if written >= limit:
                break
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--limit", type=int, default=200)
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be at least 1")
    count = create_annotation_template(args.source, args.target, args.limit)
    print(json.dumps({"status": "ok", "records": count, "target": str(args.target)}))


if __name__ == "__main__":
    main()
