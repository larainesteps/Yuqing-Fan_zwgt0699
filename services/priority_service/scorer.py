"""Deterministic, explainable scheduling-priority policy."""

from __future__ import annotations

from datetime import datetime, timezone

from contracts.models import CaseExtraction, PriorityAssessment, Urgency


POLICY_VERSION = "priority-v1.0"

CLINICAL_URGENCY_POINTS = {
    Urgency.UNKNOWN: 0.0,
    Urgency.ROUTINE: 15.0,
    Urgency.EXPEDITED: 30.0,
    Urgency.URGENT: 45.0,
    Urgency.EMERGENCY: 60.0,
}

URGENCY_RANK = {
    Urgency.UNKNOWN: 0,
    Urgency.ROUTINE: 1,
    Urgency.EXPEDITED: 2,
    Urgency.URGENT: 3,
    Urgency.EMERGENCY: 4,
}


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _deadline_hours(case: CaseExtraction) -> float:
    candidates = [float(case.maximum_delay_hours)]
    if case.recommended_time_window_hours is not None:
        candidates.append(float(case.recommended_time_window_hours))
    return min(candidates)


def _deadline_risk(waiting_hours: float, deadline_hours: float) -> tuple[float, float]:
    if deadline_hours <= 0:
        return 25.0, 1.0
    ratio = waiting_hours / deadline_hours
    if ratio >= 1:
        return 25.0, ratio
    if ratio <= 0.5:
        return round(ratio * 10.0, 2), ratio
    return round(5.0 + ((ratio - 0.5) / 0.5) * 20.0, 2), ratio


def _score_level(score: float) -> Urgency:
    if score >= 85:
        return Urgency.EMERGENCY
    if score >= 65:
        return Urgency.URGENT
    if score >= 45:
        return Urgency.EXPEDITED
    return Urgency.ROUTINE


def _priority_level(case: CaseExtraction, score: float) -> Urgency:
    if case.urgency == Urgency.UNKNOWN:
        return Urgency.UNKNOWN
    candidate = _score_level(score)
    if candidate == Urgency.EMERGENCY and case.urgency != Urgency.EMERGENCY:
        candidate = Urgency.URGENT
    if URGENCY_RANK[candidate] < URGENCY_RANK[case.urgency]:
        return case.urgency
    return candidate


def score_case(
    case: CaseExtraction,
    assessed_at: datetime | None = None,
) -> PriorityAssessment:
    """Score a case without external state so the same inputs and time are reproducible."""

    now = _aware(assessed_at or datetime.now(timezone.utc))
    requested = _aware(case.requested_datetime)
    waiting_hours = max(0.0, (now - requested).total_seconds() / 3600.0)
    deadline_hours = _deadline_hours(case)

    clinical_points = CLINICAL_URGENCY_POINTS[case.urgency]
    waiting_points = round(min(15.0, waiting_hours / 24.0 * 1.5), 2)
    deadline_points, elapsed_ratio = _deadline_risk(waiting_hours, deadline_hours)
    confidence_adjustment = round(-(1.0 - case.confidence) * 5.0, 2)
    review_adjustment = -5.0 if case.human_review_required else 0.0

    components = {
        "clinical_urgency": clinical_points,
        "waiting_time": waiting_points,
        "deadline_risk": deadline_points,
        "confidence_adjustment": confidence_adjustment,
        "review_adjustment": review_adjustment,
    }
    score = round(max(0.0, min(100.0, sum(components.values()))), 2)
    level = _priority_level(case, score)

    explanation = [
        f"Clinical urgency {case.urgency.value} contributes {clinical_points:.1f} points.",
        f"Case has waited {waiting_hours:.1f} hours and receives {waiting_points:.1f} waiting-time points.",
    ]
    if deadline_hours <= 0:
        explanation.append("The case has an immediate scheduling window, so deadline risk is maximal.")
    elif elapsed_ratio >= 1:
        explanation.append(
            f"The {deadline_hours:.1f}-hour scheduling window has been exceeded; deadline risk is maximal."
        )
    else:
        explanation.append(
            f"{elapsed_ratio * 100:.1f}% of the {deadline_hours:.1f}-hour scheduling window has elapsed."
        )
    if confidence_adjustment < 0:
        explanation.append(
            f"Extraction confidence {case.confidence:.2f} applies a {confidence_adjustment:.2f}-point adjustment."
        )
    if case.human_review_required:
        explanation.append("A 5-point safety adjustment is applied until human review is complete.")
    if case.urgency == Urgency.UNKNOWN:
        explanation.append("Priority level remains UNKNOWN until clinical urgency is reviewed.")
    elif level != case.urgency:
        explanation.append(
            f"Waiting and deadline risk raise the scheduling level from {case.urgency.value} to {level.value}."
        )

    return PriorityAssessment(
        case_id=case.case_id,
        priority_score=score,
        priority_level=level,
        components=components,
        explanation=explanation,
        policy_version=POLICY_VERSION,
        assessed_at=now,
    )
