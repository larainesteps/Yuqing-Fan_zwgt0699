# Optimizer Service

Schedules cases against discrete time slots and mutually exclusive doctors, nurses,
operating theatres and beds. Locked assignments are hard constraints. The objective
first avoids unscheduled cases, then rewards clinical priority and earlier starts.
Optional `preferred_assignments` add continuity costs for time shifts and resource
changes, allowing emergency insertion to minimise disruption without weakening hard
clinical constraints. Exact near-term or manually protected cases remain in
`locked_assignments` and cannot move.

The independent OR-Tools adapter runs `CP_SAT_V1` when a compatible Python
environment is available. If CP-SAT cannot be loaded or fails in `auto` mode, the
service safely runs the same candidate constraints with the exact
`CP_BRANCH_AND_BOUND_V1` engine and reports that distinct name in its output.
For controlled experiments, `PRIORITY_GREEDY_V1` provides a genuinely separate,
non-backtracking baseline that schedules the highest-priority cases first.

Hard constraints cover request time, clinical maximum-wait deadline, duration,
resource availability, speciality/type matching, required quantities, locked
assignments and no-overlap for every named doctor, nurse, theatre and bed.
Unscheduled allocations return a stable `rejection_code` and a human-readable
`rejection_reason`.

```powershell
python -m services.optimizer_service.app --port 8103
python -m services.optimizer_service.app --check
```

Select an engine per request with `solver_engine=auto|cp-sat|fallback|priority-greedy`.
The `OPTIMIZER_ENGINE` environment variable remains the default when the request uses
`auto`. Set `random_seed` in the request for reproducible CP-SAT comparisons.

Endpoints: `GET /health`, `GET /metadata`, `POST /solve`.
