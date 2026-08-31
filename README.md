# TheatreFlow

An MSc project on surgical scheduling under resource constraints. The system uses React,
Express, MySQL and four independent Python services to carry a case from English clinical text
through to an auditable theatre schedule.

## Modules

1. **Clinical NLP** — converts English clinical text into structured JSON, with a traceable
   rule-based fallback when no language model is available.
2. **Priority Service** — scores a case from clinical urgency, waiting time, deadline risk and
   review status, returning the components alongside the total.
3. **CP-SAT Optimizer** — constrains doctors, nurses, theatres, beds, requested time, clinical
   deadline and locked allocations simultaneously.
4. **Evaluation Service** — computes scheduled rate, waiting time, resource utilisation,
   conflict count, hard-constraint violations and doctor workload fairness.
5. **Intake Review Workflow** — case submission, JSON correction, re-scoring, approval or
   rejection, persistence, single-case scheduling and an audit trail.
6. **Live-data Interface** — six routed pages (Overview, Schedule, Cases, Clinical Intake,
   Resources, Evaluation), each reading MySQL through the API. There is no mock data path.
7. **Dynamic Emergency Rescheduling** — inserts an approved emergency case into the current
   schedule under a freeze window and manual locks, minimising disruption and reporting a typed
   change per case.
8. **Algorithm Experiment Suite** — compares priority greedy, pure CP-SAT and priority-informed
   CP-SAT on identical cases, resources, horizons and seeds, persisting results to MySQL.
9. **Scale, Ablation and Exported Evidence** — deterministic replay at 10, 25 and 50 cases,
   objective-term ablation, evaluation charts and CSV/JSON export.

Case review states:

```text
REVIEW_REQUIRED -> APPROVED -> SCHEDULED
        |              |
        +-> REJECTED   +-> APPROVED (retaining the reason when scheduling is infeasible)
```

## Running locally

**Prerequisites.** Node.js 24 or later, Python 3.13 or later, and MySQL 8. Check with
`node --version`, `python --version` and `mysql --version`.

Copy `.env.example` to `.env` at the repository root and set the database connection to match
your MySQL installation. An OpenAI key is optional: without one the system uses the
deterministic rule engine for clinical-text extraction. `.env` is excluded by `.gitignore` and
must not be committed.

```powershell
copy .env.example .env
```

Install the Node dependencies and create the database schema:

```powershell
npm install
npm run db:modules
```

Create a virtual environment and install the Python dependencies for the four services:

```powershell
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
```

The scripts under `scripts\` call `python` from the active environment, so keep the virtual
environment activated in any console you start a service from.

**Start everything** (four Python services, the API and the interface, each in its own console):

```powershell
scripts\start-all.cmd
```

Or start the parts separately:

```powershell
scripts\start-services.cmd    # the four Python services
scripts\start-backend.cmd     # the Express API
scripts\start-frontend.cmd    # the Vite development server
```

- Interface: http://localhost:5173
- API health: http://localhost:4000/api/health
- Service ports: 8101 (NLP), 8102 (Priority), 8103 (Optimizer), 8104 (Evaluation)

> The API port comes from `PORT` in `.env` — **not** `API_PORT`, which `server.ts` does not
> read. The interface overrides the API address with `VITE_API_URL`, defaulting to
> `http://127.0.0.1:4000/api`.

A MySQL instance can also be brought up with Docker:

```powershell
npm run db:up      # MySQL 8.4 with database/init.sql mounted as an entry-point script
npm run db:down
```

The Compose service reads its root password from `DB_PASSWORD` in `.env`, so the two agree by
construction. If you change `DB_PASSWORD` after the volume has been created, remove the volume
with `docker compose down -v` before bringing it up again.

## Database and real data

- `database/import-real-data.mjs` — cleans and imports the appointment CSV. The path is a
  required argument.
- `database/optimize-real-data.mjs` — adds the indexes and normalised fields that querying and
  scheduling need.
- `database/detect-conflicts.mjs` — checks for time overlaps across doctors, nurses, theatres
  and beds, by SQL self-join over the persisted bookings rather than by asking the solver.
- `database/apply-module-schema.mjs` — applies the module migrations in order: case text, NLP,
  priority, optimisation results, evaluation reports, the review workflow, dynamic rescheduling
  and the experiment tables.
- `resource_bookings` holds one row per occupied resource, so conflict detection is an interval
  query rather than string parsing over comma-separated CSV fields.

To import the CSV:

```powershell
npm run db:import-real
npm run db:detect-conflicts
```

## REST API

Twenty-eight routes, all registered in `backend/src/server.ts`. The interface reads only through
these routes; it never addresses MySQL or a Python service directly.

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Service identity |
| GET | `/api/health` | Health check |
| GET | `/api/dashboard` | Overview summary |
| GET | `/api/cases` | Case list |
| GET | `/api/resources` | Resource list |
| GET | `/api/schedules/latest` | Most recent schedule |
| GET | `/api/evaluations` | Evaluation reports |
| POST | `/api/intake/process` | Submit clinical text, producing a case awaiting review |
| GET | `/api/intake/cases` | Cases awaiting review |
| GET | `/api/intake/cases/:id` | One case in detail |
| PATCH | `/api/intake/cases/:id` | Correct an extraction and re-score |
| POST | `/api/intake/cases/:id/approve` | Approve |
| POST | `/api/intake/cases/:id/reject` | Reject |
| POST | `/api/intake/cases/:id/schedule` | Schedule an approved case |
| POST | `/api/intake/cases/:id/emergency-insert` | Insert as an emergency and reschedule |
| POST | `/api/schedules/generate` | Generate a schedule |
| POST | `/api/workflows/run` | Run the full pipeline |
| GET | `/api/workflows/latest` | Most recent pipeline run |
| GET | `/api/reschedules/latest` | Most recent emergency reschedule |
| GET | `/api/schedules/locks` | Locks |
| POST | `/api/schedules/locks` | Add a lock |
| DELETE | `/api/schedules/locks/:caseId` | Remove a lock |
| POST | `/api/experiments/run` | Run the algorithm comparison suite |
| POST | `/api/experiments/ablation` | Run the objective-ablation suite |
| GET | `/api/experiments` | Experiment suites |
| GET | `/api/experiments/latest` | Most recent suite |
| GET | `/api/experiments/:suiteKey` | Results for one suite |
| POST | `/api/nlp/extract` | Direct extraction, bypassing the review workflow |

No route can create a case in the approved state: `approve` acts only on a case already awaiting
review. This is how the review requirement is enforced — by the absence of a route rather than
by a check that could be bypassed.

## Verification

```powershell
scripts\check-tests.cmd       # export the contract schemas, then run the Python suite
scripts\check-api.cmd         # Node API tests, read-only
scripts\check-api.cmd --write # including the tests that insert rows
scripts\check-nlp.cmd         # NLP only, forced onto the rule engine
npm run build                 # TypeScript build for both halves
```

The automated suite is 57 tests: 36 Python covering the data contracts, the rule-based
extraction fallback, priority scoring, optimisation constraints, the rejection codes, conflict
detection, evaluation metrics and service health; and 21 Node covering the API read models,
input validation and the review-safety invariant. Three of the Node tests write to the database
and are skipped unless `API_TEST_ALLOW_WRITES=1` is set, which is why `check-api.cmd` is
read-only by default. The interface has no automated tests.

## Algorithm experiments

The experiment module does not write to `schedule_results` or `resource_bookings`, so it cannot
overwrite the current schedule. It reads one optimisation request from a successful MySQL
workflow and runs:

- `PRIORITY_GREEDY` — takes cases in order of clinical priority and requested time, placing each
  in the earliest feasible position without backtracking;
- `PURE_CP_SAT` — optimises the number scheduled and waiting time, with no priority reward;
- `HYBRID_PRIORITY_CP_SAT` — optimises the number scheduled, clinical priority and waiting time.

Default scales are 10, 25 and 50 cases, across four scenarios: baseline, additional capacity,
constrained availability and an emergency surge. Where the requested scale is within the source
pool the harness selects a deterministic subset of it, rotated by seed; where it exceeds the
pool, a fixed-order bootstrap replay generates unique experiment case identifiers. Either way
the workload is synthetic and derived from the source distribution, and should not be described
as additional real patients.

Each run records the number scheduled, utilisation, waiting time, emergency waiting time,
conflicts, hard-constraint violations, doctor fairness and solve time. The Evaluation page reads
the most recent comparison and ablation suites from MySQL.

```powershell
npm run experiment:run
npm run experiment:ablation
npm run experiment:export
```

Environment variables control the run:

```powershell
$env:EXPERIMENT_CASE_COUNTS="10,25"
$env:EXPERIMENT_REPETITIONS="5"
$env:EXPERIMENT_RANDOM_SEED="42"
npm run experiment:run
```

The ablation suite uses the full hybrid objective as its control and removes the priority
reward, the waiting cost, or both. It ablates only objective terms that exist in the solver:
doctor fairness is reported as an evaluation metric and was never an optimisation target.

Endpoints: `POST /api/experiments/run`, `POST /api/experiments/ablation`, `GET /api/experiments`,
`GET /api/experiments/latest`, `GET /api/experiments/:suiteKey`. Result tables:
`experiment_suites`, `experiment_results`.

## Dynamic emergency insertion

Approve an emergency case in `Clinical Intake`, choose a freeze window, and select
`Insert into current schedule`. The system will:

- treat manually locked cases and cases inside the freeze window as immovable hard constraints;
- treat the rest of the current schedule as a soft constraint, charging a perturbation cost for
  a time shift or a resource substitution;
- re-run CP-SAT, preserving the requested-time, clinical-deadline and non-overlap constraints;
- return a typed change per case — `UNCHANGED`, `MOVED`, `RESOURCE_CHANGED`,
  `MOVED_AND_RESOURCE_CHANGED`, `DROPPED`, `INSERTED` or `REJECTED`;
- persist the baseline run, the impact counts, the full change list and an audit event.

On the `Schedule` page, `Lock` and `Unlock` fix or release an allocation; a locked case keeps its
time and its resources through an emergency reschedule.

## Repository layout

The project splits by language and responsibility, and the two halves can be opened in separate
IDEs (see `docs/PROJECT_STRUCTURE.md`).

**Node / TypeScript**

- `frontend/` — React 19, TypeScript and Vite (port 5173)
- `backend/` — Express 5, TypeScript and mysql2 (port 4000)

**Python**

- `services/` — the four services (NLP, Priority, Optimizer, Evaluation)
- `contracts/` — Pydantic models and the generated JSON Schemas that define every payload
  crossing a service boundary
- `tests/` — automated tests and the end-to-end pipeline harness

**Shared**

- `database/` — MySQL initialisation, migrations, import and conflict detection
- `data/` — the appointment dataset, the PMC-Patients narratives and the NLP benchmark
- `samples/` — example payloads for each contract
- `scripts/` — launch and verification scripts
- `docs/` — documentation, exported experiment results, known issues and the report drafts

## Scope and safe use

This system is a research prototype built for an MSc project. It is not a medical device, has
not been clinically validated, and must not be used for real clinical decisions. Input case text
must be de-identified before submission, and no extraction may enter a schedule without human
review. Known defects and their diagnoses are recorded in `docs/KNOWN_ISSUES.md`.

Dataset licences are recorded with the data: the appointment dataset under CC BY 4.0
(`data/appointments/README.md`) and PMC-Patients under CC BY-NC-SA
(`data/pmc-patients/README.md`). The non-commercial term on the latter means the repository as a
whole cannot carry a permissive licence without excluding that directory.
