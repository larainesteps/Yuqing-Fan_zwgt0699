"""Canonical Pydantic models for contract version v1.

The generated JSON Schema files in contracts/v1 are language-neutral artifacts.
Python services import these models for runtime validation.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


CONTRACT_VERSION = "v1"


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Urgency(str, Enum):
    UNKNOWN = "UNKNOWN"
    ROUTINE = "ROUTINE"
    EXPEDITED = "EXPEDITED"
    URGENT = "URGENT"
    EMERGENCY = "EMERGENCY"


class ResourceType(str, Enum):
    DOCTOR = "doctor"
    NURSE = "nurse"
    THEATRE = "theatre"
    BED = "bed"


class AllocationStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    UNSCHEDULED = "UNSCHEDULED"


class RejectionCode(str, Enum):
    DEADLINE_EXCEEDED = "DEADLINE_EXCEEDED"
    OUTSIDE_PLANNING_HORIZON = "OUTSIDE_PLANNING_HORIZON"
    NO_MATCHING_THEATRE = "NO_MATCHING_THEATRE"
    DOCTOR_UNAVAILABLE = "DOCTOR_UNAVAILABLE"
    INSUFFICIENT_NURSES = "INSUFFICIENT_NURSES"
    NO_RECOVERY_BED = "NO_RECOVERY_BED"
    NO_COMMON_RESOURCE_WINDOW = "NO_COMMON_RESOURCE_WINDOW"
    CAPACITY_EXHAUSTED = "CAPACITY_EXHAUSTED"
    LOCKED_ASSIGNMENT_CONFLICT = "LOCKED_ASSIGNMENT_CONFLICT"


class ClinicalNoteInput(ContractModel):
    contract_version: Literal["v1"] = CONTRACT_VERSION
    case_id: str = Field(min_length=1, max_length=100)
    note_text: str = Field(min_length=1, max_length=20000)
    language: str = Field(default="en", min_length=2, max_length=20)
    source: str = Field(default="synthetic", min_length=1, max_length=50)
    deidentified: bool = True
    submitted_at: datetime | None = None


class CaseExtraction(ContractModel):
    contract_version: Literal["v1"] = CONTRACT_VERSION
    case_id: str = Field(min_length=1, max_length=100)
    procedure: str = Field(min_length=1, max_length=200)
    speciality: str = Field(min_length=1, max_length=100)
    urgency: Urgency
    requested_datetime: datetime
    estimated_duration_minutes: int = Field(ge=15, le=1440)
    maximum_delay_hours: int = Field(ge=0, le=8760)
    required_doctors: list[str] = Field(default_factory=list, max_length=20)
    required_nurses: int = Field(default=1, ge=0, le=20)
    required_theatre_type: str | None = Field(default=None, max_length=100)
    required_bed_type: str | None = Field(default=None, max_length=100)
    constraints: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)
    human_review_required: bool
    evidence: list[str] = Field(default_factory=list, max_length=50)
    urgency_confidence: float = Field(default=0, ge=0, le=1)
    urgency_source: Literal["explicit", "inferred", "unknown"] = "unknown"
    recommended_time_window_hours: int | None = Field(default=None, ge=0, le=8760)
    urgency_evidence: list[str] = Field(default_factory=list, max_length=20)
    warnings: list[str] = Field(default_factory=list, max_length=50)
    extractor_version: str = Field(min_length=1, max_length=100)


class PriorityAssessment(ContractModel):
    contract_version: Literal["v1"] = CONTRACT_VERSION
    case_id: str = Field(min_length=1, max_length=100)
    priority_score: float = Field(ge=0, le=100)
    priority_level: Urgency
    components: dict[str, float]
    explanation: list[str] = Field(default_factory=list, max_length=50)
    policy_version: str = Field(min_length=1, max_length=100)
    assessed_at: datetime


class ResourceAvailability(ContractModel):
    resource_type: ResourceType
    resource_code: str = Field(min_length=1, max_length=100)
    speciality: str | None = Field(default=None, max_length=100)
    available_from: datetime
    available_to: datetime
    attributes: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_window(self):
        if self.available_to <= self.available_from:
            raise ValueError("available_to must be later than available_from")
        return self


class LockedAssignment(ContractModel):
    case_id: str = Field(min_length=1, max_length=100)
    start_datetime: datetime
    end_datetime: datetime
    resource_codes: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_window(self):
        if self.end_datetime <= self.start_datetime:
            raise ValueError("end_datetime must be later than start_datetime")
        return self


class PreferredAssignment(ContractModel):
    """A previous allocation that the optimizer should preserve when feasible."""

    case_id: str = Field(min_length=1, max_length=100)
    start_datetime: datetime
    end_datetime: datetime
    resource_codes: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_window(self):
        if self.end_datetime <= self.start_datetime:
            raise ValueError("end_datetime must be later than start_datetime")
        return self


class OptimizationCase(ContractModel):
    case: CaseExtraction
    priority: PriorityAssessment

    @model_validator(mode="after")
    def validate_case_identity(self):
        if self.case.case_id != self.priority.case_id:
            raise ValueError("case and priority case_id values must match")
        return self


class OptimizationRequest(ContractModel):
    contract_version: Literal["v1"] = CONTRACT_VERSION
    run_id: str = Field(min_length=1, max_length=100)
    horizon_start: datetime
    horizon_end: datetime
    slot_minutes: int = Field(default=30, ge=5, le=60)
    max_solve_seconds: int = Field(default=60, ge=1, le=3600)
    solver_engine: Literal["auto", "cp-sat", "fallback", "priority-greedy"] = "auto"
    random_seed: int = Field(default=42, ge=0, le=2_147_483_647)
    cases: list[OptimizationCase] = Field(min_length=1)
    resources: list[ResourceAvailability] = Field(min_length=1)
    locked_assignments: list[LockedAssignment] = Field(default_factory=list)
    preferred_assignments: list[PreferredAssignment] = Field(default_factory=list)
    objective_weights: dict[str, float] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_horizon(self):
        if self.horizon_end <= self.horizon_start:
            raise ValueError("horizon_end must be later than horizon_start")
        return self


class ResourceAssignment(ContractModel):
    resource_type: ResourceType
    resource_code: str = Field(min_length=1, max_length=100)
    stage: str = Field(default="care", min_length=1, max_length=50)


class ScheduledAllocation(ContractModel):
    case_id: str = Field(min_length=1, max_length=100)
    status: AllocationStatus
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    resources: list[ResourceAssignment] = Field(default_factory=list)
    rejection_code: RejectionCode | None = None
    rejection_reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_scheduled_fields(self):
        if self.status == AllocationStatus.SCHEDULED:
            if not self.start_datetime or not self.end_datetime:
                raise ValueError("scheduled allocations require start_datetime and end_datetime")
            if self.end_datetime <= self.start_datetime:
                raise ValueError("end_datetime must be later than start_datetime")
        return self


class OptimizationResult(ContractModel):
    contract_version: Literal["v1"] = CONTRACT_VERSION
    run_id: str = Field(min_length=1, max_length=100)
    algorithm: str = Field(min_length=1, max_length=100)
    solver_status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN", "ERROR"]
    objective_value: float | None = None
    best_bound: float | None = None
    optimality_gap: float | None = Field(default=None, ge=0)
    runtime_ms: int = Field(ge=0)
    allocations: list[ScheduledAllocation]
    metrics: dict[str, float | int] = Field(default_factory=dict)
    generated_at: datetime


class EvaluationReport(ContractModel):
    contract_version: Literal["v1"] = CONTRACT_VERSION
    run_id: str = Field(min_length=1, max_length=100)
    baseline_run_id: str | None = Field(default=None, max_length=100)
    algorithm: str = Field(min_length=1, max_length=100)
    metrics: dict[str, float | int]
    conflicts_by_resource: dict[str, int]
    workload_summary: dict[str, float | int] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)
    generated_at: datetime
