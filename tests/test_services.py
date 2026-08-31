import json
import os
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from services.common.runtime import create_server
from services.evaluation_service.app import SERVICE as EVALUATION_SERVICE
from services.nlp_service.app import SERVICE as NLP_SERVICE
from services.optimizer_service.app import SERVICE as OPTIMIZER_SERVICE
from services.priority_service.app import SERVICE as PRIORITY_SERVICE


ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "samples" / "v1"


class ModuleHealthTests(unittest.TestCase):
    services = [
        (NLP_SERVICE, "clinical-note-input.json"),
        (PRIORITY_SERVICE, "case-extraction.json"),
        (OPTIMIZER_SERVICE, "optimization-request.json"),
        (EVALUATION_SERVICE, "optimization-result.json"),
    ]

    def test_services_are_independently_runnable(self):
        for definition, sample_file in self.services:
            with self.subTest(service=definition.module):
                server = create_server(definition, "127.0.0.1", 0)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                base_url = f"http://127.0.0.1:{server.server_port}"
                try:
                    with urlopen(f"{base_url}/health", timeout=3) as response:
                        payload = json.load(response)
                    self.assertEqual(payload["status"], "ok")
                    self.assertEqual(payload["contract_version"], "v1")

                    body = (SAMPLES / sample_file).read_bytes()
                    request = Request(
                        f"{base_url}{definition.action_path}",
                        data=body,
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    if definition.module == "nlp":
                        previous_provider = os.environ.get("NLP_PROVIDER")
                        os.environ["NLP_PROVIDER"] = "rules"
                        try:
                            with urlopen(request, timeout=3) as response:
                                validated = json.load(response)
                            self.assertEqual(validated["case_id"], "CASE-DEMO-001")
                            self.assertIn(validated["urgency"], {"EMERGENCY", "URGENT"})
                        finally:
                            if previous_provider is None:
                                os.environ.pop("NLP_PROVIDER", None)
                            else:
                                os.environ["NLP_PROVIDER"] = previous_provider
                    elif definition.module == "priority":
                        with urlopen(request, timeout=3) as response:
                            validated = json.load(response)
                        self.assertEqual(validated["case_id"], "CASE-DEMO-001")
                        self.assertEqual(validated["priority_level"], "EMERGENCY")
                        self.assertEqual(validated["policy_version"], "priority-v1.0")
                    elif definition.module == "optimizer":
                        previous_engine = os.environ.get("OPTIMIZER_ENGINE")
                        os.environ["OPTIMIZER_ENGINE"] = "fallback"
                        try:
                            with urlopen(request, timeout=10) as response:
                                validated = json.load(response)
                            self.assertEqual(validated["run_id"], "RUN-DEMO-001")
                            self.assertEqual(validated["solver_status"], "OPTIMAL")
                            self.assertEqual(validated["metrics"]["scheduled_cases"], 1)
                            self.assertEqual(validated["allocations"][0]["status"], "SCHEDULED")
                        finally:
                            if previous_engine is None:
                                os.environ.pop("OPTIMIZER_ENGINE", None)
                            else:
                                os.environ["OPTIMIZER_ENGINE"] = previous_engine
                    elif definition.module == "evaluation":
                        with urlopen(request, timeout=3) as response:
                            validated = json.load(response)
                        self.assertEqual(validated["run_id"], "RUN-DEMO-001")
                        self.assertEqual(validated["metrics"]["scheduled_rate"], 1.0)
                        self.assertEqual(validated["metrics"]["total_conflicts"], 0)
                        self.assertEqual(validated["conflicts_by_resource"]["doctor"], 0)
                    else:
                        with self.assertRaises(HTTPError) as context:
                            urlopen(request, timeout=3)
                        self.assertEqual(context.exception.code, 501)
                        validated = json.loads(context.exception.read().decode("utf-8"))
                        self.assertEqual(validated["status"], "contract_validated")
                finally:
                    server.shutdown()
                    server.server_close()
                    thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
