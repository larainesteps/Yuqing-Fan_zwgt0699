# NLP extraction benchmark

Generated: 2026-08-21T22:30:53.144270+00:00

## Protocol

- Dataset: `data\nlp-benchmark\synthetic-gold-100.jsonl`
- Cases: 100 deterministic synthetic English surgical notes
- Reference labels: generated from controlled templates before either extractor is run
- Rule provider: `rules-v1`
- OpenAI provider: `openai:gpt-5.6-luna`

## Results

| Metric | Rules | OpenAI | Preferred |
| --- | ---: | ---: | --- |
| Schema-valid rate | 1.0 | 1.0 | higher |
| Procedure exact accuracy | 0.89 | 1.0 | higher |
| Procedure mean token recall | 0.9633 | 1.0 | higher |
| Speciality exact accuracy | 1.0 | 1.0 | higher |
| Urgency accuracy | 1.0 | 1.0 | higher |
| Urgency Macro-F1 | 1.0 | 1.0 | higher |
| Duration MAE (minutes) | 0.0 | 0.0 | lower |
| Time-window MAE (hours) | 0.0 | 0.0 | lower |
| Time-window coverage | 1.0 | 1.0 | higher |
| Human-review rate | 0.0 | 0.0 | lower |
| Mean latency (ms) | 0.29 | 3032.37 | lower |
| P95 latency (ms) | 0.41 | 4526.44 | lower |

## Urgency confusion matrices

Rules: `{"EMERGENCY->EMERGENCY": 25, "EXPEDITED->EXPEDITED": 25, "ROUTINE->ROUTINE": 25, "URGENT->URGENT": 25}`

OpenAI: `{"EMERGENCY->EMERGENCY": 25, "EXPEDITED->EXPEDITED": 25, "ROUTINE->ROUTINE": 25, "URGENT->URGENT": 25}`

## Interpretation boundary

This benchmark measures controlled extraction correctness and engineering feasibility. The notes
are synthetic and the labels are deterministic template references, not clinician annotations.
The results must not be presented as evidence of clinical safety or real-world generalisation.
