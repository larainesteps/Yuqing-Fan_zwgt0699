"""Dependency-light HTTP runtime used by the P0 module skeletons."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable, Type

from pydantic import BaseModel, ValidationError


MAX_REQUEST_BYTES = 1_000_000


@dataclass(frozen=True)
class ServiceDefinition:
    name: str
    module: str
    default_port: int
    action_path: str
    input_contract: str
    output_contract: str
    input_model: Type[BaseModel]
    output_model: Type[BaseModel] | None = None
    action: Callable[[BaseModel], BaseModel | dict] | None = None
    implementation_status: str = "skeleton"

    def metadata(self) -> dict:
        return {
            "service": self.name,
            "module": self.module,
            "service_version": "0.1.0",
            "contract_version": "v1",
            "implementation_status": self.implementation_status,
            "action_path": self.action_path,
            "input_contract": self.input_contract,
            "output_contract": self.output_contract,
        }


def _handler_for(definition: ServiceDefinition):
    class ServiceHandler(BaseHTTPRequestHandler):
        server_version = "TheatreFlowModule/0.1"

        def _send(self, status: HTTPStatus, payload: dict) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(int(status))
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:  # noqa: N802
            self._send(HTTPStatus.NO_CONTENT, {})

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                self._send(HTTPStatus.OK, {"status": "ok", **definition.metadata()})
                return
            if self.path == "/metadata":
                self._send(HTTPStatus.OK, definition.metadata())
                return
            self._send(HTTPStatus.NOT_FOUND, {"error": "not_found", "path": self.path})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != definition.action_path:
                self._send(HTTPStatus.NOT_FOUND, {"error": "not_found", "path": self.path})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_REQUEST_BYTES:
                    raise ValueError(f"request size must be between 1 and {MAX_REQUEST_BYTES} bytes")
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                validated = definition.input_model.model_validate(payload)
            except ValidationError as error:
                self._send(
                    HTTPStatus.UNPROCESSABLE_ENTITY,
                    {"error": "contract_validation_failed", "details": error.errors(include_url=False)},
                )
                return
            except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as error:
                self._send(HTTPStatus.BAD_REQUEST, {"error": "invalid_json", "message": str(error)})
                return

            if definition.action is None:
                self._send(
                    HTTPStatus.NOT_IMPLEMENTED,
                    {
                        "status": "contract_validated",
                        "service": definition.name,
                        "case_or_run_id": getattr(validated, "case_id", None)
                        or getattr(validated, "run_id", None),
                        "message": "P0 skeleton is healthy; algorithm implementation belongs to the next module phase.",
                    },
                )
                return

            try:
                result = definition.action(validated)
                if definition.output_model is not None:
                    result = definition.output_model.model_validate(result)
                response_payload = (
                    result.model_dump(mode="json") if isinstance(result, BaseModel) else result
                )
            except ValidationError as error:
                self._send(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {
                        "error": "service_output_validation_failed",
                        "details": error.errors(include_url=False),
                    },
                )
                return
            except Exception as error:  # pragma: no cover - defensive HTTP boundary
                self._send(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": "service_execution_failed", "message": str(error)},
                )
                return

            self._send(HTTPStatus.OK, response_payload)

        def log_message(self, format: str, *args) -> None:
            if os.environ.get("SERVICE_ACCESS_LOG", "false").lower() == "true":
                super().log_message(format, *args)

    return ServiceHandler


def create_server(definition: ServiceDefinition, host: str, port: int) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), _handler_for(definition))


def run_service(definition: ServiceDefinition) -> None:
    parser = argparse.ArgumentParser(description=f"Run the {definition.name} module skeleton")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", definition.default_port)))
    parser.add_argument("--check", action="store_true", help="Validate configuration and exit")
    args = parser.parse_args()

    if args.check:
        print(json.dumps({"status": "ok", **definition.metadata()}, ensure_ascii=False, indent=2))
        return

    server = create_server(definition, args.host, args.port)
    print(f"{definition.name} ready on http://{args.host}:{server.server_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
