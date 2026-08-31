# Chapter 6 Conclusions and Future Work

---

## 6.1 Conclusions

### 6.1.1 Against the objectives

Table 6.1  The ten project objectives, with the verdict reached and the evidence supporting it.

| # | Objective | Verdict | Evidence |
|---|---|---|---|
| 1 | Review research on theatre scheduling, RCPSP, healthcare optimisation, clinical text processing and evaluation methods | Met | Chapter 2 |
| 2 | Define a formal representation of cases, skills, theatres, beds, time windows, locks and non-overlapping bookings | Met | Section 3.1.4; `contracts/v1` |
| 3 | Design a modular architecture whose parts run and are tested independently | Met | Sections 3.2.1–3.2.2; the four services run and are health-checked separately |
| 4 | Build a data preparation process — clean, repair, import, expand bookings, report duplicate use | Met | `database/*.mjs`; 475,107 booking rows against 111,488 schedule results |
| 5 | Implement a reviewed intake workflow that prevents unapproved model output entering the schedule | Met | Sections 3.2.4, 4.5; no API route can create an approved case, though the two tests asserting this are skipped by default |
| 6 | Implement three planning configurations and determine experimentally which of them differ | Met | Sections 5.8 and 5.9.2; reworded from "compare three configurations" after the ablation showed there are two |
| 7 | Enforce hard constraints and return explicit reasons for unscheduled cases | Met | Section 4.2.3; zero conflicts found independently across 420 runs, zero deadline breaches self-reported (Section 5.10) |
| 8 | Provide an interface for review, inspection, emergency insertion, locking and evaluation over live API data | Met | Section 4.8 — six routed pages, no automated test of any kind (Section 5.5) |
| 9 | Evaluate with repeatable experiments recording throughput, utilisation, waiting, conflicts, violations, fairness, disruption and solve time | Met | Chapter 5; two suites, 420 runs, persisted with their configuration except the candidate limits (CFG-003) |
| 10 | Document design, implementation, setup, testing evidence, limitations and ethical safeguards for reproduction | Met | This report; `README.md`; `docs/KNOWN_ISSUES.md` (six defects) |

Three verdicts carry a qualification. Objective 6 was **reworded during the project** in light
of what the experiment found; rewording an objective to match a result can conceal a failure, so
it is disclosed rather than quietly adjusted. Objective 7 is met in implementation but its
evidence is uneven, the zero-conflict figure having been recomputed independently and the
zero-violation figure being the solver's own report. Objective 8 rests on a component with no
automated test.

### 6.1.2 What the project contributes

**A contract-versioned service decomposition.** Extraction, priority scoring, optimisation and
evaluation communicate through six versioned JSON Schemas generated from Pydantic models and
asserted by contract tests. This is what made the ablation a controlled comparison rather than a
comparison between differently-constrained systems, the absence of which Section 2.1.6
identified as a gap worth closing.

**A reviewed-intake safety pattern.** Schema validation, recorded provenance, an explicit review
state and mandatory human approval jointly prevent unreviewed model output from reaching a
schedule. The design follows from a property of language models rather than generic caution:
validation establishes form, not fidelity, and a model given a fabricated clinical detail will
more often elaborate on it than reject it (Omar et al., 2025). It also answers what oversight
requirements typically leave open, namely what the human is given to work with (Enqvist, 2023):
the reviewer sees the source note beside the structured record and the validation warnings.

**An empirical characterisation of the rule-versus-LLM trade-off** under a controlled input
distribution: identical schema conformance, identical urgency classification, and a latency
difference of roughly four orders of magnitude (0.29 ms against 3,032 ms). Since human review is
mandatory either way, the rule engine is the operationally preferable default for the inputs it
can parse, bounded by a procedure accuracy of 0.89 and by an accuracy half resting on synthetic
notes, which flatter every extractor measured on them (Ntinopoulos et al., 2025).

**A defect and a negative result, each with a diagnosis.** *OPT-001* is a defect: clinical
deadlines implemented as an objective term rather than a hard constraint let the solver place an
emergency case 1.5 hours past a zero-hour tolerance, which is why the design treats that
boundary as a safety property. *The inert priority reward* is a finding rather than a defect,
with a testable diagnosis: the objective rewards *including* a high-priority case, not
scheduling it *early*, so on capacity-bound instances a term whose only lever is inclusion has
nothing to act on.

### 6.1.3 What the evaluation established

**CP-SAT's advantage over the greedy baseline depends on instance size**: no throughput
difference at 10 cases, +16.3% at 25 and +19.0% at 50, winning 20 of 20 paired instances at both
larger scales. Waiting time was lower at every scale including the one where throughput was
identical, so at the smallest instances the search buys earlier surgery rather than more of it.
Two conditions attach (Section 5.8.2): CP-SAT is seeded with the greedy solution, and at 50
cases most runs ended on the time limit.

**Adding 50% more capacity treated no additional patients**, throughput staying unchanged while
utilisation fell by 28 percentage points. The rejection codes show the unplaced cases had
feasible placements and lost them to higher-scoring ones, so what binds is internal to the
formulation — most likely the candidate restriction. Whether resource limitations
bind in a given study is therefore a property of the encoding as much as of the workload (Al
Amin et al., 2024).

**The waiting-cost objective term does the work; the priority reward does not.** Including the
waiting cost reduced mean waiting in 55 of 60 paired instances by 0.66 h; removing the priority
reward changed the schedule size in 2 of 60. The ablation also priced the term that works:
roughly one case in thirty instances against 40 minutes of waiting per patient —
the throughput–waiting conflict this literature reports as structural (Cardoen,
Demeulemeester and Beliën, 2010), here given an exchange rate.

**Feasibility held throughout, on evidence of two strengths**: across all 420 runs an
independent routine found no resource conflict, while the solver's own report of no deadline
breach is weaker. **The implementation ceiling is at 100 cases, and it belongs to the encoding**
(Section 5.11.1).

### 6.1.4 Limitations

Section 5.12 sets these out in full by the kind of validity each threatens. In summary:
extraction accuracy on real clinical prose is **unmeasured**, since no clinically annotated gold
set exists and synthetic notes flatter every extractor tested on them (Ntinopoulos et al.,
2025). The zero-violation result is a solver self-report, where the zero-conflict result beside
it was independently recomputed. `OPTIMAL` is optimal only with respect to the restricted
candidate model, and CP-SAT is seeded with the greedy solution, so the sign of every paired
difference is guaranteed and only its size measured; Section 5.8.3's capacity result is
confounded with the same restriction. No metric distinguishes *which* cases were scheduled,
bounding the ablation's negative result to the outcomes measured. The Jain index certifies
nothing about equity (Sikstrom et al., 2022), and reproduction is narrower than N2 states
(CFG-003). All instances derive from one dataset and configuration, the 100-case scale cannot be
solved, the TypeScript layer is thinly covered, and no clinician evaluated the schedules.

## 6.2 Future Work

Ordered by how much each would change the conclusions of this report. The first five would alter
what Chapter 5 can claim; the rest extend the system.

**1. Build a clinically annotated extraction benchmark.** The most valuable next step.
`data/pmc-patients/pmc-surgical-annotations-200.csv` already holds 200 real case narratives
(Zhao et al., 2023) with five `gold_*` columns unpopulated. Filling even fifty with
clinician-verified labels would convert Section 5.7 from a statement about template parsing into
a measurement of clinical language understanding. The standard to meet is established:
comparable work labels two hundred real notes with inter-annotator agreement reported (Gu et
al., 2025).

**2. Redesign the priority term as priority × earliness.** Section 5.9.2 diagnosed why the
current reward is inert: it rewards inclusion, not early placement. A delay penalty scaled by
urgency would express the intended preference, the distinction drawn in scheduling under
uncertain durations, where the measure carrying the decision reflects the intensity of delay
rather than its occurrence (Fu et al., 2024). The experiment to evaluate it is already built.

**3. Replace candidate pre-enumeration with interval and assignment variables.** One interval
variable per case plus resource-assignment booleans grows *additively* rather than
multiplicatively, removing both the restricted candidate list and the 100-case ceiling — the
two largest caveats on the current results — and settling whether 50% more capacity treated
no additional patients because the instances were saturated or because the restriction hid the
extra resources from the solver (Section 5.8.3). That constraint programming reaches surgical
instances three times this size under a fraction of the budget (Farsi, Torabi and Mokhtarzadeh,
2022) is the reason to expect it to pay.

**4. Close two small gaps in the evidence.** Recomputing deadline compliance inside the
evaluation service would convert the weaker half of the feasibility result into the stronger
half, as it already does for conflicts. Instrumenting priority-weighted throughput would let the
harness detect whether an objective term changes *which* cases are scheduled when it cannot
change how many.

**5. Estimate extraction uncertainty rather than reporting the provider's confidence.** The
confidence value the priority score reads is the provider's own report, not an estimate of how
likely the extraction is to be right. Methods exist that derive an uncertainty measure from the
output sequences a JSON schema admits (Schimmelpfennig et al., 2025), which would let the review
queue be ordered by uncertainty.

**6. Tests for the TypeScript layer.** No component test exists, and two of the three N1
assertions are skipped in a default run. Component tests over the six pages, and integration
tests driving `workflow.ts`, `intake.ts` and `reschedule.ts` directly, are the next work. A
third gap sits in the optimiser: nothing solves a non-trivial instance with both engines and
compares the schedules.

**7. Stochastic procedure durations and modelled arrivals.** Sequencing decisions ignoring
duration variance perform poorly once realised times differ (Denton, Viapiano and Vogl, 2007),
and arrivals are a deterministic projection where recent work forecasts them from data
(Eshghali et al., 2023).

**8. Multi-day rolling horizon.** Real scheduling is a rolling commitment in which today's plan
constrains tomorrow's, so the disruption cost of Section 4.6 would apply across days.

**9. Clinician usability evaluation.** No clinician has assessed whether the schedules are
clinically sensible or the review interface usable. The safety argument of Section 3.2.4 rests
on a reviewer being able to check a structured record against its source note, and an oversight
requirement is only as good as what the person exercising it is given (Enqvist, 2023).

**10. Regulatory and governance pathway.** Operational use would require legal and regulatory
assessment, clinical risk management, security testing, organisational approval and evaluation
with representative data, for which frameworks specific to model-extracted clinical data are
emerging (Estevez et al., 2026). All of it lies outside an MSc project's scope.
