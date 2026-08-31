# Chapter 5 Software Testing and Evaluation

Sections 5.1–5.5 cover the testing of the software. Sections 5.6–5.12 report the experimental
evaluation, which asks the two questions Section 2.1.6 left open — what constraint programming
buys over a priority-ordered heuristic, and what each term of the objective contributes.

---

## 5.1 Testing strategy

Testing operates at five levels, chosen so that a failure at one level localises the fault
rather than merely signalling that something is wrong.

Table 5.1  The five test levels, with what each checks, where it runs, and how many tests it contains.

| Level | What it checks | Where | Tests |
|---|---|---|---|
| Contract | Models and generated schemas agree; every sample payload validates | `tests/test_contracts.py` | 2 |
| Unit | Each service's logic in isolation — extraction, scoring, solving, metric computation | `tests/test_*_service.py` | 33 |
| Integration | Each service answers over HTTP with the contract it advertises | `tests/test_services.py` | 1 |
| API | Every route returns the shape it advertises and cannot produce an approved case | `backend/tests/api.test.mjs` | 21 |
| End-to-end | A note travels through extraction, review, scoring, optimisation and evaluation into MySQL | `tests/full_pipeline_llm.py` | — |

The contract level exists because the architecture depends on services being substitutable.
Schema generation from the Pydantic models (`contracts/export_schemas.py`) makes the models the
single source of truth, and the contract tests fail if the committed schemas have drifted. The
integration level starts each service itself on an ephemeral port rather than addressing a
running stack, which keeps it in the automated suite rather than in a manual checklist.

Two qualifications bound what a default run establishes. The **end-to-end level is a harness,
not an automated test**: `full_pipeline_llm.py` defines no test case and does not match the
`test_*.py` discovery pattern, so it is not among the counts above and does not run under
`check-tests.cmd`. Its value is diagnostic — it produced the evidence for the defect of
Section 5.3.1, which none of the automated levels detected. And the **API level is read-only by
default**: three of its 21 tests write to the database and are skipped unless
`API_TEST_ALLOW_WRITES=1` is set, so a default run reports 18 passes and 3 skips. Two of the
three are the requirement N1 assertions, so the clinical-safety invariant this project treats
as its most important property is among the skipped.

## 5.2 Automated test suite

The suite comprises **57 tests**: 36 Python tests over the contracts and the four services,
completing in about 3.4 seconds, and 21 Node tests over the REST API, completing in under two.
The outcome is 36 of 36 Python tests passing, and 18 of 21 Node tests passing with 3 skipped
and none failing.

Table 5.2  Areas covered by the automated test suite.

| Area | Coverage |
|---|---|
| Data contracts | Schema generation, sample payload validation, version pinning |
| NLP fallback | Deterministic rule extraction, provider selection, provenance recording |
| Priority scoring | Component decomposition, reproducibility for identical inputs |
| Optimiser | Skills, non-overlap, deadline windows, bed capacity, locks |
| Rejection codes | A stable code for each infeasibility class |
| Conflict detection | Overlap detection across doctors, nurses, theatres and beds |
| Evaluation metrics | Utilisation, waiting time, Jain fairness computed from a known schedule |
| Service health | Each service reports its module, contract version and implementation status |
| API read models | Shape of every read endpoint, and the parameters each accepts |
| API validation | Rejection of malformed request bodies on every write route |
| Review safety (N1) | No route produces an approved case; a client-supplied status is not honoured — **write-enabled runs only** |

Two rows test a design decision rather than a function: the **rejection codes** are asserted by
name, so a later refactor cannot collapse the nine-way distinction of Section 4.2.3 into a
generic failure without a test failing, and **review safety** asserts the absence of a route,
which is how N1 is enforced — and is the row a default run skips.

## 5.3 Defect case studies

### 5.3.1 OPT-001: a deadline treated as a preference

**Symptom.** In an end-to-end run over six generated surgical cases
(`tests/artifacts/llm_pipeline_20260821_023929.json`), the schedule placed an emergency open
aneurysm repair with `maximum_delay_hours = 0` at a **1.5-hour** wait, and an urgent
decompressive craniectomy with a 6-hour limit at a **7.5-hour** wait. All six cases were
scheduled and the independently recomputed conflict count was zero: the evaluation service
reported `deadline_breaches = 2` alongside `total_conflicts = 0`. The run was internally
consistent and clinically wrong.

**Root cause.** Clinical deadlines had been implemented as a *term in the objective* —
a weighted delay penalty — rather than as a hard constraint, so the solver was free
to schedule a case past its deadline whenever that improved the weighted objective by more than
the penalty cost. A shorter, lower-priority case could legitimately displace a longer emergency
one.

**Fix.** Candidate start times are restricted to `requested_datetime` through
`requested_datetime + maximum_delay_hours`; a case that cannot meet its deadline is returned
`UNSCHEDULED` with `rejection_code = DEADLINE_EXCEEDED`, so the solver never creates a late
allocation; locked assignments are rejected as infeasible when they start before the request,
after the deadline, outside resource availability, or omit a required resource; and both CP-SAT
and the fallback engine solve the same hard-constrained candidate model.

**Verification.** The post-fix run (`llm_pipeline_20260821_033414.json`) scheduled all six
cases with `deadline_breaches = 0` and `total_conflicts = 0`, the emergency repair moving from
a 1.5-hour wait to none and the craniectomy from 7.5 hours to 5.5. Workflow `WF-20260821033243`
produced the same result, and unit tests now assert the rejection code by name. Two properties
of that evidence belong with it. The failing run used the fallback engine and the passing run
CP-SAT, so the pair shows a change in the shared candidate model rather than a controlled
comparison between two runs of one engine. And the fix did not reduce waiting: maximum waiting
rose from 7.5 to 9 hours as the expedited fracture fixation, allowed 72 hours, absorbed the
delay the others had carried.

The defect is why the design treats the boundary between hard constraints and objective terms as
a safety property: an objective term is negotiable by construction, a clinical deadline is not.

> **Figure 5.1** — `figures/fig-5-1-opt001-before-after.svg`: the same six-case workload
> before and after the fix, as two schedule timelines with each case's deadline marked. The
> failing run used the fallback engine and the passing run CP-SAT.

### 5.3.2 SCH-002: a status left behind by a displacement

**Symptom.** Inserting an emergency case can displace an already-scheduled one; the rescheduler
classifies such a case as `DROPPED` and records it in the run's change list, but the
transaction that follows updated only the emergency case's review row. A displaced case
therefore kept `case_reviews.status = 'SCHEDULED'` while the current run no longer contained
it, so the case list would show a patient as scheduled after their slot had been taken.

**Why testing did not find it.** The rescheduler is TypeScript, and the orchestration layer is
covered only where a route reaches it (Section 5.5). The information was never lost —
`reschedule_runs.changes_json` holds the full change list — so no downstream check had reason
to disagree with the read model. Nor had the condition occurred: no run in the database had
displaced a case, so the defect was latent and no stored record needed correcting.

**Fix.** The same transaction now returns each displaced case to `APPROVED` with the reason,
guarded by `status = 'SCHEDULED'` so no other state is disturbed. `APPROVED` is the correct
target: the case is still approved for surgery, simply not placed — the state Section 3.2.4
reserves for a case that could not be scheduled.

## 5.4 Independent verification

Three checks recompute a result
without consulting the component that produced it.

**Conflict recomputation from persisted data.** `database/detect-conflicts.mjs` reads booking
rows back from MySQL and finds overlaps with a self-join on `a.start < b.end AND b.start <
a.end`. Its only input is what was written, so a solver that believed its own answer would
report zero conflicts by construction where this query would not.

**Metric cross-checking in the end-to-end harness.** `tests/full_pipeline_llm.py` recalculates
the conflict count, scheduled rate, Jain index, deadline breaches and waiting hours in its own
code, failing the run if any differs from what the evaluation service reported. This matters
because every figure in Chapter 5 comes from that service, and it is how OPT-001 surfaced.

**Two solver engines over one model.** CP-SAT and the dependency-free search engine consume the
same candidate model (Section 4.2.4), which makes their results comparable in principle. What
the suite establishes is narrower: twelve hard-constraint tests run against the fallback engine,
one confirms that CP-SAT solves the same model with no violations, and one that `auto` falls
back cleanly when CP-SAT raises. No test solves a non-trivial instance with both engines and
compares the schedules, so the shared model is an argument that a feasibility result belongs to
the model rather than to one search, not a measurement that it does.

**The stage these checks do not reach.** All three verify the optimisation and evaluation
stages, where a quantity can be recomputed from persisted data. Extraction has no equivalent:
recomputing an extraction means deciding what the note actually said, which requires
variable-level benchmarking against expert human abstraction (Estevez et al., 2026). That
benchmark does not exist here, so the pipeline is independently verified from the structured
record onwards and taken on trust before it.

## 5.5 Limitations of testing

- **Coverage of the TypeScript layer is thin and the interface has none.** The 21 Node tests
  reach the API from outside, establishing that each route returns the shape it advertises and
  rejects a malformed body, not that the orchestration behind it is correct. That orchestration
  is the larger part of the layer: `workflow.ts`, `experiments.ts`, `intake.ts` and
  `reschedule.ts` are 1,890 of the 2,504 lines in `backend/src`. `intake.ts` implements the
  review workflow on which N1 depends and has no test of its own; the interface, 1,066 lines,
  has none. Section 5.3.2 reports a defect this gap allowed to survive until code review.
- **The review invariant is not verified by default**, two of its three assertions being
  write-enabled and skipped (Section 5.1).
- **No property-based testing, and no cross-engine equivalence test.** Solver correctness is
  checked against hand-written instances, twelve of which run against the fallback engine
  alone.
- **No adversarial clinical text.** The extractor has never been given malformed, contradictory
  or misleading notes. Models presented with a fabricated clinical detail tend to elaborate on
  it rather than reject it (Omar et al., 2025), and schema validation would accept such an
  extraction, since it is well-formed — which is why the untested case is the one the design
  most depends on a reviewer to catch.
- **Coverage is not measured.** No line or branch coverage figure is reported, and of the 57
  tests a default run executes 54 and skips 3.

---

## 5.6 Experimental design

### 5.6.1 Purpose

Section 2.1.5 set out why a scheduling study must carry its own definitions: a structured review
of operating room optimisation finds no uniform definition of the term in use, and metrics so
varied that assessing the impact of a proposed approach becomes complex or impossible (Schouten
et al., 2023). The evaluation therefore states in advance what it asks.

1. Does constraint programming schedule more cases, or schedule them sooner, than the
   priority-ordered greedy baseline, and does any advantage depend on instance size?
2. Which terms of the objective actually contribute? This is the gap of Section 2.1.6,
   answerable only by removing each term with everything else held fixed.
3. Does the system maintain feasibility under all tested conditions?
4. What are the limits of the implementation, and are they limits of the method or of this
   encoding of it?

Questions 1 and 2 use paired designs in which every configuration sees the same instance; 3 and
4 are properties of single runs. Scale is part of question 1 because constraint programming has
been reported solving integrated surgical instances of up to 150 surgeries within practical
budgets (Farsi, Torabi and Mokhtarzadeh, 2022), so a result at one size does not transfer.

### 5.6.2 Instance construction

All instances derive from workflow `WF-20260821223642`, an optimisation run over 100 cases from
the synthetic appointment dataset, with two theatres, two doctors, two post-operative beds and
six theatre nurses, a 30-minute slot and a 30-second solve budget.

**Arrival projection.** The imported cases carry original timestamps spanning November 2024 to
August 2026, whereas an experiment uses one continuous horizon, so a case whose feasible window
closed months earlier is structurally infeasible: in the source workflow only **2 of 100** cases
had a window overlapping the ten-hour horizon and 98 were rejected with `DEADLINE_EXCEEDED`,
which made the comparison incapable of discriminating between methods. The workload is therefore
treated as an *arrival pattern*: arrivals are projected deterministically and evenly across the
first half of the horizon, preserving the stratified service ordering, and each case's delay
tolerance is capped at the horizon length so the clinical deadline remains active.

That projection is a simplification, not a model of arrivals: work that takes arrival timing
seriously estimates it from data (Eshghali et al., 2023). Durations are simplified in the same
way, as point estimates. Section 5.12 carries both as threats.

**Horizon sizing.** The horizon is sized so theoretical capacity is 60% of offered demand,
`H = caseCount × meanDuration × 0.6 / concurrency`, where concurrency is the smallest of the
theatre, doctor and bed pools. This keeps every instance over-subscribed, so the algorithms must
choose *which* cases to schedule — the behaviour the comparison is designed to measure. Sizing
uses the *baseline* pool and is computed before any scenario perturbation, so BASELINE and
RESOURCE_MODERATE share an identical horizon and case set and differ only in capacity;
Section 5.8.3 depends on this control.

### 5.6.3 Factors

Two suites share the scenario, case-count and repetition factors and differ in the algorithm
factor: the comparison varies the method, the ablation varies the objective.

Table 5.3  The experimental factors and their levels.

| Factor | Levels |
|---|---|
| Algorithm (comparison) | `PRIORITY_GREEDY`, `PURE_CP_SAT`, `HYBRID_PRIORITY_CP_SAT` |
| Algorithm (ablation) | `HYBRID_PRIORITY_CP_SAT` as control, against `ABLATION_NO_PRIORITY`, `ABLATION_NO_WAITING` and `ABLATION_THROUGHPUT_ONLY` |
| Scenario | `BASELINE`, `RESOURCE_MODERATE` (+50% of every resource type), `RESOURCE_TIGHT` (availability truncated to 70% of the horizon), `EMERGENCY_SURGE` (30% of cases forced to EMERGENCY with a ≤4 h tolerance) |
| Case count | 10, 25, 50 |
| Repetitions | 5 (seeds 42–46) |

The scenarios perturb the two constraints a review of the field identifies as dominating
practical formulations — resource limitations and staff availability (Al Amin et al., 2024) —
while `EMERGENCY_SURGE` tests the flexible policy adopted in Section 2.1.3, whose cost is
disruption to planned work (Van Riet and Demeulemeester, 2015).

Repetitions vary the *instance*, not merely the solver's seed: each seed selects a different
subset of the source cases by deterministic rotation of the stratified ordering. An earlier
version held the instance fixed, so repeated runs measured only solver jitter; that defect was
corrected before these runs.

The full factorial gives 3 × 4 × 3 × 5 = **180 comparison runs** and 4 × 4 × 3 × 5 = **240
ablation runs**, the 420 on which Sections 5.8 to 5.10 rest. Suite `EXP-20260825012438-42` holds
the comparison and `ABL-20260825014044-42` the ablation; all raw repetitions, the summary
aggregation and the configuration are persisted in MySQL and exported to
`docs/experiment-results/`.

Two facts about that configuration matter for reproduction. The solve budget was 20 seconds per
run, whereas the harness default in code is 30: what governs these results is the value recorded
with each suite, not the one in the source (CFG-003). And the 100-case result of Section 5.11 is
**not** among the 420 — it comes from two separate probes, `EXP-20260825012103-42` at the same
20-second budget, where the greedy baseline scheduled 46 cases in 690 ms while CP-SAT returned
`UNKNOWN` with none, and `EXP-20260825012259-42` at 90 seconds, which returned `UNKNOWN` again
after 75 seconds.

### 5.6.4 Restricted candidate list

The mechanism is described in Section 4.3: candidates are pre-enumerated as (resource
combination × start slot), and the models are made tractable by retaining only the two
highest-scoring resource combinations per start slot, capped at 300 per case.

**The restriction bounds what `OPTIMAL` means.** Part of the argument for constraint programming
is that a modern solver returns bounds and an optimality guarantee rather than only a solution
(Naderi, Ruiz and Roshanaei, 2023). That guarantee survives in weakened form: CP-SAT optimises
over a subset of the assignment space, so a reported `OPTIMAL` is optimal *with respect to the
restricted model*. The limits are applied by a deterministic rule, so runs remain reproducible.

**It does not bias the comparison.** `build_candidate_model` runs once before the engine is
selected, so every configuration searches the same lists. Nor is thinning a truncation:
candidates are grouped by start slot before pruning, so no slot can be emptied by another's
candidates outscoring it, and the earliest feasible placement is re-inserted if a stride would
have dropped it.

**Two couplings the results carry.** Every CP-SAT solve is seeded with the greedy schedule
through `AddHint`, `PURE_CP_SAT` included, so neither CP-SAT configuration is independent of
the baseline it is measured against, and neither can score worse than it on the objective.
`PRIORITY_GREEDY` and `HYBRID_PRIORITY_CP_SAT` carry *identical* objective weights, differing
only in the search, which is what makes Section 5.8 a one-factor contrast; `PURE_CP_SAT`
differs on two weights at once, so it is a reference point rather than a controlled contrast.

The two limits themselves were supplied through the environment rather than persisted with each
run — recorded as CFG-003 and revisited in Section 5.12. The values governing every result in
this chapter are two resource options per slot and 300 candidates per case.

## 5.7 Clinical text extraction

Table 5.4  Extraction accuracy and latency of the rule engine and the language model over the 100 benchmark cases.

| Provider | Procedure acc. | Token recall | Speciality acc. | Urgency macro-F1 | Duration MAE | Window MAE | Schema valid | Mean latency | p95 latency |
|---|---|---|---|---|---|---|---|---|---|
| `rules-v1` | 0.89 | 0.963 | 1.00 | 1.00 | 0 min | 0 h | 100% | **0.29 ms** | 0.41 ms |
| `openai:gpt-5.6-luna` | 1.00 | 1.00 | 1.00 | 1.00 | 0 min | 0 h | 100% | **3 032 ms** | 4 526 ms |

Both providers processed all 100 benchmark cases with no failures and produced schema-valid
output in every case. The accuracy figures reproduce exactly on re-running the rule path; the
latency figures are machine-dependent and reproduce approximately.

**What this benchmark does and does not establish.** The gold set is `synthetic-gold-100.jsonl`,
templated synthetic notes in which every target field is stated in canonical form —
for example, "*Emergency intervention is required immediately and the operation must start
within 4 hours.*" The urgency bands are balanced by construction, and the rule extractor was
written against those same patterns. The near-perfect scores therefore measure **schema
conformance and template-parsing reliability under a controlled input distribution**, not
clinical language understanding, and a model returning exactly 1.00 on every metric should be
read as a property of the benchmark. That reading is not peculiar to this project: eighteen
language models evaluated on synthetic notes likewise reached accuracies above 0.98 (Ntinopoulos
et al., 2025).

No clinically annotated gold set was available. The 200 real case narratives held in the project
come from the PMC-Patients dataset (Zhao et al., 2023), but
`data/pmc-patients/pmc-surgical-annotations-200.csv` is an empty template: all five `gold_*`
columns are unpopulated. What a filled version would look like is not hypothetical —
Gu et al. (2025) evaluate open-source models against 200 manually labelled real notes with
inter-annotator agreement reported. Extraction accuracy on real clinical prose is therefore
**unmeasured**. A second thing the benchmark cannot supply is a usable confidence signal: the
value the priority score reads (Section 4.4) is the provider's own report rather than an
estimate of how likely the extraction is to be right, where CeRTS derives such a measure from
the output sequences the JSON schema admits (Schimmelpfennig et al., 2025).

**The latency result is independent of that limitation.** Both providers were measured on
identical inputs, so the ratio holds regardless of the gold set's provenance. The rule engine
is roughly **10 000 times faster** — 0.29 ms against 3 032 ms mean, 0.41 ms against 4 526 ms at
the 95th percentile. Since human review is required either way (N1), a three-second per-case
model call buys no accuracy observable on this benchmark while adding a network dependency, a
per-request cost and the privacy exposure of Section 1.4.1. The rule engine is therefore the
operationally preferable default for inputs it can parse, bounded by a procedure accuracy of
0.89.

## 5.8 Algorithm comparison

### 5.8.1 Throughput and waiting time

Figures 5.2 and 5.3 plot throughput and mean waiting time; the numbers below are the same data
in full.

> **Figures 5.2 and 5.3** — `figures/fig-5-2a-throughput.svg` and
> `figures/fig-5-2b-waiting.svg`: cases scheduled and mean waiting time by instance size,
> greedy against hybrid CP-SAT, pooled over the four scenarios.

The percentages in Figure 5.2 are pooled over all four scenarios — 20 paired instances per scale
— while the table below shows two scenarios in full. Recomputing +16.3% from the BASELINE rows
alone gives +13.4%; the pooled means are 12.60 against 14.65 cases at 25, and 23.10 against
27.50 at 50. `PURE_CP_SAT` is omitted because it is not distinguishable here: it scheduled
exactly the same number of cases as the hybrid in nine of the twelve scenario–scale cells and
differed by 0.4 cases at most in the other three.

Table 5.5  Cases scheduled, utilisation, waiting time, fairness and conflicts by instance size and scenario, greedy against hybrid CP-SAT.

| n | Scenario | Algorithm | Scheduled (SD) | Util. % | Mean wait (h) | Emerg. wait (h) | Fairness | Conflicts |
|---|---|---|---|---|---|---|---|---|
| 10 | BASELINE | Greedy | 7.40 (0.89) | 86.0 | 1.63 | 1.60 | 0.988 | 0 |
| 10 | BASELINE | Hybrid CP-SAT | 7.40 (0.89) | 82.5 | **0.97** | 1.13 | 0.996 | 0 |
| 25 | BASELINE | Greedy | 13.40 (0.55) | 84.6 | 3.96 | 2.52 | 0.982 | 0 |
| 25 | BASELINE | Hybrid CP-SAT | **15.20** (0.45) | 85.0 | **2.05** | 1.24 | 0.981 | 0 |
| 50 | BASELINE | Greedy | 24.00 (0.71) | 79.3 | 8.03 | 2.92 | 0.949 | 0 |
| 50 | BASELINE | Hybrid CP-SAT | **28.60** (0.55) | 79.7 | **3.64** | 1.29 | 0.951 | 0 |
| 25 | RESOURCE_TIGHT | Greedy | 10.60 (0.55) | 96.6 | 2.75 | 2.37 | 0.999 | 0 |
| 25 | RESOURCE_TIGHT | Hybrid CP-SAT | **13.00** (0.71) | 97.7 | **1.15** | 1.09 | 0.999 | 0 |
| 50 | RESOURCE_TIGHT | Greedy | 20.40 (0.55) | 93.1 | 5.40 | 2.92 | 0.997 | 0 |
| 50 | RESOURCE_TIGHT | Hybrid CP-SAT | **25.00** (0.71) | 95.1 | **1.68** | 1.47 | 0.999 | 0 |

**The advantage depends on scale, and appears in two different measures.** At 10 cases the two
methods scheduled an identical number of cases in every one of the four scenarios, a ten-case
instance leaving little for revisiting an earlier commitment to recover. From 25 cases the gap
opens and widens: +16.3%, then +19.0%. Waiting time separates the methods at *every* scale
including the one where throughput does not, falling from 1.63 h to 0.97 h at 10 cases. What the
search buys on a small instance is not more surgery but earlier surgery, and a comparison
reporting throughput alone would have found nothing to choose between the methods.

**Utilisation moves the other way at 10 cases**: greedy records 86.0% against the hybrid's 82.5%
while scheduling the same cases and making patients wait longer, because filling theatre time
earlier raises the ratio without treating anyone more. A study that had optimised utilisation
would have selected the worse schedule, the concrete form of the objection that the metric
chosen determines the answer obtained (Schouten et al., 2023). Emergency waiting follows mean
waiting at every row, and no run produced a conflict or violation.

### 5.8.2 Paired analysis

Because every configuration runs on identical instances, the comparison is paired: each scale
contributes 20 pairs. The statistics below come from the per-run differences.

Table 5.6  Paired differences between hybrid CP-SAT and greedy by instance size, over 20 paired instances per scale.

| n | Δ scheduled (Hybrid − Greedy) | SD | t | Wins / ties / losses | Δ mean wait (h) | t |
|---|---|---|---|---|---|---|
| 10 | 0.00 | 0.00 | — | 0 / 20 / 0 | **−0.63** | −7.62 |
| 25 | **+2.05** | 0.76 | 12.08 | **20 / 0 / 0** | **−1.80** | −14.78 |
| 50 | **+4.40** | 1.23 | 15.98 | **20 / 0 / 0** | **−3.79** | −17.80 |

At 25 and 50 cases CP-SAT scheduled more cases in **every one of the 20 paired instances**, with
t-statistics of 12.08 and 15.98 on 19 degrees of freedom. At 10 cases the difference is exactly
zero in all 20 pairs, so no t-statistic is defined.

**Three qualifications belong with these numbers.** The 20 pairs at each scale pool four
scenarios: they are paired by instance but are not independent replicates of one condition, so
the t-statistics describe how consistent the effect is across the conditions tested.

At 50 cases the solver reached its 20-second budget in 36 of 40 CP-SAT runs — 17 of 20 hybrid,
19 of 20 pure — returning `FEASIBLE` rather than `OPTIMAL`.

Table 5.7  Solver termination status by instance size, showing where the time budget was reached.

| n | OPTIMAL | FEASIBLE (time limit reached) |
|---|---|---|
| 10 | 40 / 40 | 0 |
| 25 | 40 / 40 | 0 |
| 50 | 4 / 40 | 36 |

That would ordinarily leave the +19.0% as an unquantified lower bound, but the solver reports a
bound alongside an interrupted solution — the capability Naderi, Ruiz and Roshanaei (2023)
identify as what makes constraint programming usable under a time limit. Across the twenty
hybrid runs at 50 cases the optimality gap averaged **1.9%** and never exceeded **5.1%**. The
bound is on the objective rather than on throughput directly, since cases scheduled is one
weighted term within it; what it establishes is that the measured advantage is close to what
this model could reach given unlimited time.

Finally, CP-SAT is seeded with the greedy schedule (Section 5.6.4), so it begins from the
baseline's solution and cannot score below it. The direction of every paired difference is
guaranteed by construction; what the experiment measures is the *size* of the improvement.

### 5.8.3 Additional capacity did not increase throughput

`RESOURCE_MODERATE` adds 50% to every resource pool while holding the case set and horizon
fixed. Across the three algorithms and three scales it scheduled **exactly the same number of
cases as BASELINE in eight of the nine pairs**, and in the ninth differed by 0.2 cases. Figures
are for `HYBRID_PRIORITY_CP_SAT`; the other configurations behave the same way.

Table 5.8  Effect of 50% additional capacity on cases scheduled and on utilisation.

| n | Scheduled, BASELINE → +50% | Utilisation, BASELINE → +50% |
|---|---|---|
| 10 | 7.40 → 7.40 | 82.5% → 55.0% (−27.5 pp) |
| 25 | 15.20 → 15.20 | 85.0% → 56.7% (−28.3 pp) |
| 50 | 28.60 → 28.80 | 79.7% → 53.7% (−26.0 pp) |

Utilisation falls by close to the ratio in which the pools grew, because the denominator
increased and the numerator did not. A metric moved by 28 percentage points between two
configurations that treated the same patients, and a study optimising it would have preferred
the configuration that helped nobody.

**Why the extra capacity changed nothing is not what the aggregate suggests.** Every unscheduled
case in both scenarios carries the rejection code `CAPACITY_EXHAUSTED` and not one carries
`DEADLINE_EXCEEDED` — 13, 49 and 107 rejections at the three scales under BASELINE against 13, 49
and 106 under the enlarged pools. That code is the residual the solver applies when a case *had*
feasible candidates and the objective selected others (Section 4.2.3), so the cases were blocked
neither by their deadlines nor by an absence of free resources: they lost a contest for
placements that existed.

The natural explanation is the candidate restriction. Only two resource combinations survive per
start slot (Section 5.6.4), so enlarging a pool mostly generates alternatives at start slots
already reachable, and those are pruned before the solver sees them. The experiment cannot
separate this from genuine saturation, the restriction being applied identically in both
scenarios. What the result licenses is therefore a claim about this model — within this
formulation, adding theatres, staff and beds did not treat more patients — and not the
operational claim that a hospital facing this workload would gain nothing from more capacity.
Whether resource limitations bind in a given study is a property of the model as much as of the
workload (Al Amin et al., 2024).

`RESOURCE_TIGHT`, which truncates availability to 70% of the horizon, does bind: throughput
falls at 25 cases from 13.40 to 10.60 for greedy and from 15.20 to 13.00 for the hybrid, and
utilisation rises above 96%.

### 5.8.4 Priority-informed versus pure CP-SAT

Rewarding high-priority cases in the objective is a reasonable thing to try — prioritising by
clinical urgency is observable practice, English hip-replacement data showing waiting times
differing by at least fifteen days between patients in the best and worst pre-operative health
(Kasteridis et al., 2026). The question is whether this encoding of it changes any schedule.

The hybrid scheduled marginally more cases at 50 (28.60 against 28.40 in BASELINE, 28.80 against
28.40 in RESOURCE_MODERATE) at a small cost in mean waiting (3.64 h against 3.51 h). The paired
differences separate "no effect" from "small effect":

Table 5.9  Priority-informed against pure CP-SAT: paired differences in cases scheduled and in waiting time.

| n | Δ scheduled | Δ mean wait (h) | Δ emergency wait (h) | Emergency wait: hybrid better / tied / worse |
|---|---|---|---|---|
| 10 | 0.00 | +0.03 | +0.030 | 0 / 17 / 3 |
| 25 | 0.00 | +0.03 | +0.049 | 0 / 16 / 4 |
| 50 | +0.15 | +0.13 | +0.115 | 6 / 8 / 6 |

Differences are hybrid minus pure, so a positive value in a waiting column is worse for the
hybrid. The dominant outcome is **no outcome**: emergency waiting was identical in 41 of the 60
paired instances, and throughput identical at two of three scales. Where it did change
something the balance was adverse — 13 worse against 6 better on emergency waiting, 19 against
8 on mean waiting — but that rests on the instances in which anything moved at all.

Two cautions. The comparison is not controlled: the two configurations differ in the delay
weight as well as the priority reward (Section 5.6.4). And the differences are of the order of a
tenth of an hour, so the consistency of the direction carries the argument rather than its size.
The controlled test is Section 5.9.2. Until then the two CP-SAT configurations are treated as
one method, with `HYBRID_PRIORITY_CP_SAT` as the representative for Section 5.8.2.

## 5.9 Ablation study

Section 2.1.5 argued that reporting an assembled method's performance attributes nothing to any
of its parts, and Section 2.1.6 identified that as one of the two gaps this project addresses.
Suite `ABL-20260825014044-42` closes it for this formulation: it removes objective terms from
the full hybrid configuration while holding the constraint model, instances, scenarios, scales
and seeds fixed. Four configurations were run — the full objective, the priority reward removed,
the waiting cost removed, and throughput only. Each comparison is paired over 60 instances.

The ablation removes only objective terms that exist in the solver. Doctor workload fairness is
an evaluation metric and was never an optimisation target, so it is not ablated.

### 5.9.1 The waiting cost term

Figure 5.4 plots mean waiting time by objective configuration.

> **Figure 5.4** — `figures/fig-5-4-ablation-waiting.svg`: mean waiting time by objective
> configuration, pooled over the four scenarios. Blue retains the waiting cost, grey removes
> it.

Counts are oriented per metric: **helps** means shorter waiting *or* more cases scheduled,
because the two run in opposite directions.

Table 5.10  Ablation of the waiting cost term: the effect of including it, over 60 paired instances.

| Metric | Effect of **including** the waiting cost | SD | t | Helps / no change / hurts |
|---|---|---|---|---|
| Mean waiting time | **−0.659 h** | 0.568 | 9.00 | **55 / 3 / 2** |
| Emergency waiting time | **−0.291 h** | 0.376 | 5.99 | 45 / 13 / 2 |
| Cases scheduled | −0.033 | 0.181 | 1.43 | 0 / 58 / **2** |

Including the waiting cost reduced mean waiting in 55 of 60 paired instances, by 0.66 h on
average (t = 9.00, df = 59). Emergency waiting fell by less — 0.29 h — and was unchanged in 13
pairs, consistent with emergency cases already being pulled early by their short deadlines: a
delay penalty has less to correct where the hard constraint has done the work.

Throughput was statistically unchanged (t = 1.43), but in both instances that moved, the
configuration *without* the waiting cost scheduled one case **more**. Waiting time and
throughput are among the criteria Cardoen, Demeulemeester and Beliën (2010) find in use
precisely because they conflict, and dropping the delay penalty frees the solver to use later
slots it would otherwise avoid. What the ablation adds is a rate for the exchange: **one case in
thirty instances, against roughly 40 minutes of waiting per patient.** A study reporting only
the waiting improvement would have presented that trade as free.

### 5.9.2 The priority reward term — a negative result

Table 5.11  Ablation of the priority reward term: the effect of including it, over 60 paired instances — a negative result.

| Metric | Effect of **including** the priority reward | SD | t | Helps / no change / hurts |
|---|---|---|---|---|
| Cases scheduled | **0.000** | 0.184 | 0.00 | 1 / **58** / 1 |
| Mean waiting time | +0.063 h | 0.213 | 2.30 | 9 / 35 / **16** |
| Emergency waiting time | **+0.047 h** | 0.171 | 2.15 | 5 / 42 / **13** |

The priority reward left the schedule size untouched in 58 of 60 paired instances, and its mean
effect on throughput is exactly zero. It was not wholly inert — mean waiting moved in 25 pairs
and emergency waiting in 18 — but wherever it moved them the balance was *adverse*, with mean
rises of 3.8 and 2.8 minutes, both statistically detectable (t = 2.30 and 2.15) and operationally
negligible.

`HYBRID_PRIORITY_CP_SAT` is not measurably better than `ABLATION_NO_PRIORITY` — the same
configuration with the priority weight alone removed — on any metric collected, and is
fractionally worse on emergency waiting time, the metric the reward was designed to improve. The
uncontrolled comparison in Section 5.8.4 pointed the same way.

**Why this happens.** The objective rewards *selecting* a high-priority case
(`priority_score × selected`), not selecting it *early*. Section 5.8.3 showed how little room
that leaves: the number of schedulable cases is fixed tightly enough that even a 50% larger
resource pool did not change it, so a term whose only lever is inclusion has almost nothing to
act on. Where it does bind, it acts as a tie-break that accepts a later slot in order to include
a high-priority case — which is why waiting rises slightly rather than falls.

**What follows.** The finding does not show that clinical priority is irrelevant to surgical
scheduling; it shows that *this* formulation cannot express the intended preference, the quantity
it is proportional to being the wrong one. An objective acting on urgency must be sensitive to
*how late* a case is placed, not merely to whether it is placed — the distinction Fu et al.
(2024) draw in scheduling under uncertain durations. A term proportional to priority × earliness
is a specific, testable change, recorded in Section 6.2.

**What the experiment cannot see.** All configurations schedule the same number of cases, and the
metrics do not distinguish *which*. The conclusion is that the priority reward has no effect on
the outcomes measured here, not that it has none.

### 5.9.3 Summary

Table 5.12  Mean waiting time and cases scheduled by objective configuration, 25 cases, BASELINE scenario.

| Configuration | Mean wait, 25 cases BASELINE | Cases scheduled |
|---|---|---|
| Full hybrid objective | 2.05 h | 15.20 |
| Priority reward removed | 2.01 h | 15.20 |
| Waiting cost removed | 2.58 h | 15.20 |
| Throughput only | 2.83 h | 15.20 |

Of the two objective terms under test, one is doing the work and the other is inert. The
separation is not an artefact of the row shown: across all twelve scenario–scale cells, every
configuration retaining the waiting cost produced a lower mean waiting time than every
configuration without it — **twelve of twelve, with no overlap between the groups**.

Zero conflicts and zero hard-constraint violations were recorded across all **240 ablation
runs**, including the configurations optimising for throughput alone. In a constraint programme
the objective expresses preference over a feasible region the constraints define independently
of it (Rossi, van Beek and Walsh, 2006), so no choice of weights can produce an invalid
schedule. This gives OPT-001 its general form: that defect was a clinical deadline implemented
on the wrong side of that boundary.

## 5.10 Feasibility and safety

No run in either suite produced a resource conflict or a hard-constraint violation: zero and zero
across the 180 comparison runs and the 240 ablation runs alike.

**The two counts do not have the same evidential standing.** Conflicts are recomputed by the
evaluation service, which tests every pair of allocations on the same resource for interval
overlap — a separate implementation in a separate process from the optimiser. Hard-constraint
violations are different: the evaluation service does not compute them, and the figure recorded
with each run is the solver's own `deadline_breaches` count. It is a self-report, and it covers
deadline compliance rather than the full set of hard constraints in Section 3.1.4. Deadline
compliance *has* been independently recomputed — the end-to-end harness fails a run if the two
disagree (Section 5.4) — but on six-case pipeline runs, not on these 420. Closing the gap would
mean having the evaluation service recompute deadline compliance from the allocations.

**Workload fairness.** The Jain index over doctor workload ranged from 0.929 to 1.000 across
individual runs, with scenario means between 0.949 and 0.999 and no systematic difference
between algorithms. It declines slightly with scale — at BASELINE from 0.988 at 10 cases to
0.949 at 50 for greedy, and 0.996 to 0.951 for the hybrid — as more cases are distributed over
the same two surgeons.

That number should be read narrowly. Fairness in medical algorithms is contested, and the
response within the field has been technocratic: measuring one of several competing mathematical
definitions in place of engaging with what equity requires (Sikstrom et al., 2022). The Jain
index compares the evenness of a workload distribution; it says nothing about whether equal case
counts are equitable, and nothing at all about patients, being computed over surgeons rather
than over the people waiting for surgery.

## 5.11 Computation time and scalability limit

Figure 5.5 plots mean runtime on a logarithmic scale.

> **Figure 5.5** — `figures/fig-5-6-runtime.svg`: mean runtime by instance size,
> logarithmic scale.

Table 5.13  Solver runtime by instance size, greedy against hybrid CP-SAT.

| n | Greedy | Hybrid CP-SAT |
|---|---|---|
| 10 | 11–183 ms | 86–305 ms |
| 25 | 38–419 ms | 0.7–4.1 s |
| 50 | 161–784 ms | 14.9–21.5 s |

The intervals are the spread of the four scenario means, not of individual runs; single runs
range wider, the hybrid at 25 cases spanning 0.62 s to 8.55 s. The mean at 25 cases is
comfortably interactive, the worst observed run less clearly so.

The greedy baseline remains interactive at every tested scale. CP-SAT is interactive to 25 cases
and reaches its budget at 50, where 36 of 40 runs returned `FEASIBLE`. The advantages of
Section 5.8 are therefore bought at two to three orders of magnitude in computation time —
acceptable for overnight or session planning, not for keystroke latency at the larger scale.
That an exact method degrades this way is expected of a strongly NP-hard problem class
(Błażewicz, Lenstra and Rinnooy Kan, 1983), which is why N6 requires a usable answer within a
budget rather than optimality.

### 5.11.1 The 100-case ceiling

The 100-case scale was attempted and **could not be solved**. With the restricted candidate list
already applied and a 90-second budget, `HYBRID_PRIORITY_CP_SAT` returned `UNKNOWN` with zero
allocations after 75 seconds, while the greedy baseline scheduled 46 cases on the same instance
in 690 ms. Raising the budget from 20 s to 90 s did not change the outcome, so this is a limit
of model size rather than of search time.

**The cause is architectural.** Pre-enumerating (resource combination x start slot) candidates
produces a model growing multiplicatively with both the resource pools and the horizon, which
grows with the case count under the sizing rule of Section 5.6.2. At 100 cases the horizon
reaches about 77 hours and the model exceeds what CP-SAT can presolve within any practical
budget. **This is a limitation of the implementation, not of constraint programming**: the same
technique has solved up to 150 surgeries in under 500 seconds (Farsi, Torabi and Mokhtarzadeh,
2022), which locates the problem in the encoding. A formulation using interval variables with
resource-assignment variables would grow additively, and that redesign is the principal
technical item of further work.

## 5.12 Threats to validity

**Construct validity.** The extraction benchmark uses templated synthetic notes matching the
patterns the rule extractor was written against, so its accuracy figures do not transfer to
clinical prose (Ntinopoulos et al., 2025). The Jain index measures equality of case counts, not
equity (Sikstrom et al., 2022), and utilisation moves independently of the number of patients
treated, this field having no agreed definition of what it optimises (Schouten et al., 2023).
`hard_constraint_violations` is a solver self-report, where the zero-conflict result beside it
was recomputed independently; and the harness records how many cases were scheduled but not
*which*, bounding the negative result of Section 5.9.2 to the measures reported.

**Internal validity.** The restricted candidate list means `OPTIMAL` is optimal with respect to
the restricted model, so the absolute quality of a CP-SAT schedule is a lower bound; both
algorithms receive the same lists, so the comparison between them is unaffected. At 50 cases
most runs hit the time limit, the optimality gap bounding what was left at 1.9% on average, and
CP-SAT is seeded with the greedy solution, so the direction of every paired difference is
guaranteed and only its size measured. Two comparisons are less controlled than they appear:
`PURE_CP_SAT` differs from the hybrid in two weights, and Section 5.8.3 is confounded with the
candidate restriction.

Reproducibility is narrower than N2 states. The solver's worker count follows the machine's
core count up to a cap of eight and parallel workers exchange information during search, so a
seed reproduces a schedule exactly on the machine that produced it but not on one with a
different core count. The candidate limits were read from the environment rather than persisted
with the suite record (CFG-003), and the optimiser now reports both in every result.

**External validity.** All instances derive from one imported dataset and one resource
configuration. Durations are deterministic point estimates, whereas the risk a sequencing
decision carries is a property of their variance (Denton, Viapiano and Vogl, 2007; Fu et al.,
2024), and arrivals are a deterministic projection rather than an observed or forecast process
(Eshghali et al., 2023). The ceiling of Section 5.11.1 bounds the range tested, and no
clinician evaluated the schedules.

**Statistical conclusion validity.** Five repetitions per cell give 20 paired observations per
scale, pooled across four scenarios. The pooled pairs are not independent replicates of one
condition, so the t-statistics describe consistency within these experiments rather than
supporting generalisation, and no correction is applied for the number of comparisons across
Sections 5.8 to 5.10.

**Summary.** These experiments establish the behaviour of this software under controlled,
reproducible conditions, not clinical effectiveness, readiness for deployment, or extraction
accuracy on real clinical text.