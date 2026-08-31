# Chapter 1 Introduction

## 1.1 Project aim

The aim of this project is to design, implement and evaluate a resource-constrained surgical scheduling application that converts surgical case information into schedules allocating doctors, nurses, operating theatres and post-operative beds simultaneously. The main goal is to establish whether a constraint programming formulation produces measurably better schedules than the priority-ordered heuristic that conventional manual practice approximates, and to identify which terms of the optimisation objective are responsible for any difference, by measuring cases scheduled, patient waiting time and solver computation time.

Surgical scheduling is difficult because a procedure cannot be planned by considering a theatre alone. A single case may require a surgeon of a particular specialty, theatre nurses, a suitably equipped theatre and a post-operative bed, all free at the same moment, with no resource committed to two overlapping procedures. This places the problem in the *resource-constrained* family, in which activities compete for renewable resources of limited capacity and feasibility depends on the joint availability of several resource types rather than on any one of them (Błażewicz et al., 1983; Hartmann and Briskorn, 2010). Each case also carries a clinical time window — a point before which surgery should not occur and a deadline after which delay becomes unacceptable — so a placement can be infeasible on time even when every resource is idle.

Theatre planning must therefore balance outcomes that pull against each other: reviews of the field identify resource utilisation, patient waiting time and responsiveness to emergencies as the quantities it is expected to reconcile (Cardoen et al., 2010; Guerriero and Guido, 2011; Al Amin et al., 2024), and capacity reserved for urgent cases is capacity not used for planned ones (Van Riet and Demeulemeester, 2015). Prioritising by clinical urgency is not merely a modelling convenience: English hip-replacement data show waiting times differing by at least fifteen days between patients in the best and worst pre-operative health (Kasteridis et al., 2026).

*Constraint programming* is a declarative approach to such problems: the model declares decision variables and the constraints relating them, and a general-purpose solver searches for an assignment satisfying all of them, optionally optimising a stated objective (Rossi et al., 2006). Its counterpart here is a *priority-ordered greedy heuristic*, in which cases are sorted by urgency and each placed in the first position that fits, with no earlier placement reconsidered. The heuristic is fast and approximates manual practice, but a placement that appeared reasonable early can block several later cases and it has no mechanism for detecting that. Whether exhaustive search buys enough to justify its cost is the empirical question this project measures.

*Clinical text structuring* is the step preceding all of this. Scheduling requires typed values — a procedure code, an expected duration, an urgency level, required skills — whereas case information arrives as prose. The project converts a description into a schema-validated record, using a large language model where one is available and a deterministic rule engine otherwise, and in both cases requiring human approval before the record may be scheduled.

A surgical case is consequently a structured scheduling request recording procedure, expected duration, urgency, requested time, maximum acceptable delay, required skills and required resources. Cases that cannot satisfy the hard constraints remain unscheduled and are returned with a reason code rather than placed late or in conflict: throughput is never obtained at the cost of a constraint violation. This is a design position, not a limitation, and Section 5.3 records a defect in which it was briefly untrue.

The work is a research prototype, evaluated under controlled conditions on synthetic and publicly available records rather than identifiable patient data. It measures the behaviour of the software; it does not establish clinical effectiveness or readiness for deployment. The resulting system, TheatreFlow, is described in Chapter 4 and evaluated in Chapter 5.

## 1.2 Objectives

1. To review research on operating theatre scheduling, resource-constrained project scheduling, healthcare optimisation, clinical text processing and the evaluation of scheduling systems.

2. To define a formal representation of surgical cases, resources, staff skills, clinical time windows, locked assignments and non-overlapping bookings.

3. To design a modular architecture whose front end, REST API, database and four algorithm services run and are tested independently.

4. To build a data preparation process that cleans and imports appointment records, expands resource assignments into one booking row per occupied resource, and reports duplicated use.

5. To implement a reviewed intake workflow that converts clinical descriptions into validated JSON and prevents unapproved model output reaching the live schedule.

6. To implement three planning configurations — priority greedy, CP-SAT and priority-informed CP-SAT — and determine experimentally which of them differ and what each objective term contributes, including the possibility that a term contributes nothing.

7. To enforce hard constraints on skills, availability, non-overlapping bookings, time windows, locks and post-operative capacity, returning explicit reasons for cases that cannot be scheduled.

8. To provide an interface for reviewing cases, inspecting schedules and resources, inserting urgent cases, locking allocations and viewing evaluation results, driven by live API data.

9. To evaluate the system with repeatable experiments recording throughput, utilisation, waiting time, conflicts, hard-constraint violations, workload fairness, disruption and solver run time.

10. To document design, implementation, setup, testing evidence, limitations and ethical safeguards so that another developer can reproduce the prototype and its experiments.

## 1.3 Deliverables

1. **A browser-based scheduling application** — React and TypeScript front end, Express REST API, MySQL store — providing case review, schedule and resource inspection, emergency insertion, allocation locking and evaluation reporting over live API data.

2. **Four independent Python services** — text extraction, priority scoring, constrained optimisation and schedule evaluation — communicating through six versioned JSON schemas generated from Pydantic models, so any service can be replaced without altering the others.

3. **Three scheduling implementations over a shared constraint model** — priority greedy, CP-SAT and priority-informed CP-SAT — with locked allocations and low-disruption emergency insertion. The shared model is what allows an objective term to be added or removed with everything else held fixed.

4. **A relational database and its preparation pipeline**: the schema, and scripts that clean and import appointment records, expand resource assignments into one booking row per occupied resource, and report overlapping use. The appointment dataset is included under its CC BY 4.0 licence with attribution.

5. **A reviewed clinical intake workflow** retaining the original note beside the structured extraction, recording validation warnings, extraction path and approval decision, and maintaining a before-and-after audit history of every case transition.

6. **A reproducible experiment suite and its exported evidence**: two suites totalling 420 runs at 10, 25 and 50 cases across four resource conditions under fixed seeds, persisted in MySQL and exported as CSV, JSON and Markdown. The 100-case scale is retained as a recorded scalability limit rather than a result.

7. **An automated test suite of 57 tests**: 36 Python tests covering the data contracts, rule-based extraction, priority scoring, optimisation constraints and evaluation metrics, and 21 Node tests covering the REST API's read models, input validation and the review-safety invariant. The front end carries no automated tests (Section 5.5).

8. **Developer documentation**: architecture and directory structure, database setup, the commands for running the services, tests and experiments, and a record of known defects.

9. **A GitHub repository** containing the source code, services, database schema and pipeline, appointment dataset, automated tests and developer documentation, packaged as the School requires.

10. **The MSc project report**.

## 1.4 Ethical, legal, and social issues

This section states the issues the project raises and the position taken on each. Appendix B records the safeguards implemented and the ethical review status.

### 1.4.1 Patient data and privacy

No personal data was processed. Clinical case text came from synthetic notes written for this
project and from the publicly available PMC-Patients dataset (Zhao et al., 2023), derived from
open-access PubMed Central articles. Scheduling behaviour was exercised against the *Medical
Appointment Scheduling System* dataset (Gonzalez Galtier, 2024), published on Kaggle under a
Creative Commons Attribution 4.0 licence and synthetically generated: names come from the Faker
library, insurers are fictitious, and age and sex distributions are calibrated against
published outpatient statistics rather than drawn from individual records. No record refers to
an identifiable person, and no data was obtained from a healthcare organisation. The surgical
fields this project requires were derived from the published dataset, so the file used is a
derivative work redistributed under the same licence with attribution (Appendix A.1).

Because the data is synthetic, the project raised no question of consent, de-identification or re-identification risk — a property of the evaluation, not of the problem. A deployed system would process real appointment records, which the Information Commissioner's Office classifies as special category data under the UK GDPR (Information Commissioner's Office, 2024) and whose processing requires both a lawful basis and an applicable special category condition (Information Commissioner's Office, n.d.); age, sex, appointment date and service type moreover form a quasi-identifier set. Appendix B.2 sets out what a hospital implementation would require.

The extraction service carries a further risk, because a case description may be transmitted to an external model provider. The language model path was exercised only on the 100 synthetic benchmark notes; the PMC-Patients narratives were processed by the local rule engine, and no appointment record left the machine. The API key is held in local environment configuration and excluded from version control, and a deterministic fallback allows the system to run with no external provider at all.

### 1.4.2 Human oversight and clinical safety

An incorrect extraction could assign the wrong procedure, urgency, duration or resource requirement, and a technically feasible schedule may still be clinically unsuitable if its input is incomplete. The risk is not hypothetical: across 300 physician-validated vignettes each seeded with one fabricated clinical detail, large language models frequently elaborated on the fabrication rather than rejecting it, and prompt-level mitigation reduced the behaviour without removing it (Omar et al., 2025). Every extracted case therefore enters a review state and requires approval before scheduling, with the original text and any validation warnings retained beside it. The extraction path is labelled, so a rule-engine result is never presented as a model interpretation. This is enforced structurally rather than by convention: the API exposes no route that creates an approved case (Section 3.2.4).

Requiring a human in the loop is necessary but not sufficient. Analysis of the EU AI Act's oversight provisions notes that such requirements leave open who exercises the oversight, at what point and with what information (Enqvist, 2023), and Kelly (2026) states the underlying limit plainly: these systems predict where a clinician understands, and a prediction cannot supply the reasoning and justification a clinical decision requires. The consequence taken here is that the reviewer is given the source text and the validation warnings, not merely an approve control.

The priority score is a planning aid, not a clinical triage score. It is computed from the fields the scheduling system holds and cannot represent every factor a clinical team weighs, so its components are exposed for inspection rather than presented as an unquestionable ranking. The prototype must not be used to delay care, override a clinician, or allocate a real patient without authorised review.

### 1.4.3 Bias, fairness, and explainability

Historical appointment data can encode the effects of earlier capacity shortages or unequal access, and optimising against such records without review could reproduce them. The project limits this through explicit scheduling fields, deterministic validation, visible warnings and manual approval. The dataset includes synthetic sex and age values; neither is read by the priority score or the optimisation objective — protected characteristics are not optimisation rewards — and a deployment would need to keep it that way.

Fairness cannot be reduced to a single measure, and it has to be operationalised rather than asserted (Wawira Gichoya et al., 2021). Doctor workload is reported through the Jain fairness index, but equal case counts are not necessarily equitable once experience, continuity of care and contracted hours are considered. The index compares schedules; it does not certify an allocation as fair (Section 2.2.4, Appendix B.4).

### 1.4.4 Accountability, security, and legal use

Review decisions, optimisation requests and results, rejections, locks, emergency changes and resource bookings are persisted, so any output can be traced to the input and configuration that produced it (Appendix B.5). This supports investigation; it does not transfer responsibility from the user to the software. Dataset, model and library licences are recorded in Appendix A. Credentials and the API key are excluded by `.gitignore`, which matters because the source code is submitted as a repository.

The prototype is research software: not a medical device, not a validated clinical system, and no claim of clinical effectiveness or deployment readiness is made. Appendix B.6 states what operational use would require.

### 1.4.5 Social and operational effects

Automated scheduling can reduce repetitive work but can also encourage overreliance on a score or a solver result. Schedulers need to see why a case was not allocated and which constraint prevented it, so the interface reports rejection reasons, conflicts, violations and the changes made during emergency rescheduling, and manual locks preserve decisions that should not move automatically.

Resource utilisation is not treated as the sole measure of a good schedule, because driving it to its maximum removes the slack that absorbs emergencies. Section 5.8.3 shows why this matters: two configurations that treated exactly the same patients differed by 28 percentage points of utilisation, because adding 50% more capacity enlarged the denominator without treating anyone more. A capacity investment justified on utilisation figures alone could therefore deliver nothing.
