"""Pluggable extraction providers for the NLP service."""

from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from contracts.models import CaseExtraction, ClinicalNoteInput
from services.nlp_service.extractor import (
    ExtractionDraft,
    RuleBasedExtractor,
    to_case_extraction,
)


SYSTEM_INSTRUCTIONS = """You extract scheduling-relevant facts from English clinical case text.
Return only data supported by the note. Use null or empty lists when a field is absent.
Do not invent staff, duration, theatre, bed, or urgency information.
Urgency means urgency of surgical intervention, not general disease severity.
Use UNKNOWN when the surgical urgency is not supported. Evidence entries must be short exact
quotes from the source note. Set urgency_source to explicit only for direct urgency/time wording,
inferred only for strong clinical evidence, and unknown otherwise. This is research software and
does not provide clinical advice."""


class ProviderError(RuntimeError):
    pass


class OpenAIExtractor:
    """Responses API provider. It is only activated when an API key is configured."""

    def __init__(self) -> None:
        self.api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        self.model = os.environ.get("NLP_OPENAI_MODEL", "gpt-5.6-luna").strip()
        self.base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.timeout = float(os.environ.get("NLP_OPENAI_TIMEOUT_SECONDS", "45"))
        if not self.api_key:
            raise ProviderError("OPENAI_API_KEY is not configured")

    @property
    def name(self) -> str:
        return f"openai:{self.model}"

    def extract(self, note: ClinicalNoteInput) -> ExtractionDraft:
        body = {
            "model": self.model,
            "instructions": SYSTEM_INSTRUCTIONS,
            "input": note.note_text,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "surgical_case_extraction",
                    "strict": True,
                    "schema": ExtractionDraft.model_json_schema(),
                }
            },
        }
        request = Request(
            f"{self.base_url}/responses",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                payload = json.load(response)
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            raise ProviderError(f"OpenAI request failed with HTTP {error.code}: {detail}") from error
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise ProviderError(f"OpenAI request failed: {error}") from error

        output_text = payload.get("output_text") or self._find_output_text(payload)
        if not output_text:
            raise ProviderError("OpenAI response did not contain output text")
        try:
            return ExtractionDraft.model_validate_json(output_text)
        except Exception as error:
            raise ProviderError(f"OpenAI structured output failed validation: {error}") from error

    @staticmethod
    def _find_output_text(payload: dict) -> str | None:
        for item in payload.get("output", []):
            if item.get("type") != "message":
                continue
            for content in item.get("content", []):
                if content.get("type") == "output_text" and content.get("text"):
                    return content["text"]
        return None


def extract_case(note: ClinicalNoteInput) -> CaseExtraction:
    """Select the configured provider and always keep the no-key mode runnable."""

    mode = os.environ.get("NLP_PROVIDER", "auto").strip().lower()
    allow_fallback = os.environ.get("NLP_ALLOW_RULE_FALLBACK", "true").strip().lower() == "true"
    rules = RuleBasedExtractor()

    if mode not in {"auto", "openai", "rules"}:
        raise ProviderError("NLP_PROVIDER must be one of: auto, openai, rules")

    if mode == "rules" or (mode == "auto" and not os.environ.get("OPENAI_API_KEY", "").strip()):
        draft = rules.extract(note)
        return to_case_extraction(note, draft, rules.name)

    try:
        provider = OpenAIExtractor()
        draft = provider.extract(note)
        return to_case_extraction(note, draft, provider.name)
    except ProviderError as error:
        if not allow_fallback:
            raise
        draft = rules.extract(note)
        draft = draft.model_copy(
            update={
                "warnings": [
                    *draft.warnings,
                    f"LLM provider was unavailable; rule fallback was used: {error}",
                ],
                "confidence": min(draft.confidence, 0.65),
            }
        )
        return to_case_extraction(note, draft, f"{rules.name}:openai-fallback")
