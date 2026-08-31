# Priority Service

Produces deterministic and explainable `PriorityAssessment` records from validated
`CaseExtraction` inputs.

Policy `priority-v1.0` combines clinical urgency (60 points), waiting-time ageing
(15 points), and deadline risk (25 points). Low extraction confidence and pending
human review apply safety adjustments. Administrative waiting may raise ROUTINE to
EXPEDITED or EXPEDITED to URGENT, but never creates a clinical EMERGENCY by itself.

```powershell
python -m services.priority_service.app --port 8102
python -m services.priority_service.app --check
```

Endpoints: `GET /health`, `GET /metadata`, `POST /score`.
