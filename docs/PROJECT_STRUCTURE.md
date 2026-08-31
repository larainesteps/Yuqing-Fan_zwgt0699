# TheatreFlow repository layout

Reorganised 2026-08-22; figures updated 2026-08-29.

## 1. Overview

The project divides by **implementation language** into two halves that can be opened in
separate IDEs without interfering with each other.

| Half | Directory | Stack | IDE | Port |
|------|-----------|-------|-----|------|
| Front end | `frontend/` | React 19 + TypeScript + Vite | **VSCode** | 5173 |
| API | `backend/` | Express 5 + TypeScript + mysql2 | **VSCode** | 4000 |
| Python services | `services/` | Python 3.13 + standard-library HTTP | **PyCharm** | 8101–8104 |
| Data contracts | `contracts/` | Pydantic + JSON Schema | **PyCharm** | — |
| Tests | `tests/` | unittest | **PyCharm** | — |

`backend/` belongs to the VSCode window rather than PyCharm because it is TypeScript, not
Python: it shares the Node toolchain with `frontend/`, and debugging both in one window is
simpler.

## 2. Directory responsibilities

### Code

| Directory | Contents | Key files |
|-----------|----------|-----------|
| `frontend/src/` | Single-page application, six routed pages: Overview / Schedule / Cases / Clinical Intake / Resources / Evaluation. 19 modules, 1,066 lines | `App.tsx` (shell and routes), `routes.ts` (the single declaration of what pages exist), `pages/`, `components/`, `hooks/` |
| `backend/src/` | REST API and workflow orchestration | `server.ts` (routes), `workflow.ts` (scheduling pipeline), `intake.ts` (case intake and review), `reschedule.ts` (emergency insertion), `experiments.ts` (algorithm experiments), `scheduler.ts`, `db.ts` |
| `services/nlp_service/` | English clinical text to structured JSON, falling back to the rule engine when OpenAI is unavailable | `extractor.py`, `providers.py`, `evaluation.py` |
| `services/priority_service/` | Clinical priority scoring | `scorer.py` |
| `services/optimizer_service/` | CP-SAT constraint solving | `solver.py` (761 lines, the core algorithm), `cp_sat_adapter.py` |
| `services/evaluation_service/` | Schedule quality metrics | `evaluator.py` |
| `services/common/` | The lightweight HTTP runtime the four services share | `runtime.py` (159 lines) |
| `contracts/` | Cross-service data contracts, with the Python models and JSON Schemas kept in step | `models.py`, `v1/*.schema.json` |

### Resources

| Directory | Contents |
|-----------|----------|
| `database/` | MySQL schema and migrations (`init.sql`, `002`–`008`), plus the `.mjs` scripts for import, conflict detection and experiment batches |
| `data/` | The appointment dataset, the PMC-Patients narratives (`pmc-surgical-1000.jsonl` and others) and the NLP benchmark |
| `samples/v1/` | Example payloads for each contract, referenced by tests and documentation |
| `scripts/` | Launch and verification scripts |
| `docs/` | This document, `KNOWN_ISSUES.md`, exported experiment results and the report drafts |

## 3. Launch scripts

All of them live in `scripts/`; the eight that were previously scattered across the repository
root were rewritten and moved here.

| Script | Purpose |
|--------|---------|
| `start-all.cmd` | Start the whole stack (Python services, then the API, then the front end) |
| `start-services.cmd` | Start the four Python services, each in its own console |
| `start-backend.cmd` | Start the Express API with `tsx watch`, installing dependencies if missing |
| `start-frontend.cmd` | Start the Vite development server, installing dependencies if missing |
| `check-tests.cmd` | Export the contract schemas, then run every Python test |
| `check-api.cmd` | Run the Node API tests; `--write` also runs the tests that insert rows |
| `check-nlp.cmd` | NLP checks only, forced onto the rule engine so no OpenAI call is made |
| `configure-openai-key.cmd` | Configure the OpenAI key interactively into the user environment, never into a project file |

These are Windows batch files and must keep CRLF line endings. `cmd.exe` mis-parses a `.cmd`
file with LF endings: multi-line `if (...) else (...)` blocks execute both branches and `REM`
comment text can be executed as a command. `.gitattributes` pins `*.cmd text eol=crlf` to stop a
checkout reintroducing the problem; see CFG-006 in `KNOWN_ISSUES.md`.

## 4. Working in the two IDEs

Both IDEs open the **same repository root**, and their configuration directories coexist
(`.vscode/` and `.idea/`).

### VSCode — front end and API

- **Debug** (F5):
  - `Backend: debug the API (4000)` — `tsx` reload, breakpoints available
  - `Backend: debug the API (no database)` — sets `SKIP_DB=true`, so it runs without MySQL
  - `Frontend: debug in the browser (5173)` — with source maps
  - `Full stack (API + front end)` — a compound configuration starting both
- **Tasks** (`Ctrl+Shift+B`, or Terminal → Run Task):
  - `full stack: front end + API` (the default build task)
  - `frontend: dev` / `backend: dev` / `services: start the four Python services`
  - `build: compile both halves` / `db: apply module migrations`

### PyCharm — the Python services

Run configurations (top-right dropdown):

| Configuration | Purpose |
|---------------|---------|
| `All Services` | Compound configuration, bringing up 8101–8104 together |
| `NLP Service (8101)` and the rest | One service at a time, for breakpoint debugging |
| `All Tests` | unittest over `tests/` — 36 Python tests |
| `Export Contract Schemas` | Regenerate `contracts/v1/*.schema.json` from the Pydantic models |

The interpreter is pinned in each run configuration to the project virtual environment:

```
..\outputs\.venv\Scripts\python.exe    (Python 3.13.5, on the SSD)
```

It holds pydantic 2.13.4, ortools 9.15.6755, requests and python-dotenv, so the configurations
run without further setup.

**Note:** the NLP and Priority services take six to eight seconds to start while the Pydantic
models load. Wait before calling their health endpoints.

### Why a dedicated virtual environment rather than a general-purpose interpreter

A large shared interpreter works, but makes PyCharm's environment scan unusably slow. The
measurements taken on this machine:

| Measure | Value |
|---|---|
| `site-packages` in the shared interpreter | 795 packages / **102,558 files** |
| Disk holding it | ST1000LM035, a **5400 rpm** mechanical drive |
| That disk's idle time during the scan | **0–0.6%** — saturated |
| SSD idle time over the same period | 97–99% |
| Windows Defender cumulative CPU | 12,112 seconds |

PyCharm indexes by reading each of those hundred thousand small files, Defender scans every one
of them in real time, and all of it lands as random reads on a mechanical disk; the three
amplify one another. Enumerating 1,506 standard-library files on that disk took **507 seconds**,
an average of 0.34 seconds per file.

The trimmed virtual environment on the SSD reduces the scanned file count from 102,558 to
**6,905**, roughly one fifteenth, on a disk that is 97% idle.

If the shared interpreter is used again, adding its directory to the Defender exclusion list is
worth doing. The exclusions currently cover the project and the PyCharm configuration directory
but not the interpreter. That is a system security setting and has to be changed by hand in
Windows Security → Virus & threat protection → Manage settings → Add or remove exclusions.

## 5. What the 2026-08-22 reorganisation changed

### Removed (about 280 MB)

- `.npm-cache/` (159 MB), `.pnpm-home/` (121 MB) and `.pnpm-store/` — package manager caches
- 16 `*.log` files in the repository root
- Eight `__pycache__/` directories and `tsconfig.tsbuildinfo`
- `query`, a file whose only content was the string "MySQL80" — captured command output
- `pnpm-lock.yaml` and `pnpm-workspace.yaml`: `package.json` declares npm workspaces, and
  running two package managers over one tree produces inconsistent dependency resolution, so the
  project standardises on npm

### Defects fixed

1. **The front end and API disagreed on the port**, so the interface could not reach the API.
   `App.tsx` had `127.0.0.1:4006` hard-coded while `server.ts` listened on 4000. Both are now
   4000.

2. **`API_PORT` in `.env` had no effect.** `server.ts` reads `process.env.PORT` and never
   `API_PORT`, so changing it did nothing and the port stayed at the default. The variable is
   now `PORT`, with `FRONTEND_ORIGIN` added alongside it.

3. **The launch scripts hard-coded absolute interpreter paths** under a per-machine cache
   directory, which breaks on any other machine. They now use `python` and `npm` from `PATH`.

4. **`frontend/package.json` hard-coded a node path in its build script.** It is now the
   standard `tsc -b && vite build`.

5. **`vite.config.ts` was missing.** `@vitejs/plugin-react` was installed but never enabled, so
   the React plugin was not in effect. The configuration was added, with a `/api` proxy option.

6. **`index.html` was a fragment** — one `<div id="root">` and a script tag, with no doctype,
   `<html>`, `<head>` or `<body>`. It is now a complete document.

7. **Twenty-two orphaned processes** were holding ports 4000, 4005, 4006, 5173 and 8101–8104,
   one of them a `db:import-real` that had been hung for 45 hours. MySQL was confirmed to have
   no active transactions before they were terminated, so no write was interrupted.

### Dependency changes

`vite` and `@vitejs/plugin-react` were listed under `dependencies` in `frontend/package.json`
and moved to `devDependencies`, build tooling not being a runtime dependency. `@types/node` was
added for `vite.config.ts`.

### Environment

The system Node was **v16.15.0**, while Vite 6 requires `^18 || ^20 || >=22` and Express 5
requires `>=18`; the project ran only because the previous toolchain supplied its own Node 24.
**Node v24.19.0 LTS** (npm 11.17.0) was installed with
`winget install OpenJS.NodeJS.LTS`, so the system Node now builds and runs the project directly.

## 6. Rolling back

The state before the reorganisation is the first commit in the repository:

```powershell
git log --oneline
# 01e5d85 chore: clean up stray files and orphaned processes
# ab518fe chore: full archive before the reorganisation   <- original state

git checkout ab518fe -- <path>    # restore one file
git reset --hard ab518fe          # roll everything back
```

`.env` is excluded from git because it holds the database password. A copy taken before the
reorganisation was saved as `.env.backup-before-cleanup`; note that this file *is* tracked, and
should be removed from the repository before it is published.
