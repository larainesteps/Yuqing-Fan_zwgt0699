"""Isolated OR-Tools CP-SAT adapter for the discrete scheduling model."""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence

from contracts.models import ResourceType


CP_SAT_ALGORITHM = "CP_SAT_V1"
SCORE_SCALE = 100


def load_cp_model():
    vendor = Path(__file__).resolve().parent / "_vendor"
    if vendor.exists() and str(vendor) not in sys.path:
        sys.path.insert(0, str(vendor))
    try:
        from ortools.sat.python import cp_model  # type: ignore
    except ImportError:
        return None
    return cp_model


def is_available() -> bool:
    return load_cp_model() is not None


def solve(
    candidates: Mapping[str, Sequence[Any]],
    locked_occupancy: Mapping[tuple[ResourceType, str], Sequence[tuple[int, int]]],
    max_seconds: int,
    random_seed: int = 42,
    hint: Mapping[str, int] | None = None,
) -> tuple[dict[str, Any], str, float, float | None, float | None]:
    """Solve the discrete candidate model.

    ``hint`` maps a case id to the index of a candidate known to be feasible, normally taken
    from the greedy baseline. Supplying it gives CP-SAT a complete starting assignment, so
    that on large instances the solver improves on a known-good schedule instead of spending
    its whole budget searching for a first feasible solution and returning UNKNOWN.
    """
    cp_model = load_cp_model()
    if cp_model is None:
        raise RuntimeError(
            "OR-Tools is not installed; install services/optimizer_service/requirements.txt"
        )

    solver_model = cp_model.CpModel()
    choices: dict[tuple[str, int], Any] = {}
    resource_intervals: dict[tuple[ResourceType, str], list[Any]] = defaultdict(list)
    for case_id, case_candidates in candidates.items():
        case_choices = []
        for index, candidate in enumerate(case_candidates):
            choice = solver_model.NewBoolVar(f"use_{case_id}_{index}")
            choices[(case_id, index)] = choice
            case_choices.append(choice)
            duration = candidate.end_slot - candidate.start_slot
            for resource_type, resource_code in candidate.resources:
                interval = solver_model.NewOptionalIntervalVar(
                    candidate.start_slot,
                    duration,
                    candidate.end_slot,
                    choice,
                    f"interval_{case_id}_{index}_{resource_type.value}_{resource_code}",
                )
                resource_intervals[(resource_type, resource_code)].append(interval)
        solver_model.Add(sum(case_choices) <= 1)

    for key, intervals in locked_occupancy.items():
        for index, (start, end) in enumerate(intervals):
            resource_intervals[key].append(
                solver_model.NewIntervalVar(start, end - start, end, f"locked_{key[1]}_{index}")
            )
    for intervals in resource_intervals.values():
        solver_model.AddNoOverlap(intervals)

    solver_model.Maximize(
        sum(
            round(candidate.score * SCORE_SCALE) * choices[(case_id, index)]
            for case_id, case_candidates in candidates.items()
            for index, candidate in enumerate(case_candidates)
        )
    )
    if hint:
        for case_id, case_candidates in candidates.items():
            hinted = hint.get(case_id)
            for index in range(len(case_candidates)):
                solver_model.AddHint(choices[(case_id, index)], 1 if index == hinted else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_seconds
    solver.parameters.num_search_workers = max(1, min(8, os.cpu_count() or 1))
    solver.parameters.random_seed = random_seed
    result = solver.Solve(solver_model)
    status = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.UNKNOWN: "UNKNOWN",
        cp_model.MODEL_INVALID: "ERROR",
    }.get(result, "UNKNOWN")

    chosen: dict[str, Any] = {}
    if status not in {"OPTIMAL", "FEASIBLE"}:
        return chosen, status, 0.0, None, None
    for case_id, case_candidates in candidates.items():
        for index, candidate in enumerate(case_candidates):
            if solver.BooleanValue(choices[(case_id, index)]):
                chosen[case_id] = candidate
                break
    objective = solver.ObjectiveValue() / SCORE_SCALE
    bound = solver.BestObjectiveBound() / SCORE_SCALE
    gap = abs(objective - bound) / max(abs(objective), 1.0)
    return chosen, status, objective, bound, gap
