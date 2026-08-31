# Known issues

## OPT-001 — Clinical deadlines are soft constraints

**Status:** Resolved  
**Severity:** High  
**Discovered:** 2026-08-21  
**Resolved:** 2026-08-21  
**Component:** `services/optimizer_service`

The original optimizer rewarded earlier starts but did not enforce
`requested_datetime + maximum_delay_hours` as a hard constraint. A shorter,
lower-priority case can therefore start before a longer emergency case when that
slightly improves the weighted-delay objective.

### Reproduction

Run:

```powershell
python tests/full_pipeline_llm.py --cases 6 --cases-file tests/fixtures/llm_random_surgical_cases_20260821.json
```

Evidence is stored in
`tests/artifacts/llm_pipeline_20260821_023929.json`:

- emergency open aneurysm repair: maximum delay 0 h, scheduled wait 1.5 h;
- urgent decompressive craniectomy: maximum delay 6 h, scheduled wait 7.5 h.

All resource constraints were satisfied and the independently recalculated conflict
count was zero, so this is an objective/deadline-policy issue rather than a collision.

### Resolution

1. Candidate starts are now restricted to
   `requested_datetime <= start <= requested_datetime + maximum_delay_hours`.
2. A case that cannot meet its deadline is returned as `UNSCHEDULED` with
   `rejection_code=DEADLINE_EXCEEDED`; the solver never creates a late allocation.
3. Locked assignments are rejected as infeasible when they start before the request,
   after the deadline, outside resource availability, or omit a required resource.
4. Both CP-SAT and the exact fallback engine solve the same hard-constraint candidate
   model.
5. Unit tests and MySQL workflow `WF-20260821033243` produced zero deadline breaches,
   zero hard-constraint violations and zero resource conflicts.

## SCH-002 — A displaced case keeps the status SCHEDULED

**Status:** Resolved
**Severity:** Medium
**Discovered:** 2026-08-28 (code review, not a failing test)
**Resolved:** 2026-08-28
**Component:** `backend/src/reschedule.ts`

Inserting an emergency case can displace an already-scheduled case. The rescheduler
classified such a case as `DROPPED` and recorded it in `reschedule_runs.changes_json`,
but the transaction that followed updated only the emergency case's row in
`case_reviews`. A displaced case therefore kept `status = 'SCHEDULED'` while the current
optimisation run no longer contained it, so `/api/cases` and the Cases view would show a
patient as scheduled after their slot had been taken.

All five `UPDATE case_reviews` statements in `backend/src` were checked; none covered the
displaced cases.

### Scope

The defect was latent. A query over `reschedule_runs` found no run with
`dropped_cases > 0`, so the condition had never occurred and no stored record required
correction. The experiment suites of Chapter 5 are unaffected: they call the optimiser
directly through `experiments.ts` and do not pass through the review workflow.

### Resolution

The same transaction now returns each displaced case to `APPROVED`, carrying the reason it
was displaced:

```sql
UPDATE case_reviews
SET status='APPROVED', reviewer=?, last_run_key=?, last_schedule_status='UNSCHEDULED',
    last_rejection_code=?, last_rejection_reason=?
WHERE external_case_id=? AND status='SCHEDULED'
```

`APPROVED` is the correct target state: the case is still approved for surgery, simply not
placed. The `status='SCHEDULED'` guard means no other state is disturbed.

Verified by `npx tsc --noEmit` (clean) and by executing the statement against the live
schema with a non-existent case id, which parsed and affected zero rows. It is **not**
covered by an automated test — the emergency-insertion path has none, which is the gap
recorded in Section 5.5 of the report.

## CFG-003 — Optimiser candidate limits were not persisted with a run

**Status:** Resolved (mechanism); the earlier runs remain unrecorded
**Severity:** Medium
**Discovered:** 2026-08-28 (during report verification)
**Component:** `services/optimizer_service/solver.py`

`MAX_RESOURCE_OPTIONS_PER_SLOT` and `MAX_CANDIDATES_PER_CASE` are read from the environment
and materially determine a result: a suite run at different limits is not comparable with one
run at these. They appeared in no configuration file, no launcher script and no `.env`, and
`experiment_suites.config_json` stored the scenarios, algorithms, case counts, seed and solve
time limit without them.

The values used for the 420 runs reported in the dissertation were therefore recoverable only
from the environment block of the optimiser process, which was still running:

```
OPTIMIZER_MAX_RESOURCE_OPTIONS_PER_SLOT=2
OPTIMIZER_MAX_CANDIDATES_PER_CASE=300
```

Had that process been restarted, the configuration behind every reported figure would have
been unrecoverable.

### Resolution

Both limits are now included in the `metrics` of every `OptimizationResult`, which flows into
`experiment_results`, so each persisted run carries the limits it was produced under. The
existing suites (`EXP-20260825012438-42`, `ABL-20260825014044-42`) predate the change and do
not; Section 5.12 of the report states the values and their provenance.

Verified by `python -m unittest tests.test_optimizer_service` — 15 tests, OK.

## NLP-004 — A failed extraction leaves no record

**Status:** Open
**Severity:** Low
**Discovered:** 2026-08-28 (during report verification)
**Component:** `backend/src/intake.ts`

`nlp_extractions` defines an `error_message` column and a multi-valued `status` enum, so the
schema is designed to hold a failed extraction attempt. No code writes one. The single
`INSERT INTO nlp_extractions` in `intake.ts` hardcodes `status='REVIEW_REQUIRED'` and never
populates `error_message`; a validation failure raises `IntakeError` and the request aborts
with nothing persisted.

The consequence is that a reviewer sees no difference between a note that was never submitted
and one whose extraction was rejected. That is a usability and auditability gap rather than a
safety one — no invalid record can reach a schedule either way, which is what N1 requires.

An earlier draft of Section 4.5 described the intended behaviour as though it were
implemented. The section now states what the code does.

### Suggested resolution

Insert the row with `status='FAILED'` and the validation message before re-raising, so the
attempt is visible in the case list and in `case_audit_events`.

## CFG-005 — The Compose database and the example environment disagree on the password

**Status:** Resolved 2026-08-30
**Severity:** Low
**Discovered:** 2026-08-29
**Component:** `docker-compose.yml`, `.env.example`

The two documented ways of obtaining a database do not produce the same credentials.
`docker-compose.yml` sets `MYSQL_ROOT_PASSWORD: root`, while `.env.example` ships
`DB_PASSWORD=123456`. A reader following the documented path — `npm run db:up`, then copy
`.env.example` to `.env` — gets `ER_ACCESS_DENIED_ERROR` on the first connection and has to
work out which of the two files to believe.

This does not affect any result reported in this dissertation: the experiments were run
against a locally installed MySQL configured from `.env`, not against the Compose service.
It affects reproduction by a third party, which is the point of shipping either file.

### Suggested resolution

Make one file the source of truth. The smaller change is to align Compose with the example
environment:

```yaml
    environment:
      MYSQL_ROOT_PASSWORD: 123456
```

Changing it does **not** re-password an existing `mysql_data` volume; a reader who has
already run `db:up` must `npm run db:down -- -v` before the new value takes effect. That
caveat is the reason this is recorded rather than silently changed.


**Resolution.** `docker-compose.yml` now reads the root password from `DB_PASSWORD`, defaulting to the value shipped in `.env.example`, so the two paths agree by construction. A volume created before this change keeps its original password and must be removed with `docker compose down -v` first.

## CFG-006 — Every .cmd script had LF line endings and was mis-parsed by cmd.exe

**Status:** Resolved
**Severity:** High
**Discovered:** 2026-08-29
**Resolved:** 2026-08-29
**Component:** `scripts/`

All eight scripts in `scripts/` and the four `services/*/start.cmd` launchers were committed
with LF line endings. cmd.exe requires CRLF,
and the failure is not cosmetic. Running `scripts\check-api.cmd` produced:

```
'ackend.cmd)?REM' is not recognized as an internal or external command
Running API tests INCLUDING writes - rows will be inserted into the database.
Running read-only API tests. Pass --write to include the tests that insert rows.
i tests 0
```

Three separate faults in one run: part of a `REM` comment was executed as a command, *both*
branches of the `if /i "%~1"=="--write" (...) else (...)` block ran, and the `cd /d` never
took effect, so `node --test` discovered zero tests and reported success. A verification
script that silently runs nothing is worse than one that fails.

The both-branches behaviour also meant the read-only default could not be relied upon: the
`set "API_TEST_ALLOW_WRITES=1"` line sits inside the branch that should not have executed.

### Reproduction

Check out any `.cmd` file in `scripts/` with LF endings and run it from `cmd.exe`.

### Resolution

1. All twelve scripts converted to CRLF.
2. `.gitattributes` added with `*.cmd text eol=crlf`, so a checkout cannot reintroduce it.
3. A second, independent fault fixed in the same file: `check-api.cmd` invoked
   `node --test tests/`, which fails with `MODULE_NOT_FOUND` on Node 24. It now uses
   `node --test "tests/*.test.mjs"`, matching `backend/package.json`.

Verified after the fix: `check-api.cmd` reports 21 tests, 18 passed, 3 skipped, 0 failed and
takes only the read-only branch; `check-tests.cmd` exports the schemas and runs 36 Python
tests; `check-nlp.cmd` completes the rule-engine benchmark.
