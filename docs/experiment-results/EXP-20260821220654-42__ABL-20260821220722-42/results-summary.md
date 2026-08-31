# Surgical scheduling experiment results

Exported: 2026-08-21T22:09:04.686Z

## Experimental protocol

- Comparison suite: `EXP-20260821220654-42`
- Ablation suite: `ABL-20260821220722-42`
- Source workflow: `WF-20260821033243` (6 source cases)
- Case scales: 10, 25, 50
- Scenarios: BASELINE, RESOURCE_TIGHT, EMERGENCY_SURGE
- Repetitions: 3; random seeds 42-44
- Maximum solver time: 5 seconds per run
- Scaling method: deterministic-bootstrap-replay

> Data note: The source workflow contains real imported project records. Case-count scaling uses deterministic bootstrap replay and must not be described as additional real patients.

## Algorithm comparison (mean over repetitions)

| Algorithm | Scenario | Cases | Scheduled | Utilisation % | Avg wait h | Emergency wait h | Conflicts | Fairness | Runtime ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRIORITY_GREEDY | BASELINE | 10 | 4 | 55 | 35.25 | 0 | 0 | 0.6541 | 2.6667 |
| PURE_CP_SAT | BASELINE | 10 | 4 | 50 | 18.56 | 0 | 0 | 0.6711 | 69.3333 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 10 | 4 | 55 | 35.25 | 0 | 0 | 0.6541 | 67 |
| PRIORITY_GREEDY | RESOURCE_TIGHT | 10 | 3 | 60.71 | 44.67 | 0 | 0 | 0.7049 | 3 |
| PURE_CP_SAT | RESOURCE_TIGHT | 10 | 3 | 46.43 | 0.83 | 0 | 0 | 0.7752 | 79 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 10 | 3 | 60.71 | 44.67 | 0 | 0 | 0.7049 | 39.6667 |
| PRIORITY_GREEDY | EMERGENCY_SURGE | 10 | 4 | 55 | 2.62 | 1.1667 | 0 | 0.6541 | 2.3333 |
| PURE_CP_SAT | EMERGENCY_SURGE | 10 | 4 | 50 | 2.12 | 0.8333 | 0 | 0.6711 | 56.6667 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 10 | 4 | 55 | 18.44 | 0.8333 | 0 | 0.6541 | 57.6667 |
| PRIORITY_GREEDY | BASELINE | 25 | 6 | 70 | 24.25 | 1.5 | 0 | 0.8869 | 6.3333 |
| PURE_CP_SAT | BASELINE | 25 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 162.6667 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 25 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 163 |
| PRIORITY_GREEDY | RESOURCE_TIGHT | 25 | 5 | 82.14 | 27.7 | 1.5 | 0 | 0.9549 | 6.3333 |
| PURE_CP_SAT | RESOURCE_TIGHT | 25 | 5 | 67.86 | 1.4 | 1.5 | 0 | 0.9972 | 102 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 25 | 5 | 82.14 | 27.7 | 1.5 | 0 | 0.9549 | 106.3333 |
| PRIORITY_GREEDY | EMERGENCY_SURGE | 25 | 6 | 75 | 2.67 | 1.8 | 0 | 0.9336 | 13.3333 |
| PURE_CP_SAT | EMERGENCY_SURGE | 25 | 7 | 72.5 | 2.79 | 1.125 | 0 | 0.8742 | 351.6667 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 25 | 7 | 77.5 | 2.79 | 1.125 | 0 | 0.9223 | 388 |
| PRIORITY_GREEDY | BASELINE | 50 | 6 | 70 | 24.25 | 1.5 | 0 | 0.8869 | 27 |
| PURE_CP_SAT | BASELINE | 50 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 406.3333 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 50 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 429 |
| PRIORITY_GREEDY | RESOURCE_TIGHT | 50 | 5 | 82.14 | 27.7 | 1.5 | 0 | 0.9549 | 24.6667 |
| PURE_CP_SAT | RESOURCE_TIGHT | 50 | 5 | 67.86 | 1.4 | 1.5 | 0 | 0.9972 | 293.3333 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 50 | 5 | 82.14 | 27.7 | 1.5 | 0 | 0.9549 | 268 |
| PRIORITY_GREEDY | EMERGENCY_SURGE | 50 | 6 | 75 | 2.5 | 1.6 | 0 | 0.9336 | 20.3333 |
| PURE_CP_SAT | EMERGENCY_SURGE | 50 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 592.6667 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 50 | 7 | 74.1667 | 2.79 | 1.4 | 0 | 0.8902 | 625.3333 |

## Ablation study (mean over repetitions)

| Algorithm | Scenario | Cases | Scheduled | Utilisation % | Avg wait h | Emergency wait h | Conflicts | Fairness | Runtime ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 10 | 4 | 55 | 35.25 | 0 | 0 | 0.6541 | 72 |
| ABLATION_NO_PRIORITY | BASELINE | 10 | 4 | 50 | 18.56 | 0 | 0 | 0.6711 | 57 |
| ABLATION_NO_WAITING | BASELINE | 10 | 4 | 55 | 35.2533 | 1.1667 | 0 | 0.6541 | 61.6667 |
| ABLATION_THROUGHPUT_ONLY | BASELINE | 10 | 4 | 51.6667 | 24.5033 | 1.3333 | 0 | 0.6654 | 46.6667 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 10 | 3 | 60.71 | 44.67 | 0 | 0 | 0.7049 | 35 |
| ABLATION_NO_PRIORITY | RESOURCE_TIGHT | 10 | 3 | 46.43 | 0.83 | 0 | 0 | 0.7752 | 38 |
| ABLATION_NO_WAITING | RESOURCE_TIGHT | 10 | 3 | 60.71 | 45.3333 | 2 | 0 | 0.7049 | 41 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_TIGHT | 10 | 3 | 51.19 | 16.1633 | 1.3333 | 0 | 0.7486 | 38 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 10 | 4 | 55 | 18.44 | 0.8333 | 0 | 0.6541 | 46.6667 |
| ABLATION_NO_PRIORITY | EMERGENCY_SURGE | 10 | 4 | 50 | 2.12 | 0.8333 | 0 | 0.6711 | 50 |
| ABLATION_NO_WAITING | EMERGENCY_SURGE | 10 | 4 | 55 | 19.1433 | 1.6111 | 0 | 0.6541 | 56.6667 |
| ABLATION_THROUGHPUT_ONLY | EMERGENCY_SURGE | 10 | 4 | 53.3333 | 19.81 | 1.75 | 0 | 0.6598 | 41.3333 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 25 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 134 |
| ABLATION_NO_PRIORITY | BASELINE | 25 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 157.6667 |
| ABLATION_NO_WAITING | BASELINE | 25 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 140.3333 |
| ABLATION_THROUGHPUT_ONLY | BASELINE | 25 | 7 | 72.5 | 2.9067 | 1.7778 | 0 | 0.8742 | 156.3333 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 25 | 5 | 82.14 | 27.7 | 1.5 | 0 | 0.9549 | 98.6667 |
| ABLATION_NO_PRIORITY | RESOURCE_TIGHT | 25 | 5 | 67.86 | 1.4 | 1.5 | 0 | 0.9972 | 92 |
| ABLATION_NO_WAITING | RESOURCE_TIGHT | 25 | 5 | 82.14 | 28.3 | 2.5 | 0 | 0.9549 | 80.6667 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_TIGHT | 25 | 5 | 75 | 15.3167 | 2.1667 | 0 | 0.9774 | 92.3333 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 25 | 7 | 77.5 | 2.79 | 1.125 | 0 | 0.9223 | 254.6667 |
| ABLATION_NO_PRIORITY | EMERGENCY_SURGE | 25 | 7 | 72.5 | 2.79 | 1.125 | 0 | 0.8742 | 243.3333 |
| ABLATION_NO_WAITING | EMERGENCY_SURGE | 25 | 7 | 77.5 | 2.93 | 1.7917 | 0 | 0.9223 | 245 |
| ABLATION_THROUGHPUT_ONLY | EMERGENCY_SURGE | 25 | 7 | 72.5 | 2.8833 | 1.7083 | 0 | 0.8742 | 185.6667 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 50 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 401.3333 |
| ABLATION_NO_PRIORITY | BASELINE | 50 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 425.6667 |
| ABLATION_NO_WAITING | BASELINE | 50 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 382.6667 |
| ABLATION_THROUGHPUT_ONLY | BASELINE | 50 | 7 | 72.5 | 2.79 | 1.5 | 0 | 0.8742 | 414 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 50 | 5 | 82.14 | 27.7 | 1.5 | 0 | 0.9549 | 266.6667 |
| ABLATION_NO_PRIORITY | RESOURCE_TIGHT | 50 | 5 | 67.86 | 1.4 | 1.5 | 0 | 0.9972 | 272.6667 |
| ABLATION_NO_WAITING | RESOURCE_TIGHT | 50 | 5 | 82.14 | 28.1667 | 2.2778 | 0 | 0.9549 | 278 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_TIGHT | 50 | 5 | 70.24 | 6.2833 | 1.9444 | 0 | 0.9915 | 251 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 50 | 7 | 74.1667 | 2.79 | 1.4 | 0 | 0.8902 | 577.6667 |
| ABLATION_NO_PRIORITY | EMERGENCY_SURGE | 50 | 7 | 72.5 | 2.79 | 1.375 | 0 | 0.8742 | 623 |
| ABLATION_NO_WAITING | EMERGENCY_SURGE | 50 | 7 | 75.8333 | 2.9767 | 1.6667 | 0 | 0.9063 | 565.3333 |
| ABLATION_THROUGHPUT_ONLY | EMERGENCY_SURGE | 50 | 7 | 72.5 | 2.93 | 1.7083 | 0 | 0.8742 | 468.6667 |

## Interpretation guardrails

- Zero conflicts and zero hard-constraint violations establish feasibility for these runs, but do not prove correctness for every possible input.
- Results at 10, 25 and 50 cases test computational scaling using deterministic replay of the source distribution.
- Three repetitions provide an initial comparison; increase the repetition count for final statistical inference.
