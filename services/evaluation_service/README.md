# Evaluation Service

Produces a validated `EvaluationReport` from any contract-compatible optimizer result.
Metrics include schedule success, named-resource conflicts, observed utilisation,
solver quality, waiting/deadline metrics supplied by the optimizer, and doctor
workload balance (standard deviation, coefficient of variation, Gini and Jain index).

```powershell
python -m services.evaluation_service.app --port 8104
python -m services.evaluation_service.app --check
```

Endpoints: `GET /health`, `GET /metadata`, `POST /evaluate`.
