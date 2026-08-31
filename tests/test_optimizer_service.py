import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from contracts.models import (
    AllocationStatus,
    CaseExtraction,
    LockedAssignment,
    OptimizationCase,
    OptimizationRequest,
    PreferredAssignment,
    PriorityAssessment,
    RejectionCode,
    ResourceAvailability,
    ResourceType,
    Urgency,
)
from services.optimizer_service.cp_sat_adapter import is_available
from services.optimizer_service.solver import (
    CP_SAT_ALGORITHM,
    FALLBACK_ALGORITHM,
    PRIORITY_GREEDY_ALGORITHM,
    solve_schedule,
)


START = datetime(2026, 8, 21, 8, 0, tzinfo=timezone.utc)


def make_case(case_id: str, score: float = 70, duration: int = 60, **updates) -> OptimizationCase:
    case_payload = {
        "case_id": case_id,
        "procedure": "Test procedure",
        "speciality": "General Surgery",
        "urgency": Urgency.URGENT,
        "requested_datetime": START - timedelta(hours=12),
        "estimated_duration_minutes": duration,
        "maximum_delay_hours": 48,
        "required_nurses": 0,
        "required_theatre_type": "general",
        "confidence": 1,
        "human_review_required": False,
        "extractor_version": "test",
    }
    case_payload.update(updates)
    case = CaseExtraction(**case_payload)
    priority = PriorityAssessment(
        case_id=case_id,
        priority_score=score,
        priority_level=case.urgency,
        components={"test": score},
        policy_version="test",
        assessed_at=START,
    )
    return OptimizationCase(case=case, priority=priority)


def resource(resource_type: ResourceType, code: str, **attributes) -> ResourceAvailability:
    return ResourceAvailability(
        resource_type=resource_type,
        resource_code=code,
        speciality="General Surgery" if resource_type != ResourceType.BED else None,
        available_from=START,
        available_to=START + timedelta(hours=8),
        attributes=attributes,
    )


def make_request(cases, resources, horizon_hours=8, locked=None, preferred=None, weights=None) -> OptimizationRequest:
    return OptimizationRequest(
        run_id="OPTIMIZER-TEST",
        horizon_start=START,
        horizon_end=START + timedelta(hours=horizon_hours),
        slot_minutes=30,
        max_solve_seconds=5,
        cases=cases,
        resources=resources,
        locked_assignments=locked or [],
        preferred_assignments=preferred or [],
        objective_weights=weights or {},
    )


class OptimizerTests(unittest.TestCase):
    def test_priority_greedy_is_a_distinct_explainable_baseline(self):
        high = make_case("GREEDY-HIGH", score=95, duration=60)
        low = make_case("GREEDY-LOW", score=20, duration=60)
        theatre = resource(ResourceType.THEATRE, "T-GREEDY", theatre_type="general")
        request = make_request([low, high], [theatre], horizon_hours=1)
        request.solver_engine = "priority-greedy"

        result = solve_schedule(request)

        self.assertEqual(result.algorithm, PRIORITY_GREEDY_ALGORITHM)
        self.assertEqual(result.solver_status, "FEASIBLE")
        scheduled = [entry.case_id for entry in result.allocations if entry.status == AllocationStatus.SCHEDULED]
        self.assertEqual(scheduled, ["GREEDY-HIGH"])
        self.assertEqual(result.metrics["hard_constraint_violations"], 0)

    def test_assigns_all_required_resource_types(self):
        case = make_case(
            "FULL-RESOURCE",
            duration=90,
            required_doctors=["surgeon", "anaesthetist"],
            required_nurses=2,
            required_bed_type="ICU",
        )
        resources = [
            resource(ResourceType.DOCTOR, "D-SURGEON", role="surgeon"),
            resource(ResourceType.DOCTOR, "D-ANAES", role="anaesthetist"),
            resource(ResourceType.NURSE, "N-1"),
            resource(ResourceType.NURSE, "N-2"),
            resource(ResourceType.THEATRE, "T-1", theatre_type="general"),
            resource(ResourceType.BED, "B-ICU", bed_type="ICU"),
        ]

        result = solve_schedule(make_request([case], resources), engine="fallback")

        self.assertEqual(result.solver_status, "OPTIMAL")
        self.assertEqual(result.algorithm, FALLBACK_ALGORITHM)
        allocation = result.allocations[0]
        self.assertEqual(allocation.status, AllocationStatus.SCHEDULED)
        self.assertEqual({entry.resource_type for entry in allocation.resources}, set(ResourceType))
        self.assertEqual(len(allocation.resources), 6)

    def test_shared_theatre_goes_to_higher_priority_case(self):
        high = make_case("HIGH", score=95)
        low = make_case("LOW", score=20)
        theatre = resource(ResourceType.THEATRE, "ONLY-THEATRE", theatre_type="general")

        result = solve_schedule(make_request([low, high], [theatre], horizon_hours=1), engine="fallback")

        by_id = {allocation.case_id: allocation for allocation in result.allocations}
        self.assertEqual(by_id["HIGH"].status, AllocationStatus.SCHEDULED)
        self.assertEqual(by_id["LOW"].status, AllocationStatus.UNSCHEDULED)
        self.assertEqual(by_id["LOW"].rejection_code, RejectionCode.CAPACITY_EXHAUSTED)

    def test_parallel_theatres_allow_parallel_cases(self):
        cases = [make_case("PARALLEL-1"), make_case("PARALLEL-2")]
        resources = [
            resource(ResourceType.THEATRE, "T-1", theatre_type="general"),
            resource(ResourceType.THEATRE, "T-2", theatre_type="general"),
        ]

        result = solve_schedule(make_request(cases, resources, horizon_hours=1), engine="fallback")

        self.assertEqual(result.metrics["scheduled_cases"], 2)
        self.assertEqual({allocation.start_datetime for allocation in result.allocations}, {START})

    def test_locked_assignment_blocks_occupied_time(self):
        case = make_case("AFTER-LOCK")
        theatre = resource(ResourceType.THEATRE, "T-LOCKED", theatre_type="general")
        locked = LockedAssignment(
            case_id="EXISTING",
            start_datetime=START,
            end_datetime=START + timedelta(hours=2),
            resource_codes=["T-LOCKED"],
        )

        result = solve_schedule(make_request([case], [theatre], locked=[locked]), engine="fallback")

        self.assertEqual(result.allocations[0].start_datetime, START + timedelta(hours=2))

    def test_preferred_assignment_minimises_schedule_disruption(self):
        case = make_case("KEEP-ME")
        theatre = resource(ResourceType.THEATRE, "T-STABLE", theatre_type="general")
        preferred = PreferredAssignment(
            case_id="KEEP-ME",
            start_datetime=START + timedelta(hours=2),
            end_datetime=START + timedelta(hours=3),
            resource_codes=["T-STABLE"],
        )

        result = solve_schedule(
            make_request(
                [case],
                [theatre],
                preferred=[preferred],
                weights={"keep_assignment": 500, "disruption_time": 100},
            ),
            engine="fallback",
        )

        self.assertEqual(result.allocations[0].start_datetime, START + timedelta(hours=2))
        self.assertEqual(result.metrics["continuity_unchanged_cases"], 1)

    def test_missing_required_resource_is_explained(self):
        case = make_case("NO-THEATRE")
        nurse = resource(ResourceType.NURSE, "N-ONLY")

        result = solve_schedule(make_request([case], [nurse]), engine="fallback")

        allocation = result.allocations[0]
        self.assertEqual(allocation.status, AllocationStatus.UNSCHEDULED)
        self.assertEqual(allocation.rejection_code, RejectionCode.NO_MATCHING_THEATRE)
        self.assertIn("theatre", allocation.rejection_reason.lower())

    def test_each_missing_clinical_resource_has_a_stable_code(self):
        theatre = resource(ResourceType.THEATRE, "T-REASONS", theatre_type="general")
        cases_and_codes = [
            (
                make_case("NO-DOCTOR", required_doctors=["surgeon"]),
                [theatre],
                RejectionCode.DOCTOR_UNAVAILABLE,
            ),
            (
                make_case("NO-NURSES", required_nurses=2),
                [theatre, resource(ResourceType.NURSE, "N-ONLY")],
                RejectionCode.INSUFFICIENT_NURSES,
            ),
            (
                make_case("NO-BED", required_bed_type="ICU"),
                [theatre],
                RejectionCode.NO_RECOVERY_BED,
            ),
        ]

        for case, resources, expected_code in cases_and_codes:
            with self.subTest(case_id=case.case.case_id):
                result = solve_schedule(make_request([case], resources), engine="fallback")
                self.assertEqual(result.allocations[0].rejection_code, expected_code)

    def test_disjoint_resource_windows_are_rejected(self):
        case = make_case("NO-COMMON-WINDOW", required_doctors=["surgeon"])
        doctor = ResourceAvailability(
            resource_type=ResourceType.DOCTOR,
            resource_code="D-EARLY",
            speciality="General Surgery",
            available_from=START,
            available_to=START + timedelta(hours=3),
            attributes={"role": "surgeon"},
        )
        theatre = ResourceAvailability(
            resource_type=ResourceType.THEATRE,
            resource_code="T-LATE",
            speciality="General Surgery",
            available_from=START + timedelta(hours=4),
            available_to=START + timedelta(hours=8),
            attributes={"theatre_type": "general"},
        )

        result = solve_schedule(make_request([case], [doctor, theatre]), engine="fallback")

        self.assertEqual(
            result.allocations[0].rejection_code,
            RejectionCode.NO_COMMON_RESOURCE_WINDOW,
        )

    def test_request_after_horizon_has_a_stable_code(self):
        future = make_case(
            "AFTER-HORIZON",
            requested_datetime=START + timedelta(hours=9),
            maximum_delay_hours=2,
        )
        theatre = resource(ResourceType.THEATRE, "T-HORIZON", theatre_type="general")

        result = solve_schedule(make_request([future], [theatre]), engine="fallback")

        self.assertEqual(
            result.allocations[0].rejection_code,
            RejectionCode.OUTSIDE_PLANNING_HORIZON,
        )

    def test_clinical_deadline_is_a_hard_constraint(self):
        expired = make_case(
            "EXPIRED",
            requested_datetime=START - timedelta(hours=2),
            maximum_delay_hours=1,
        )
        theatre = resource(ResourceType.THEATRE, "T-DEADLINE", theatre_type="general")

        result = solve_schedule(make_request([expired], [theatre]), engine="fallback")

        allocation = result.allocations[0]
        self.assertEqual(allocation.status, AllocationStatus.UNSCHEDULED)
        self.assertEqual(allocation.rejection_code, RejectionCode.DEADLINE_EXCEEDED)
        self.assertEqual(result.metrics["deadline_breaches"], 0)
        self.assertEqual(result.metrics["hard_constraint_violations"], 0)

    def test_case_never_starts_before_request_time(self):
        future = make_case(
            "FUTURE",
            requested_datetime=START + timedelta(hours=2),
            maximum_delay_hours=3,
        )
        theatre = resource(ResourceType.THEATRE, "T-FUTURE", theatre_type="general")

        result = solve_schedule(make_request([future], [theatre]), engine="fallback")

        self.assertEqual(result.allocations[0].start_datetime, START + timedelta(hours=2))

    def test_invalid_locked_deadline_makes_model_infeasible(self):
        case = make_case(
            "LOCKED-LATE",
            requested_datetime=START,
            maximum_delay_hours=1,
        )
        theatre = resource(ResourceType.THEATRE, "T-LATE", theatre_type="general")
        locked = LockedAssignment(
            case_id="LOCKED-LATE",
            start_datetime=START + timedelta(hours=2),
            end_datetime=START + timedelta(hours=3),
            resource_codes=["T-LATE"],
        )

        result = solve_schedule(make_request([case], [theatre], locked=[locked]), engine="fallback")

        self.assertEqual(result.solver_status, "INFEASIBLE")
        self.assertEqual(result.allocations[0].status, AllocationStatus.UNSCHEDULED)
        self.assertEqual(
            result.allocations[0].rejection_code,
            RejectionCode.LOCKED_ASSIGNMENT_CONFLICT,
        )

    @unittest.skipUnless(is_available(), "OR-Tools is not installed")
    def test_cp_sat_adapter_solves_the_hard_constraint_model(self):
        case = make_case("CP-SAT")
        theatre = resource(ResourceType.THEATRE, "T-CP", theatre_type="general")

        result = solve_schedule(make_request([case], [theatre]), engine="cp-sat")

        self.assertEqual(result.algorithm, CP_SAT_ALGORITHM)
        self.assertEqual(result.solver_status, "OPTIMAL")
        self.assertEqual(result.allocations[0].status, AllocationStatus.SCHEDULED)
        self.assertEqual(result.metrics["hard_constraint_violations"], 0)

    def test_auto_engine_safely_falls_back_when_cp_sat_fails(self):
        case = make_case("SAFE-FALLBACK")
        theatre = resource(ResourceType.THEATRE, "T-FALLBACK", theatre_type="general")

        with patch(
            "services.optimizer_service.solver.cp_sat_adapter.is_available",
            return_value=True,
        ), patch(
            "services.optimizer_service.solver.cp_sat_adapter.solve",
            side_effect=RuntimeError("simulated adapter failure"),
        ):
            result = solve_schedule(make_request([case], [theatre]), engine="auto")

        self.assertEqual(result.algorithm, FALLBACK_ALGORITHM)
        self.assertEqual(result.solver_status, "OPTIMAL")
        self.assertEqual(result.metrics["cp_sat_fallback_used"], 1)


if __name__ == "__main__":
    unittest.main()
