# Chapter 3 Software Requirements and System Design

---

## 3.1 Software Requirements

This is an exploratory project: it investigates a problem domain rather than delivering against an agreed specification, so the requirements below state what the software must do and the properties it must hold, without the acceptance criteria a product specification would carry.

### 3.1.1 Scope

The system converts surgical case information into feasible schedules over the resources a procedure requires — theatre, surgeon, nurses and post-operative bed — and reports their quality against the measures of Section 2.2.4. Two roles use it: a **reviewer** approves or rejects each extracted case against its source note, and a **scheduler** runs the optimiser, inspects the allocation, locks what should not move, and inserts emergency cases.

The resource pool, the duration estimate on each case and the planning horizon are inputs rather than decisions. Consistent with Section 2.1.1, durations are deterministic and the horizon is a single continuous period.

Out of scope are strategic capacity planning and tactical allocation of theatre blocks between specialities — a different planning problem — together with stochastic durations, multi-day rolling re-planning, identifiable patient data and evaluation with clinicians, which Section 6.2 treats as further work. The prototype is research software: not a medical device, and it makes no clinical decision (Section 1.4.4).

### 3.1.2 Functional requirements

Priorities follow MoSCoW. All seven *Must* and all five *Should* requirements were implemented, F11's interface being the one with no automated tests (Section 5.5); the two *Could* requirements were placed out of scope above and deliberately not attempted. F1 and F2 are implemented in Section 4.5, F6 in Section 4.2 and F8 in Section 4.6, while F5 is evidenced by an independent conflict recomputation finding none across all 420 experiment runs and F6 by the solver's own deadline-breach count, which is a weaker check (Section 5.10).

Table 3.1  The fourteen functional requirements, with MoSCoW priority.

| # | Requirement | Priority |
|---|---|---|
| F1 | Convert an English clinical note into a structured case record conforming to a published schema | Must |
| F2 | Fall back to a deterministic rule-based extractor when no language model is available, and record which path produced the record | Must |
| F3 | Hold every extracted case in a review state until a human approves or rejects it | Must |
| F4 | Compute a reproducible priority score, exposing the components that produced it | Must |
| F5 | Allocate approved cases to a theatre, doctor, nurses and a bed over a planning horizon without any resource being double-booked | Must |
| F6 | Enforce the requested time and maximum acceptable delay as hard constraints, returning a typed reason for any case that cannot be scheduled | Must |
| F7 | Evaluate a schedule for throughput, utilisation, waiting time, conflicts, hard-constraint violations and workload fairness | Must |
| F8 | Insert an approved emergency case into an existing schedule while respecting a freeze window and manual locks, and report what moved | Should |
| F9 | Allow a scheduler to lock and unlock individual allocations | Should |
| F10 | Run reproducible algorithm comparison and objective-ablation experiments and persist their results | Should |
| F11 | Present schedules, cases, resources, intake and evaluation through a browser interface reading live API data | Should |
| F12 | Import, clean and normalise synthetic appointment records into relational tables and detect resource conflicts in them | Should |
| F13 | Multi-day rolling horizon | Could — not implemented |
| F14 | Stochastic procedure durations | Could — not implemented |

### 3.1.3 Non-functional requirements

These are properties the software must hold rather than functions it must perform. Each is given with the reason it is a requirement rather than a preference, since a non-functional requirement that cannot be argued for usually is one. Six of the seven were met; N6 was met to 50 cases and failed at 100 (Section 5.11).

Table 3.2  The seven non-functional requirements, each with the reason it is a requirement rather than a preference.

| # | Requirement | Why it is a requirement, not a preference |
|---|---|---|
| N1 | **No unreviewed model output may enter a schedule** | A language model can produce fluent, schema-valid output that misstates the procedure or its urgency, and will elaborate on a fabricated detail rather than reject it (Omar et al., 2025). Validation establishes form, not fidelity, so human approval is the only remaining control. |
| N2 | **Reproducibility** — identical inputs and seed produce identical outputs | Without it the experiments in Chapter 5 cannot be repeated and no comparison between algorithms is meaningful. |
| N3 | **Module substitutability** — each stage replaceable without changing its callers | The ablation varies one component while holding the rest fixed, so this is the precondition for the measurement Section 2.1.6 identifies as missing. |
| N4 | **Auditability** — every review decision, optimisation run, rejection and emergency change recoverable | No reviewer can answer for a decision whose inputs and configuration cannot be recovered (Section 1.4.4). |
| N5 | **Availability without the external model** | A prototype that cannot run without a paid external dependency is neither reproducible nor demonstrable offline. |
| N6 | **Bounded solve time with a usable answer** | A tool that blocks indefinitely is unusable, and one returning nothing when its budget expires is no better. Met to 50 cases; at 100 it returned no allocations (Section 5.11.1). |
| N7 | **Secrets outside the repository** | Keys and passwords are read from local environment configuration and never committed, the source code being submitted as a repository. |

### 3.1.4 The scheduling problem, stated formally

Given a planning horizon discretised into slots of fixed length, a set of cases and a set of resources, choose for each case either a start slot and a set of resources, or no allocation at all.

**Hard constraints.** An allocation is admissible only if:

1. every required resource type is supplied, and each supplied resource has the skills the case requires;
2. no resource is assigned to two cases whose intervals overlap;
3. every assigned resource is available for the whole interval;
4. the start lies within `[requested_datetime, requested_datetime + maximum_delay_hours]`;
5. a post-operative bed is available for the recovery period where the case requires one;
6. any locked allocation is honoured exactly.

Constraint 4 is a hard constraint deliberately: a case that cannot meet its deadline is returned unscheduled rather than placed late. Section 5.3 records the defect in which this was briefly untrue.

**Objective.** Every admissible allocation carries a score, and the solver maximises the sum of the scores of the allocations it selects:

> *score* = *base* + *priority* × *w*_p − *delay* × *w*_d × *urgency*

Here *base* is a fixed reward for scheduling a case at all, so maximising the sum first maximises how many cases are placed; *priority* is the score of Section 4.4; *delay* is the hours between the requested time and the chosen start; and *urgency* scales the delay penalty by the case's own priority. The weights *w*_p and *w*_d are configuration rather than structure, which is what allows Section 5.9 to remove either term while the constraints stay fixed. When rescheduling, the score additionally subtracts a cost per hour shifted and per resource substituted, and adds a bonus where an assignment is left unchanged.

Urgency therefore enters the objective twice — once as the priority reward, and again as the multiplier on the delay penalty. Section 5.9.2 reports the consequence of that duplication.

**Output.** For every case, either an allocation or an `UNSCHEDULED` status with a typed rejection code. A case is never silently omitted.

---

## 3.2 System Design

### 3.2.1 Architecture

> **Figure 3.1** — `figures/fig-3-1-architecture.svg`: the four layers and the contract spine that binds them.

Four layers, each independently runnable and testable. The technologies chosen for each are given in Section 4.1.

Table 3.3  The four architectural layers and the responsibility of each.

| Layer | Responsibility |
|---|---|
| Presentation | Six views over live data, obtained only through the application layer |
| Application | The REST interface, workflow orchestration and all persistence |
| Domain services | Extraction, priority scoring, optimisation and evaluation, one process each |
| Persistence | Cases, schedules, resources, the audit trail and experiment results |

Dependency runs in one direction. The presentation layer reaches neither the database nor the domain services; the application layer is the only component addressing both. A domain service holds no state of its own and knows nothing of its caller.

The domain layer is four separate processes rather than one, for three reasons in order of weight. The ablation requires it, an objective term being variable in a controlled way only if the optimiser is addressable independently of what surrounds it. The optimisation library and the web stack are written in different languages, and a process boundary is the cheapest place for that seam. And a service can be replaced, restarted or stubbed without redeploying the application layer (N3). The cost is four extra processes, network latency on every call, and no transactional boundary spanning services.

### 3.2.2 Data contracts

Six versioned schemas define every payload crossing a service boundary: *clinical-note-input* and *case-extraction* for intake, *priority-assessment* for scoring, *optimization-request* and *optimization-result* for planning, and *evaluation-report* for measurement. Together they form the spine of Figure 3.1: a service is defined by the contracts it consumes and emits, not by the code behind them.

Two decisions make that definition hold. The schemas are **generated from the typed models the services use** rather than written by hand, and a contract test fails if the two have drifted — closing the failure mode in which a schema and the code it describes diverge silently. And versioning is explicit: every payload carries the contract version it was written against. A service can therefore be replaced by any implementation satisfying the same contract (N3), which two substitutions exercise: the extraction service runs a language model or a rule engine behind one contract, and the optimiser runs either of two search engines over one problem model.

### 3.2.3 Database design

> **Figure 3.2** — `figures/fig-3-2-er-diagram.svg`: the intake and scheduling core. Every relationship shown is a declared foreign key.

The schema divides into four groups: **intake**, tracing a note through extraction to review; **planning**, holding the priority assessment, the optimisation request and its outcome; **occupancy**, recording which resource is committed to which case over which interval; and **reporting**, holding evaluation reports and experiment results. Three decisions carry more weight than the table names.

**Unscheduled cases are stored, not omitted.** `optimization_assignments` holds one row per case per run whether or not the case was placed, with the rejection code where it was not. The "never silently omitted" rule of Section 3.1.4 is therefore a property of the schema, not only of the solver: a run that dropped a case could not represent that outcome.

**Resources are normalised to one row per commitment.** The source data represented a case's resources as comma-separated fields in a single column, a form that cannot be indexed, joined or checked for overlap. Expanding each occupied resource into its own row makes conflict detection an interval query rather than string parsing. It is why the imported dataset run holds 475,107 booking rows against 111,488 schedule results — 4.26 resources per case, which is what a theatre, a surgeon, nursing staff and a bed amount to. Both counts are scoped to `run_id = 'csv_import_v1'`, since the same tables also carry the optimisation and rescheduling runs.

**Auditability is data, not logging** (N4). `case_audit_events` stores a before-and-after document per transition, `optimization_runs` the request that produced each result, and `experiment_suites` the configuration that produced each suite.

### 3.2.4 The case review state machine

> **Figure 3.3** — `figures/fig-3-3-review-state-machine.svg`.

Every case enters `REVIEW_REQUIRED` whichever extraction path produced it: the language model and the rule engine are treated identically, because N1 distinguishes reviewed output from unreviewed output, not one producer from another. The safety property the machine encodes is the absence of an edge — nothing reaches `APPROVED` except through a human decision, and the API offers no route that would create one.

An oversight requirement is only as good as what the reviewer is given to work with, and commentary on the EU AI Act warns that such requirements often leave unspecified who exercises oversight, when, and on what information (Enqvist, 2023). Here the answer is explicit: in `REVIEW_REQUIRED` the reviewer sees the original note beside the structured record and any validation warnings, and may correct the record, which re-scores the case and returns it to the same state.

**A failed scheduling attempt does not change state.** The case remains `APPROVED` and its rejection code is retained, so an infeasible case stays visible and is not confused with a rejected one. This is the state-machine counterpart of the schema decision above: infeasibility is a recorded outcome, not a disappearance.

`SCHEDULED` is not terminal. An emergency insertion can displace a case that was already placed, returning it to `APPROVED` with the reason — the same state a case reaches when it cannot be scheduled in the first place, since in both cases it remains approved for surgery but is not in the plan. Section 5.3.2 reports a defect in which that edge existed in the rescheduler but not in the record it wrote.

### 3.2.5 API surface

Twenty-eight routes divide into six concerns. The route list itself is developer documentation rather than design, and is given in `README.md`.

Table 3.4  The twenty-eight API routes, grouped into the six concerns they serve.

| Concern | What it exposes |
|---|---|
| Read models | Views over persisted data: the dashboard, the case list, resources, the most recent schedule and the evaluation reports |
| Intake | The review workflow of Section 3.2.4 — submit a note, inspect a case, correct an extraction, approve, reject, schedule, or insert as an emergency |
| Scheduling | Execution of the full pipeline, and retrieval of the most recent run |
| Locks | Creation and removal of a manual lock on an allocation |
| Experiments | Launching a comparison or ablation suite and retrieving its results (Chapter 5) |
| Operational | The health contract of each service, and direct extraction without the review workflow |

Two properties of this surface matter more than its size. It is the *only* interface in the system: by the dependency rule of Section 3.2.1, no other component exposes one. And the intake group has no route that creates an approved case — approval is reachable only by an explicit decision on a case already in review, which is how N1 is enforced by construction rather than by a check.
