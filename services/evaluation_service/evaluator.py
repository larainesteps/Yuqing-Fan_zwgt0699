"""Deterministic quality metrics for an optimization result."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timezone

from contracts.models import AllocationStatus, EvaluationReport, OptimizationResult, ResourceType


EVALUATOR_VERSION = "evaluation-v1.0"


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _minutes(start: datetime, end: datetime) -> float:
    return max(0.0, (_utc(end) - _utc(start)).total_seconds() / 60)


def _overlaps(first: tuple[datetime, datetime], second: tuple[datetime, datetime]) -> bool:
    return _utc(first[0]) < _utc(second[1]) and _utc(second[0]) < _utc(first[1])


def _union_minutes(intervals: list[tuple[datetime, datetime]]) -> float:
    if not intervals:
        return 0.0
    ordered = sorted((_utc(start), _utc(end)) for start, end in intervals)
    merged: list[tuple[datetime, datetime]] = []
    for start, end in ordered:
        if not merged or start > merged[-1][1]:
            merged.append((start, end))
        elif end > merged[-1][1]:
            merged[-1] = (merged[-1][0], end)
    return sum(_minutes(start, end) for start, end in merged)


def _gini(values: list[float]) -> float:
    if not values or sum(values) == 0:
        return 0.0
    ordered = sorted(values)
    count = len(ordered)
    weighted = sum((index + 1) * value for index, value in enumerate(ordered))
    return (2 * weighted) / (count * sum(ordered)) - (count + 1) / count


def _workload_summary(doctor_minutes: dict[str, float]) -> dict[str, float | int]:
    values = list(doctor_minutes.values())
    if not values:
        return {
            "doctor_count": 0,
            "total_doctor_minutes": 0.0,
            "mean_doctor_minutes": 0.0,
            "doctor_workload_stddev": 0.0,
            "doctor_workload_cv": 0.0,
            "doctor_workload_gini": 0.0,
            "jain_fairness_index": 1.0,
            "min_doctor_minutes": 0.0,
            "max_doctor_minutes": 0.0,
        }
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    squares = sum(value * value for value in values)
    fairness = (sum(values) ** 2) / (len(values) * squares) if squares else 1.0
    return {
        "doctor_count": len(values),
        "total_doctor_minutes": round(sum(values), 2),
        "mean_doctor_minutes": round(mean, 2),
        "doctor_workload_stddev": round(math.sqrt(variance), 2),
        "doctor_workload_cv": round(math.sqrt(variance) / mean, 4) if mean else 0.0,
        "doctor_workload_gini": round(_gini(values), 4),
        "jain_fairness_index": round(fairness, 4),
        "min_doctor_minutes": round(min(values), 2),
        "max_doctor_minutes": round(max(values), 2),
    }


def evaluate_result(result: OptimizationResult) -> EvaluationReport:
    scheduled = [
        allocation
        for allocation in result.allocations
        if allocation.status == AllocationStatus.SCHEDULED
        and allocation.start_datetime is not None
        and allocation.end_datetime is not None
    ]
    total_cases = len(result.allocations)
    scheduled_count = len(scheduled)
    unscheduled_count = total_cases - scheduled_count

    intervals_by_resource: dict[
        tuple[ResourceType, str], list[tuple[str, datetime, datetime]]
    ] = defaultdict(list)
    doctor_minutes: dict[str, float] = defaultdict(float)
    resource_types_used: dict[ResourceType, set[str]] = defaultdict(set)
    for allocation in scheduled:
        start = allocation.start_datetime
        end = allocation.end_datetime
        duration = _minutes(start, end)
        seen: set[tuple[ResourceType, str]] = set()
        for assignment in allocation.resources:
            key = (assignment.resource_type, assignment.resource_code)
            if key in seen:
                continue
            seen.add(key)
            intervals_by_resource[key].append((allocation.case_id, start, end))
            resource_types_used[assignment.resource_type].add(assignment.resource_code)
            if assignment.resource_type == ResourceType.DOCTOR:
                doctor_minutes[assignment.resource_code] += duration

    conflicts_by_type = {resource_type.value: 0 for resource_type in ResourceType}
    detailed_conflicts: dict[str, int] = {}
    total_conflicts = 0
    for (resource_type, resource_code), entries in intervals_by_resource.items():
        resource_conflicts = 0
        for index, first in enumerate(entries):
            for second in entries[index + 1 :]:
                if first[0] != second[0] and _overlaps((first[1], first[2]), (second[1], second[2])):
                    resource_conflicts += 1
        if resource_conflicts:
            detailed_conflicts[f"{resource_type.value}:{resource_code}"] = resource_conflicts
            conflicts_by_type[resource_type.value] += resource_conflicts
            total_conflicts += resource_conflicts

    metrics: dict[str, float | int] = dict(result.metrics)
    metrics.update(
        {
            "total_cases": total_cases,
            "scheduled_cases": scheduled_count,
            "unscheduled_cases": unscheduled_count,
            "scheduled_rate": round(scheduled_count / total_cases, 4) if total_cases else 0.0,
            "scheduled_percent": round(scheduled_count * 100 / total_cases, 2) if total_cases else 0.0,
            "total_conflicts": total_conflicts,
            "conflict_free": 1 if total_conflicts == 0 else 0,
            "runtime_ms": result.runtime_ms,
        }
    )
    if result.optimality_gap is not None:
        metrics["optimality_gap"] = result.optimality_gap

    notes = [f"Metrics generated by {EVALUATOR_VERSION}."]
    if scheduled:
        observed_start = min(_utc(allocation.start_datetime) for allocation in scheduled)
        observed_end = max(_utc(allocation.end_datetime) for allocation in scheduled)
        observed_minutes = _minutes(observed_start, observed_end)
        metrics["observed_schedule_minutes"] = round(observed_minutes, 2)
        for resource_type in ResourceType:
            codes = resource_types_used[resource_type]
            if not codes or observed_minutes <= 0:
                utilisation = 0.0
            else:
                busy = sum(
                    _union_minutes(
                        [(start, end) for _, start, end in intervals_by_resource[(resource_type, code)]]
                    )
                    for code in codes
                )
                utilisation = busy * 100 / (len(codes) * observed_minutes)
            metrics[f"observed_{resource_type.value}_utilisation_percent"] = round(utilisation, 2)
        notes.append(
            "Observed utilisation uses the first scheduled start and last scheduled end as its denominator."
        )
    else:
        for resource_type in ResourceType:
            metrics[f"observed_{resource_type.value}_utilisation_percent"] = 0.0
        notes.append("No scheduled allocations were available for utilisation or workload analysis.")

    if total_conflicts:
        notes.append(f"Detected {total_conflicts} overlapping assignment pair(s) on the same resource.")
    else:
        notes.append("No overlapping assignments were detected for any named resource.")
    if "average_waiting_hours" not in metrics:
        notes.append(
            "Waiting-time metrics were not present in this optimization result; use a current Optimizer output."
        )

    conflicts_by_resource = {**conflicts_by_type, **detailed_conflicts}
    return EvaluationReport(
        run_id=result.run_id,
        baseline_run_id=None,
        algorithm=result.algorithm,
        metrics=metrics,
        conflicts_by_resource=conflicts_by_resource,
        workload_summary=_workload_summary(dict(doctor_minutes)),
        notes=notes,
        generated_at=datetime.now(timezone.utc),
    )
