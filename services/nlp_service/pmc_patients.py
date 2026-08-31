"""Create a small surgical-case JSONL subset from PMC-Patients CSV."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path


SURGICAL_TERMS = re.compile(
    r"\b(?:surgery|surgical|operation|operative|resection|appendectomy|"
    r"cholecystectomy|arthroplasty|laparoscop(?:y|ic)|anaesthe(?:sia|tic)|"
    r"anesthe(?:sia|tic)|postoperative|craniotomy|mastectomy|colectomy|"
    r"hernia repair|coronary artery bypass|CABG)\b",
    re.I,
)


def build_subset(source: Path, target: Path, limit: int = 1000) -> int:
    """Stream the source CSV so the 1+ GB dataset never has to fit in memory."""

    target.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with source.open("r", encoding="utf-8-sig", newline="") as source_handle, target.open(
        "w", encoding="utf-8", newline=""
    ) as target_handle:
        reader = csv.DictReader(source_handle)
        if not reader.fieldnames or "patient" not in reader.fieldnames:
            raise ValueError("PMC-Patients CSV must contain a 'patient' column")
        for row_number, row in enumerate(reader, start=1):
            note_text = " ".join((row.get("patient") or "").split())
            if not note_text or not SURGICAL_TERMS.search(note_text):
                continue
            patient_id = row.get("patient_uid") or row.get("patient_id") or str(row_number)
            record = {
                "contract_version": "v1",
                "case_id": f"PMC-{patient_id}",
                "note_text": note_text,
                "language": "en",
                "source": "PMC-Patients",
                "deidentified": True,
                "submitted_at": None,
            }
            target_handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            written += 1
            if written >= limit:
                break
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Downloaded PMC-Patients CSV")
    parser.add_argument("target", type=Path, help="Output JSONL path")
    parser.add_argument("--limit", type=int, default=1000)
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be at least 1")
    count = build_subset(args.source, args.target, args.limit)
    print(json.dumps({"status": "ok", "records": count, "target": str(args.target)}))


if __name__ == "__main__":
    main()
