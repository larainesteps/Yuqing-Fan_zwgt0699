from pathlib import Path
import sys

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from contracts.models import OptimizationRequest, OptimizationResult
from services.common.runtime import ServiceDefinition, run_service
from services.optimizer_service.solver import solve_schedule


SERVICE = ServiceDefinition(
    name="TheatreFlow Optimizer Service",
    module="optimizer",
    default_port=8103,
    action_path="/solve",
    input_contract="optimization-request.schema.json",
    output_contract="optimization-result.schema.json",
    input_model=OptimizationRequest,
    output_model=OptimizationResult,
    action=solve_schedule,
    implementation_status="implemented-cp-sat-with-exact-fallback",
)


if __name__ == "__main__":
    run_service(SERVICE)
