"""Temporarily serve the current build for browser-based UI verification."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]


def wait_for(url: str, timeout: float = 20.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"UI test service did not become healthy: {url}")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python tests/run_ui_integration_stack.py <node-executable>")
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    environment = os.environ.copy()
    environment.update({
        "OPTIMIZER_SERVICE_URL": "http://127.0.0.1:8143",
        "EVALUATION_SERVICE_URL": "http://127.0.0.1:8144",
    })
    processes: list[subprocess.Popen[bytes]] = []
    try:
        commands = [
            ([sys.executable, "-m", "services.optimizer_service.app", "--port", "8143"], ROOT, environment),
            ([sys.executable, "-m", "services.evaluation_service.app", "--port", "8144"], ROOT, environment),
            ([sys.argv[1], "dist/server.js"], ROOT / "backend", {**environment, "PORT": "4015"}),
            ([sys.argv[1], "node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4173"], ROOT / "frontend", environment),
        ]
        for command, cwd, env in commands:
            processes.append(subprocess.Popen(
                command,
                cwd=cwd,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creation_flags,
            ))
        wait_for("http://127.0.0.1:4015/api/health")
        wait_for("http://127.0.0.1:4173/")
        print("UI_STACK_READY http://127.0.0.1:4173/", flush=True)
        time.sleep(90)
        return 0
    finally:
        for process in processes:
            process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    raise SystemExit(main())
