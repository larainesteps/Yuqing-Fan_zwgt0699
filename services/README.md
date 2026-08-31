# Independent Module Services

The services have stable process and HTTP boundaries. NLP, Priority, Optimizer and
Evaluation are implemented behind versioned contracts.

| Module | Port | Action endpoint | Input | Future output |
|---|---:|---|---|---|
| NLP | 8101 | `POST /extract` | ClinicalNoteInput | CaseExtraction (implemented) |
| Priority | 8102 | `POST /score` | CaseExtraction | PriorityAssessment (implemented) |
| Optimizer | 8103 | `POST /solve` | OptimizationRequest | OptimizationResult |
| Evaluation | 8104 | `POST /evaluate` | OptimizationResult | EvaluationReport |

All services expose `GET /health` and `GET /metadata`; every action endpoint returns
an output validated against its v1 contract.

Run one service independently from the project root:

```powershell
python -m services.nlp_service.app --port 8101
```

Or double-click the module's `start.cmd`. Run all module checks with `check-p0.cmd` in the project root.

Run the four-service LLM-generated end-to-end test after configuring `OPENAI_API_KEY`:

```powershell
python tests/full_pipeline_llm.py --cases 6
```

The test saves synthetic inputs, every module output, independent constraint checks and
quality metrics under `tests/artifacts/`. API keys are never written to the artifact.

Module ownership rules:

- `contracts/v1` is the only public cross-module payload definition.
- A module must not import another algorithm module.
- A module may import `contracts` and `services.common` only.
- MySQL tables are module-owned; cross-module workflow is introduced later through the API gateway.
- Breaking payload changes create `contracts/v2`; they do not overwrite v1.
