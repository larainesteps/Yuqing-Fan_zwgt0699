# Surgical scheduling experiment results

Exported: 2026-08-21T22:43:28.978Z

## Experimental protocol

- Comparison suite: `EXP-20260821224215-42`
- Ablation suite: `ABL-20260821224241-42`
- Source workflow: `WF-20260821223642` (100 source cases)
- Case scales: 25, 50, 100
- Scenarios: BASELINE, RESOURCE_TIGHT, EMERGENCY_SURGE
- Repetitions: 3; random seeds 42-44
- Maximum solver time: 5 seconds per run
- Scaling method: deterministic-source-subset

> Data note: All configured case scales are deterministic subsets of unique cases in the real imported source workflow; no bootstrap replay is used.

## Algorithm comparison (mean over repetitions)

| Algorithm | Scenario | Cases | Scheduled | Utilisation % | Avg wait h | Emergency wait h | Conflicts | Fairness | Runtime ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRIORITY_GREEDY | BASELINE | 25 | 2 | 15 | 0 | 0 | 0 | 0.9 | 1.6667 |
| PURE_CP_SAT | BASELINE | 25 | 2 | 15 | 0 | 0 | 0 | 0.9 | 39.6667 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 25 | 2 | 15 | 0 | 0 | 0 | 0.9 | 33.6667 |
| PRIORITY_GREEDY | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 2.3333 |
| PURE_CP_SAT | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 25.3333 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 26 |
| PRIORITY_GREEDY | EMERGENCY_SURGE | 25 | 5 | 62.5 | 1.8 | 1.8 | 0 | 0.9858 | 4.6667 |
| PURE_CP_SAT | EMERGENCY_SURGE | 25 | 6 | 55 | 1.58 | 1.5833 | 0 | 0.968 | 106.3333 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 25 | 6 | 55 | 1.58 | 1.5833 | 0 | 0.968 | 100.6667 |
| PRIORITY_GREEDY | BASELINE | 50 | 2 | 15 | 0 | 0 | 0 | 0.9 | 2.3333 |
| PURE_CP_SAT | BASELINE | 50 | 2 | 15 | 0 | 0 | 0 | 0.9 | 38.3333 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 50 | 2 | 15 | 0 | 0 | 0 | 0.9 | 30 |
| PRIORITY_GREEDY | RESOURCE_TIGHT | 50 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 2.3333 |
| PURE_CP_SAT | RESOURCE_TIGHT | 50 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 35.6667 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 50 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 32 |
| PRIORITY_GREEDY | EMERGENCY_SURGE | 50 | 5 | 65 | 1.9 | 1.9 | 0 | 0.9941 | 10.3333 |
| PURE_CP_SAT | EMERGENCY_SURGE | 50 | 6 | 51.6667 | 1.58 | 1.5833 | 0 | 0.9934 | 215 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 50 | 6 | 50 | 1.58 | 1.5833 | 0 | 0.9901 | 221.3333 |
| PRIORITY_GREEDY | BASELINE | 100 | 2 | 15 | 0 | 0 | 0 | 0.9 | 2.6667 |
| PURE_CP_SAT | BASELINE | 100 | 2 | 15 | 0 | 0 | 0 | 0.9 | 35.6667 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 100 | 2 | 15 | 0 | 0 | 0 | 0.9 | 36.3333 |
| PRIORITY_GREEDY | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 3.6667 |
| PURE_CP_SAT | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 30 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 34 |
| PRIORITY_GREEDY | EMERGENCY_SURGE | 100 | 4 | 52.5 | 1.5 | 1.5 | 0 | 0.98 | 18.6667 |
| PURE_CP_SAT | EMERGENCY_SURGE | 100 | 7 | 52.5 | 1.71 | 1.7143 | 0 | 0.98 | 759.3333 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 100 | 7 | 57.5 | 1.71 | 1.7143 | 0 | 0.9826 | 779.3333 |

## Ablation study (mean over repetitions)

| Algorithm | Scenario | Cases | Scheduled | Utilisation % | Avg wait h | Emergency wait h | Conflicts | Fairness | Runtime ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 25 | 2 | 15 | 0 | 0 | 0 | 0.9 | 27 |
| ABLATION_NO_PRIORITY | BASELINE | 25 | 2 | 15 | 0 | 0 | 0 | 0.9 | 31 |
| ABLATION_NO_WAITING | BASELINE | 25 | 2 | 15 | 3.25 | 0.6667 | 0 | 0.9 | 36.6667 |
| ABLATION_THROUGHPUT_ONLY | BASELINE | 25 | 2 | 15 | 3.0833 | 0.6667 | 0 | 0.9 | 27.3333 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 28 |
| ABLATION_NO_PRIORITY | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 27.6667 |
| ABLATION_NO_WAITING | RESOURCE_TIGHT | 25 | 2 | 21.43 | 1 | 0.3333 | 0 | 0.9 | 34 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_TIGHT | 25 | 2 | 21.43 | 0.25 | 0.3333 | 0 | 0.9 | 28.6667 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 25 | 6 | 55 | 1.58 | 1.5833 | 0 | 0.968 | 110.6667 |
| ABLATION_NO_PRIORITY | EMERGENCY_SURGE | 25 | 6 | 55 | 1.58 | 1.5833 | 0 | 0.968 | 106.3333 |
| ABLATION_NO_WAITING | EMERGENCY_SURGE | 25 | 6 | 59.1667 | 1.9433 | 1.9444 | 0 | 0.9865 | 97.3333 |
| ABLATION_THROUGHPUT_ONLY | EMERGENCY_SURGE | 25 | 6 | 57.5 | 1.83 | 1.8333 | 0 | 0.9781 | 107 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 50 | 2 | 15 | 0 | 0 | 0 | 0.9 | 31 |
| ABLATION_NO_PRIORITY | BASELINE | 50 | 2 | 15 | 0 | 0 | 0 | 0.9 | 34.3333 |
| ABLATION_NO_WAITING | BASELINE | 50 | 2 | 15 | 0.6667 | 0.3333 | 0 | 0.9 | 26 |
| ABLATION_THROUGHPUT_ONLY | BASELINE | 50 | 2 | 15 | 1.9167 | 0.3333 | 0 | 0.9 | 34 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 50 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 29.3333 |
| ABLATION_NO_PRIORITY | RESOURCE_TIGHT | 50 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 29.3333 |
| ABLATION_NO_WAITING | RESOURCE_TIGHT | 50 | 2 | 21.43 | 1.25 | 0.6667 | 0 | 0.9 | 29.6667 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_TIGHT | 50 | 2 | 21.43 | 2 | 0.6667 | 0 | 0.9 | 32 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 50 | 6 | 51.6667 | 1.58 | 1.5833 | 0 | 0.9934 | 252 |
| ABLATION_NO_PRIORITY | EMERGENCY_SURGE | 50 | 6 | 50 | 1.58 | 1.5833 | 0 | 0.9901 | 236.3333 |
| ABLATION_NO_WAITING | EMERGENCY_SURGE | 50 | 6 | 51.6667 | 1.8867 | 1.8889 | 0 | 0.9952 | 211 |
| ABLATION_THROUGHPUT_ONLY | EMERGENCY_SURGE | 50 | 6 | 50.8333 | 1.7467 | 1.75 | 0 | 0.9926 | 199.3333 |
| HYBRID_PRIORITY_CP_SAT | BASELINE | 100 | 2 | 15 | 0 | 0 | 0 | 0.9 | 36.3333 |
| ABLATION_NO_PRIORITY | BASELINE | 100 | 2 | 15 | 0 | 0 | 0 | 0.9 | 34.3333 |
| ABLATION_NO_WAITING | BASELINE | 100 | 2 | 15 | 2.0833 | 0.6667 | 0 | 0.9 | 35.6667 |
| ABLATION_THROUGHPUT_ONLY | BASELINE | 100 | 2 | 15 | 0.6667 | 0.3333 | 0 | 0.9 | 34 |
| HYBRID_PRIORITY_CP_SAT | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 29.6667 |
| ABLATION_NO_PRIORITY | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0 | 0 | 0 | 0.9 | 31.3333 |
| ABLATION_NO_WAITING | RESOURCE_TIGHT | 100 | 2 | 21.43 | 1.25 | 0.6667 | 0 | 0.9 | 32 |
| ABLATION_THROUGHPUT_ONLY | RESOURCE_TIGHT | 100 | 2 | 21.43 | 0.25 | 0.3333 | 0 | 0.9 | 28 |
| HYBRID_PRIORITY_CP_SAT | EMERGENCY_SURGE | 100 | 7 | 52.5 | 1.71 | 1.7143 | 0 | 0.98 | 755.3333 |
| ABLATION_NO_PRIORITY | EMERGENCY_SURGE | 100 | 7 | 52.5 | 1.71 | 1.7143 | 0 | 0.98 | 860.6667 |
| ABLATION_NO_WAITING | EMERGENCY_SURGE | 100 | 7 | 54.1667 | 1.71 | 1.7143 | 0 | 0.9716 | 634.3333 |
| ABLATION_THROUGHPUT_ONLY | EMERGENCY_SURGE | 100 | 7 | 54.1667 | 1.71 | 1.7143 | 0 | 0.9716 | 631 |

## Interpretation guardrails

- Zero conflicts and zero hard-constraint violations establish feasibility for these runs, but do not prove correctness for every possible input.
- Results at 25, 50, 100 cases use the scaling method recorded above.
- Three repetitions provide an initial comparison; increase the repetition count for final statistical inference.
