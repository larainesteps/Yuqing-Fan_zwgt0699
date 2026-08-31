"""Run the real-MySQL experiment suite against temporary current-code services."""

from __future__ import annotations

import os
import json
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
    raise RuntimeError(f"Temporary service did not become healthy: {url}")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python tests/run_experiment_integration.py <node-executable>")
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    processes: list[subprocess.Popen[bytes]] = []
    try:
        for module, port in [
            ("services.optimizer_service.app", "8133"),
            ("services.evaluation_service.app", "8134"),
        ]:
            processes.append(subprocess.Popen(
                [sys.executable, "-m", module, "--port", port],
                cwd=ROOT,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creation_flags,
            ))
        wait_for("http://127.0.0.1:8133/health")
        wait_for("http://127.0.0.1:8134/health")
        environment = os.environ.copy()
        environment.update({
            "OPTIMIZER_SERVICE_URL": "http://127.0.0.1:8133",
            "EVALUATION_SERVICE_URL": "http://127.0.0.1:8134",
            "EXPERIMENT_REPETITIONS": "1",
            "EXPERIMENT_SCENARIOS": "BASELINE",
            "EXPERIMENT_CASE_COUNTS": "10,25,50",
            "EXPERIMENT_MAX_SOLVE_SECONDS": "1",
        })
        backend_environment = environment.copy()
        backend_environment["PORT"] = "4015"
        processes.append(subprocess.Popen(
            [sys.argv[1], "dist/server.js"],
            cwd=ROOT / "backend",
            env=backend_environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags,
        ))
        wait_for("http://127.0.0.1:4015/api/health")
        completed = subprocess.run(
            [sys.argv[1], "database/run-algorithm-experiments.mjs"],
            cwd=ROOT,
            env=environment,
            check=False,
            creationflags=creation_flags,
        )
        if completed.returncode == 0:
            ablation_environment = environment.copy()
            ablation_environment.update({
                "EXPERIMENT_CASE_COUNTS": "10",
                "EXPERIMENT_SCENARIOS": "BASELINE",
            })
            ablation = subprocess.run(
                [sys.argv[1], "database/run-algorithm-experiments.mjs", "--ablation"],
                cwd=ROOT,
                env=ablation_environment,
                check=False,
                creationflags=creation_flags,
            )
            if ablation.returncode != 0:
                return ablation.returncode
            with urlopen("http://127.0.0.1:4015/api/experiments/latest?type=COMPARISON", timeout=10) as response:
                latest = json.load(response)
            with urlopen("http://127.0.0.1:4015/api/experiments/latest?type=ABLATION", timeout=10) as response:
                latest_ablation = json.load(response)
            if latest.get("status") != "COMPLETED" or len(latest.get("results", [])) != 9:
                raise RuntimeError("Comparison API did not return the completed 10/25/50-case suite.")
            if latest_ablation.get("status") != "COMPLETED" or len(latest_ablation.get("results", [])) != 4:
                raise RuntimeError("Ablation API did not return the completed four-variant suite.")
            print(
                f"Experiment APIs verified: {latest['suite_key']} (9 scale results), "
                f"{latest_ablation['suite_key']} (4 ablation results).",
                flush=True,
            )
        return completed.returncode
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
