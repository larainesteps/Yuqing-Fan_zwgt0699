import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from './db.js';

type AlgorithmCode =
  | 'PRIORITY_GREEDY'
  | 'PURE_CP_SAT'
  | 'HYBRID_PRIORITY_CP_SAT'
  | 'ABLATION_NO_PRIORITY'
  | 'ABLATION_NO_WAITING'
  | 'ABLATION_THROUGHPUT_ONLY';
type ScenarioCode = 'BASELINE' | 'RESOURCE_MODERATE' | 'RESOURCE_TIGHT' | 'EMERGENCY_SURGE';
type SuiteType = 'COMPARISON' | 'ABLATION';

type OptimizationCase = {
  case: {
    case_id: string;
    urgency: string;
    requested_datetime: string;
    maximum_delay_hours: number;
    [key: string]: unknown;
  };
  priority: {
    case_id: string;
    priority_score: number;
    priority_level: string;
    components: Record<string, number>;
    explanation: string[];
    [key: string]: unknown;
  };
};

type OptimizationRequest = {
  contract_version: 'v1';
  run_id: string;
  horizon_start: string;
  horizon_end: string;
  slot_minutes: number;
  max_solve_seconds: number;
  solver_engine?: 'auto' | 'cp-sat' | 'fallback' | 'priority-greedy';
  random_seed?: number;
  cases: OptimizationCase[];
  resources: Array<{
    resource_type: string;
    resource_code: string;
    available_from: string;
    available_to: string;
    [key: string]: unknown;
  }>;
  locked_assignments?: unknown[];
  preferred_assignments?: unknown[];
  objective_weights?: Record<string, number>;
};

type Allocation = {
  case_id: string;
  status: 'SCHEDULED' | 'UNSCHEDULED';
  start_datetime: string | null;
};

type OptimizationResult = {
  run_id: string;
  algorithm: string;
  solver_status: string;
  runtime_ms: number;
  allocations: Allocation[];
  metrics: Record<string, number>;
};

type EvaluationReport = {
  metrics: Record<string, number>;
  conflicts_by_resource: Record<string, number>;
  workload_summary: Record<string, number>;
  [key: string]: unknown;
};

type SourceRunRow = RowDataPacket & {
  id: number;
  run_key: string;
  request_json: OptimizationRequest | string;
};

export type ExperimentInput = {
  sourceRunKey?: string;
  algorithms?: AlgorithmCode[];
  scenarios?: ScenarioCode[];
  caseCounts?: number[];
  repetitions?: number;
  randomSeed?: number;
  maxSolveSeconds?: number;
  suiteType?: SuiteType;
};

const optimizerUrl = (process.env.OPTIMIZER_SERVICE_URL ?? 'http://127.0.0.1:8103').replace(/\/$/, '');
const evaluationUrl = (process.env.EVALUATION_SERVICE_URL ?? 'http://127.0.0.1:8104').replace(/\/$/, '');

const algorithmSettings: Record<AlgorithmCode, {
  solverEngine: 'cp-sat' | 'priority-greedy';
  weights: Record<string, number>;
}> = {
  PRIORITY_GREEDY: {
    solverEngine: 'priority-greedy',
    weights: { unscheduled_penalty: 1000, priority: 10, weighted_delay: 2 }
  },
  PURE_CP_SAT: {
    solverEngine: 'cp-sat',
    weights: { unscheduled_penalty: 1000, priority: 0, weighted_delay: 1 }
  },
  HYBRID_PRIORITY_CP_SAT: {
    solverEngine: 'cp-sat',
    weights: { unscheduled_penalty: 1000, priority: 10, weighted_delay: 2 }
  },
  ABLATION_NO_PRIORITY: {
    solverEngine: 'cp-sat',
    weights: { unscheduled_penalty: 1000, priority: 0, weighted_delay: 2 }
  },
  ABLATION_NO_WAITING: {
    solverEngine: 'cp-sat',
    weights: { unscheduled_penalty: 1000, priority: 10, weighted_delay: 0 }
  },
  ABLATION_THROUGHPUT_ONLY: {
    solverEngine: 'cp-sat',
    weights: { unscheduled_penalty: 1000, priority: 0, weighted_delay: 0 }
  }
};

const comparisonAlgorithms: AlgorithmCode[] = [
  'PRIORITY_GREEDY', 'PURE_CP_SAT', 'HYBRID_PRIORITY_CP_SAT'
];
const ablationAlgorithms: AlgorithmCode[] = [
  'HYBRID_PRIORITY_CP_SAT', 'ABLATION_NO_PRIORITY',
  'ABLATION_NO_WAITING', 'ABLATION_THROUGHPUT_ONLY'
];

function parseJson<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function postJson<T>(url: string, payload: unknown, timeoutMs: number): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as T & { message?: string } : null;
  if (!response.ok) {
    const diagnostic = body?.message ?? JSON.stringify(body);
    throw new Error(`${url} returned HTTP ${response.status}: ${diagnostic}`);
  }
  return body as T;
}

async function assertExperimentSchema() {
  const required = ['experiment_suites', 'experiment_results'];
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT table_name AS tableName FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN (?)`, [required]);
  const found = new Set(rows.map((row) => String(row.tableName)));
  const missing = required.filter((name) => !found.has(name));
  if (missing.length) throw new Error(`Experiment schema is missing: ${missing.join(', ')}. Run npm run db:modules.`);
}

async function loadSourceRun(sourceRunKey?: string) {
  const parameters: unknown[] = [];
  const keyFilter = sourceRunKey ? 'AND run_key=?' : '';
  if (sourceRunKey) parameters.push(sourceRunKey);
  const [rows] = await pool.query<SourceRunRow[]>(`
    SELECT id,run_key,request_json
    FROM optimization_runs
    WHERE status IN ('OPTIMAL','FEASIBLE') AND request_json IS NOT NULL ${keyFilter}
    ORDER BY JSON_LENGTH(request_json, '$.cases') DESC,id DESC
    LIMIT 1`, parameters);
  if (!rows[0]) throw new Error(sourceRunKey
    ? `Successful optimization run ${sourceRunKey} was not found.`
    : 'No successful optimization request is available. Run a schedule workflow first.');
  return { ...rows[0], request_json: parseJson(rows[0].request_json) };
}

// Deterministic PRNG (mulberry32) so that a seed reproduces an instance exactly.
function createSeededRandom(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function scaleCases(sourceCases: OptimizationCase[], caseCount: number, seed: number) {
  // The workflow already interleaves service groups by service_rank. Preserve that
  // deterministic order so smaller experiment subsets remain stratified instead of
  // being biased by lexicographic case identifiers.
  //
  // Repetitions must differ in the instance, not only in the solver's internal random
  // seed, otherwise repeated runs measure solver jitter rather than variation across
  // workloads. A seeded rotation of the stratified ordering gives each repetition a
  // different subset while keeping the service interleave and full reproducibility.
  const ordered = sourceCases.map((item) => clone(item));
  if (!ordered.length) throw new Error('The source optimization request contains no cases.');
  const rotation = Math.floor(createSeededRandom(seed)() * ordered.length);
  return Array.from({ length: caseCount }, (_, index) => {
    const source = clone(ordered[(rotation + index) % ordered.length]);
    if (index < ordered.length) return source;
    const suffix = `-REPLAY-${String(index + 1).padStart(3, '0')}`;
    const caseId = `${source.case.case_id.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`;
    source.case.case_id = caseId;
    source.case.constraints = {
      ...((source.case.constraints as Record<string, unknown> | undefined) ?? {}),
      experiment_scaling_method: 'deterministic-bootstrap-replay',
      experiment_source_case_id: source.priority.case_id
    };
    source.priority.case_id = caseId;
    source.priority.explanation = [
      ...source.priority.explanation,
      'Deterministic replay copy used only for workload-scaling experiments.'
    ];
    return source;
  });
}

// The imported source cases carry their original historical appointment timestamps
// (2024-11 to 2026-08 in the reference dataset), while a planning experiment uses a
// single continuous horizon. Without projection, a case whose
// [requested_datetime, requested_datetime + maximum_delay_hours] window closed months
// before the horizon is structurally infeasible, and every algorithm returns the same
// DEADLINE_EXCEEDED rejection. Only 2 of 100 source cases overlapped the original
// 10-hour horizon, which made the comparison unable to discriminate between algorithms.
//
// The workload is therefore treated as an arrival pattern rather than as absolute
// timestamps: arrivals are projected deterministically onto the horizon, and the horizon
// is sized so that theoretical capacity is HORIZON_SATURATION_RATIO of offered demand.
// This keeps the instance over-subscribed, so the algorithms must choose which cases to
// schedule, which is the behaviour the comparison is intended to measure.
const HORIZON_SATURATION_RATIO = 0.6;
const ARRIVAL_SPAN_RATIO = 0.5;

function resourceConcurrency(resources: OptimizationRequest['resources']) {
  const counts = new Map<string, number>();
  for (const resource of resources) {
    counts.set(resource.resource_type, (counts.get(resource.resource_type) ?? 0) + 1);
  }
  // A case occupies one theatre, one lead doctor and one post-operative bed at a time,
  // so the smallest of those pools bounds how many procedures can overlap.
  const bounding = ['theatre', 'doctor', 'bed']
    .map((type) => counts.get(type) ?? 0)
    .filter((value) => value > 0);
  return bounding.length ? Math.min(...bounding) : 1;
}

function projectWorkloadOntoHorizon(request: OptimizationRequest) {
  const horizonStart = new Date(request.horizon_start).getTime();
  const durationsMinutes = request.cases.map((item) =>
    Number(item.case.estimated_duration_minutes ?? 0) || 0);
  const meanDurationHours = durationsMinutes.length
    ? durationsMinutes.reduce((total, value) => total + value, 0) / durationsMinutes.length / 60
    : 1;
  const concurrency = resourceConcurrency(request.resources);

  // capacity = concurrency * horizonHours / meanDurationHours = ratio * caseCount
  const horizonHours = Math.max(
    10,
    Math.ceil((request.cases.length * meanDurationHours * HORIZON_SATURATION_RATIO) / concurrency)
  );
  const horizonEnd = horizonStart + horizonHours * 3_600_000;
  request.horizon_end = new Date(horizonEnd).toISOString();

  const arrivalSpanMs = horizonHours * ARRIVAL_SPAN_RATIO * 3_600_000;
  request.cases = request.cases.map((item, index) => {
    // Deterministic, evenly spaced arrivals preserve the stratified service ordering
    // produced by the source workflow and keep every repetition reproducible.
    const offset = request.cases.length > 1
      ? Math.round((index / (request.cases.length - 1)) * arrivalSpanMs)
      : 0;
    const requested = new Date(horizonStart + offset).toISOString();
    // Cap the tolerance at the horizon so the deadline remains a live constraint
    // rather than being trivially satisfied by a multi-day allowance.
    const maximumDelayHours = Math.min(Number(item.case.maximum_delay_hours) || horizonHours, horizonHours);
    return {
      ...item,
      case: {
        ...item.case,
        requested_datetime: requested,
        maximum_delay_hours: maximumDelayHours,
        constraints: {
          ...((item.case.constraints as Record<string, unknown> | undefined) ?? {}),
          experiment_arrival_projection: 'deterministic-horizon-projection',
          experiment_source_requested_datetime: item.case.requested_datetime
        }
      }
    };
  });

  request.resources = request.resources.map((resource) => ({
    ...resource,
    available_from: new Date(Math.min(new Date(resource.available_from).getTime(), horizonStart)).toISOString(),
    available_to: new Date(Math.max(new Date(resource.available_to).getTime(), horizonEnd)).toISOString()
  }));

  return request;
}

function applyScenario(base: OptimizationRequest, scenario: ScenarioCode, caseCount: number, seed: number) {
  const request = clone(base);
  request.cases = scaleCases(request.cases, caseCount, seed);
  request.locked_assignments = [];
  request.preferred_assignments = [];
  projectWorkloadOntoHorizon(request);
  if (scenario === 'RESOURCE_MODERATE') {
    const resourcesByType = new Map<string, OptimizationRequest['resources']>();
    for (const resource of request.resources) {
      const group = resourcesByType.get(resource.resource_type) ?? [];
      group.push(resource);
      resourcesByType.set(resource.resource_type, group);
    }
    const capacityClones = [...resourcesByType.values()].flatMap((resources) =>
      resources.slice(0, Math.max(1, Math.ceil(resources.length * 0.5))).map((resource, index) => {
        const suffix = `-MOD-${String(index + 1).padStart(2, '0')}`;
        return {
          ...resource,
          resource_code: `${resource.resource_code.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`,
          attributes: {
            ...((resource.attributes as Record<string, unknown> | undefined) ?? {}),
            experiment_capacity_clone: true,
            experiment_source_resource_code: resource.resource_code
          }
        };
      })
    );
    request.resources = [...request.resources, ...capacityClones];
  }
  if (scenario === 'RESOURCE_TIGHT') {
    const start = new Date(request.horizon_start).getTime();
    const end = new Date(request.horizon_end).getTime();
    const constrainedEnd = new Date(start + (end - start) * 0.7).toISOString();
    request.resources = request.resources.map((resource) => ({
      ...resource,
      available_to: new Date(Math.min(new Date(resource.available_to).getTime(), new Date(constrainedEnd).getTime())).toISOString()
    }));
  }
  if (scenario === 'EMERGENCY_SURGE') {
    const emergencyCount = Math.max(1, Math.ceil(request.cases.length * 0.3));
    request.cases = request.cases.map((item, index) => index >= emergencyCount ? item : {
      ...item,
      case: {
        ...item.case,
        urgency: 'EMERGENCY',
        requested_datetime: request.horizon_start,
        maximum_delay_hours: Math.min(Number(item.case.maximum_delay_hours), 4)
      },
      priority: {
        ...item.priority,
        priority_score: 100,
        priority_level: 'EMERGENCY',
        components: { ...item.priority.components, experiment_emergency_surge: 100 },
        explanation: [...item.priority.explanation, 'Marked as emergency by the reproducible experiment scenario.']
      }
    });
  }
  return request;
}

function emergencyAverageWaitingHours(request: OptimizationRequest, result: OptimizationResult) {
  const cases = new Map(request.cases.map((item) => [item.case.case_id, item.case]));
  const waits = result.allocations.flatMap((allocation) => {
    const item = cases.get(allocation.case_id);
    if (!item || item.urgency !== 'EMERGENCY' || allocation.status !== 'SCHEDULED' || !allocation.start_datetime) return [];
    return [Math.max(0, (new Date(allocation.start_datetime).getTime() - new Date(item.requested_datetime).getTime()) / 3_600_000)];
  });
  return waits.length ? waits.reduce((sum, value) => sum + value, 0) / waits.length : 0;
}

function aggregate(results: Array<Record<string, number | string>>) {
  const groups = new Map<string, Array<Record<string, number | string>>>();
  for (const result of results) {
    const key = `${result.algorithmCode}|${result.scenarioCode}|${result.caseCount}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  const metrics = [
    'runtimeMs', 'scheduledCases', 'unscheduledCases', 'theatreUtilisationPercent',
    'averageWaitingHours', 'maxWaitingHours', 'emergencyAverageWaitingHours',
    'conflictCount', 'hardConstraintViolations', 'jainFairnessIndex', 'continuityMovedCases'
  ];
  return [...groups.entries()].map(([key, rows]) => {
    const [algorithmCode, scenarioCode, caseCount] = key.split('|');
    const averages = Object.fromEntries(metrics.map((metric) => [metric,
      Number((rows.reduce((sum, row) => sum + Number(row[metric] ?? 0), 0) / rows.length).toFixed(4))
    ]));
    return { algorithmCode, scenarioCode, caseCount: Number(caseCount), repetitions: rows.length, ...averages };
  });
}

export async function runAlgorithmExperiments(input: ExperimentInput = {}) {
  await assertExperimentSchema();
  await pool.execute(`
    UPDATE experiment_suites
    SET status='FAILED',error_message='Experiment process ended before completion.',completed_at=NOW()
    WHERE status='RUNNING' AND created_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE)`);
  const source = await loadSourceRun(input.sourceRunKey);
  const baseRequest = source.request_json;
  const suiteType = input.suiteType ?? 'COMPARISON';
  const defaultAlgorithms = suiteType === 'ABLATION' ? ablationAlgorithms : comparisonAlgorithms;
  const algorithms = input.algorithms?.length ? [...new Set(input.algorithms)] : defaultAlgorithms;
  const scenarios = input.scenarios?.length ? [...new Set(input.scenarios)] : ['BASELINE', 'RESOURCE_MODERATE', 'RESOURCE_TIGHT', 'EMERGENCY_SURGE'] as ScenarioCode[];
  const repetitions = Math.max(1, Math.min(20, input.repetitions ?? 3));
  const randomSeed = Math.max(0, input.randomSeed ?? 42);
  const defaultCounts = [25, 50, 100];
  const caseCounts = [...new Set((input.caseCounts?.length ? input.caseCounts : defaultCounts)
    .map((value) => Math.max(1, Math.min(200, Math.round(value)))))]
    .sort((a, b) => a - b);
  const prefix = suiteType === 'ABLATION' ? 'ABL' : 'EXP';
  const suiteKey = `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomSeed}`;
  const config = {
    suiteType,
    algorithms,
    scenarios,
    caseCounts,
    repetitions,
    randomSeed,
    maxSolveSeconds: input.maxSolveSeconds ?? 30,
    sourceCaseCount: baseRequest.cases.length,
    scalingMethod: Math.max(...caseCounts) <= baseRequest.cases.length
      ? 'deterministic-source-subset'
      : 'deterministic-source-subset-with-bootstrap-replay'
  };
  const [insert] = await pool.execute<ResultSetHeader>(`
    INSERT INTO experiment_suites
      (suite_key,source_run_id,source_run_key,suite_type,status,scenario_count,repetition_count,random_seed,source_case_count,config_json)
    VALUES (?,?,?,?,'RUNNING',?,?,?,?,?)`, [
    suiteKey, source.id, source.run_key, suiteType, scenarios.length, repetitions,
    randomSeed, baseRequest.cases.length, JSON.stringify(config)
  ]);
  const rows: Array<Record<string, number | string>> = [];
  try {
    for (const caseCount of caseCounts) {
      for (const scenarioCode of scenarios) {
        for (const algorithmCode of algorithms) {
          const settings = algorithmSettings[algorithmCode];
          for (let repetition = 1; repetition <= repetitions; repetition += 1) {
            const seed = randomSeed + repetition - 1;
            const request = applyScenario(baseRequest, scenarioCode, caseCount, seed);
            request.run_id = `${suiteKey}-${algorithmCode}-${scenarioCode}-${caseCount}-${repetition}`;
            request.max_solve_seconds = Math.max(1, Math.min(300, input.maxSolveSeconds ?? 30));
            request.solver_engine = settings.solverEngine;
            request.random_seed = seed;
            request.objective_weights = settings.weights;
            const result = await postJson<OptimizationResult>(
              `${optimizerUrl}/solve`, request, (request.max_solve_seconds + 15) * 1000
            );
            const evaluation = await postJson<EvaluationReport>(`${evaluationUrl}/evaluate`, result, 30_000);
            const metrics = { ...result.metrics, ...evaluation.metrics };
            const row = {
              algorithmCode,
              scenarioCode,
              caseCount,
              repetition,
              randomSeed: seed,
              solverAlgorithm: result.algorithm,
              solverStatus: result.solver_status,
              runtimeMs: Number(result.runtime_ms),
              scheduledCases: Number(metrics.scheduled_cases ?? 0),
              unscheduledCases: Number(metrics.unscheduled_cases ?? 0),
              theatreUtilisationPercent: Number(metrics.theatre_utilisation_percent ?? metrics.observed_theatre_utilisation_percent ?? 0),
              averageWaitingHours: Number(metrics.average_waiting_hours ?? 0),
              maxWaitingHours: Number(metrics.max_waiting_hours ?? 0),
              emergencyAverageWaitingHours: emergencyAverageWaitingHours(request, result),
              conflictCount: Number(metrics.total_conflicts ?? 0),
              hardConstraintViolations: Number(metrics.hard_constraint_violations ?? 0),
              jainFairnessIndex: Number(evaluation.workload_summary.jain_fairness_index ?? 1),
              continuityMovedCases: Number(metrics.continuity_moved_cases ?? 0)
            };
            rows.push(row);
            await pool.execute(`
              INSERT INTO experiment_results
                (experiment_suite_id,algorithm_code,scenario_code,case_count,repetition_number,random_seed,
                 solver_algorithm,solver_status,runtime_ms,scheduled_cases,unscheduled_cases,
                 theatre_utilisation_percent,average_waiting_hours,max_waiting_hours,
                 emergency_average_waiting_hours,conflict_count,hard_constraint_violations,
                 jain_fairness_index,continuity_moved_cases,result_json,evaluation_json)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
              insert.insertId, algorithmCode, scenarioCode, caseCount, repetition, seed,
              result.algorithm, result.solver_status, row.runtimeMs, row.scheduledCases, row.unscheduledCases,
              row.theatreUtilisationPercent, row.averageWaitingHours, row.maxWaitingHours,
              row.emergencyAverageWaitingHours, row.conflictCount, row.hardConstraintViolations,
              row.jainFairnessIndex, row.continuityMovedCases, JSON.stringify(result), JSON.stringify(evaluation)
            ]);
          }
        }
      }
    }
    const summary = aggregate(rows);
    await pool.execute(`
      UPDATE experiment_suites SET status='COMPLETED',summary_json=?,completed_at=NOW() WHERE id=?`, [
      JSON.stringify(summary), insert.insertId
    ]);
    return { suiteId: insert.insertId, suiteKey, suiteType, sourceRunKey: source.run_key, config, summary, results: rows };
  } catch (error) {
    await pool.execute(`
      UPDATE experiment_suites SET status='FAILED',error_message=?,completed_at=NOW() WHERE id=?`, [
      error instanceof Error ? error.message.slice(0, 1000) : 'Unknown experiment error', insert.insertId
    ]);
    throw error;
  }
}

async function loadExperimentSuite(whereClause: string, parameters: unknown[]) {
  await assertExperimentSchema();
  const [suites] = await pool.query<RowDataPacket[]>(`
    SELECT id,suite_key,source_run_key,suite_type,status,scenario_count,repetition_count,random_seed,
           source_case_count,config_json,summary_json,error_message,created_at,completed_at
    FROM experiment_suites ${whereClause} ORDER BY id DESC LIMIT 1`, parameters);
  if (!suites[0]) return null;
  const [results] = await pool.query<RowDataPacket[]>(`
    SELECT algorithm_code,scenario_code,case_count,repetition_number,random_seed,
           solver_algorithm,solver_status,runtime_ms,scheduled_cases,unscheduled_cases,
           theatre_utilisation_percent,average_waiting_hours,max_waiting_hours,
           emergency_average_waiting_hours,conflict_count,hard_constraint_violations,
           jain_fairness_index,continuity_moved_cases,created_at
    FROM experiment_results WHERE experiment_suite_id=?
    ORDER BY case_count,scenario_code,algorithm_code,repetition_number`, [suites[0].id]);
  return { ...suites[0], results };
}

export async function latestAlgorithmExperiments(suiteType?: SuiteType) {
  return loadExperimentSuite(suiteType ? 'WHERE suite_type=?' : '', suiteType ? [suiteType] : []);
}

export async function getAlgorithmExperimentSuite(suiteKey: string) {
  return loadExperimentSuite('WHERE suite_key=?', [suiteKey]);
}

export async function listAlgorithmExperimentSuites(limit = 20) {
  await assertExperimentSchema();
  const safeLimit = Math.max(1, Math.min(100, Math.round(limit)));
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT id,suite_key,source_run_key,suite_type,status,scenario_count,repetition_count,
           random_seed,source_case_count,config_json,summary_json,error_message,created_at,completed_at
    FROM experiment_suites ORDER BY id DESC LIMIT ${safeLimit}`);
  return rows;
}
