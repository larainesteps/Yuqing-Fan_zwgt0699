# Table and Figure Captions

Captions for every table and figure in the report, written for the School template's
`table caption` and `figure caption` styles.

**How to apply them in Word.** A **table caption** goes in its own paragraph **above** the table,
with the `table caption` style applied by pressing **Ctrl + Shift + T**. A **figure caption** goes
**below** the figure, with the `figure caption` style applied by pressing **Ctrl + Shift + F**.
Both styles feed the List of Tables and the List of Figures, so those lists are generated from
these paragraphs rather than typed. Where a caption needs more explanation than belongs in a
generated list, put the extra sentence in a separate paragraph under the caption in the
`table description` or `figure description` style; that text does not appear in the lists. The
few captions below that carry such a sentence show it indented beneath them.

The label and the caption text are separated by two spaces, following the template. Numbering
restarts within each chapter.

---

## Tables

### Chapter 2

**Table 2.1**  Rule-based and learned clinical extraction compared by the training data each
needs, whether it runs locally, and how it fails.

### Chapter 3

**Table 3.1**  The fourteen functional requirements, with MoSCoW priority.

**Table 3.2**  The seven non-functional requirements, each with the reason it is a requirement
rather than a preference.

**Table 3.3**  The four architectural layers and the responsibility of each.

**Table 3.4**  The twenty-eight API routes, grouped into the six concerns they serve.

### Chapter 4

**Table 4.1**  The technology chosen for each architectural layer, with the reason for the
choice.

**Table 4.2**  The nine rejection codes, each naming the condition that eliminated a case's last
remaining placement.

> Distinguishing the codes is what makes an unscheduled case actionable: a scheduler told that
> the resources exist but never coincide can respond, where one told only that the case could
> not be placed cannot.

**Table 4.3**  The five components of the priority score, with the range and derivation of each.

**Table 4.4**  The front-end module groups and their contents.

**Table 4.5**  The three verification scripts and the guarantee each makes.

### Chapter 5

**Table 5.1**  The five test levels, with what each checks, where it runs, and how many tests it
contains.

**Table 5.2**  Areas covered by the automated test suite.

**Table 5.3**  The experimental factors and their levels.

**Table 5.4**  Extraction accuracy and latency of the rule engine and the language model over the
100 benchmark cases.

> Both providers produced schema-valid output for every case. The accuracy figures reproduce
> exactly on re-running the rule path; the latency figures are machine-dependent and reproduce
> approximately.

**Table 5.5**  Cases scheduled, utilisation, waiting time, fairness and conflicts by instance
size and scenario, greedy against hybrid CP-SAT.

> `PURE_CP_SAT` is omitted because it is not distinguishable at this level: it scheduled the same
> number of cases as the hybrid in nine of the twelve scenario–scale cells.

**Table 5.6**  Paired differences between hybrid CP-SAT and greedy by instance size, over 20
paired instances per scale.

**Table 5.7**  Solver termination status by instance size, showing where the time budget was
reached.

**Table 5.8**  Effect of 50% additional capacity on cases scheduled and on utilisation.

**Table 5.9**  Priority-informed against pure CP-SAT: paired differences in cases scheduled and
in waiting time.

**Table 5.10**  Ablation of the waiting cost term: the effect of including it, over 60 paired
instances.

**Table 5.11**  Ablation of the priority reward term: the effect of including it, over 60 paired
instances — a negative result.

**Table 5.12**  Mean waiting time and cases scheduled by objective configuration, 25 cases,
BASELINE scenario.

**Table 5.13**  Solver runtime by instance size, greedy against hybrid CP-SAT.

### Chapter 6

**Table 6.1**  The ten project objectives, with the verdict reached and the evidence supporting
it.

### Appendix A

**Table A.1**  The appointment dataset: source, licence, and use in this project.

**Table A.2**  Runtime environments, with version and licence.

**Table A.3**  Third-party JavaScript and TypeScript packages, with version, licence and role.

**Table A.4**  Third-party Python packages, with version, licence and role.

**Table A.5**  External services the system can call.

**Table A.6**  Tools used to produce this report.

---

## Figures

### Chapter 3

**Figure 3.1**  The four layers of the architecture and the contract spine that binds them.

**Figure 3.2**  The intake and scheduling core of the database schema.

> Every relationship shown is a declared foreign key.

**Figure 3.3**  The case review state machine.

### Chapter 4

**Figure 4.1**  How candidate enumeration grows with each resource pool.

**Figure 4.2**  The Overview view.

**Figure 4.3**  The Schedule view.

**Figure 4.4**  The Cases view.

**Figure 4.5**  The Clinical Intake view, showing the de-identification warning displayed before
a note can be submitted and the review pane that stays empty until a case is processed.

> This is requirement N1 as the interface expresses it.

**Figure 4.6**  The Resources view.

**Figure 4.7**  The Evaluation view, showing suites `EXP-20260825012438-42` and
`ABL-20260825014044-42` read live from MySQL.

> The comparison and ablation figures visible in it are the values tabulated in Sections 5.8
> and 5.9.

### Chapter 5

**Figure 5.1**  The six-case workload before and after the OPT-001 fix, as two schedule timelines
with each case's deadline marked.

> The failing run used the fallback engine and the passing run CP-SAT.

**Figure 5.2**  Cases scheduled by instance size, greedy against hybrid CP-SAT, pooled over the
four scenarios.

**Figure 5.3**  Mean waiting time over the same instances.

**Figure 5.4**  Mean waiting time by objective configuration, pooled over the four scenarios.
Blue retains the waiting cost, grey removes it.

**Figure 5.5**  Mean runtime by instance size, logarithmic scale.

---

## Locating each table in the document

The tables carry no captions yet, so this is the key for matching a caption to its table while
working through the document. **Section** is where the table sits; **first columns** is the top-left
of its header row; **rows** is the body row count, which separates the two tables that share
Section 5.8.2 and the several three-row result tables.

| Caption | Section | First columns of the header row | Rows |
|---|---|---|---|
| Table 2.1 | 2.2.3 | Training data \| Runs locally \| ... | 3 |
| Table 3.1 | 3.1.2 | # \| Requirement \| Priority | 14 |
| Table 3.2 | 3.1.3 | # \| Requirement \| Why it is a requirement, not a preference | 7 |
| Table 3.3 | 3.2.1 | Layer \| Responsibility | 4 |
| Table 3.4 | 3.2.5 | Concern \| What it exposes | 6 |
| Table 4.1 | 4.1 | Layer \| Choice \| Note | 5 |
| Table 4.2 | 4.2.3 | Code \| The case was eliminated because | 9 |
| Table 4.3 | 4.4 | Component \| Range \| Derived from | 5 |
| Table 4.4 | 4.8 | Module group \| Contents | 4 |
| Table 4.5 | 4.9 | Script \| Guarantee | 3 |
| Table 5.1 | 5.1 | Level \| What it checks \| Where \| ... | 5 |
| Table 5.2 | 5.2 | Area \| Coverage | 11 |
| Table 5.3 | 5.6.3 | Factor \| Levels | 5 |
| Table 5.4 | 5.7 | Provider \| Procedure acc. \| Token recall \| ... | 2 |
| Table 5.5 | 5.8.1 | n \| Scenario \| Algorithm \| ... | 10 |
| Table 5.6 | 5.8.2 | n \| Δ scheduled (Hybrid − Greedy) \| SD \| ... | 3 |
| Table 5.7 | 5.8.2 | n \| OPTIMAL \| FEASIBLE (time limit reached) | 3 |
| Table 5.8 | 5.8.3 | n \| Scheduled, BASELINE → +50% \| Utilisation, ... | 3 |
| Table 5.9 | 5.8.4 | n \| Δ scheduled \| Δ mean wait (h) \| ... | 3 |
| Table 5.10 | 5.9.1 | Metric \| Effect of **including** the waiting cost \| ... | 3 |
| Table 5.11 | 5.9.2 | Metric \| Effect of **including** the priority reward \| ... | 3 |
| Table 5.12 | 5.9.3 | Configuration \| Mean wait, 25 cases BASELINE \| Cases scheduled | 4 |
| Table 5.13 | 5.11 | n \| Greedy \| Hybrid CP-SAT | 3 |
| Table 6.1 | 6.1.1 | # \| Objective \| Verdict \| ... | 10 |
| Table A.1 | A.1 | Material \| Source \| Licence \| ... | 2 |
| Table A.2 | A.2 | Component \| Version \| Licence | 3 |
| Table A.3 | A.3 | Package \| Version \| Licence \| ... | 12 |
| Table A.4 | A.4 | Package \| Version \| Licence \| ... | 6 |
| Table A.5 | A.5 | Service \| Role \| Notes | 1 |
| Table A.6 | A.6 | Tool \| Version \| Role | 3 |

**Two tables share Section 5.8.2.** Table 5.6 is the ten-column paired-difference table and comes
first; Table 5.7 is the three-column termination-status table and follows it.

**The figures already carry their captions in the document.** They are the paragraphs beginning
"Figure 3.1", "Figure 4.1" and so on, immediately below each image. For those the work is to
apply the `figure caption` style (Ctrl + Shift + F) to the existing paragraph, not to type new
text. The wording below matches what is already there, so a caption only needs replacing where
you want the shorter form.

---

## Placement summary

| Chapter | Tables | Figures |
|---|---|---|
| 2 | 2.1 | — |
| 3 | 3.1–3.4 | 3.1–3.3 |
| 4 | 4.1–4.5 | 4.1–4.7 |
| 5 | 5.1–5.13 | 5.1–5.5 |
| 6 | 6.1 | — |
| Appendix A | A.1–A.6 | — |
| **Total** | **30** | **15** |
