from pathlib import Path
import sys

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from contracts.models import CaseExtraction, ClinicalNoteInput
from services.common.runtime import ServiceDefinition, run_service
from services.nlp_service.providers import extract_case


SERVICE = ServiceDefinition(
    name="TheatreFlow NLP Service",
    module="nlp",
    default_port=8101,
    action_path="/extract",
    input_contract="clinical-note-input.schema.json",
    output_contract="case-extraction.schema.json",
    input_model=ClinicalNoteInput,
    output_model=CaseExtraction,
    action=extract_case,
    implementation_status="implemented-with-no-key-fallback",
)


if __name__ == "__main__":
    run_service(SERVICE)
