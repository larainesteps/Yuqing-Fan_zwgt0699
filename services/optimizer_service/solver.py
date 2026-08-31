"""Constraint-based operating-theatre scheduler.

OR-Tools CP-SAT is used when installed.  The dependency-free branch-and-bound
engine solves the same discrete candidate model and keeps the service usable in
offline development environments; its algorithm name is deliberately distinct.
"""

from __future__ import annotations

import itertools
import math
import os
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

from contracts.models import (
    AllocationStatus,
    OptimizationCase,
    OptimizationRequest,
    PreferredAssignment,
    OptimizationResult,
    RejectionCode,
    ResourceAssignment,
    ResourceAvailability,
    ResourceType,
    ScheduledAllocation,
)
from services.optimizer_service import cp_sat_adapter


CP_SAT_ALGORITHM = cp_sat_adapter.CP_SAT_ALGORITHM
FALLBACK_ALGORITHM = "CP_BRANCH_AND_BOUND_V1"
PRIORITY_GREEDY_ALGORITHM = "PRIORITY_GREEDY_V1"


@dataclass(frozen=True)
class Candidate:
    case_id: str
    start_slot: int
    end_slot: int
    resources: tuple[tuple[ResourceType, str], ...]
    score: float


@dataclass
class CandidateModel:
    horizon_start: datetime
    slot_minutes: int
    cases: list[OptimizationCase]
    candidates: dict[str, list[Candidate]]
    rejection_reasons: dict[str, tuple[RejectionCode, str]]
    locked_cases: dict[str, ScheduledAllocation]
    locked_occupancy: dict[tuple[ResourceType, str], list[tuple[int, int]]]
    resource_windows: dict[tuple[ResourceType, str], list[tuple[int, int]]]
    locked_conflict: bool = False
    locked_conflict_reason: str | None = None


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalise(value: object) -> str:
    return "".join(character for character in str(value).lower() if character.isalnum())


def _window_slots(
    resource: ResourceAvailability,
    horizon_start: datetime,
    horizon_end: datetime,
    slot_minutes: int,
) -> tuple[int, int] | None:
    start = max(_utc(resource.available_from), horizon_start)
    end = min(_utc(resource.available_to), horizon_end)
    if end <= start:
        return None
    slot_seconds = slot_minutes * 60
    first = math.ceil((start - horizon_start).total_seconds() / slot_seconds)
    last = math.floor((end - horizon_start).total_seconds() / slot_seconds)
    return (first, last) if last > first else None


def _matches_doctor(resource: ResourceAvailability, requirement: str, speciality: str) -> bool:
    target = _normalise(requirement)
    attributes = resource.attributes
    roles = attributes.get("roles", [])
    if not isinstance(roles, list):
        roles = [roles]
    values = [resource.resource_code, attributes.get("role", ""), *roles]
    if any(_normalise(value) == target for value in values):
        return True
    return target == _normalise(speciality) and _normalise(resource.speciality or "") == target


def _matches_speciality(resource: ResourceAvailability, speciality: str) -> bool:
    declared = resource.speciality or resource.attributes.get("speciality")
    return not declared or _normalise(declared) == _normalise(speciality)


def _matches_typed_resource(
    resource: ResourceAvailability,
    required_type: str | None,
    attribute_name: str,
    speciality: str,
) -> bool:
    if required_type:
        target = _normalise(required_type)
        return target in {
            _normalise(resource.resource_code),
            _normalise(resource.attributes.get(attribute_name, "")),
        }
    return _matches_speciality(resource, speciality)


def _unique_products(groups: Iterable[Iterable[str]]) -> list[tuple[str, ...]]:
    groups = [tuple(dict.fromkeys(group)) for group in groups]
    if any(not group for group in groups):
        return []
    results: list[tuple[str, ...]] = []
    for values in itertools.product(*groups):
        if len(set(values)) == len(values):
            results.append(tuple(values))
    return list(dict.fromkeys(results))


def _resource_combinations(
    item: OptimizationCase,
    resources: dict[ResourceType, list[ResourceAvailability]],
) -> tuple[
    list[tuple[tuple[ResourceType, str], ...]],
    tuple[RejectionCode, str] | None,
]:
    case = item.case
    doctor_groups = [
        [
            resource.resource_code
            for resource in resources[ResourceType.DOCTOR]
            if _matches_doctor(resource, requirement, case.speciality)
        ]
        for requirement in case.required_doctors
    ]
    doctor_options = _unique_products(doctor_groups) if doctor_groups else [()]
    if not doctor_options:
        return [], (
            RejectionCode.DOCTOR_UNAVAILABLE,
            "No eligible doctor satisfies every required role or speciality.",
        )

    nurses = [
        resource.resource_code
        for resource in resources[ResourceType.NURSE]
        if _matches_speciality(resource, case.speciality)
    ]
    if case.required_nurses > len(nurses):
        return [], (
            RejectionCode.INSUFFICIENT_NURSES,
            f"Requires {case.required_nurses} eligible nurses; only {len(nurses)} are available.",
        )
    nurse_options = list(itertools.combinations(nurses, case.required_nurses)) if case.required_nurses else [()]

    theatres = [
        resource.resource_code
        for resource in resources[ResourceType.THEATRE]
        if _matches_typed_resource(
            resource, case.required_theatre_type, "theatre_type", case.speciality
        )
    ]
    if not theatres:
        return [], (
            RejectionCode.NO_MATCHING_THEATRE,
            "No eligible operating theatre matches the required type and speciality.",
        )

    if case.required_bed_type:
        beds = [
            resource.resource_code
            for resource in resources[ResourceType.BED]
            if _matches_typed_resource(resource, case.required_bed_type, "bed_type", case.speciality)
        ]
        if not beds:
            return [], (
                RejectionCode.NO_RECOVERY_BED,
                "No eligible recovery bed matches the required bed type and speciality.",
            )
        bed_options: list[tuple[str, ...]] = [(code,) for code in beds]
    else:
        bed_options = [()]

    combinations: list[tuple[tuple[ResourceType, str], ...]] = []
    for doctors, selected_nurses, theatre, selected_beds in itertools.product(
        doctor_options, nurse_options, theatres, bed_options
    ):
        assigned = [(ResourceType.DOCTOR, code) for code in doctors]
        assigned.extend((ResourceType.NURSE, code) for code in selected_nurses)
        assigned.append((ResourceType.THEATRE, theatre))
        assigned.extend((ResourceType.BED, code) for code in selected_beds)
        combinations.append(tuple(assigned))
    return list(dict.fromkeys(combinations)), None


def _candidate_score(
    request: OptimizationRequest,
    item: OptimizationCase,
    start_slot: int,
    resources: tuple[tuple[ResourceType, str], ...],
    preferred: PreferredAssignment | None,
) -> float:
    weights = request.objective_weights
    base = float(weights.get("unscheduled_penalty", 1000.0))
    priority_weight = float(weights.get("priority", 10.0))
    delay_weight = float(weights.get("weighted_delay", 1.0))
    scheduled_start = _utc(request.horizon_start) + timedelta(
        minutes=start_slot * request.slot_minutes
    )
    delay_hours = max(
        0.0,
        (scheduled_start - _utc(item.case.requested_datetime)).total_seconds() / 3600,
    )
    urgency_factor = max(item.priority.priority_score / 100, 0.1)
    score = base + item.priority.priority_score * priority_weight - delay_hours * delay_weight * urgency_factor
    if preferred is not None:
        shift_weight = float(weights.get("disruption_time", 25.0))
        resource_weight = float(weights.get("disruption_resource", 40.0))
        keep_bonus = float(weights.get("keep_assignment", 250.0))
        shift_hours = abs((scheduled_start - _utc(preferred.start_datetime)).total_seconds()) / 3600
        selected_codes = {code for _, code in resources}
        preferred_codes = set(preferred.resource_codes)
        resource_changes = len(selected_codes.symmetric_difference(preferred_codes))
        score -= shift_hours * shift_weight + resource_changes * resource_weight
        if shift_hours < 1e-9 and resource_changes == 0:
            score += keep_bonus
    return round(score, 4)


def _overlaps(first: tuple[int, int], second: tuple[int, int]) -> bool:
    return first[0] < second[1] and second[0] < first[1]


def _case_start_bounds(
    item: OptimizationCase,
    horizon_start: datetime,
    total_slots: int,
    slot_minutes: int,
    duration_slots: int,
) -> tuple[tuple[int, int] | None, tuple[RejectionCode, str] | None]:
    slot_seconds = slot_minutes * 60
    requested = _utc(item.case.requested_datetime)
    deadline = requested + timedelta(hours=item.case.maximum_delay_hours)
    earliest = max(
        0,
        math.ceil((requested - horizon_start).total_seconds() / slot_seconds),
    )
    latest_horizon = total_slots - duration_slots
    if earliest > latest_horizon:
        return None, (
            RejectionCode.OUTSIDE_PLANNING_HORIZON,
            "The case cannot start at or after its request time and finish inside the planning horizon.",
        )
    latest_deadline = math.floor((deadline - horizon_start).total_seconds() / slot_seconds)
    latest = min(latest_horizon, latest_deadline)
    if latest < earliest:
        return None, (
            RejectionCode.DEADLINE_EXCEEDED,
            f"No slot can start by the clinical deadline {deadline.isoformat()}.",
        )
    return (earliest, latest), None


# Candidates are pre-enumerated as (resource combination x start slot), so the model grows
# multiplicatively with the size of each resource pool. Enlarging the nurse pool from 6 to 9
# takes the per-case combination count from 2 x C(6,3) x 2 x 2 = 160 to 3 x C(9,3) x 3 x 3 =
# 2268, and CP-SAT could not find any feasible solution for the resulting ~1.5M boolean
# variables within a practical time budget.
#
# The redundancy is in the resource dimension, not the temporal one: at a given start slot
# most resource combinations are interchangeable, whereas every start slot is a genuinely
# different scheduling decision. Candidates are therefore restricted per start slot,
# preserving full temporal coverage while bounding the number of interchangeable resource
# alternatives. This is a restricted candidate list; it makes the search tractable but means
# CP-SAT optimises over a subset of the full assignment space, so "optimal" is optimal with
# respect to the restricted model. The limits are deterministic, so runs stay reproducible.
#
# They are also environment-configurable, which makes them part of the experimental
# configuration rather than a constant of the code: a suite run with different values is not
# comparable with one run at these. Both are therefore reported in every result's metrics, so
# that a persisted run records the limits it was produced under. An earlier set of runs did
# not carry them, and recovering the values afterwards meant reading the environment block of
# the still-running service.
MAX_RESOURCE_OPTIONS_PER_SLOT = max(1, int(os.environ.get("OPTIMIZER_MAX_RESOURCE_OPTIONS_PER_SLOT", "6")))
MAX_CANDIDATES_PER_CASE = max(1, int(os.environ.get("OPTIMIZER_MAX_CANDIDATES_PER_CASE", "1500")))


def _restrict_candidates(by_slot: dict[int, list[Candidate]]) -> list[Candidate]:
    """Deterministically bound the candidate list while keeping every reachable start slot."""
    restricted: list[Candidate] = []
    for start_slot in sorted(by_slot):
        ranked = sorted(
            by_slot[start_slot],
            key=lambda value: (-value.score, value.resources),
        )
        restricted.extend(ranked[:MAX_RESOURCE_OPTIONS_PER_SLOT])
    if len(restricted) <= MAX_CANDIDATES_PER_CASE:
        return restricted
    # Still too large: thin the start slots evenly so the retained set continues to span the
    # whole feasible window rather than clustering at its beginning.
    stride = math.ceil(len(restricted) / MAX_CANDIDATES_PER_CASE)
    thinned = restricted[::stride]
    # Guarantee the earliest feasible placement survives; it is what the greedy baseline and
    # the waiting-time objective both depend on.
    if restricted and thinned and thinned[0] is not restricted[0]:
        thinned.insert(0, restricted[0])
    return thinned[:MAX_CANDIDATES_PER_CASE]


def build_candidate_model(request: OptimizationRequest) -> CandidateModel:
    horizon_start = _utc(request.horizon_start)
    horizon_end = _utc(request.horizon_end)
    total_slots = math.floor(
        (horizon_end - horizon_start).total_seconds() / (request.slot_minutes * 60)
    )
    resources_by_type: dict[ResourceType, list[ResourceAvailability]] = defaultdict(list)
    windows: dict[tuple[ResourceType, str], list[tuple[int, int]]] = defaultdict(list)
    code_types: dict[str, ResourceType] = {}
    for resource in request.resources:
        resources_by_type[resource.resource_type].append(resource)
        code_types[resource.resource_code] = resource.resource_type
        window = _window_slots(resource, horizon_start, horizon_end, request.slot_minutes)
        if window:
            windows[(resource.resource_type, resource.resource_code)].append(window)

    locked_occupancy: dict[tuple[ResourceType, str], list[tuple[int, int]]] = defaultdict(list)
    locked_cases: dict[str, ScheduledAllocation] = {}
    locked_conflict = False
    locked_conflict_reason: str | None = None
    case_ids = {item.case.case_id for item in request.cases}
    item_by_case = {item.case.case_id: item for item in request.cases}
    preferred_by_case = {assignment.case_id: assignment for assignment in request.preferred_assignments}
    for locked in request.locked_assignments:
        start_slot = math.floor(
            (_utc(locked.start_datetime) - horizon_start).total_seconds() / (request.slot_minutes * 60)
        )
        end_slot = math.ceil(
            (_utc(locked.end_datetime) - horizon_start).total_seconds() / (request.slot_minutes * 60)
        )
        assigned: list[ResourceAssignment] = []
        if start_slot < 0 or end_slot > total_slots:
            locked_conflict = True
            locked_conflict_reason = "A locked assignment lies outside the planning horizon."
        for code in locked.resource_codes:
            resource_type = code_types.get(code)
            if resource_type is None:
                locked_conflict = True
                locked_conflict_reason = f"Locked assignment references unknown resource {code}."
                continue
            key = (resource_type, code)
            interval = (start_slot, end_slot)
            if not any(start_slot >= window[0] and end_slot <= window[1] for window in windows[key]):
                locked_conflict = True
                locked_conflict_reason = f"Locked resource {code} is unavailable for the locked interval."
            if any(_overlaps(interval, existing) for existing in locked_occupancy[key]):
                locked_conflict = True
                locked_conflict_reason = f"Locked resource {code} is assigned to overlapping intervals."
            locked_occupancy[key].append(interval)
            assigned.append(ResourceAssignment(resource_type=resource_type, resource_code=code, stage="locked"))
        if locked.case_id in case_ids:
            item = item_by_case[locked.case_id]
            case = item.case
            deadline = _utc(case.requested_datetime) + timedelta(hours=case.maximum_delay_hours)
            if _utc(locked.start_datetime) < _utc(case.requested_datetime):
                locked_conflict = True
                locked_conflict_reason = f"Locked case {locked.case_id} starts before it was requested."
            if _utc(locked.start_datetime) > deadline:
                locked_conflict = True
                locked_conflict_reason = f"Locked case {locked.case_id} starts after its clinical deadline."
            if (_utc(locked.end_datetime) - _utc(locked.start_datetime)).total_seconds() < case.estimated_duration_minutes * 60:
                locked_conflict = True
                locked_conflict_reason = f"Locked case {locked.case_id} is shorter than its required duration."
            combinations, resource_failure = _resource_combinations(item, resources_by_type)
            assigned_keys = {(entry.resource_type, entry.resource_code) for entry in assigned}
            if resource_failure or not any(set(option).issubset(assigned_keys) for option in combinations):
                locked_conflict = True
                locked_conflict_reason = f"Locked case {locked.case_id} does not include all required compatible resources."
            locked_cases[locked.case_id] = ScheduledAllocation(
                case_id=locked.case_id,
                status=AllocationStatus.SCHEDULED,
                start_datetime=locked.start_datetime,
                end_datetime=locked.end_datetime,
                resources=assigned,
            )

    candidates: dict[str, list[Candidate]] = {}
    rejection_reasons: dict[str, tuple[RejectionCode, str]] = {}
    for item in request.cases:
        case = item.case
        if case.case_id in locked_cases:
            continue
        duration_slots = math.ceil(case.estimated_duration_minutes / request.slot_minutes)
        start_bounds, temporal_failure = _case_start_bounds(
            item, horizon_start, total_slots, request.slot_minutes, duration_slots
        )
        if temporal_failure:
            candidates[case.case_id] = []
            rejection_reasons[case.case_id] = temporal_failure
            continue
        combinations, reason = _resource_combinations(item, resources_by_type)
        case_candidates: list[Candidate] = []
        if reason is None and start_bounds is not None:
            earliest_start, latest_start = start_bounds
            by_slot: dict[int, list[Candidate]] = defaultdict(list)
            for resource_set in combinations:
                for start_slot in range(earliest_start, latest_start + 1):
                    end_slot = start_slot + duration_slots
                    fits = True
                    for key in resource_set:
                        if not any(start_slot >= window[0] and end_slot <= window[1] for window in windows[key]):
                            fits = False
                            break
                        if any(_overlaps((start_slot, end_slot), interval) for interval in locked_occupancy[key]):
                            fits = False
                            break
                    if fits:
                        by_slot[start_slot].append(
                            Candidate(
                                case_id=case.case_id,
                                start_slot=start_slot,
                                end_slot=end_slot,
                                resources=resource_set,
                                score=_candidate_score(
                                    request,
                                    item,
                                    start_slot,
                                    resource_set,
                                    preferred_by_case.get(case.case_id),
                                ),
                            )
                        )
            case_candidates = _restrict_candidates(by_slot)
        if not case_candidates:
            rejection_reasons[case.case_id] = reason or (
                RejectionCode.NO_COMMON_RESOURCE_WINDOW,
                "No common conflict-free resource window satisfies availability, duration and clinical deadline constraints.",
            )
        candidates[case.case_id] = case_candidates

    return CandidateModel(
        horizon_start=horizon_start,
        slot_minutes=request.slot_minutes,
        cases=request.cases,
        candidates=candidates,
        rejection_reasons=rejection_reasons,
        locked_cases=locked_cases,
        locked_occupancy=dict(locked_occupancy),
        resource_windows=dict(windows),
        locked_conflict=locked_conflict,
        locked_conflict_reason=locked_conflict_reason,
    )


def _solve_branch_and_bound(
    model: CandidateModel, max_seconds: int
) -> tuple[dict[str, Candidate], str, float, float | None, float | None]:
    started = time.perf_counter()
    priority = {item.case.case_id: item.priority.priority_score for item in model.cases}
    case_ids = sorted(
        model.candidates,
        key=lambda case_id: (-priority[case_id], len(model.candidates[case_id]), case_id),
    )
    ordered_candidates = {
        case_id: sorted(model.candidates[case_id], key=lambda value: (-value.score, value.start_slot, value.resources))
        for case_id in case_ids
    }
    upper = [max([candidate.score for candidate in ordered_candidates[case_id]], default=0.0) for case_id in case_ids]
    suffix_bound = [0.0] * (len(case_ids) + 1)
    for index in range(len(case_ids) - 1, -1, -1):
        suffix_bound[index] = suffix_bound[index + 1] + max(upper[index], 0.0)

    occupied = {key: list(intervals) for key, intervals in model.locked_occupancy.items()}
    current: dict[str, Candidate] = {}
    best: dict[str, Candidate] = {}
    best_score = -math.inf
    timed_out = False

    def visit(index: int, score: float) -> None:
        nonlocal best, best_score, timed_out
        if time.perf_counter() - started >= max_seconds:
            timed_out = True
            return
        if score + suffix_bound[index] <= best_score + 1e-9:
            return
        if index == len(case_ids):
            if score > best_score:
                best_score = score
                best = dict(current)
            return
        case_id = case_ids[index]
        for candidate in ordered_candidates[case_id]:
            interval = (candidate.start_slot, candidate.end_slot)
            if any(any(_overlaps(interval, existing) for existing in occupied.get(key, [])) for key in candidate.resources):
                continue
            current[case_id] = candidate
            for key in candidate.resources:
                occupied.setdefault(key, []).append(interval)
            visit(index + 1, score + candidate.score)
            for key in candidate.resources:
                occupied[key].pop()
            current.pop(case_id, None)
            if timed_out:
                break
        visit(index + 1, score)

    visit(0, 0.0)
    if best_score == -math.inf:
        best_score = 0.0
    status = "FEASIBLE" if timed_out else "OPTIMAL"
    bound = None if timed_out else best_score
    gap = None if timed_out else 0.0
    return best, status, best_score, bound, gap


def _solve_priority_greedy(
    model: CandidateModel,
) -> tuple[dict[str, Candidate], str, float, float | None, float | None]:
    """Schedule each case once in descending clinical priority using its earliest feasible slot.

    This deliberately non-optimal baseline makes the experiment meaningful: it follows the
    explainable priority policy but never backtracks to improve global theatre utilisation.
    """

    priority = {item.case.case_id: item.priority.priority_score for item in model.cases}
    requested = {item.case.case_id: _utc(item.case.requested_datetime) for item in model.cases}
    case_ids = sorted(
        model.candidates,
        key=lambda case_id: (-priority[case_id], requested[case_id], case_id),
    )
    occupied = {key: list(intervals) for key, intervals in model.locked_occupancy.items()}
    chosen: dict[str, Candidate] = {}
    objective = 0.0
    for case_id in case_ids:
        candidates = sorted(
            model.candidates[case_id],
            key=lambda value: (value.start_slot, -value.score, value.resources),
        )
        for candidate in candidates:
            interval = (candidate.start_slot, candidate.end_slot)
            if any(
                any(_overlaps(interval, existing) for existing in occupied.get(key, []))
                for key in candidate.resources
            ):
                continue
            chosen[case_id] = candidate
            objective += candidate.score
            for key in candidate.resources:
                occupied.setdefault(key, []).append(interval)
            break
    return chosen, "FEASIBLE", objective, None, None


def _greedy_hint(model: CandidateModel) -> dict[str, int]:
    """Map each case to the index of the candidate chosen by the greedy baseline.

    The greedy schedule is feasible by construction, so handing it to CP-SAT as a starting
    assignment guarantees an incumbent solution on instances where the solver would otherwise
    exhaust its time budget before finding one.
    """
    chosen, _status, _objective, _bound, _gap = _solve_priority_greedy(model)
    hint: dict[str, int] = {}
    for case_id, candidate in chosen.items():
        for index, option in enumerate(model.candidates.get(case_id, [])):
            if option is candidate:
                hint[case_id] = index
                break
    return hint


def _allocation_from_candidate(model: CandidateModel, candidate: Candidate) -> ScheduledAllocation:
    start = model.horizon_start + timedelta(minutes=candidate.start_slot * model.slot_minutes)
    end = model.horizon_start + timedelta(minutes=candidate.end_slot * model.slot_minutes)
    return ScheduledAllocation(
        case_id=candidate.case_id,
        status=AllocationStatus.SCHEDULED,
        start_datetime=start,
        end_datetime=end,
        resources=[
            ResourceAssignment(resource_type=resource_type, resource_code=code, stage="procedure")
            for resource_type, code in candidate.resources
        ],
    )


def solve_schedule(request: OptimizationRequest, engine: str | None = None) -> OptimizationResult:
    started = time.perf_counter()
    model = build_candidate_model(request)
    configured_engine = request.solver_engine
    requested_engine = (
        engine
        or (configured_engine if configured_engine != "auto" else os.environ.get("OPTIMIZER_ENGINE", "auto"))
    ).strip().lower()
    if requested_engine not in {"auto", "cp-sat", "fallback", "priority-greedy"}:
        raise ValueError("Optimizer engine must be auto, cp-sat, fallback, or priority-greedy")

    cp_sat_fallback_used = False
    if model.locked_conflict:
        chosen, status, objective, bound, gap = {}, "INFEASIBLE", 0.0, None, None
        if requested_engine == "cp-sat":
            algorithm = CP_SAT_ALGORITHM
        elif requested_engine == "priority-greedy":
            algorithm = PRIORITY_GREEDY_ALGORITHM
        else:
            algorithm = FALLBACK_ALGORITHM
    elif requested_engine == "priority-greedy":
        chosen, status, objective, bound, gap = _solve_priority_greedy(model)
        algorithm = PRIORITY_GREEDY_ALGORITHM
    elif requested_engine == "cp-sat":
        chosen, status, objective, bound, gap = cp_sat_adapter.solve(
            model.candidates, model.locked_occupancy, request.max_solve_seconds, request.random_seed,
            hint=_greedy_hint(model)
        )
        algorithm = CP_SAT_ALGORITHM
    elif requested_engine == "auto" and cp_sat_adapter.is_available():
        try:
            chosen, status, objective, bound, gap = cp_sat_adapter.solve(
                model.candidates, model.locked_occupancy, request.max_solve_seconds, request.random_seed,
                hint=_greedy_hint(model)
            )
            algorithm = CP_SAT_ALGORITHM
        except Exception:
            chosen, status, objective, bound, gap = _solve_branch_and_bound(
                model, request.max_solve_seconds
            )
            algorithm = FALLBACK_ALGORITHM
            cp_sat_fallback_used = True
    else:
        chosen, status, objective, bound, gap = _solve_branch_and_bound(model, request.max_solve_seconds)
        algorithm = FALLBACK_ALGORITHM
        cp_sat_fallback_used = requested_engine == "auto"

    allocations: list[ScheduledAllocation] = []
    for item in request.cases:
        case_id = item.case.case_id
        if model.locked_conflict:
            allocations.append(
                ScheduledAllocation(
                    case_id=case_id,
                    status=AllocationStatus.UNSCHEDULED,
                    rejection_code=RejectionCode.LOCKED_ASSIGNMENT_CONFLICT,
                    rejection_reason=model.locked_conflict_reason
                    or "Locked assignments contain an invalid or conflicting hard constraint.",
                )
            )
        elif case_id in model.locked_cases:
            allocations.append(model.locked_cases[case_id])
        elif case_id in chosen:
            allocations.append(_allocation_from_candidate(model, chosen[case_id]))
        else:
            rejection = model.rejection_reasons.get(case_id)
            rejection_code, reason = rejection or (
                RejectionCode.CAPACITY_EXHAUSTED,
                "All feasible resource capacity was assigned to higher-priority cases.",
            )
            allocations.append(
                ScheduledAllocation(
                    case_id=case_id,
                    status=AllocationStatus.UNSCHEDULED,
                    rejection_code=rejection_code,
                    rejection_reason=reason,
                )
            )

    scheduled = [allocation for allocation in allocations if allocation.status == AllocationStatus.SCHEDULED]
    scheduled_ids = {allocation.case_id for allocation in scheduled}
    scheduled_priority = sum(
        item.priority.priority_score for item in request.cases if item.case.case_id in scheduled_ids
    )
    scheduled_minutes = sum(
        item.case.estimated_duration_minutes for item in request.cases if item.case.case_id in scheduled_ids
    )
    case_lookup = {item.case.case_id: item.case for item in request.cases}
    waiting_hours = [
        max(
            0.0,
            (_utc(allocation.start_datetime) - _utc(case_lookup[allocation.case_id].requested_datetime)).total_seconds()
            / 3600,
        )
        for allocation in scheduled
        if allocation.start_datetime is not None
    ]
    deadline_breaches = sum(
        waiting > case_lookup[allocation.case_id].maximum_delay_hours
        for allocation, waiting in zip(scheduled, waiting_hours)
    )
    theatre_capacity_slots = sum(
        end - start
        for (resource_type, _), resource_windows in model.resource_windows.items()
        if resource_type == ResourceType.THEATRE
        for start, end in resource_windows
    )
    theatre_busy_slots = sum(
        math.ceil(case_lookup[allocation.case_id].estimated_duration_minutes / request.slot_minutes)
        for allocation in scheduled
        if any(resource.resource_type == ResourceType.THEATRE for resource in allocation.resources)
    )
    theatre_utilisation = (
        theatre_busy_slots * 100 / theatre_capacity_slots if theatre_capacity_slots else 0.0
    )
    preferred_by_case = {assignment.case_id: assignment for assignment in request.preferred_assignments}
    unchanged_cases = 0
    moved_cases = 0
    total_shift_minutes = 0
    resource_changes = 0
    for allocation in scheduled:
        preferred = preferred_by_case.get(allocation.case_id)
        if preferred is None or allocation.start_datetime is None:
            continue
        shift_minutes = round(
            abs((_utc(allocation.start_datetime) - _utc(preferred.start_datetime)).total_seconds()) / 60
        )
        current_codes = {resource.resource_code for resource in allocation.resources}
        changed_resources = len(current_codes.symmetric_difference(set(preferred.resource_codes)))
        total_shift_minutes += shift_minutes
        resource_changes += changed_resources
        if shift_minutes == 0 and changed_resources == 0:
            unchanged_cases += 1
        else:
            moved_cases += 1
    return OptimizationResult(
        run_id=request.run_id,
        algorithm=algorithm,
        solver_status=status,
        objective_value=round(objective, 4) if status in {"OPTIMAL", "FEASIBLE"} else None,
        best_bound=round(bound, 4) if bound is not None else None,
        optimality_gap=round(gap, 6) if gap is not None else None,
        runtime_ms=max(0, round((time.perf_counter() - started) * 1000)),
        allocations=allocations,
        metrics={
            "scheduled_cases": len(scheduled),
            "unscheduled_cases": len(allocations) - len(scheduled),
            "scheduled_minutes": scheduled_minutes,
            "scheduled_priority_points": round(scheduled_priority, 2),
            "resource_assignments": sum(len(allocation.resources) for allocation in scheduled),
            "average_waiting_hours": round(sum(waiting_hours) / len(waiting_hours), 2)
            if waiting_hours
            else 0.0,
            "max_waiting_hours": round(max(waiting_hours), 2) if waiting_hours else 0.0,
            "deadline_breaches": deadline_breaches,
            "hard_constraint_violations": deadline_breaches,
            "cp_sat_fallback_used": 1 if cp_sat_fallback_used else 0,
            "max_resource_options_per_slot": MAX_RESOURCE_OPTIONS_PER_SLOT,
            "max_candidates_per_case": MAX_CANDIDATES_PER_CASE,
            "theatre_utilisation_percent": round(theatre_utilisation, 2),
            "continuity_unchanged_cases": unchanged_cases,
            "continuity_moved_cases": moved_cases,
            "continuity_total_shift_minutes": total_shift_minutes,
            "continuity_resource_changes": resource_changes,
        },
        generated_at=datetime.now(timezone.utc),
    )
