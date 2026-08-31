import unittest
from datetime import datetime, timedelta, timezone

from contracts.models import (
    AllocationStatus,
    OptimizationResult,
    ResourceAssignment,
    ResourceType,
    ScheduledAllocation,
)
from services.evaluation_service.evaluator import EVALUATOR_VERSION, evaluate_result


START = datetime(2026, 8, 21, 8, 0, tzinfo=timezone.utc)


def allocation(case_id: str, start_hour: float, duration_hours: float, resources):
    start = START + timedelta(hours=start_hour)
    return ScheduledAllocation(
        case_id=case_id,
        status=AllocationStatus.SCHEDULED,
        start_datetime=start,
        end_datetime=start + timedelta(hours=duration_hours),
        resources=[
            ResourceAssignment(resource_type=resource_type, resource_code=code, stage="procedure")
            for resource_type, code in resources
        ],
    )


def result(allocations, **metrics):
    return OptimizationResult(
        run_id="EVAL-TEST",
        algorithm="TEST_SOLVER",
        solver_status="OPTIMAL",
        objective_value=100,
        best_bound=100,
        optimality_gap=0,
        runtime_ms=25,
        allocations=allocations,
        metrics=metrics,
        generated_at=START,
    )


class EvaluationTests(unittest.TestCase):
    def test_conflict_free_schedule_metrics(self):
        allocations = [
            allocation("A", 0, 1, [(ResourceType.DOCTOR, "D1"), (ResourceType.THEATRE, "T1")]),
            allocation("B", 1, 1, [(ResourceType.DOCTOR, "D1"), (ResourceType.THEATRE, "T1")]),
        ]

        report = evaluate_result(result(allocations, average_waiting_hours=4.5))

        self.assertEqual(report.metrics["scheduled_rate"], 1.0)
        self.assertEqual(report.metrics["total_conflicts"], 0)
        self.assertEqual(report.metrics["observed_theatre_utilisation_percent"], 100.0)
        self.assertEqual(report.workload_summary["total_doctor_minutes"], 120.0)
        self.assertTrue(any(EVALUATOR_VERSION in note for note in report.notes))

    def test_overlapping_named_resource_is_reported(self):
        allocations = [
            allocation("A", 0, 2, [(ResourceType.DOCTOR, "D-CONFLICT")]),
            allocation("B", 1, 2, [(ResourceType.DOCTOR, "D-CONFLICT")]),
        ]

        report = evaluate_result(result(allocations))

        self.assertEqual(report.metrics["total_conflicts"], 1)
        self.assertEqual(report.conflicts_by_resource["doctor"], 1)
        self.assertEqual(report.conflicts_by_resource["doctor:D-CONFLICT"], 1)
        self.assertEqual(report.metrics["conflict_free"], 0)

    def test_balanced_doctor_workload_has_perfect_fairness(self):
        allocations = [
            allocation("A", 0, 1, [(ResourceType.DOCTOR, "D1")]),
            allocation("B", 1, 1, [(ResourceType.DOCTOR, "D2")]),
        ]

        report = evaluate_result(result(allocations))

        self.assertEqual(report.workload_summary["doctor_workload_cv"], 0.0)
        self.assertEqual(report.workload_summary["doctor_workload_gini"], 0.0)
        self.assertEqual(report.workload_summary["jain_fairness_index"], 1.0)

    def test_unscheduled_cases_reduce_schedule_rate(self):
        allocations = [
            allocation("A", 0, 1, [(ResourceType.THEATRE, "T1")]),
            ScheduledAllocation(
                case_id="B",
                status=AllocationStatus.UNSCHEDULED,
                rejection_reason="No resource",
            ),
        ]

        report = evaluate_result(result(allocations))

        self.assertEqual(report.metrics["scheduled_cases"], 1)
        self.assertEqual(report.metrics["unscheduled_cases"], 1)
        self.assertEqual(report.metrics["scheduled_rate"], 0.5)

    def test_empty_schedule_is_safe(self):
        report = evaluate_result(
            result(
                [
                    ScheduledAllocation(
                        case_id="NONE",
                        status=AllocationStatus.UNSCHEDULED,
                        rejection_reason="Infeasible",
                    )
                ]
            )
        )

        self.assertEqual(report.metrics["observed_doctor_utilisation_percent"], 0.0)
        self.assertEqual(report.workload_summary["doctor_count"], 0)
        self.assertEqual(report.workload_summary["jain_fairness_index"], 1.0)


if __name__ == "__main__":
    unittest.main()
