# Chapter 2 Background Research

---

## 2.1 Literature Survey

### 2.1.1 Surgical scheduling as an operational problem

Operating theatres are among the most expensive resources a hospital operates, and the
decisions governing their use determine both institutional cost and the time a patient waits
(Aktaş et al., 2024). Operational research applied to surgical planning has been reviewed
(Guerriero and Guido, 2011), and Cardoen, Demeulemeester and Beliën (2010) give the field its
standard classification across six fields including patient characteristics, performance
measures, decision delineation and the incorporation of uncertainty. They judge the common
strategic/tactical/operational division to lack adequate detail, and the finer scheme is more
useful here because a piece of work can declare which patients it plans for, which measures it
optimises and whether it admits uncertainty. A systematic review of the literature from 2000 to
2023 confirms that resource limitations, staff availability and patient variability dominate
practical models (Al Amin et al., 2024).

Positioned on those fields, this project plans for elective and non-elective patients together; optimises throughput, waiting time and utilisation; decides the date, time, theatre and staff for each case; and is deterministic. It does not decide how much capacity to build, nor how blocks should be divided between specialities.

The problem is hard because a surgical case is not a demand on a single resource: a procedure
requires a theatre, a surgeon with appropriate skills, nursing staff and often a post-operative
bed, all free simultaneously. This places it in the family Abdalkareem et al. (2021) survey
under healthcare scheduling. Recent formulations draw the set wider still, scheduling theatres
jointly with equipment and multi-room availability (Vieira, Silva and Chaves, 2025) or with
reusable instrument inventory (Bhosekar, Isik and Eksioglu, 2026). Including downstream ward
capacity is reported to produce more stable plans and fewer cancellations (Tayyab and Saif,
2022), which is why the post-operative bed is modelled here as a scheduled resource.

Two properties of real demand complicate any practical system: emergencies arrive unpredictably
(Section 2.1.3), and the quantities the model relies on are uncertain. Denton, Viapiano and
Vogl (2007) show that a sequencing rule based on nothing more than the variance of surgery
durations substantially reduces surgeon and team waiting, theatre idling and overtime:
variability is information a scheduler can act on. The recent literature answers it with
stochastic and robust formulations — over anaesthetist availability as well as theatre capacity
(Tsang et al., 2025), over induction, surgery and turnover durations (Çelik, Gul and Çelik,
2023), and across a three-stage process (Lin and Chong, 2025) — or by estimating the durations
themselves, where machine learning improves on conventional projections (Miller et al., 2022).
This project treats durations as deterministic point estimates and forgoes all of that.

### 2.1.2 Priority, urgency and clinical triage

Surgical waiting lists are not first-in-first-out queues. Urgency is built into how the field
classifies its own problems: the first of Cardoen et al.'s (2010) six fields is patient
characteristics, separating elective from non-elective patients and, within the latter, urgent
from emergent cases. Prioritisation is observable in practice: administrative data on hip
replacements in England from 2015 to 2021 show inpatient waiting times differing by at least
fifteen days between patients in the best and worst pre-operative health (Kasteridis et al.,
2026). In England a second layer applies, because non-urgent consultant-led elective care
carries a maximum referral-to-treatment waiting time of 18 weeks (NHS, 2019). A case can
therefore be urgent in two senses at once, and the two need not agree.

Across the literature, priority enters scheduling methods in two structurally different roles. In constructive heuristics it acts as a **sort key**: cases are ordered by urgency and placed in that order. In optimisation formulations it acts as a **weight in the objective**, expressing what scheduling a high-priority case is worth relative to other goals. These are not equivalent. A sort key fully determines a greedy method's behaviour, whereas an objective weight competes with every other term and may or may not change the solution returned.

That raises a question the literature does not settle. Objectives commonly combine throughput, waiting cost, deadline penalties and priority rewards, and it is generally assumed rather than demonstrated that each contributes. Where a formulation already penalises waiting and enforces deadlines as hard constraints, an explicit priority reward may be redundant, since urgent cases are already advantaged by their shorter deadlines. Section 5.9 isolates each term to test it.

A separate distinction underpins how this project uses a priority score at all, and it is a
position taken here rather than a finding in the literature. *Clinical triage* is a judgement
drawing on examination, history and context; a *computational priority score* is a function
over the fields a scheduling system happens to hold. The second is computed from a proper
subset of what the first draws on and cannot substitute for it. This is why the score's
components are exposed for inspection instead of presented as a ranking, and why every
extracted case requires human approval before scheduling.

### 2.1.3 Emergency insertion and schedule stability

An emergency arriving during a working day must be accommodated against a schedule already partly executed. Two literatures bear on this.

The first is the elective–emergency capacity trade-off surveyed by Van Riet and Demeulemeester
(2015), who find two policies dominating: a *dedicated* policy reserving theatre capacity for
non-elective cases, and a *flexible* policy in which non-electives may also use elective
theatres. Reservation protects the elective programme but idles capacity when no emergency
arrives; flexibility uses capacity efficiently but disrupts planned work. Their review reports
that the choice demonstrably affects disruption and utilisation, while findings on overtime and
waiting time partly contradict one another. More recent work integrates both streams in one
model, reserving emergency capacity from a machine-learned forecast of arrivals (Eshghali et
al., 2023).

Related work plans the two streams jointly under uncertainty rather than choosing between the policies (Fallahpour et al., 2024), and forecasts emergency arrivals directly from several years of theatre data (Zadeh et al., 2025), which makes the reserved quantity an estimate rather than a guess.

This project adopts the flexible policy for reasons of scale rather than any claim that flexibility dominates: the resource pools here are small, and reserving a theatre from a pool of two would idle half the surgical capacity against an emergency that may not arrive. Adopting it means accepting its cost — disruption — and therefore measuring it.

The second literature is *schedule stability*, surveyed by Herroelen and Leus (2005) under
proactive and reactive project scheduling. When a plan is revised the revision has a cost of
its own: staff have been briefed, patients told when to arrive, equipment prepared. A method
producing a marginally better plan by moving many cases may be worse in practice than one
producing a slightly worse plan by moving few. This territory lies outside the deterministic
scope to which the standard RCPSP survey restricts itself (Hartmann and Briskorn, 2010), which
is one reason a system can adopt a well-founded formulation and still have no representation of
what a change costs.

Two consequences follow, both implemented rather than asserted: disruption is priced into the objective, with frozen and locked cases as hard constraints and the rest of the existing schedule as a soft one carrying a perturbation cost (Section 4.6); and it is reported rather than absorbed, each case receiving a typed change so a scheduler sees what an insertion cost.

### 2.1.4 From clinical text to structured data

Scheduling requires structured fields; clinical documentation arrives as prose. Three families of method bridge the gap, and none displaced its predecessor, because what they offer differs in kind rather than degree.

Rule and dictionary pipelines match text against controlled terminologies; cTAKES (Savova et al., 2010) is the standard example, pairing dictionary lookup against a UMLS subset with maximum-entropy models for sentence boundaries, tagging and shallow parsing. What they offer a clinical setting is not peak accuracy but accountability: an output traces to a rule, so a failure can be located and corrected. Supervised models trained on annotated corpora outperform them on many tasks — Wu et al. (2020) review 212 studies applying deep learning to clinical text, in which information extraction accounts for 89.2% of the work — at the cost of decisions that cannot be traced to a rule.

General-purpose models extend coverage furthest, requiring no task-specific corpus — which
matters because conventional pipelines need expert-driven annotation before they can be trained
at all (Chen et al., 2025). Singhal et al. (2023) show that such models encode substantial
clinical knowledge, though the capability evidenced is question answering rather than
structured extraction. Reported extraction studies cover imaging reports (Ge et al., 2024),
physician notes (McMurry et al., 2025) and pathology reports (Foy et al., 2026); where closed
models raise cost and data-security concerns, adapted open models are a documented alternative
(Yim et al., 2025), including on-premises pipelines that keep clinical text inside the
institution (Ntinopoulos et al., 2026). Eighteen models tested on synthetic notes reached
accuracies above 0.98 (Ntinopoulos et al., 2025), and open-source models without fine-tuning
extracted social determinants of health from real notes against manually labelled ground truth
(Gu et al., 2025). Alongside these runs a documented failure mode: generated text can be fluent
and wrong (Ji et al., 2023). Across 300 physician-validated vignettes seeded with a fabricated
detail, models frequently elaborated on it rather than rejecting it (Omar et al., 2025), and a
record-embedded system across sixteen Kenyan clinics hallucinated in 3.4% of 1,469 encounters
(Agweyu et al., 2026). An invented extraction is indistinguishable, at the point of use, from a
correct one.

Two consequences follow. In design, *validation establishes form, not fidelity*: a schema-valid record is well-typed and in range, and none of that shows its contents reflect the source note. In evaluation, measuring fidelity requires clinically annotated ground truth, which is scarce and rarely shareable — note that the strongest accuracy figures above were obtained on synthetic notes. A benchmark built from generated text with known fields measures whether the extractor can invert the generator that produced it, which is why Section 5.7 reports schema conformance rather than language understanding.

### 2.1.5 Evaluating scheduling systems

Performance in this field is not a single quantity. May et al. (2011) organise the literature by planning horizon into six categories, each carrying its own criterion of success. Within schedule construction alone, Cardoen et al. (2010) find waiting time, patient deferral, utilisation, makespan, financial value, preferences and throughput all serving as performance criteria, and these conflict structurally: throughput and waiting time move in opposite directions when capacity is scarce, and utilisation can be raised simply by removing the slack that absorbs emergencies.

The deeper problem is that the field has not agreed what it is measuring. A structured review of operating room optimisation finds no uniform definition of "optimisation" has been adopted, and that the metrics used are so diverse that assessing the impact of a proposed approach becomes complex or impossible (Schouten et al., 2023). A study claiming an improvement must therefore carry its own definitions.

Three requirements follow. A study must name the measure improved and report those that did not; comparison must be made on identical instances, since methods evaluated on separately generated problems differ by instance as well as by method; and where a method combines several components, reporting that the assembled method performs well attributes nothing to any individual term. Establishing what each contributes requires removing it while holding everything else fixed, which is the ablation design of Section 5.9. Without such a test a term can remain in a formulation indefinitely on the assumption that it is doing work.

### 2.1.6 Research gap

The literature is strong in each individual area: theatre optimisation is mature (Cardoen et al., 2010; Al Amin et al., 2024), constraint programming for disjunctive scheduling is well established (Rossi, van Beek and Walsh, 2006), and clinical information extraction has an extensive history (Savova et al., 2010; Wu et al., 2020). Two gaps emerge from reading them together rather than from any one of them.

The first lies at the junction between extraction and scheduling. Studies applying language models to clinical text evaluate extraction quality in isolation, without asking what happens when the extracted record reaches a scheduler; optimisation studies assume structured input already exists. The gap is evidential rather than architectural: what happens at the junction has not been measured, because measuring it requires a system that spans it.

The second lies inside the optimisation stage, where objectives routinely combine throughput, waiting cost, deadline and priority terms and the contribution of an individual term is more often assumed than demonstrated. A formulation that performs well is evidence for the formulation, not for any of its parts.

This project addresses both, and how far it reaches differs. The second it closes directly: Section 5.9 removes each objective term in turn under an otherwise fixed configuration. The first it closes only in part, since establishing extraction fidelity requires clinically annotated ground truth that was not available. The junction is constructed and instrumented; only one side of it is measured.

---

## 2.2 Methods and Techniques

This section surveys the methods *available*. Which the project adopted, and why, is Section 2.3.

### 2.2.1 Relationship to resource-constrained project scheduling

The operational surgical scheduling problem is a variant of the resource-constrained project scheduling problem (RCPSP), in which activities of known duration compete for renewable resources of limited capacity. Błażewicz, Lenstra and Rinnooy Kan (1983) proposed a classification scheme for resource constraints and established that the resulting problem class is strongly NP-hard; Hartmann and Briskorn (2010) survey the variants generalising the activity concept, precedence relations, resource constraints and objective.

Reviews covering 2016 to 2024 trace the field's movement toward hybrid metaheuristics, multi-objective formulations and stochastic variants (Khajesaeedi et al., 2025), while exact methods continue to be developed for generalisations in which only a subset of activities need be executed (van der Beek et al., 2025) — a property this problem shares, since a case may be left unscheduled.

Three generalisations apply here. Theatres, surgeons and beds are *dedicated* resources, each admitting one activity at a time — the disjunctive case. Each case carries a *time window* rather than only a duration, so a placement can be infeasible on time while every resource sits idle. And resources are not interchangeable units of a pool: a case requires a particular skill, so a timing decision and an assignment decision must be taken together.

Two differences matter as much. The standard RCPSP minimises makespan and schedules every activity; this problem instead maximises the number of cases placed within their clinical windows, returning a case unscheduled with a reason code where no feasible placement exists. Rejection is an outcome, not a failure. The complexity result also carries a warning: no exact method should be expected to scale indefinitely, so a practical system must return a usable answer under a time limit rather than only an optimal one.

### 2.2.2 Exact and heuristic approaches

Three families of solution method are available, and they are not mutually exclusive.

**Mixed-integer linear programming (MILP)** is the most widely reported, expressing the problem with binary assignment variables and linear constraints and benefiting from mature solvers. Its weakness here is expressiveness: disjunctive "these two procedures must not overlap" conditions require big-M formulations or time-indexed variables, both of which grow awkwardly as the horizon is discretised more finely.

**Heuristics and metaheuristics** — dispatch rules, greedy insertion, genetic algorithms, simulated annealing — give fast answers without optimality guarantees, and priority-ordered greedy insertion corresponds closely to how a list is often constructed manually. The families combine: a heuristic solution can seed an exact solver, so the same greedy construction serves twice, as the baseline a method must beat and as a component of the method that beats it.

**Constraint programming (CP)** represents the same conditions directly. The handbook edited by
Rossi, van Beek and Walsh (2006) covers the global constraints that make this possible; modern
solvers expose interval variables with a no-overlap constraint over the intervals competing for
one resource. A CP model can therefore be written close to the way a scheduler would describe
the problem, and can report that a case *cannot* be placed rather than silently omitting it.
The historical objection was that classical CP solvers could guarantee optimality but not
provide bounds if interrupted; Naderi, Ruiz and Roshanaei (2023) note that current solvers
supply both, their comparison across twelve scheduling problems finding CP a general
alternative rather than a specialist fallback. Applied to surgery, a CP model of integrated
theatre, nurse and surgeon scheduling solved up to 150 surgeries in under 500 seconds (Farsi,
Torabi and Mokhtarzadeh, 2022), with comparable results on real industrial scheduling
(Geibinger, Mischek and Musliu, 2024).


### 2.2.3 Rule-based versus learned clinical extraction

Section 2.1.4 established that these families differ in how their failures present rather than in peak accuracy. As implementation options they differ in three further respects, on which the choice in Section 2.3 turns.

Table 2.1  Rule-based and learned clinical extraction compared by the training data each needs, whether it runs locally, and how it fails.

| | Training data | Runs locally | Failure mode |
|---|---|---|---|
| Rules and dictionary lookup | None | Yes | Non-match, traceable to a rule |
| Trained sequence models | Annotated clinical corpus required | Yes | Misclassification, not individually traceable |
| Schema-constrained generation | None | No — network, per-request charge, variable latency | Fluent invention that validates as readily as a correct extraction |

The annotated corpus the second option requires is expensive to produce and difficult to share; the third exports clinical text beyond the institution. They are not mutually exclusive: a provider abstraction can place several behind one contract, with validation and review applied identically to whichever produced the output.

### 2.2.4 Candidate evaluation metrics

Section 2.1.5 argued that no single measure suffices. These are the measures available and what each misses.

**Throughput** — cases scheduled — is the most direct measure, but alone it rewards scheduling easy cases and counts every case equally.

**Utilisation** is the standard efficiency measure. High utilisation removes the slack that absorbs emergencies, so a schedule at very high utilisation may be *worse* operationally than one below it, and it is a ratio, so it moves when its denominator changes even if the same patients are treated (Section 5.8.3).

**Waiting time** — mean and maximum, and separately for emergency cases — represents the patient's experience, and moves opposite to throughput when capacity is scarce.

**Workload fairness** can be measured with the Jain fairness index (Jain, Chiu and Hawe, 1984), which maps an allocation across *n* recipients to a scalar bounded by 1/*n* and 1: it reaches 1 under perfect equality and falls to 1/*n* where one recipient takes everything. It compares schedules; it does not certify an allocation as fair. Workload is not only an equity question, either: cumulative daily workload measurably affects service time and quality in cardiac surgery (Shen et al., 2025), and recent formulations treat equitable allocation among surgeons as an objective alongside utilisation (Kayvanfar, Baldacci and Govindan, 2025).

**Schedule disruption** — how much of an existing plan a revision moves. Classifying each case by the kind of change is more informative than a single distance, since a time shift and a resource substitution are different costs to those affected. **Feasibility and violation counts** matter for safety, and are only meaningful if computed independently of the component that produced the schedule. **Computation time** needs two readings: time to a first feasible answer, and time to a proved optimum.

---

## 2.3 Choice of methods

**CP-SAT as the optimiser.** This project uses the CP-SAT solver from Google OR-Tools (Perron and Furnon, n.d.) rather than MILP or a metaheuristic, for four reasons:

1. **Direct expression of the dominant constraint.** Every resource conflict is a disjunction,
   and CP-SAT provides interval variables with a native no-overlap constraint.
2. **Proof of infeasibility, not silent omission.** An unschedulable case is returned with a
   reason rather than quietly dropped.
3. **Anytime behaviour under a time limit.** CP-SAT returns the best feasible solution found
   within a budget and reports whether optimality was proved.
4. **One constraint model serving several objectives.** The objective is a weighted expression
   over the same feasible region, so terms can be varied without changing the constraints,
   which makes the Chapter 5 ablation a controlled comparison.

The choice is supported externally: CP is a general alternative to MIP for scheduling (Naderi,
Ruiz and Roshanaei, 2023), applied to surgical instances larger than those used here (Farsi,
Torabi and Mokhtarzadeh, 2022), which makes the ceiling of Section 5.11 a property of this
encoding rather than the method.

**Priority-ordered greedy in two roles.** Greedy insertion in priority order mirrors manual
list construction and never backtracks, so where CP-SAT beats it the gain is attributable to
revisiting earlier commitments. The same construction also seeds the solver, making it both the
baseline and a component of the method measured against it.

**A provider abstraction with a deterministic rule fallback.** Both techniques sit behind one
contract, every extraction is schema-validated, its path recorded as provenance, and none may
enter a schedule without human approval. Since validation cannot establish fidelity, review is
not optional; once it is mandatory, the choice of provider is a question of cost and latency
rather than trust.

**A metric set rather than a single measure**, because the measures of Section 2.2.4 trade
against one another and the field lacks an agreed definition of what is optimised (Schouten et
al., 2023).

**The priority score orders but does not decide.** Following Section 2.1.2, it is deterministic
and exposes the components that produced it, ordering cases and weighting the objective but
never accepting or rejecting one.