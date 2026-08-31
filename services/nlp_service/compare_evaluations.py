"""Combine rule and OpenAI NLP evaluation reports into thesis-ready artifacts."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path


METRICS = (
    ("schema_valid_rate", "Schema-valid rate", "higher"),
    ("procedure_accuracy", "Procedure exact accuracy", "higher"),
    ("procedure_mean_token_recall", "Procedure mean token recall", "higher"),
    ("speciality_accuracy", "Speciality exact accuracy", "higher"),
    ("urgency_accuracy", "Urgency accuracy", "higher"),
    ("urgency_macro_f1", "Urgency Macro-F1", "higher"),
    ("duration_mae_minutes", "Duration MAE (minutes)", "lower"),
    ("time_window_mae_hours", "Time-window MAE (hours)", "lower"),
    ("time_window_coverage", "Time-window coverage", "higher"),
    ("human_review_rate", "Human-review rate", "lower"),
    ("mean_latency_ms", "Mean latency (ms)", "lower"),
    ("p95_latency_ms", "P95 latency (ms)", "lower"),
)


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def compare(rule_path: Path, openai_path: Path, output_dir: Path, dataset_path: Path) -> dict:
    rules = _load(rule_path)
    openai = _load(openai_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    rows = [
        {
            "metric": key,
            "label": label,
            "preferred_direction": direction,
            "rules": rules.get(key),
            "openai": openai.get(key),
        }
        for key, label, direction in METRICS
    ]
    with (output_dir / "comparison.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    combined = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": str(dataset_path),
        "reference_origin": "deterministic-template",
        "clinical_validation": False,
        "rules": rules,
        "openai": openai,
    }
    (output_dir / "combined-report.json").write_text(
        json.dumps(combined, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    table_rows = "\n".join(
        f"| {row['label']} | {row['rules']} | {row['openai']} | {row['preferred_direction']} |"
        for row in rows
    )
    markdown = f"""# NLP extraction benchmark

Generated: {combined['generated_at']}

## Protocol

- Dataset: `{dataset_path}`
- Cases: {rules.get('cases')} deterministic synthetic English surgical notes
- Reference labels: generated from controlled templates before either extractor is run
- Rule provider: `{', '.join(rules.get('extractor_counts', {}))}`
- OpenAI provider: `{', '.join(openai.get('extractor_counts', {}))}`

## Results

| Metric | Rules | OpenAI | Preferred |
| --- | ---: | ---: | --- |
{table_rows}

## Urgency confusion matrices

Rules: `{json.dumps(rules.get('urgency_confusion', {}), sort_keys=True)}`

OpenAI: `{json.dumps(openai.get('urgency_confusion', {}), sort_keys=True)}`

## Interpretation boundary

This benchmark measures controlled extraction correctness and engineering feasibility. The notes
are synthetic and the labels are deterministic template references, not clinician annotations.
The results must not be presented as evidence of clinical safety or real-world generalisation.
"""
    (output_dir / "summary.md").write_text(markdown, encoding="utf-8")
    return combined


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rules_report", type=Path)
    parser.add_argument("openai_report", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--dataset", type=Path, required=True)
    args = parser.parse_args()
    combined = compare(args.rules_report, args.openai_report, args.output_dir, args.dataset)
    print(json.dumps({
        "output_dir": str(args.output_dir),
        "cases": combined["rules"].get("cases"),
        "rules_provider": combined["rules"].get("extractor_counts"),
        "openai_provider": combined["openai"].get("extractor_counts"),
    }, indent=2))


if __name__ == "__main__":
    main()
