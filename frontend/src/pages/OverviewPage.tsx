import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Users,
  WandSparkles
} from 'lucide-react';
import type { CaseRow, ScheduleRow, WorkflowResult } from '../types';
import { postJson } from '../api/client';
import { useApiResource } from '../hooks/useApiResource';
import { matchesQuery, useSearch } from '../hooks/useSearch';
import { PageHeader } from '../components/PageHeader';
import { Metric } from '../components/Metric';
import { Timeline } from '../components/Timeline';
import { CaseTable } from '../components/CaseTable';
import { fmt, pct } from '../lib/format';

type DashboardPayload = {
  summary?: Record<string, number>;
  resources?: Record<string, number>;
};

type EvaluationPayload = {
  utilisation?: Array<{ resource_type: string; booked_hours: number }>;
  workloadBalance?: { fairnessIndex: number };
};

export default function OverviewPage() {
  const dashboard = useApiResource<DashboardPayload>('/dashboard', 'Dashboard');
  const cases = useApiResource<CaseRow[]>('/cases', 'Cases');
  const schedule = useApiResource<ScheduleRow[]>('/schedules/latest', 'Schedule');
  const evaluation = useApiResource<EvaluationPayload>('/evaluations', 'Evaluation');
  const { query } = useSearch();

  const [caseLimit, setCaseLimit] = useState(100);
  const [running, setRunning] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowResult | null>(null);
  const [notice, setNotice] = useState('');

  const reloadAll = () => {
    dashboard.reload();
    cases.reload();
    schedule.reload();
    evaluation.reload();
  };

  const runWorkflow = async () => {
    if (running) return;
    setRunning(true);
    setNotice('');
    try {
      const completed = await postJson<WorkflowResult>('/workflows/run', {
        date: new Date().toISOString().slice(0, 10),
        caseLimit,
        slotMinutes: 30,
        maxSolveSeconds: 30
      });
      setWorkflow(completed);
      reloadAll();
      setNotice(
        `Workflow ${completed.runKey}: ${completed.result.metrics.scheduled_cases ?? 0}/${completed.sourceCaseCount} cases scheduled with ${completed.evaluation.metrics.total_conflicts ?? 0} conflicts.`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to run scheduling workflow');
    } finally {
      setRunning(false);
    }
  };

  const filtered = useMemo(
    () =>
      (cases.data ?? [])
        .filter((row) =>
          matchesQuery(query, row.appointment_id, row.service_type, row.source_patient_id)
        )
        .slice(0, 80),
    [cases.data, query]
  );

  const loading = dashboard.loading || cases.loading || schedule.loading;
  const summary = dashboard.data?.summary ?? {};
  const pools = dashboard.data?.resources ?? {};
  const scheduled = Number(summary.scheduledCases ?? 0);
  const total = Number(summary.totalCases ?? filtered.length);
  const unscheduled = Number(summary.unscheduledCases ?? 0);
  const rows = schedule.data ?? [];
  const rejected =
    workflow?.result.allocations.filter((allocation) => allocation.status === 'UNSCHEDULED') ?? [];

  const loadError = dashboard.error || cases.error || schedule.error || evaluation.error;

  const workflowNote = workflow
    ? `${workflow.result.algorithm} · ${workflow.result.metrics.scheduled_cases ?? 0}/${workflow.sourceCaseCount} scheduled · ${workflow.evaluation.metrics.total_conflicts ?? 0} conflicts${rejected.length ? ` · ${rejected.length} unscheduled (${rejected[0].rejection_code})` : ''}`
    : evaluation.data?.workloadBalance
      ? `Latest doctor fairness: ${evaluation.data.workloadBalance.fairnessIndex}`
      : 'Ready to generate a constraint-safe schedule';

  return (
    <>
      <PageHeader title="Overview" onRefresh={reloadAll} />
      {(notice || loadError) && <div className="notice" style={{ marginBottom: 16 }}>{notice || loadError}</div>}

      {loading ? (
        <section className="panel full">
          <div className="panel-head">
            <h2>Loading real database records...</h2>
          </div>
        </section>
      ) : (
        <>
          <section className="metrics">
            <Metric
              label="Total cases"
              value={fmt(total)}
              detail={`${fmt(scheduled)} scheduled`}
              tone="amber"
              icon={<Clock3 />}
            />
            <Metric
              label="Unscheduled"
              value={fmt(unscheduled)}
              detail={`${pct(total ? scheduled / total : 0)} scheduled rate`}
              tone="green"
              icon={<CalendarDays />}
            />
            <Metric
              label="Avg delay"
              value={`${summary.avgDelayDays ?? 0}d`}
              detail="Across scheduled cases"
              tone="blue"
              icon={<Activity />}
            />
            <Metric
              label="Clinical staff"
              value={fmt(Number(pools.doctors ?? 0) + Number(pools.nurses ?? 0))}
              detail={`${pools.doctors ?? 0} doctors · ${pools.nurses ?? 0} nurses`}
              tone="violet"
              icon={<Users />}
            />
          </section>

          <div className="content-grid">
            <section className="panel schedule-panel">
              <div className="panel-head">
                <div>
                  <h2>Latest imported schedule</h2>
                  <p>{rows.length} visible allocations from database</p>
                </div>
                <Link className="text-button" to="/schedule">
                  Open full schedule <ChevronRight size={16} />
                </Link>
              </div>
              <Timeline rows={rows.slice(0, 24)} />
            </section>

            <aside className="generator">
              <span className="gen-icon">
                <WandSparkles size={22} />
              </span>
              <h2>Generate optimized schedule</h2>
              <p>
                Run Priority, CP-SAT and Evaluation for a configurable sample of theatre cases
                loaded from MySQL.
              </p>
              <label>
                Cases per run
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={caseLimit}
                  onChange={(event) =>
                    setCaseLimit(Math.max(1, Math.min(500, Number(event.target.value) || 1)))
                  }
                />
              </label>
              <button type="button" onClick={runWorkflow} disabled={running}>
                {running ? (
                  <>
                    <LoaderCircle className="spin" size={17} /> Running {caseLimit} cases...
                  </>
                ) : (
                  <>
                    <WandSparkles size={17} /> Generate schedule
                  </>
                )}
              </button>
              <small>
                <span className="dot" /> 1–500 cases · hard constraints · MySQL persistence
              </small>
              <div className="notice">{workflowNote}</div>
            </aside>
          </div>

          <section className="panel cases">
            <div className="panel-head">
              <div>
                <h2>Imported cases</h2>
                <p>Real CSV appointments mapped into normalized patient records</p>
              </div>
              <Link className="text-button" to="/cases">
                View all cases <ChevronRight size={16} />
              </Link>
            </div>
            <CaseTable data={filtered} />
          </section>
        </>
      )}
    </>
  );
}
