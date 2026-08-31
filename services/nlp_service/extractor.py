"""English clinical-note extraction with a deterministic no-key fallback."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from contracts.models import CaseExtraction, ClinicalNoteInput, Urgency


class ExtractionDraft(BaseModel):
    """Provider-neutral output before scheduling-contract defaults are applied."""

    model_config = ConfigDict(extra="forbid")

    procedure: str | None
    speciality: str | None
    urgency: Urgency
    urgency_confidence: float = Field(ge=0, le=1)
    urgency_source: Literal["explicit", "inferred", "unknown"]
    recommended_time_window_hours: int | None = Field(ge=0, le=8760)
    estimated_duration_minutes: int | None = Field(ge=15, le=1440)
    required_doctors: list[str]
    required_nurses: int | None = Field(ge=0, le=20)
    required_theatre_type: str | None
    required_bed_type: str | None
    evidence: list[str]
    urgency_evidence: list[str]
    warnings: list[str]
    confidence: float = Field(ge=0, le=1)


@dataclass(frozen=True)
class ProcedureProfile:
    canonical_name: str
    speciality: str
    duration_minutes: int
    doctors: tuple[str, ...]
    nurses: int
    theatre_type: str
    bed_type: str | None = None


PROCEDURES: tuple[tuple[re.Pattern[str], ProcedureProfile], ...] = (
    (
        re.compile(r"\b(?:laparoscopic\s+)?append(?:ic)?ectomy\b", re.I),
        ProcedureProfile(
            "Laparoscopic appendectomy", "General Surgery", 75,
            ("general_surgeon", "anaesthetist"), 2, "general",
        ),
    ),
    (
        re.compile(r"\b(?:laparoscopic\s+)?cholecystectomy\b", re.I),
        ProcedureProfile(
            "Laparoscopic cholecystectomy", "General Surgery", 90,
            ("general_surgeon", "anaesthetist"), 2, "general",
        ),
    ),
    (
        re.compile(r"\b(?:coronary artery bypass(?: graft(?:ing)?)?|CABG)\b", re.I),
        ProcedureProfile(
            "Coronary artery bypass grafting", "Cardiothoracic Surgery", 240,
            ("cardiac_surgeon", "anaesthetist"), 3, "cardiac", "ICU",
        ),
    ),
    (
        re.compile(r"\b(?:total\s+)?hip (?:replacement|arthroplasty)\b", re.I),
        ProcedureProfile(
            "Total hip arthroplasty", "Orthopaedics", 120,
            ("orthopaedic_surgeon", "anaesthetist"), 2, "orthopaedic",
        ),
    ),
    (
        re.compile(r"\b(?:total\s+)?knee (?:replacement|arthroplasty)\b", re.I),
        ProcedureProfile(
            "Total knee arthroplasty", "Orthopaedics", 120,
            ("orthopaedic_surgeon", "anaesthetist"), 2, "orthopaedic",
        ),
    ),
    (
        re.compile(r"\b(?:partial |total )?colectomy\b", re.I),
        ProcedureProfile(
            "Colectomy", "Colorectal Surgery", 180,
            ("colorectal_surgeon", "anaesthetist"), 3, "general",
        ),
    ),
    (
        re.compile(r"\bmastectomy\b", re.I),
        ProcedureProfile(
            "Mastectomy", "Breast Surgery", 120,
            ("breast_surgeon", "anaesthetist"), 2, "general",
        ),
    ),
    (
        re.compile(r"\b(?:inguinal |femoral |incisional )?hernia repair\b", re.I),
        ProcedureProfile(
            "Hernia repair", "General Surgery", 90,
            ("general_surgeon", "anaesthetist"), 2, "general",
        ),
    ),
    (
        re.compile(r"\bcraniotomy\b", re.I),
        ProcedureProfile(
            "Craniotomy", "Neurosurgery", 240,
            ("neurosurgeon", "anaesthetist"), 3, "neurosurgical", "ICU",
        ),
    ),
)


EXPLICIT_URGENCY: tuple[tuple[Urgency, int, re.Pattern[str]], ...] = (
    (Urgency.EMERGENCY, 1, re.compile(r"\b(?:emergency|emergent|immediate(?:ly)?|without delay)\b", re.I)),
    (Urgency.URGENT, 48, re.compile(r"\b(?:urgent(?:ly)?|as soon as possible|ASAP)\b", re.I)),
    (Urgency.EXPEDITED, 168, re.compile(r"\b(?:expedited|time[- ]sensitive)\b", re.I)),
    (Urgency.ROUTINE, 720, re.compile(r"\b(?:elective|routine|non[- ]urgent|planned)\b", re.I)),
)

INFERRED_URGENCY: tuple[tuple[Urgency, int, re.Pattern[str]], ...] = (
    (
        Urgency.EMERGENCY,
        6,
        re.compile(
            r"\b(?:haemodynamically|hemodynamically) unstable\b|"
            r"\blife[- ]threatening (?:bleeding|haemorrhage|hemorrhage)\b|"
            r"\bruptured (?:aortic )?aneurysm\b|\bperforat(?:ion|ed).{0,40}\bsepsis\b",
            re.I,
        ),
    ),
    (
        Urgency.URGENT,
        48,
        re.compile(
            r"\b(?:acute appendicitis|acute cholecystitis|bowel obstruction|"
            r"open fracture|compartment syndrome)\b",
            re.I,
        ),
    ),
)


def _sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+|[\r\n]+", text) if part.strip()]


def _evidence_for(text: str, pattern: re.Pattern[str]) -> str:
    for sentence in _sentences(text):
        if pattern.search(sentence):
            return sentence[:300]
    match = pattern.search(text)
    return match.group(0)[:300] if match else ""


def _explicit_time_window(text: str) -> tuple[int | None, str | None]:
    pattern = re.compile(r"\bwithin\s+(\d{1,3})\s*(hours?|days?|weeks?)\b", re.I)
    match = pattern.search(text)
    if not match:
        return None, None
    value = int(match.group(1))
    unit = match.group(2).lower()
    multiplier = 1 if unit.startswith("hour") else 24 if unit.startswith("day") else 168
    return min(value * multiplier, 8760), _evidence_for(text, pattern)


def _explicit_duration(text: str) -> tuple[int | None, str | None]:
    patterns = (
        re.compile(
            r"\b(?:estimated|expected|planned)\s+(?:operating|operation|surgery|procedure)?\s*"
            r"(?:duration|time)\s*(?:of|is|:)?\s*(\d{1,3})\s*"
            r"(minutes?|mins?|hours?|hrs?)\b",
            re.I,
        ),
        re.compile(
            r"\b(?:duration|operating time|surgery time|procedure time)\s*"
            r"(?:of|is|:)\s*(\d{1,3})\s*(minutes?|mins?|hours?|hrs?)\b",
            re.I,
        ),
        re.compile(
            r"\b(?:operation|surgery|procedure)\s+(?:is\s+)?(?:expected\s+)?"
            r"(?:to\s+)?(?:last|lasting)\s*(\d{1,3})\s*"
            r"(minutes?|mins?|hours?|hrs?)\b",
            re.I,
        ),
    )
    for pattern in patterns:
        match = pattern.search(text)
        if not match:
            continue
        value = int(match.group(1))
        minutes = value * 60 if match.group(2).lower().startswith(("hour", "hr")) else value
        if 15 <= minutes <= 1440:
            return minutes, _evidence_for(text, re.compile(re.escape(match.group(0)), re.I))
    return None, None


class RuleBasedExtractor:
    """Conservative baseline used before an API key is configured."""

    name = "rules-v1"

    def extract(self, note: ClinicalNoteInput) -> ExtractionDraft:
        text = " ".join(note.note_text.split())
        warnings: list[str] = []
        evidence: list[str] = []

        profile = None
        for pattern, candidate in PROCEDURES:
            if pattern.search(text):
                profile = candidate
                evidence.append(_evidence_for(text, pattern))
                break

        time_window, time_evidence = _explicit_time_window(text)
        duration, duration_evidence = _explicit_duration(text)
        if time_evidence:
            evidence.append(time_evidence)
        if duration_evidence:
            evidence.append(duration_evidence)

        urgency = Urgency.UNKNOWN
        urgency_source: Literal["explicit", "inferred", "unknown"] = "unknown"
        urgency_confidence = 0.2
        urgency_evidence: list[str] = []

        for candidate, default_window, pattern in EXPLICIT_URGENCY:
            if pattern.search(text):
                urgency = candidate
                urgency_source = "explicit"
                urgency_confidence = 0.95
                time_window = time_window if time_window is not None else default_window
                urgency_evidence.append(_evidence_for(text, pattern))
                break

        if urgency == Urgency.UNKNOWN:
            for candidate, default_window, pattern in INFERRED_URGENCY:
                if pattern.search(text):
                    urgency = candidate
                    urgency_source = "inferred"
                    urgency_confidence = 0.72
                    time_window = time_window if time_window is not None else default_window
                    urgency_evidence.append(_evidence_for(text, pattern))
                    break

        if time_window is not None and urgency == Urgency.UNKNOWN:
            if time_window <= 6:
                urgency = Urgency.EMERGENCY
            elif time_window <= 72:
                urgency = Urgency.URGENT
            elif time_window <= 336:
                urgency = Urgency.EXPEDITED
            else:
                urgency = Urgency.ROUTINE
            urgency_source = "explicit"
            urgency_confidence = 0.9
            if time_evidence:
                urgency_evidence.append(time_evidence)

        if profile is None:
            warnings.append("Procedure was not matched by the no-key clinical dictionary.")
        if urgency == Urgency.UNKNOWN:
            warnings.append("No explicit or supported inferred urgency evidence was found.")
        if duration is None:
            warnings.append("Duration was not explicit; the procedure profile default will be used.")
        if note.language.lower() not in {"en", "en-gb", "en-us"}:
            warnings.append("The no-key extractor is designed for English notes.")

        confidence = 0.25
        if profile:
            confidence += 0.35
        if urgency != Urgency.UNKNOWN:
            confidence += 0.25
        if duration is not None:
            confidence += 0.1

        return ExtractionDraft(
            procedure=profile.canonical_name if profile else None,
            speciality=profile.speciality if profile else None,
            urgency=urgency,
            urgency_confidence=urgency_confidence,
            urgency_source=urgency_source,
            recommended_time_window_hours=time_window,
            estimated_duration_minutes=duration or (profile.duration_minutes if profile else None),
            required_doctors=list(profile.doctors) if profile else [],
            required_nurses=profile.nurses if profile else None,
            required_theatre_type=profile.theatre_type if profile else None,
            required_bed_type=profile.bed_type if profile else None,
            evidence=list(dict.fromkeys(item for item in evidence if item)),
            urgency_evidence=list(dict.fromkeys(item for item in urgency_evidence if item)),
            warnings=warnings,
            confidence=min(confidence, 0.95),
        )


def to_case_extraction(
    note: ClinicalNoteInput,
    draft: ExtractionDraft,
    extractor_version: str,
) -> CaseExtraction:
    warnings = list(draft.warnings)
    procedure = draft.procedure or "Unspecified surgical procedure"
    speciality = draft.speciality or "Unknown"
    duration = draft.estimated_duration_minutes or 60
    window_defaults = {
        Urgency.EMERGENCY: 6,
        Urgency.URGENT: 48,
        Urgency.EXPEDITED: 168,
        Urgency.ROUTINE: 720,
        Urgency.UNKNOWN: 720,
    }
    delay = draft.recommended_time_window_hours
    if delay is None:
        delay = window_defaults[draft.urgency]
        warnings.append("Maximum delay uses a provisional policy default.")
    if draft.estimated_duration_minutes is None:
        warnings.append("Duration uses a provisional 60-minute fallback.")

    review_required = (
        draft.confidence < 0.7
        or draft.urgency in {Urgency.UNKNOWN}
        or draft.urgency_source == "inferred"
        or draft.procedure is None
        or note.language.lower() not in {"en", "en-gb", "en-us"}
    )
    requested = note.submitted_at or datetime.now(timezone.utc)

    return CaseExtraction(
        case_id=note.case_id,
        procedure=procedure,
        speciality=speciality,
        urgency=draft.urgency,
        requested_datetime=requested,
        estimated_duration_minutes=duration,
        maximum_delay_hours=delay,
        required_doctors=draft.required_doctors,
        required_nurses=draft.required_nurses or 0,
        required_theatre_type=draft.required_theatre_type,
        required_bed_type=draft.required_bed_type,
        constraints={
            "deidentified": note.deidentified,
            "source": note.source,
            "provisional_values_require_review": review_required,
        },
        confidence=draft.confidence,
        human_review_required=review_required,
        evidence=draft.evidence,
        urgency_confidence=draft.urgency_confidence,
        urgency_source=draft.urgency_source,
        recommended_time_window_hours=draft.recommended_time_window_hours,
        urgency_evidence=draft.urgency_evidence,
        warnings=list(dict.fromkeys(warnings)),
        extractor_version=extractor_version,
    )
