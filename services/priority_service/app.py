from pathlib import Path
import sys

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from contracts.models import CaseExtraction, PriorityAssessment
from services.common.runtime import ServiceDefinition, run_service
from services.priority_service.scorer import score_case


SERVICE = ServiceDefinition(
    name="TheatreFlow Priority Service",
    module="priority",
    default_port=8102,
    action_path="/score",
    input_contract="case-extraction.schema.json",
    output_contract="priority-assessment.schema.json",
    input_model=CaseExtraction,
    output_model=PriorityAssessment,
    action=score_case,
    implementation_status="implemented-deterministic-policy",
)


if __name__ == "__main__":
    run_service(SERVICE)
