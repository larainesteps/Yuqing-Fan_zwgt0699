from pathlib import Path
import sys

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from contracts.models import EvaluationReport, OptimizationResult
from services.common.runtime import ServiceDefinition, run_service
from services.evaluation_service.evaluator import evaluate_result


SERVICE = ServiceDefinition(
    name="TheatreFlow Evaluation Service",
    module="evaluation",
    default_port=8104,
    action_path="/evaluate",
    input_contract="optimization-result.schema.json",
    output_contract="evaluation-report.schema.json",
    input_model=OptimizationResult,
    output_model=EvaluationReport,
    action=evaluate_result,
    implementation_status="implemented-deterministic-metrics",
)


if __name__ == "__main__":
    run_service(SERVICE)
