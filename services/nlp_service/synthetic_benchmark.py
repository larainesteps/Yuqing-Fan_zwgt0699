"""Generate a deterministic English surgical-note benchmark with reference labels."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


PROCEDURES = (
    ("Laparoscopic appendectomy", "General Surgery", 75, "general"),
    ("Laparoscopic cholecystectomy", "General Surgery", 90, "general"),
    ("Coronary artery bypass grafting", "Cardiothoracic Surgery", 240, "cardiac"),
    ("Total hip arthroplasty", "Orthopaedics", 120, "orthopaedic"),
    ("Total knee arthroplasty", "Orthopaedics", 120, "orthopaedic"),
    ("Colectomy", "Colorectal Surgery", 180, "general"),
    ("Mastectomy", "Breast Surgery", 120, "general"),
    ("Inguinal hernia repair", "General Surgery", 90, "general"),
    ("Craniotomy", "Neurosurgery", 240, "neurosurgical"),
)

URGENCIES = (
    ("EMERGENCY", 4, "Emergency intervention is required immediately"),
    ("URGENT", 48, "Urgent intervention is required"),
    ("EXPEDITED", 168, "This is a time-sensitive expedited procedure"),
    ("ROUTINE", 720, "This is a planned elective procedure"),
)

LEADS = (
    "Following multidisciplinary review",
    "After surgical assessment",
    "The operating list request states that",
    "The de-identified referral confirms that",
    "Following diagnostic review",
)


def generate_rows(count: int) -> list[dict]:
    rows: list[dict] = []
    for index in range(count):
        procedure, speciality, duration, theatre = PROCEDURES[index % len(PROCEDURES)]
        urgency, window, urgency_phrase = URGENCIES[index % len(URGENCIES)]
        age = 22 + ((index * 13) % 67)
        nurses = 3 if duration >= 180 else 2
        bed = "ICU" if procedure in {"Coronary artery bypass grafting", "Craniotomy"} else None
        bed_sentence = f" A postoperative {bed} bed is required." if bed else " No specialist postoperative bed is required."
        note = (
            f"{LEADS[index % len(LEADS)]}, a de-identified {age}-year-old patient is listed for "
            f"{procedure} under {speciality}. {urgency_phrase} and the operation must start within "
            f"{window} hours. The expected operating time is {duration} minutes. Two doctors and "
            f"{nurses} theatre nurses are required in a {theatre} operating theatre.{bed_sentence}"
        )
        rows.append({
            "input": {
                "contract_version": "v1",
                "case_id": f"SYN-GOLD-{index + 1:03d}",
                "note_text": note,
                "language": "en",
                "source": "deterministic-synthetic-benchmark",
                "deidentified": True,
                "submitted_at": "2026-08-21T09:00:00Z",
            },
            "expected": {
                "procedure": procedure,
                "speciality": speciality,
                "urgency": urgency,
                "duration_minutes": duration,
                "time_window_hours": window,
                "reference_origin": "deterministic-template",
            },
        })
    return rows


def write_benchmark(target: Path, count: int = 100) -> dict:
    if count < 4:
        raise ValueError("count must be at least 4 so every urgency class is represented")
    rows = generate_rows(count)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )
    urgency = Counter(row["expected"]["urgency"] for row in rows)
    return {
        "path": str(target),
        "cases": len(rows),
        "urgency_distribution": dict(sorted(urgency.items())),
        "procedure_count": len({row["expected"]["procedure"] for row in rows}),
        "reference_origin": "deterministic-template",
        "clinical_validation": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path)
    parser.add_argument("--count", type=int, default=100)
    args = parser.parse_args()
    print(json.dumps(write_benchmark(args.target, args.count), indent=2))


if __name__ == "__main__":
    main()
