# Front matter

> **Build this part in `SoC-report-Template.docx` itself, not from this file.** The title
> page, the automatic table of contents, and the List of Figures and List of Tables are Word
> constructs that a Markdown export cannot reproduce. What follows records what each of
> them must contain, and the formatting rules the template states.

---

## Formatting requirements stated by the template

These are not preferences. They are quoted from the template's own layout note.

| Requirement | Value |
|---|---|
| Paper | A4, single or double-sided |
| Margins | 1 inch on all sides |
| Point size | **11** |
| Line spacing | **one-and-a-half** |
| Page numbering, front matter | **Roman numerals**, from *Summary* to *Table of Contents* inclusive |
| Page numbering, body onwards | **Arabic numerals**, a single sequence |
| Length, 60-credit project | **60 pages maximum** for the main body, excluding appendices and references |
| Length, 40-credit project | **50 pages maximum** |

> **Check your credit weighting.** The current drafts total roughly 15,600 words plus 18
> figures. At 11 pt with one-and-a-half spacing that will land somewhere around 45–55 pages
> of body text, which is comfortable against the 60-page limit and tight against 50. Confirm
> whether your project is 40 or 60 credits before deciding whether anything must be cut.

---

## Title page

The template supplies this page. Fill in the placeholders it already contains:

| Template placeholder | What goes there |
|---|---|
| `Full Title of Project` | *TheatreFlow: A Contract-Driven Microservice Architecture for Resource-Constrained Surgical Scheduling with Reviewed LLM Case Intake* — agree the final wording with your supervisor; a shorter alternative is *Resource-Constrained Surgical Scheduling with Reviewed Clinical Text Intake: A Contract-Driven Microservice Prototype* |
| `Full Name of Author` | Your name as registered |
| `<Name of Degree>` | Your exact programme title, e.g. *MSc Advanced Computer Science* |
| `<Session>` | The academic session, e.g. *2025/2026* |
| `Type of Project` | **Exploratory Software (ES)** — this is what determines the Chapter 3–5 titles used throughout |
| `© <Year of Submission> The University of Leeds and <full name of candidate>` | Year of submission and your name |
| `(Signature of student)` | Sign per your School's current practice — check whether a typed name is accepted |

The header reads **School of Computer Science**, Faculty of Engineering and Physical
Sciences. An earlier draft of this report said "School of Computing"; the template does not,
so the template wins.

### The submission declaration table

The template puts a table on the title page listing what has been submitted, in what format,
and to whom. Its example rows are illustrative — replace them with your actual submission.
For this project the deliverables in Section 1.3 map roughly as:

| Items | Format | Recipient(s) and Date |
|---|---|---|
| Deliverables 1–5 (application, services, database and scripts, algorithms, intake workflow) | Software source code or repository URL | Supervisor, assessor (date) |
| Deliverable 6 (experiment suite and exported evidence) | Software and exported CSV/JSON/Markdown | Supervisor, assessor (date) |
| Deliverable 7 (automated tests) | Software source code | Supervisor, assessor (date) |
| Deliverable 8 (technical and user documentation) | Documentation files in the repository | Supervisor, assessor (date) |
| Deliverable 9 (this report) | Report | SSO (date) |

> **Complete this yourself.** Only you know the actual submission dates, the recipients your
> School specifies, and whether a repository URL or an archive is expected. No participant
> consent forms apply — this project recruited no human participants (Appendix B).

Immediately below, the template carries the candidate's confirmation that the work is their
own and that credit has been given where reference is made to the work of others, together
with the acknowledgement that failure to attribute material may be considered plagiarism.
**Leave that wording exactly as the template has it.**

---

## Summary

The template requires **no more than one A4 page**. The version below is 322 words, which leaves
room for the heading, and reflects the chapters as they now stand.

> Surgical scheduling requires a theatre, a suitably skilled surgeon, theatre nurses and a
> post-operative bed to be free at once, and must accommodate emergencies without unduly
> disturbing work already planned. This project designed, implemented and evaluated
> **TheatreFlow**, a prototype that converts English clinical case notes into structured records
> and allocates them to resources over a planning horizon.
>
> The system is decomposed into a React front end, an Express API, a MySQL database and four
> independent Python services for extraction, priority scoring, optimisation and evaluation. The
> services communicate through six versioned JSON schemas generated from Pydantic models, which
> makes any stage replaceable without altering the others. Extraction uses a large language
> model where one is available and a deterministic rule engine otherwise; either way the record
> is schema-validated, its provenance recorded, and human approval required before it can be
> scheduled. Allocation uses CP-SAT, with clinical deadlines and resource non-overlap as hard
> constraints and a typed rejection code returned for any case that cannot be placed.
>
> Evaluation used two reproducible suites totalling 420 runs. Constraint programming scheduled
> 16.3% more cases than a priority-ordered greedy baseline at 25 cases and 19.0% more at 50,
> winning all 20 paired instances at both scales, and reduced mean waiting time at every scale.
> Two results ran against expectation. Adding 50% more capacity treated no additional patients:
> every unplaced case had feasible placements and lost them to higher-scoring ones, locating the
> binding constraint inside the formulation rather than in the workload. An objective-term
> ablation found the clinical priority reward inert — the schedule unchanged in 58 of 60
> paired instances, and marginally adverse on the emergency waiting time it was designed to
> improve — while the waiting-cost term accounted for the benefit observed.
>
> An independent recomputation found no resource conflict in any run, though deadline compliance
> rests on the solver's own report. Extraction accuracy on real clinical prose is unmeasured,
> and the implementation does not scale past 50 cases.

> **What changed, and why.** Two statements in the earlier draft no longer match the chapters.
> The capacity result was attributed to "the binding constraint being the clinical time windows
> rather than resources"; Section 5.8.3 shows the opposite, since every rejection carries
> `CAPACITY_EXHAUSTED` and not one carries `DEADLINE_EXCEEDED`. And "no schedule violated a hard
> constraint in any run" stated as one finding what Chapters 5 and 6 are careful to separate:
> conflicts were recomputed independently of the solver, while deadline compliance is the
> solver's self-report. The summary must not be stronger than the evidence behind it.

---

## Acknowledgements

*Personal — the names are yours to supply.* The draft below has the conventional
elements in the usual order; replace every placeholder and cut anything that does not apply.

> I thank my supervisor, ⟨supervisor's name⟩, for ⟨what specifically — e.g. guidance
> on scoping the evaluation, or the suggestion to treat the objective terms as separately
> testable⟩, and my assessor, ⟨assessor's name⟩, for ⟨contribution⟩.
>
> ⟨Anyone who gave technical or domain input — a clinician who commented on how
> theatre lists are built in practice, a colleague who read a chapter for sense, staff who
> helped with access to equipment or data. Name what each contributed.⟩
>
> This work was carried out on publicly available data. The appointment records come from the
> *Medical Appointment Scheduling System* dataset published under CC BY 4.0, and the clinical
> narratives from the PMC-Patients dataset; both are attributed in full in Appendix A.1. The
> prototype is built on open-source software, principally Google OR-Tools, whose licences are
> listed in Appendix A.3 and A.4.
>
> ⟨Personal thanks.⟩

> **Three constraints on this page.**
>
> **Proof-reading.** The template states it is *not acceptable* to solicit assistance with
> proof-reading, defined as "the systematic checking and identification of errors in spelling,
> punctuation, grammar and sentence construction, formatting and layout in the text". The policy
> is at `http://www.leeds.ac.uk/qat/documents/policy/Proof-reading-policy.pdf`. It constrains
> what you may ask of others, not merely what you disclose here, so read it before writing this
> page rather than after.
>
> **Team contributions.** Where you worked as part of a team, the template requires you to
> reference any contribution others made to the project. This project was carried out
> individually, so that clause applies only if you received contributions of the kind described
> in the second paragraph above.
>
> **Generative AI does not belong on this page.** Use of generative AI is declared in the
> submission declaration and in **Appendix A.7**, in the terms your handbook specifies. Thanking
> a tool here instead of declaring it there is a disclosure failure, not a stylistic choice.
> Appendix A.7 is still marked ⟨TO COMPLETE⟩.

> **Attribution is not acknowledgement.** The dataset and licence paragraph above is a courtesy;
> the binding attribution lives in Appendix A.1 and the reference list. If you cut that
> paragraph for length, nothing is lost from the attribution itself.

---

## Table of Contents

Generate it in Word — do not type it. The template's heading styles feed it directly:

- **Heading 1** (Ctrl+Shift+1) for chapter titles
- **Heading 2** (Ctrl+Shift+2), **Heading 3** (Ctrl+Shift+3), **Heading 4** (Ctrl+Shift+4)

Applying those styles is what makes the contents, and the page numbers in it, correct and
updatable. The full section structure the contents will show is listed in
`dissertation-outline.md`.

---

## List of Figures and List of Tables

Also generated, and this is the part most easily got wrong: the template produces them from
**caption styles**, not from ordinary text.

| Style | Shortcut | Applies to |
|---|---|---|
| `figure caption` | Ctrl+Shift+F | The caption line under each figure — appears in the List of Figures |
| `figure description` | — | Optional extra explanation; does **not** appear in the List of Figures |
| `table caption` | Ctrl+Shift+T | The caption line above each table — appears in the List of Tables |
| `table description` | — | Optional extra explanation; does **not** appear in the List of Tables |

So each figure needs a short caption in `figure caption` style, with any longer explanation
placed separately in `figure description`. The exported `.docx` files carry the caption text
as bold paragraphs; restyle them with the shortcuts above once the content is in the
template.

### Figures — eighteen

| Figure | Caption |
|---|---|
| 3.1 | The four architectural layers and the contract spine binding them |
| 3.2 | Entity–relationship diagram of the intake and scheduling core |
| 3.3 | The case review state machine |
| 4.1 | Candidate enumeration growth and the restricted candidate list |
| 4.2 | Interface: Overview |
| 4.3 | Interface: Schedule |
| 4.4 | Interface: Cases |
| 4.5 | Interface: Clinical Intake, showing the de-identification warning |
| 4.6 | Interface: Resources |
| 4.7 | Interface: Evaluation, showing the two experiment suites of Chapter 5 |
| 5.1 | Defect OPT-001: the same workload before and after the fix |
| 5.2 | Cases scheduled by instance size, greedy against CP-SAT |
| 5.3 | Mean waiting time by instance size, greedy against CP-SAT |
| 5.4 | Cases scheduled: baseline against 50% additional capacity |
| 5.5 | Theatre utilisation: baseline against 50% additional capacity |
| 5.6 | Mean waiting time by objective configuration |
| 5.7 | Paired ablation outcomes over 60 instances |
| 5.8 | Mean solver runtime by instance size, logarithmic scale |

> **Numbering changed here.** The drafts pair two panels under one number — "Figure 5.2(a)
> and (b)". The template numbers every figure singly, so the two-panel figures have been
> split above: former 5.2(a)/(b) are now 5.2 and 5.3, former 5.3(a)/(b) are now 5.4 and 5.5,
> and the rest shift by two. **The in-text callouts in Chapter 5 still use the old
> numbering** and must be updated when the content is placed in the template. Source files:
> `fig-5-2a-throughput.svg` → Figure 5.2, `fig-5-2b-waiting.svg` → 5.3,
> `fig-5-3a-capacity-throughput.svg` → 5.4, `fig-5-3b-capacity-utilisation.svg` → 5.5,
> `fig-5-4-ablation-waiting.svg` → 5.6, `fig-5-5-paired-outcomes.svg` → 5.7,
> `fig-5-6-runtime.svg` → 5.8.

### Tables — nineteen

| Table | Content | Section |
|---|---|---|
| 2.1 | Method choices and the argument for each | 2.3 |
| 3.1 | Functional requirements (MoSCoW) | 3.1.2 |
| 3.2 | Non-functional requirements and why each is a requirement | 3.1.3 |
| 3.3 | The four architectural layers | 3.2.1 |
| 3.4 | API surface by concern | 3.2.5 |
| 4.1 | Technology stack | 4.1 |
| 5.1 | Testing levels | 5.1 |
| 5.2 | Automated test coverage by area | 5.2 |
| 5.3 | Experimental factors and levels | 5.6.3 |
| 5.4 | Clinical text extraction: rules against language model | 5.7 |
| 5.5 | Throughput and waiting time by scale and scenario | 5.8.1 |
| 5.6 | Paired differences, CP-SAT against greedy | 5.8.2 |
| 5.7 | Solver status by instance size | 5.8.2 |
| 5.8 | Effect of including the waiting cost term | 5.9.1 |
| 5.9 | Effect of including the priority reward term | 5.9.2 |
| 5.10 | Ablation summary at 25 cases | 5.9.3 |
| 5.11 | Computation time by scale | 5.11 |
| 6.1 | Objectives against evidence | 6.1.1 |
| 6.2 | Limitations and their consequences for the claims | 6.1.4 |

---

## Assembling the document

The exported `.docx` files carry the text, tables and figures with Word heading styles
applied, but a Markdown export cannot produce the template's title page, its automatic
contents, or its caption styles. The remaining steps are Word work:

1. Open `SoC-report-Template.docx` and save it under your own filename.
2. Fill in the title page and the submission declaration table.
3. Paste each chapter in, using **Keep Text Only** or **Merge Formatting** so the template's
   styles win over the exported ones.
4. Apply Heading 1–4 with the shortcuts above where anything did not carry across.
5. Restyle every figure caption to `figure caption` and every table caption to
   `table caption` — otherwise the two generated lists come out empty.
6. Renumber the Chapter 5 figures as noted above.
7. Set page numbering: Roman for *Summary* to *Table of Contents*, Arabic from Chapter 1.
8. Update the contents, List of Figures and List of Tables (Ctrl+A, F9).
9. Check the page count against your credit weighting.
10. Insert the SVG figures from `figures/` in place of the rasterised PNGs if you want vector
    quality in print — Word 2016 and later handles SVG natively.
