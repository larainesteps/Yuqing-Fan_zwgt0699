# MSc Dissertation Outline — TheatreFlow

**Working title:** *TheatreFlow: A Contract-Driven Microservice Architecture for Resource-Constrained Surgical Scheduling with Reviewed LLM Case Intake*

University of Leeds, School of Computer Science — MSc project report
**Project type: Exploratory Software (ES)**

Structure follows *Structure of MSc Dissertation* (School handout). Chapter titles and
section sequence are taken from that document; the handout states that failure to include
a required section, or misplacing it, **can lose marks**.

> **Not specified by the handout — confirm with your supervisor:** the word limit. The
> budget at the end of this file is a working allocation, not a regulation.

---

## What the handout forbids

Explicitly dropped from the report since 2019–20. Including any of these earns no marks
and distracts the assessor:

- project planning and risk mitigation
- choice of software development methodology (waterfall vs agile comparison)
- description of relevant modules taken previously
- **self-appraisal / personal reflection**

An earlier version of this outline proposed a "7.5 Personal reflection" section. Removed.

---

## Part 0 — Front matter

Title page · Summary/Abstract (~300 words, written last) · Acknowledgements · Table of
contents · List of figures and tables.

---

## Chapter 1 — Introduction  (~1,500 words)

**Status: draft exists** at `chapter-1-introduction-draft.md` — its four sections already
match the mandated titles and sequence exactly.

| Section | Content | Status |
|---|---|---|
| 1.1 Project Aim | Opens "The aim of this project is to design, implement, and evaluate…"; then defines terms for a computing audience, plus context and practical importance | ✅ matches handout's required opening form |
| 1.2 Objectives | 10 enumerated objectives | ✅ handout recommends bullet points |
| 1.3 Deliverables | 9 enumerated deliverables | ✅ |
| 1.4 Ethical, legal, and social issues | Five subsections: UK GDPR special category data; human oversight; bias and explainability; accountability and security; social effects | ✅ handout allows supporting documents in an appendix |

**Action:** do **not** add a "1.5 Report structure" section. The handout lists 1.1–1.4 as
the compulsory set and asks you to keep the same titles and sequence; an extra section
here is a deviation with no upside.

---

## Chapter 2 — Background Research  (~3,000 words)

**Status: restructured and drafted** — `chapter-2-background-research-draft.md`, now under
the three mandated section titles. The three references to it from Chapter 5 have been
repointed to §2.2.4.

The numbered contribution list that ended the earlier draft was **moved out**: under the
handout, §2.3 is a brief closure on method selection, so the contributions belong in §6.1
Conclusions. The research gap that motivates them stays, in §2.1.6.

### 2.1 Literature Survey

A balanced survey of prior research — the handout warns against dwelling on one paper
while ignoring an equally important one.

| Subsection | Source in current draft |
|---|---|
| 2.1.1 Surgical scheduling as an operational problem | drafted §2.1 |
| 2.1.2 Priority, urgency and clinical triage | drafted §2.3 |
| 2.1.3 Emergency insertion and schedule stability | drafted §2.4 |
| 2.1.4 Clinical text to structured data | drafted §2.5 |
| 2.1.5 Evaluating scheduling systems | drafted §2.6 |
| 2.1.6 Research gap | drafted §2.7, first half |

### 2.2 Methods and Techniques

Brief, balanced coverage of what is *available* — not yet what you chose.

| Subsection | Source in current draft |
|---|---|
| 2.2.1 Relationship to resource-constrained project scheduling | drafted §2.2.1 |
| 2.2.2 Exact and heuristic approaches — MILP, constraint programming, greedy/metaheuristics | drafted §2.2.2 |
| 2.2.3 Rule-based versus learned clinical information extraction | drafted §2.5, methods half |
| 2.2.4 Candidate evaluation metrics | drafted §2.6, metrics half |

### 2.3 Choice of methods

The handout wants this **brief**, with convincing arguments for each choice.

- **CP-SAT** — drafted §2.2.3 already gives four arguments: direct expression of the
  disjunctive constraint; proof of infeasibility rather than silent omission; anytime
  behaviour under a time cap; one constraint model serving several objectives, which is
  what makes the ablation a controlled comparison.
- **Priority-ordered greedy** as the baseline — it mirrors how a list is built manually.
- **Provider abstraction with a deterministic rule fallback** — the fidelity and
  availability arguments from drafted §2.5.
- **The metric set** — why no single measure suffices; sets up Chapter 5.

---

## Chapter 3 — Software Requirements and System Design  (~2,500 words)

**Status: drafted** — `chapter-3-requirements-and-design-draft.md` (1,727 words). Figures 3.1–3.3 done.

ES project: requirements may be **rather generic**, since the project explores the problem
domain (SP projects require detailed, precise requirements — you are not held to that).

### 3.1 Software Requirements
- Functional requirements derived from the nine implemented modules
- Non-functional: reproducibility, auditability, module replaceability, and the safety
  requirement that no unreviewed model output reaches a schedule
- Formal problem statement: decision variables, hard constraints, objective terms

### 3.2 System Design

The handout asks for **diagrams wherever possible** — block, use case, class, relational
database. None exist yet; see the figure list below.

- Layered architecture: React SPA → Express API → MySQL, with four Python services on
  8101–8104
- Design rationale for HTTP microservices over a monolith
- Data contracts: six versioned JSON Schemas, Pydantic models as the single source of truth
- Database design: ER diagram of the core scheduling tables; the normalisation decision
  behind `resource_bookings`; the audit tables
- Case review state machine: `REVIEW_REQUIRED → APPROVED → SCHEDULED`, with `REJECTED`
  and infeasible-retain branches

---

## Chapter 4 — Software Implementation  (~2,500 words)

**Status: drafted** — `chapter-4-implementation-draft.md` (1,962 words). Figures 4.1–4.7 done, including the six interface screenshots.

The handout expects detail here — screenshots, pseudocode, code snippets.

- 4.1 Technology stack
- 4.2 **The optimiser** — the technical core, warrants the most space: CP-SAT model
  construction, interval variables and `AddNoOverlap`, deadline windows, the exact
  fallback engine, structured rejection codes
- 4.3 **The restricted candidate list and the greedy solution hint** — *moved here from the
  evaluation chapter, where only its consequence belongs*: candidates are pre-enumerated as
  (resource combination × start slot), so model size grows multiplicatively with each
  resource pool; the pruning rule and the hint are implementation mechanisms
- 4.4 Priority scoring — deterministic policy, reproducibility as a design requirement
- 4.5 NLP intake and the fallback path — provider abstraction, schema validation before
  persistence, provenance per extraction
- 4.6 Dynamic emergency rescheduling — freeze window, locks as hard constraints, current
  schedule as soft constraint, diff computation
- 4.7 Experiment harness — arrival projection, seeded instance selection, persistence
- 4.8 Front end — six views over live API data; `App.tsx` holds all six views in one 46 KB file (17 components, 32 useState) — a known`n  structural weakness, noted honestly and revisited in 6.1

---

## Chapter 5 — Software Testing and Evaluation  (~4,500 words)

**This is where testing and evaluation merge.** The handout: "outline the methodology for
testing the software as well as the outcome of the tests. If the software was evaluated by
customers or other stakeholders, then you should also include the results of the
evaluation in this chapter."

My earlier outline split these across two chapters and numbered the experimental figures
6.x. Under the actual structure they are **Chapter 5, Figures 5.1–5.5**.

**Status: the evaluation half is drafted** in `chapter-6-evaluation-draft.md` — content is
sound, needs renumbering and the merge.

### Testing

| Section | Content |
|---|---|
| 5.1 Testing strategy | Unit, contract, integration, end-to-end |
| 5.2 Automated test suite | 36 unittest cases: contracts, NLP fallback, priority, CP-SAT hard constraints, rejection codes, conflict detection, evaluation metrics, service health |
| 5.3 Defect case study: OPT-001 | The strongest testing evidence in the project. Symptom (emergency aneurysm repair with 0 h tolerance scheduled 1.5 h late) → root cause (deadline was an objective term, not a hard constraint) → fix → verification (`WF-20260821033243`, zero breaches). Full defect lifecycle with stored artefacts |
| 5.4 Independent verification | Conflicts recomputed by `detect-conflicts.mjs`, external to the solver under test |
| 5.5 Limitations of testing | All 36 tests are Python; the whole TypeScript layer is untested. No property-based testing, no adversarial clinical text |

### Evaluation

| Section | Was | Content |
|---|---|---|
| 5.6 Experimental design | 6.1 | Instance construction, arrival projection, horizon sizing, factors, repetitions |
| 5.7 Clinical text extraction | 6.2 | Rules vs LLM; the ~10,000× latency difference; the synthetic-benchmark limitation stated plainly |
| 5.8 Algorithm comparison | 6.3 | Paired analysis; +16.3% at 25 cases, +19.0% at 50, 20/20 wins; the capacity result |
| 5.9 Ablation study | 6.4 | Waiting cost works; **priority reward is inert** — the negative result |
| 5.10 Feasibility and safety | 6.5 | Zero conflicts, zero hard-constraint violations, Jain fairness |
| 5.11 Computation time and scalability limit | 6.6 + 6.7 | Runtime growth; the 100-case ceiling |
| 5.12 Threats to validity | 6.8 | Construct, internal, external, statistical conclusion validity |

---

## Chapter 6 — Conclusions and Future Work  (~1,500 words)

**Status: drafted** — `chapter-6-conclusions-draft.md` (1,533 words).

Only two mandated sections. Everything from my earlier 7.1–7.4 folds into these.

### 6.1 Conclusions
- Objective-by-objective assessment: table mapping each of the 10 objectives in §1.2 to
  its evidence, with an honest met / partially met / not met verdict
- Contributions: contract-versioned replaceable-service architecture; the reviewed-intake
  safety pattern; the latency/accuracy trade-off finding; the deadline-as-hard-constraint
  defect and fix; **the ablation's negative result on the priority reward**
- Limitations: synthetic NLP gold set; single dataset and resource configuration;
  deterministic durations; the restricted candidate list; the 100-case ceiling; no
  clinical user evaluation; `App.tsx` monolith

> **Wording change required.** §5.9 found the priority reward inert and fractionally
> adverse on emergency waiting. `HYBRID_PRIORITY_CP_SAT` can no longer be presented as a
> validated contribution. Reword Objective 6 and the Deliverables list in Chapter 1 to
> match. The contribution is the *controlled comparison that isolated the term and showed
> it inert*, the diagnosis of why (the objective rewards including a high-priority case,
> not scheduling it early), and the redesign that follows.

### 6.2 Future Work
Clinically annotated extraction benchmark · priority × earliness objective term · interval
variables with resource-assignment variables instead of candidate pre-enumeration (removes
the 100-case ceiling) · multi-day rolling horizon · stochastic durations · clinician
usability study · regulatory pathway

---

## Figures

Renumbered to Chapter 5. The seven SVG files currently carry `fig-6-*` names and need
renaming.

| Figure | Panels | Status |
|---|---|---|
| 3.1 Layered architecture | — | ✅ done |
| 3.2 ER diagram, core scheduling tables | — | ✅ done |
| 3.3 Case review state machine | — | ✅ done |
| 4.1 Candidate enumeration and pruning | — | ✅ done |
| 4.2–4.7 The six interface views | screenshots | ✅ done |
| 5.1 OPT-001 before/after schedule | — | ✅ done |
| 5.2 CP-SAT advantage grows with instance size | (a) throughput (b) waiting | ✅ done |
| 5.3 Extra capacity treated no additional patients | (a) scheduled (b) utilisation | ✅ done |
| 5.4 Only the waiting cost does any work | emphasis form | ✅ done |
| 5.5 Paired ablation outcomes | diverging stacked | ✅ done |
| 5.6 Solver runtime | log scale | ✅ done |

---

## Evaluation defects found and fixed — 25 August 2026

Recorded because §5.12 must disclose them and §5.3 can use them as testing evidence.

1. **Comparison experiment was degenerate** — only 2 of 100 source cases had a feasible
   window overlapping the horizon; 98 were requested before 2026 (historical CSV records).
   "2 scheduled" was the count of temporally eligible cases, not an algorithm result.
   *Fixed:* workload projected onto the horizon as an arrival pattern; horizon sized so
   capacity is 60% of demand.
2. **Repetitions measured solver jitter, not instance variance** — `applyScenario` never
   received the seed, so every repetition built an identical instance.
   *Fixed:* seeded rotation of the stratified ordering; 5 genuine replicates per cell.
3. **Three repetitions could not support statistical claims** — *fixed:* raised to 5,
   giving 20 paired observations per scale.
4. **CP-SAT returned zero allocations on large instances** — candidate pre-enumeration
   reached ~1.5M boolean variables; the solver exhausted its budget in presolve while the
   greedy baseline scheduled 18–24 cases on the same instance.
   *Fixed:* restricted candidate list plus greedy solution hint. 25-case RESOURCE_MODERATE
   0 → 15; 50-case BASELINE 0 → 29. **Residual limit:** 100 cases still unsolvable (§5.11).
5. **No clinically annotated gold set exists** — `pmc-surgical-annotations-200.csv` is an
   empty template (0/200 populated). *Resolved by scoping the claim,* not by new data:
   §5.7 reports schema conformance and template-parsing reliability, and states that
   extraction accuracy on real clinical prose is unmeasured.

---

## Suggested word budget

| Chapter | Words |
|---|---|
| 1 Introduction | 1,500 |
| 2 Background Research | 3,000 |
| 3 Requirements and System Design | 2,500 |
| 4 Software Implementation | 2,500 |
| 5 Software Testing and Evaluation | 4,500 |
| 6 Conclusions and Future Work | 1,500 |
| **Total** | **~15,500** |

Confirm the actual limit with your supervisor — the handout does not state one. Chapters 2
and 5 carry the most marks and should not be compressed to make room for Chapter 4.

---

## Suggested writing order

1. **Chapter 5 evaluation half** — already drafted; renumber and merge with the testing half
2. **Chapters 3 and 4** — the artefacts exist, these are the fastest to write; produce the
   four missing diagrams while writing them
3. **Chapter 2** — longest lead time (reading); re-bucket the existing draft into the three
   mandated sections
4. **Chapter 6**, then the Abstract
