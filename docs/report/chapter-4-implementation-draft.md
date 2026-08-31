# Chapter 4 Software Implementation

This chapter describes how the design of Chapter 3 was realised. Its coverage is deliberately
uneven: the optimiser receives the most space, because that is where the technical difficulty
lies and where the defect of Section 5.3 originated.

---

This chapter describes how the design of Chapter 3 was realised. Its coverage is uneven by intent: the optimiser receives the most space, being where the technical difficulty lies.

---

## 4.1 Technology stack

The layers are those of Section 3.2.1; exact versions are in Appendix A.

Table 4.1  The technology chosen for each architectural layer, with the reason for the choice.

| Layer | Choice | Note |
|---|---|---|
| Presentation | React 19, TypeScript, Vite 6 | Single-page application, no state-management library |
| Application | Express 5, TypeScript, `mysql2/promise`, `zod` | ES modules throughout; request bodies validated before use |
| Domain services | Python 3.13, `pydantic` 2 | No web framework — see below |
| — optimiser | OR-Tools CP-SAT | With a dependency-free exact fallback engine |
| Persistence | MySQL 8 | `dateStrings: true` on the pool, so timestamps are not coerced through the JavaScript `Date` type |

The last note is a decision rather than a detail: `DATETIME` values arriving as JavaScript
`Date` objects would be reinterpreted in the process's local time zone, which for a scheduler
comparing stored start times against clinical deadlines is a source of silent one-hour errors.

**No web framework in the Python services.** The four services run on
`services/common/runtime.py`, a 159-line wrapper over `ThreadingHTTPServer`. Each declares a
`ServiceDefinition` — name, module, port, action path, input and output contracts, the Pydantic
models for each, the action to invoke, and an `implementation_status` — and the runtime handles
request decoding, validation, error mapping and the health endpoint. The reason is N5: the
services must run without installing a framework, so the system is reproducible with only
`pydantic` and, for the optimiser, `ortools`. `implementation_status` is load-bearing: it is
reported on every health endpoint, which lets the integration tests distinguish a fully
implemented service from a skeleton, and is how the NLP service reports that it is running on
the rule engine because no API key is present.

## 4.2 The optimiser

`services/optimizer_service/solver.py`, 761 lines, is the technical core.

### 4.2.1 The candidate model

Rather than building a constraint model over abstract assignment variables, the solver first
enumerates **candidates**. A candidate is a concrete, individually feasible option for one case:
a start slot, a specific set of resources, and a score.

```
for each case:
    compute duration in slots
    derive [earliest_start, latest_start] from requested time and maximum delay
    for each admissible resource combination:
        for each start slot in range:
            if every resource is available for the whole interval
               and no locked booking overlaps:
                emit Candidate(case, start, resources, score)
```

Resource combinations come from a Cartesian product over the doctors, nurse subsets, theatres
and beds satisfying the case's skill and bed-type requirements. The design has one clear virtue
and one severe cost. The virtue is that hard constraints 1, 3, 4 and 5 of Section 3.1.4 are
discharged *during enumeration*: a candidate that exists is by construction individually
admissible, so the model handed to CP-SAT need only express non-overlap and
at-most-one-per-case. The cost is Section 4.3.

### 4.2.2 The CP-SAT model

`cp_sat_adapter.py`, 119 lines, turns candidates into a model:

```python
for case_id, case_candidates in candidates.items():
    case_choices = []
    for index, candidate in enumerate(case_candidates):
        choice = model.NewBoolVar(f"use_{case_id}_{index}")
        duration = candidate.end_slot - candidate.start_slot
        for resource_type, resource_code in candidate.resources:
            interval = model.NewOptionalIntervalVar(
                candidate.start_slot, duration, candidate.end_slot,
                choice, ...)
            resource_intervals[(resource_type, resource_code)].append(interval)
        case_choices.append(choice)
    model.Add(sum(case_choices) <= 1)          # at most one allocation per case

for key, intervals in locked_occupancy.items():        # locked work, hard constraint 6
    for start, end in intervals:
        resource_intervals[key].append(
            model.NewIntervalVar(start, end - start, end, ...))

for intervals in resource_intervals.values():
    model.AddNoOverlap(intervals)              # hard constraint 2

model.Maximize(sum(round(c.score * SCORE_SCALE) * choices[k] for ...))
```

`NewOptionalIntervalVar` is what makes this compact: the interval participates in its resource's
`AddNoOverlap` only when its boolean is true, so selection and non-overlap are expressed together
rather than through big-M inequalities. Locked work enters the same map as a *non-optional*
interval, so constraint 6 is enforced twice — once by excluding colliding starts during
enumeration, and again here. The duplication is deliberate: the enumeration filter is the one
that would silently stop working if the candidate predicate were later changed, and a lock is
the one constraint a user has asserted by hand.

Three solver parameters are set: a time limit bounding the call (N6), a fixed random seed making
the search deterministic (N2), and a worker count taken as the smaller of the machine's core
count and eight. That worker count bounds the reproducibility claim more tightly than N2 states:
parallel CP-SAT workers exchange information during search, so a seed reproduces a schedule
exactly on the same machine but not necessarily on one with a different core count. Every figure
in Chapter 5 comes from a single machine; Section 5.12 records this as a threat to reproduction
elsewhere.

### 4.2.3 Rejection codes, not silent omission

Where a case yields no candidate, the reason is recorded at the point of failure. Each of the
nine codes names the condition that eliminated the last remaining option:

Table 4.2  The nine rejection codes, each naming the condition that eliminated a case's last remaining placement.

| Code | The case was eliminated because |
|---|---|
| `OUTSIDE_PLANNING_HORIZON` | its window falls outside the horizon being planned |
| `DEADLINE_EXCEEDED` | no start within `[requested, requested + maximum delay]` survived |
| `DOCTOR_UNAVAILABLE` | no doctor with the required skill is free in that window |
| `INSUFFICIENT_NURSES` | fewer nurses are free than the procedure requires |
| `NO_MATCHING_THEATRE` | no theatre of the required type is free |
| `NO_RECOVERY_BED` | no bed of the required type is free for the recovery period |
| `NO_COMMON_RESOURCE_WINDOW` | each resource is free at some point, but never all at once |
| `LOCKED_ASSIGNMENT_CONFLICT` | every remaining option collides with a manual lock |
| `CAPACITY_EXHAUSTED` | the resources exist and are free, but are taken by other cases |

The distinction between the last three is what makes the codes worth having. A scheduler told
only that a case "could not be placed" cannot act; told that the resources exist but never
coincide, or that a lock blocks them, they can. The codes are asserted by name in the tests, so
a refactor that changed one would fail rather than silently degrade the explanation. This
satisfies F6, and it is the behaviour Section 5.3.1 shows was missing from the original deadline
handling.

### 4.2.4 Two engines over one model

Both CP-SAT and a dependency-free fallback consume the same `CandidateModel`. The fallback is a
depth-first search taking each case's candidates in descending score order and pruning a branch
when the score so far plus an admissible bound on the remainder cannot beat the incumbent; that
bound is a suffix sum of each remaining case's best candidate, so it can only over-estimate and
no optimal assignment is pruned. The engine exists for N5 — the service must run where OR-Tools
cannot be installed — and has a second use: two searches written independently over one model
that agree on feasibility give evidence about the model rather than about either search
(Section 5.4).

## 4.3 The restricted candidate list and the greedy hint

Candidate enumeration grows multiplicatively with every resource pool (Figure 4.1). With two theatres, two
doctors, two beds and six nurses, a three-nurse case has `2 × C(6,3) × 2 × 2 = 160`
combinations. Adding 50% to each pool takes that to `3 × C(9,3) × 3 × 3 = 2 268` — a factor of
14, driven mostly by `C(9,3) = 84` against `C(6,3) = 20`. Multiplied by the start slots, the
model reached roughly 1.5 million boolean variables, and CP-SAT exhausted its budget in presolve
**without finding any feasible solution**, while the greedy baseline scheduled 18–24 cases on
the same instance.

> **Figure 4.1** — `figures/fig-4-1-candidate-enumeration.svg`: how candidate enumeration
> grows with each resource pool.

Two changes answer that, acting on different things.

**A restricted candidate list.** Within each start slot only the highest-scoring resource
combinations are retained — two, capped at 300 candidates per case, for every run in Chapter 5:


The redundancy removed is in the **resource dimension**: at one start time most resource
combinations are interchangeable, whereas every start slot is a genuinely different scheduling
decision. Grouping by slot before pruning preserves full temporal coverage, and the second stage
takes a uniform stride rather than a prefix, so thinning spreads across the horizon instead of
truncating its tail. The rule is deterministic, so N2 is not compromised, but both limits are
read from the environment, which makes them part of an experiment's configuration rather than a
constant of the code (Section 5.12).

**A greedy solution hint.** The greedy baseline's schedule is feasible by construction, so it is
handed to CP-SAT through `model.AddHint`. This does not shrink the model but changes what the
budget is spent on: CP-SAT begins from a known-good schedule and improves it, rather than
searching for a first feasible one and returning `UNKNOWN` if the budget expires.

**What this costs the claims.** Two things, different in kind. The restriction means CP-SAT
optimises over a subset of the assignment space, so a reported `OPTIMAL` is optimal *with
respect to the restricted model*; because both algorithms receive the same restricted lists the
comparison between them is unaffected, but the absolute quality of a CP-SAT schedule is a lower
bound. The hint means the two methods are not independent: CP-SAT starts from the greedy
solution and can only improve on it, so it cannot score worse on the objective.

## 4.4 Priority scoring

`services/priority_service/scorer.py` implements a policy over the fields the scheduler can see.
The score is a sum of five signed components, clamped to `[0, 100]`:

Table 4.3  The five components of the priority score, with the range and derivation of each.

| Component | Range | Derived from |
|---|---|---|
| `clinical_urgency` | 0–60 | the recorded urgency band, in steps of 15 |
| `deadline_risk` | 0–25 | elapsed fraction of the scheduling window, rising steeply past half |
| `waiting_time` | 0–15 | hours already waited, 1.5 points per day |
| `confidence_adjustment` | 0 to −5 | extraction confidence below 1.0 |
| `review_adjustment` | 0 or −5 | applied while human review is outstanding |

Two properties are deliberate. The negative components mean an unreviewed or low-confidence case
scores *below* an otherwise identical verified one, so uncertainty defers a case rather than
advancing it. And clinical urgency alone supplies 60 of the 100 points, making the score largely
a restatement of the urgency band. That proportion matters when reading Chapter 5: Section 3.1.4
showed urgency already scaling the delay penalty in the objective, so a case's urgency reaches
the objective through two paths that are far from independent — the mechanism behind
Section 5.9.2.

The service returns the components and a generated explanation, not only the number, because
Section 2.1.2 argues that a computed score must not be mistaken for clinical triage and a score
that cannot be decomposed invites exactly that mistake. Two guards carry the same intent: a score
high enough to read as `EMERGENCY` is downgraded to `URGENT` unless the clinician recorded an
emergency, and the level is never allowed to fall below the recorded urgency. Scoring is
deterministic given the timestamp it is assessed at, so the experiments do not rescore — they
reuse the assessments persisted with the source request, and a schedule difference can never be
attributed to scoring drift.

## 4.5 NLP intake and the fallback path

`services/nlp_service/` implements F1, F2 and N1.

**Provider abstraction.** `providers.py` places the language model and the rule engine behind
one interface. Selection is by `NLP_PROVIDER` — `auto`, `openai` or `rules` — with `auto`
preferring the model when a key is present. The path used is written to
`nlp_extractions.provider` and surfaced in the health endpoint, so provenance is recorded rather
than inferred. The rule engine (`extractor.py`, 355 lines) matches procedure vocabulary,
speciality, urgency phrasing, duration and time-window expressions.

**Validation twice, in two languages.** Every extraction is checked against the Pydantic
`CaseExtraction` model inside the service, and again by an independent schema in the API before
anything is written. Both derive from the same contract but are separate implementations, so a
service emitting a non-conforming record is stopped at the boundary. A failure at either point
aborts the intake; nothing partial is persisted. The `nlp_extractions` table carries an
`error_message` column for a failed attempt, but no code path currently writes it, so a rejected
extraction leaves no trace for a reviewer — recorded in `docs/KNOWN_ISSUES.md` rather than
claimed as behaviour.

**Human approval.** No extraction leaves `REVIEW_REQUIRED` without a decision, and the API
offers no route creating an approved case directly. N1 is enforced by the absence of a path, not
by a check that could be bypassed. The OpenAI key is read from a user environment variable,
never from the repository.

## 4.6 Dynamic emergency rescheduling

`backend/src/reschedule.ts`, 341 lines, implements F8 using the insertion approach of
Section 2.1.3. Inserting an emergency re-solves the horizon against the existing plan rather
than from nothing, under three rules.

- Cases already under way are protected by a **freeze window**, supplied as minutes from the
  start of the horizon; a case starting inside it, or carrying a **manual lock**, becomes a hard
  constraint. The window is a parameter rather than a constant because how far ahead a theatre
  list is committed is an organisational fact, not a property of the algorithm.
- The rest of the **existing schedule becomes a soft constraint**: the objective gains a
  perturbation cost per hour shifted and per resource substituted, and a bonus for leaving an
  assignment untouched, so an equal-quality plan that moves fewer cases is preferred.
- Every case receives a typed change — `UNCHANGED`, `MOVED`, `RESOURCE_CHANGED`,
  `MOVED_AND_RESOURCE_CHANGED`, `DROPPED`, `INSERTED` or `REJECTED`. The compound type is kept
  distinct because a case that both moves and changes theatre is a different conversation with a
  patient than one that does only one of those.

One transaction records the outcome: the baseline run revised, the impact counts, the full change
list, an audit event, and — for any case the insertion displaced — a return to `APPROVED`
carrying the reason, so no review row claims a case is scheduled when the current plan no longer
contains it. Section 5.3.2 reports the defect in which that last step was missing. Reporting the
taxonomy rather than only the post-insertion metrics is the design response to the argument of
Section 2.1.3 that disruption is itself a cost.

## 4.7 The experiment harness

`backend/src/experiments.ts`, 546 lines, produces the suites reported in Chapter 5.

**Arrival projection.** Imported cases carry historical timestamps spanning 2024–2026, while an
experiment uses one continuous horizon. `projectWorkloadOntoHorizon` treats the workload as an
*arrival pattern*: arrivals are spread deterministically across the first half of the horizon,
and each case's delay tolerance is capped at the horizon length so the deadline stays an active
constraint. Without this, only 2 of 100 source cases had a feasible window overlapping the
horizon.

**Horizon sizing.** The horizon is sized so theoretical capacity is 60% of offered demand,
`H = caseCount × meanDuration × 0.6 / concurrency`, where `concurrency` is the smallest of the
theatre, doctor and bed pools; nurses are excluded because a case needs several of them, so the
nurse pool constrains through different arithmetic. Section 5.6.2 sets out why that ratio is the
point of the design.

**Seeded instance selection.** Each repetition takes a different window of the source ordering,
rotated by a seeded draw and wrapping around when a scale exceeds the source pool, so repetitions
vary the *instance* rather than only the solver's seed (Section 5.6.3). Every raw repetition, the
aggregated summary and the configuration that produced them are persisted and exported as CSV,
JSON and Markdown.

## 4.8 The front end

The interface is six pages over live API data, each at its own URL and in its own module.
There is no mock data path; every value in the figures below was read from MySQL through the
API.

Table 4.4  The front-end module groups and their contents.

| Module group | Contents |
|---|---|
| `pages/` | One component per view, each owning the queries it needs |
| `components/` | Pieces used by more than one page: sidebar, page header, metric tile, case table, day timeline |
| `hooks/` | `useApiResource` loads one endpoint; `useSearch` holds the term the shared header sets |
| `api/`, `lib/`, `types.ts`, `routes.ts` | Request helpers, formatting, the contract types, and the single declaration of what pages exist |

Two decisions carry the structure. The first is that a page is declared exactly once:

```ts
export const ROUTES: RouteDefinition[] = [
  { path: '/',           label: 'Overview',        icon: LayoutDashboard },
  { path: '/schedule',   label: 'Schedule',        icon: CalendarDays },
  { path: '/cases',      label: 'Cases',           icon: Stethoscope },
  { path: '/intake',     label: 'Clinical Intake', icon: FileJson2, standalone: true },
  { path: '/resources',  label: 'Resources',       icon: Users },
  { path: '/evaluation', label: 'Evaluation',      icon: FlaskConical }
];
```

The sidebar, the router and the page heading all read this array, so adding a view is one edit
rather than three that can fall out of step. The second is that each page fetches its own data:
the previous design requested four endpoints in the root component and held the whole interface
behind them, so one slow query left every view on a placeholder.

The six views are shown in Figures 4.2 to 4.7. `figures/capture-screenshots.mjs` produced them against
the running system at 1440×900 with `deviceScaleFactor: 2`, visiting each URL, waiting for that
page's placeholder to clear, asserting the rendered `main h1` matches the expected label, then
capturing — so a routing regression fails the capture rather than producing a plausible wrong
figure. It attaches over the DevTools protocol rather than launching headless, because Edge 151
exits with code 0 and an empty stderr when given `--headless`. The capture is a viewport, not a
full page: four of the six views scroll past it, Overview reaching 4,266 px. The same run logged
every response — no API request failed on any page.

> **Figures 4.2 and 4.3** — `figures/fig-4-2-ui-overview.png` and
> `figures/fig-4-3-ui-schedule.png`: the Overview and Schedule views.
> **Figures 4.4 and 4.5** — `figures/fig-4-4-ui-cases.png` and
> `figures/fig-4-5-ui-clinical-intake.png`: the Cases view, and the Clinical Intake view
> showing the de-identification warning displayed before a note can be submitted and the
> review pane that stays empty until a case is processed — requirement N1 as the interface
> expresses it.
> **Figures 4.6 and 4.7** — `figures/fig-4-6-ui-resources.png` and
> `figures/fig-4-7-ui-evaluation.png`: the Resources view, and the Evaluation view showing
> suites `EXP-20260825012438-42` and `ABL-20260825014044-42` read live from MySQL. The
> comparison and ablation figures visible in it are the values tabulated in Sections 5.8
> and 5.9.


**What the restructuring did not fix.** The interface is 19 modules and a one-line ambient
declaration, 1,066 lines, where it was one 46 KB file holding every view with its fetching and
its state. The decomposition is sound, but three files are written at a density the rest is not.
`ClinicalIntakePage.tsx` and `EvaluationPage.tsx` were moved across whole rather than rewritten
and keep their original formatting: 28 and 10 lines respectively exceed 200 characters, the
longest reaching 1,315 and 3,011. `types.ts` is not inherited — the restructuring created it,
and 10 of its 12 type declarations are single lines, the longest 580. Elsewhere the longest line
is 284. Behaviour is verified and the markup correct, but readability was restored unevenly.

## 4.9 Build and deployment

**Build.** The repository is an npm workspace with `frontend` and `backend` as members, so a
single root `npm install` resolves both and `npm run build` compiles the API with `tsc` and the
interface with `tsc -b && vite build`. The workspace hoists shared dependencies to the root,
which is why `vite.config.ts` pins `resolve.dedupe` for `react` and `react-dom`: without it Vite
resolves a second copy of React for packages that depend on it, and the failure appears inside
library components as an invalid hook call rather than in application code.

**Database.** `docker-compose.yml` defines one MySQL 8.4 service with `database/init.sql`
mounted as an entry-point script and a `mysqladmin ping` healthcheck, so `npm run db:up` builds
the schema from nothing. The Compose service and `.env.example` currently disagree on the root
password, which breaks the documented first run for a third party; this is recorded as CFG-005
rather than silently corrected, because changing it does not re-password a volume a reader has
already created.

**Running.** `scripts/start-all.cmd` starts the four Python services on 8101–8104, then the API
on 4000, then the interface on 5173, each in its own console.

**Verification.** Three scripts, each making a different guarantee:

Table 4.5  The three verification scripts and the guarantee each makes.

| Script | Guarantee |
|---|---|
| `check-tests.cmd` | Exports the contract schemas before running the Python suite, so a model change that was never re-exported fails at the export rather than as a confusing test failure |
| `check-api.cmd` | Runs the Node API tests read-only; `--write` sets `API_TEST_ALLOW_WRITES=1` and admits the tests that insert rows |
| `check-nlp.cmd` | Forces `NLP_PROVIDER=rules`, so the extraction tests and the benchmark run with no network call and no API key |

The read-only default matters because these tests address the same database the experiments use.

**Reproducing Chapter 5.** `npm run experiment:run` and `npm run experiment:ablation` regenerate
the two suites reported in Sections 5.8 and 5.9, and `experiment:export` writes them to CSV,
JSON and Markdown.

**Editor configuration.** `.vscode/` and `.idea/runConfigurations/` are committed, the latter
holding one configuration per Python service plus `All_Services`, `All_Tests` and
`Export_Contract_Schemas`.
