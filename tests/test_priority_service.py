import unittest
from datetime import datetime, timedelta, timezone

from contracts.models import CaseExtraction, Urgency
from services.priority_service.scorer import POLICY_VERSION, score_case


NOW = datetime(2026, 8, 21, 12, 0, tzinfo=timezone.utc)


def make_case(**updates) -> CaseExtraction:
    payload = {
        "case_id": "PRIORITY-TEST-1",
        "procedure": "Laparoscopic appendectomy",
        "speciality": "General Surgery",
        "urgency": Urgency.ROUTINE,
        "requested_datetime": NOW,
        "estimated_duration_minutes": 75,
        "maximum_delay_hours": 240,
        "confidence": 0.95,
        "human_review_required": False,
        "extractor_version": "test",
    }
    payload.update(updates)
    return CaseExtraction(**payload)


class PriorityScoringTests(unittest.TestCase):
    def test_explicit_emergency_is_never_downgraded(self):
        result = score_case(
            make_case(urgency=Urgency.EMERGENCY, maximum_delay_hours=0, confidence=0.99),
            NOW,
        )

        self.assertEqual(result.priority_level, Urgency.EMERGENCY)
        self.assertGreaterEqual(result.priority_score, 84)
        self.assertEqual(result.policy_version, POLICY_VERSION)
        self.assertEqual(sum(result.components.values()), result.priority_score)

    def test_overdue_routine_case_gets_starvation_protection(self):
        result = score_case(
            make_case(requested_datetime=NOW - timedelta(days=20), maximum_delay_hours=72),
            NOW,
        )

        self.assertEqual(result.priority_level, Urgency.EXPEDITED)
        self.assertEqual(result.components["waiting_time"], 15.0)
        self.assertEqual(result.components["deadline_risk"], 25.0)
        self.assertTrue(any("exceeded" in item for item in result.explanation))

    def test_unknown_urgency_requires_review_instead_of_false_escalation(self):
        result = score_case(
            make_case(
                urgency=Urgency.UNKNOWN,
                requested_datetime=NOW - timedelta(days=10),
                maximum_delay_hours=24,
                confidence=0.4,
                human_review_required=True,
            ),
            NOW,
        )

        self.assertEqual(result.priority_level, Urgency.UNKNOWN)
        self.assertEqual(result.components["review_adjustment"], -5.0)
        self.assertTrue(any("remains UNKNOWN" in item for item in result.explanation))

    def test_future_request_time_does_not_create_negative_waiting_points(self):
        result = score_case(make_case(requested_datetime=NOW + timedelta(hours=4)), NOW)

        self.assertEqual(result.components["waiting_time"], 0.0)
        self.assertGreaterEqual(result.priority_score, 0)

    def test_recommended_window_takes_precedence_when_shorter(self):
        result = score_case(
            make_case(
                urgency=Urgency.URGENT,
                requested_datetime=NOW - timedelta(hours=24),
                maximum_delay_hours=72,
                recommended_time_window_hours=24,
            ),
            NOW,
        )

        self.assertEqual(result.components["deadline_risk"], 25.0)
        self.assertEqual(result.priority_level, Urgency.URGENT)


if __name__ == "__main__":
    unittest.main()
