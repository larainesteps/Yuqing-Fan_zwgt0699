"""Generate language-neutral JSON Schema files from the canonical models."""

import json
from pathlib import Path

from contracts.models import (
    CaseExtraction,
    ClinicalNoteInput,
    EvaluationReport,
    OptimizationRequest,
    OptimizationResult,
    PriorityAssessment,
)


SCHEMAS = {
    "clinical-note-input": ClinicalNoteInput,
    "case-extraction": CaseExtraction,
    "priority-assessment": PriorityAssessment,
    "optimization-request": OptimizationRequest,
    "optimization-result": OptimizationResult,
    "evaluation-report": EvaluationReport,
}


def main() -> None:
    output_dir = Path(__file__).resolve().parent / "v1"
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, model in SCHEMAS.items():
        schema = model.model_json_schema()
        schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
        schema["$id"] = f"https://theatreflow.local/contracts/v1/{name}.schema.json"
        schema["x-contract-version"] = "v1"
        target = output_dir / f"{name}.schema.json"
        target.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(target.relative_to(Path.cwd()))


if __name__ == "__main__":
    main()
