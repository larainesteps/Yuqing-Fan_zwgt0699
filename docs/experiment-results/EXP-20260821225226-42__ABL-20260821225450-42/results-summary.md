# Surgical scheduling experiment results

Exported: 2026-08-21T22:55:43.109Z

## Experimental protocol

- Comparison suite: `EXP-20260821225226-42`
- Ablation suite: `ABL-20260821225450-42`
- Source workflow: `WF-20260821223642` (100 source cases)
- Case scales: 25, 50, 100
- Scenarios: BASELINE, RESOURCE_MODERATE, RESOURCE_TIGHT, EMERGENCY_SURGE
- Repetitions: 3; random seeds 42-44
- Maximum solver time: 5 seconds per run
- Scaling method: deterministic-source-subset

> Data note: All configured case scales are deterministic subsets of unique cases in the real imported source workflow; no bootstrap replay is used.

## Algorithm comparison (mean over repetitions)

| Algorithm | Scenario | Cases | Scheduled | Utilisation % | Avg wait h | Emergency wait h | Conflicts | Fairness | Runtime ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRIORITY_GREEDY | BASELINE | 25 | 2 | 15 | 0 | 0 | 0 | 0.9 | 2.3333 |
| PURE_CP_SAT | BASELINE | 25 | 2 | 15 | 0 | 0 | 0 | 0.9 | 269.3333 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 25 | 2 | 15 | 0 | 0 | 0 | 0.9 | 33 |
| PRIORITY_GREEDY | RESOURCE_MODERATE | 25 | 2 | 10 | 0 | 0 | 0 | 0.9 | 20 |
| PURE_CP_SAT | RESOURCE_MODERATE | 25 | 2 | 10 | 0 | 0 | 0 | 0.9 | 191.6667 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_MODERATE | 25 | 2 | 10 | 0 | 0 | 0 | 0.9 | 190.3333 |
| PRIORITY_GREEDY | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 2 |
| PURE_CP_SAT | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 25 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 29 |
| PRIORITY_GREEDY | EMERGENCY_SURGE | 25 | 5 | 62.5 | 1.8 | 1.8 | 0 | 0.9858 | 6.3333 |
| PURE_CP_SAT | EMERGENCY_SURGE | 25 | 6 | 55 | 1.58 | 1.5833 | 0 | 0.968 | 114.3333 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 25 | 6 | 55 | 1.58 | 1.5833 | 0 | 0.968 | 109.6667 |
| PRIORITY_GREEDY | BASELINE | 50 | 2 | 15 | 0 | 0 | 0 | 0.9 | 2.6667 |
| PURE_CP_SAT | BASELINE | 50 | 2 | 15 | 0 | 0 | 0 | 0.9 | 35.3333 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 50 | 2 | 15 | 0 | 0 | 0 | 0.9 | 32 |
| PRIORITY_GREEDY | RESOURCE_MODERATE | 50 | 2 | 10 | 0 | 0 | 0 | 0.9 | 23.6667 |
| PURE_CP_SAT | RESOURCE_MODERATE | 50 | 2 | 10 | 0 | 0 | 0 | 0.9 | 173.6667 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_MODERATE | 50 | 2 | 10 | 0 | 0 | 0 | 0.9 | 195 |
| PRIORITY_GREEDY | RESOURCE_TIGHT | 50 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 1.6667 |
| PURE_CP_SAT | RESOURCE_TIGHT | 50 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 31.6667 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 50 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 30 |
| PRIORITY_GREEDY | EMERGENCY_SURGE | 50 | 5 | 65 | 1.9 | 1.9 | 0 | 0.9941 | 10.3333 |
| PURE_CP_SAT | EMERGENCY_SURGE | 50 | 6 | 50 | 1.58 | 1.5833 | 0 | 0.9901 | 239.6667 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 50 | 6 | 50 | 1.58 | 1.5833 | 0 | 0.9901 | 260.3333 |
| PRIORITY_GREEDY | BASELINE | 100 | 2 | 15 | 0 | 0 | 0 | 0.9 | 3.3333 |
| PURE_CP_SAT | BASELINE | 100 | 2 | 15 | 0 | 0 | 0 | 0.9 | 30.6667 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 100 | 2 | 15 | 0 | 0 | 0 | 0.9 | 27 |
| PRIORITY_GREEDY | RESOURCE_MODERATE | 100 | 2 | 10 | 0 | 0 | 0 | 0.9 | 29.6667 |
| PURE_CP_SAT | RESOURCE_MODERATE | 100 | 2 | 10 | 0 | 0 | 0 | 0.9 | 182.3333 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_MODERATE | 100 | 2 | 10 | 0 | 0 | 0 | 0.9 | 179.6667 |
| PRIORITY_GREEDY | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 4.6667 |
| PURE_CP_SAT | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 25.6667 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 30 |
| PRIORITY_GREEDY | EMERGENCY_SURGE | 100 | 4 | 52.5 | 1.5 | 1.5 | 0 | 0.98 | 21.3333 |
| PURE_CP_SAT | EMERGENCY_SURGE | 100 | 7 | 60.8333 | 1.71 | 1.7143 | 0 | 0.9764 | 844.6667 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 100 | 7 | 55 | 1.71 | 1.7143 | 0 | 0.9671 | 857.3333 |

## Ablation study (mean over repetitions)

| Algorithm | Scenario | Cases | Scheduled | Utilisation % | Avg wait h | Emergency wait h | Conflicts | Fairness | Runtime ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 25 | 2 | 15 | 0 | 0 | 0 | 0.9 | 34.6667 |
| ABLATION_NO_PRIORITY | BASELINE | 25 | 2 | 15 | 0 | 0 | 0 | 0.9 | 38 |
| ABLATION_NO_WAITING | BASELINE | 25 | 2 | 15 | 3 | 0.3333 | 0 | 0.9 | 38.3333 |
| ABLATION_THROUGHPUT_ONLY | BASELINE | 25 | 2 | 15 | 4.5 | 1 | 0 | 0.9 | 39 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_MODERATE | 25 | 2 | 10 | 0 | 0 | 0 | 0.9 | 205.3333 |
| ABLATION_NO_PRIORITY | RESOURCE_MODERATE | 25 | 2 | 10 | 0 | 0 | 0 | 0.9 | 214 |
| ABLATION_NO_WAITING | RESOURCE_MODERATE | 25 | 2 | 10 | 3.1667 | 0.6667 | 0 | 0.9 | 212 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_MODERATE | 25 | 2 | 10 | 1.75 | 0.3333 | 0 | 0.9 | 174 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 26.3333 |
| ABLATION_NO_PRIORITY | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 29.3333 |
| ABLATION_NO_WAITING | RESOURCE_TIGHT | 25 | 2 | 21.43 | 1.25 | 0.6667 | 0 | 0.9 | 23.3333 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0.0833 | 0 | 0 | 0.9 | 29.3333 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 25 | 6 | 55 | 1.58 | 1.5833 | 0 | 0.968 | 115.3333 |
| ABLATION_NO_PRIORITY | EMERGENCY_SURGE | 25 | 6 | 55 | 1.58 | 1.5833 | 0 | 0.968 | 111.3333 |
| ABLATION_NO_WAITING | EMERGENCY_SURGE | 25 | 6 | 57.5 | 1.83 | 1.8333 | 0 | 0.9781 | 96.3333 |
| ABLATION_THROUGHPUT_ONLY | EMERGENCY_SURGE | 25 | 6 | 57.5 | 1.83 | 1.8333 | 0 | 0.9781 | 95.6667 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 50 | 2 | 15 | 0 | 0 | 0 | 0.9 | 30.3333 |
| ABLATION_NO_PRIORITY | BASELINE | 50 | 2 | 15 | 0 | 0 | 0 | 0.9 | 38.3333 |
| ABLATION_NO_WAITING | BASELINE | 50 | 2 | 15 | 1.75 | 0.3333 | 0 | 0.9 | 27 |
| ABLATION_THROUGHPUT_ONLY | BASELINE | 50 | 2 | 15 | 3.1667 | 0.6667 | 0 | 0.9 | 32.6667 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_MODERATE | 50 | 2 | 10 | 0 | 0 | 0 | 0.9 | 185.3333 |
| ABLATION_NO_PRIORITY | RESOURCE_MODERATE | 50 | 2 | 10 | 0 | 0 | 0 | 0.9 | 196 |
| ABLATION_NO_WAITING | RESOURCE_MODERATE | 50 | 2 | 10 | 0.6667 | 0.3333 | 0 | 0.9 | 184 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_MODERATE | 50 | 2 | 10 | 4.5 | 1 | 0 | 0.9 | 192.3333 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 50 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 33 |
| ABLATION_NO_PRIORITY | RESOURCE_TIGHT | 50 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 26.6667 |
| ABLATION_NO_WAITING | RESOURCE_TIGHT | 50 | 2 | 21.43 | 1.0833 | 0.3333 | 0 | 0.9 | 26 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_TIGHT | 50 | 2 | 21.43 | 1.0833 | 0.3333 | 0 | 0.9 | 29.6667 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 50 | 6 | 53.3333 | 1.58 | 1.5833 | 0 | 0.9967 | 227.6667 |
| ABLATION_NO_PRIORITY | EMERGENCY_SURGE | 50 | 6 | 50 | 1.58 | 1.5833 | 0 | 0.9901 | 238 |
| ABLATION_NO_WAITING | EMERGENCY_SURGE | 50 | 6 | 51.6667 | 1.8867 | 1.8889 | 0 | 0.9952 | 194 |
| ABLATION_THROUGHPUT_ONLY | EMERGENCY_SURGE | 50 | 6 | 50.8333 | 1.7467 | 1.75 | 0 | 0.9926 | 201.3333 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 100 | 2 | 15 | 0 | 0 | 0 | 0.9 | 27.6667 |
| ABLATION_NO_PRIORITY | BASELINE | 100 | 2 | 15 | 0 | 0 | 0 | 0.9 | 32 |
| ABLATION_NO_WAITING | BASELINE | 100 | 2 | 15 | 0.6667 | 0.3333 | 0 | 0.9 | 34 |
| ABLATION_THROUGHPUT_ONLY | BASELINE | 100 | 2 | 15 | 2.9167 | 0.3333 | 0 | 0.9 | 33.3333 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_MODERATE | 100 | 2 | 10 | 0 | 0 | 0 | 0.9 | 166.6667 |
| ABLATION_NO_PRIORITY | RESOURCE_MODERATE | 100 | 2 | 10 | 0 | 0 | 0 | 0.9 | 171 |
| ABLATION_NO_WAITING | RESOURCE_MODERATE | 100 | 2 | 10 | 2 | 0.6667 | 0 | 0.9 | 161.3333 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_MODERATE | 100 | 2 | 10 | 3.1667 | 0.6667 | 0 | 0.9 | 169 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 29.6667 |
| ABLATION_NO_PRIORITY | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 31.6667 |
| ABLATION_NO_WAITING | RESOURCE_TIGHT | 100 | 2 | 21.43 | 1.25 | 0.6667 | 0 | 0.9 | 35.6667 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0.25 | 0.3333 | 0 | 0.9 | 25 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 100 | 7 | 52.5 | 1.71 | 1.7143 | 0 | 0.98 | 830.6667 |
| ABLATION_NO_PRIORITY | EMERGENCY_SURGE | 100 | 7 | 55 | 1.71 | 1.7143 | 0 | 0.9671 | 812.6667 |
| ABLATION_NO_WAITING | EMERGENCY_SURGE | 100 | 7 | 55 | 1.71 | 1.7143 | 0 | 0.9671 | 642 |
| ABLATION_THROUGHPUT_ONLY | EMERGENCY_SURGE | 100 | 7 | 58.3333 | 1.8533 | 1.8571 | 0 | 0.9706 | 631.6667 |

## Interpretation guardrails

- Zero conflicts and zero hard-constraint violations establish feasibility for these runs, but do not prove correctness for every possible input.
- Results at 25, 50, 100 cases use the scaling method recorded above.
- Three repetitions provide an initial comparison; increase the repetition count for final statistical inference.
