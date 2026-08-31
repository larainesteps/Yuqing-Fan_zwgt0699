import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from './db.js';

type Urgency = 'UNKNOWN' | 'ROUTINE' | 'EXPEDITED' | 'URGENT' | 'EMERGENCY';
type ResourceType = 'doctor' | 'nurse' | 'theatre' | 'bed';

type PatientRow = RowDataPacket & {
  id: number;
  appointment_id: string;
  requested_datetime: string;
  duration_hours: string | number;
  nurses_needed: number;
  service_code: string;
  service_name: string;
  max_delay_days: number;
};

type ResourceRow = RowDataPacket & {
  id: number;
  code: string;
  service_code: string;
};

export type CaseExtraction = {
  contract_version: 'v1';
  case_id: string;
  procedure: string;
  speciality: string;
  urgency: Urgency;
  requested_datetime: string;
  estimated_duration_minutes: number;
  maximum_delay_hours: number;
  required_doctors: string[];
  required_nurses: number;
  required_theatre_type: string | null;
  required_bed_type: string | null;
  constraints: Record<string, unknown>;
  confidence: number;
  human_review_required: boolean;
  evidence: string[];
  urgency_confidence: number;
  urgency_source: 'explicit' | 'inferred' | 'unknown';
  recommended_time_window_hours: number;
  urgency_evidence: string[];
  warnings: string[];
  extractor_version: string;
};

type PriorityAssessment = {
  contract_version: 'v1';
  case_id: string;
  priority_score: number;
  priority_level: Urgency;
  components: Record<string, number>;
  explanation: string[];
  policy_version: string;
  assessed_at: string;
};

type ResourceAvailability = {
  resource_type: ResourceType;
  resource_code: string;
  speciality: string | null;
  available_from: string;
  available_to: string;
  attributes: Record<string, unknown>;
};

type ResourceAssignment = {
  resource_type: ResourceType;
  resource_code: string;
  stage: string;
};

type Allocation = {
  case_id: string;
  status: 'SCHEDULED' | 'UNSCHEDULED';
  start_datetime: string | null;
  end_datetime: string | null;
  resources: ResourceAssignment[];
  rejection_code: string | null;
  rejection_reason: string | null;
};

type OptimizationResult = {
  contract_version: 'v1';
  run_id: string;
  algorithm: string;
  solver_status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN' | 'ERROR';
  objective_value: number | null;
  best_bound: number | null;
  optimality_gap: number | null;
  runtime_ms: number;
  allocations: Allocation[];
  metrics: Record<string, number>;
  generated_at: string;
};

type EvaluationReport = {
  contract_version: 'v1';
  run_id: string;
  baseline_run_id: string | null;
  algorithm: string;
  metrics: Record<string, number>;
  conflicts_by_resource: Record<string, number>;
  workload_summary: Record<string, number>;
  notes: string[];
  generated_at: string;
};

export type WorkflowInput = {
  date: string;
  caseLimit: number;
  slotMinutes: number;
  maxSolveSeconds: number;
  caseIds?: string[];
  extractionOverrides?: CaseExtraction[];
  lockedAssignments?: ContinuityAssignment[];
  preferredAssignments?: ContinuityAssignment[];
  runType?: 'STANDARD' | 'EMERGENCY_INSERTION';
  baselineRunKey?: string | null;
};

export type ContinuityAssignment = {
  case_id: string;
  start_datetime: string;
  end_datetime: string;
  resource_codes: string[];
};

const serviceUrls = {
  priority: (process.env.PRIORITY_SERVICE_URL ?? 'http://127.0.0.1:8102').replace(/\/$/, ''),
  optimizer: (process.env.OPTIMIZER_SERVICE_URL ?? 'http://127.0.0.1:8103').replace(/\/$/, ''),
  evaluation: (process.env.EVALUATION_SERVICE_URL ?? 'http://127.0.0.1:8104').replace(/\/$/, '')
};

function asUtcIso(value: string) {
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) return new Date(value).toISOString();
  return new Date(value.replace(' ', 'T') + 'Z').toISOString();
}

function sqlDate(value: string) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

async function postService<T>(url: string, payload: unknown, timeoutMs: number): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${url} returned invalid JSON`);
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body && 'message' in body
      ? String((body as { message?: unknown }).message)
      : `${url} returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => runWorker())
  );
  return results;
}

function toExtraction(row: PatientRow, replayedRequestedDatetime: string): CaseExtraction {
  const isEmergency = row.service_code.toLowerCase() === 'emergency';
  const sourceDelayDays = Number(row.max_delay_days);
  const maximumDelayHours = Math.max(
    0,
    Math.min(8760, isEmergency && sourceDelayDays === 0 ? 4 : sourceDelayDays * 24)
  );
  return {
    contract_version: 'v1',
    case_id: row.appointment_id,
    procedure: row.service_name,
    speciality: row.service_code,
    urgency: isEmergency ? 'EMERGENCY' : 'ROUTINE',
    requested_datetime: replayedRequestedDatetime,
    estimated_duration_minutes: Math.max(15, Math.min(1440, Math.round(Number(row.duration_hours) * 60))),
    maximum_delay_hours: maximumDelayHours,
    required_doctors: [row.service_code],
    required_nurses: Math.max(0, Math.min(20, Number(row.nurses_needed))),
    required_theatre_type: row.service_code,
    required_bed_type: row.service_code,
    constraints: {
      source: 'mysql-workflow-adapter',
      patient_id: row.id,
      planning_mode: 'historical-replay',
      original_requested_datetime: asUtcIso(row.requested_datetime),
      deadline_policy_assumption: isEmergency && sourceDelayDays === 0
        ? 'A zero-day emergency policy is represented as a four-hour operational deadline.'
        : 'Service maximum-delay days are converted to hours.',
      resource_availability_assumption: '08:00-18:00 UTC demo window'
    },
    confidence: 1,
    human_review_required: false,
    evidence: [`Imported service code: ${row.service_code}`],
    urgency_confidence: 1,
    urgency_source: isEmergency ? 'explicit' : 'inferred',
    recommended_time_window_hours: maximumDelayHours,
    urgency_evidence: [isEmergency ? 'Emergency service record' : `Service maximum delay ${row.max_delay_days} days`],
    warnings: [
      'Procedure and resource requirements are adapted from normalized MySQL service data.',
      'Each service queue timeline is shifted to the selected planning date for replay.',
      ...(isEmergency && sourceDelayDays === 0
        ? ['The source zero-day emergency policy is represented as a four-hour scheduling target.']
        : [])
    ],
    extractor_version: 'mysql-workflow-adapter-v1'
  };
}

function groupResources(rows: ResourceRow[]) {
  const grouped = new Map<string, ResourceRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.service_code) ?? [];
    current.push(row);
    grouped.set(row.service_code, current);
  }
  return grouped;
}

async function loadWorkflowData(input: WorkflowInput) {
  const caseFilter = input.caseIds?.length ? 'AND p.appointment_id IN (?)' : '';
  const parameters = input.caseIds?.length
    ? [input.caseIds, input.caseLimit]
    : [input.caseLimit];
  const [patientRows] = await pool.query<PatientRow[]>(`
    WITH ranked AS (
      SELECT p.id, p.appointment_id, p.requested_datetime, p.duration_hours, p.nurses_needed,
             s.code AS service_code, s.name AS service_name, s.max_delay_days,
             ROW_NUMBER() OVER (PARTITION BY s.code ORDER BY p.requested_datetime DESC, p.id DESC) AS service_rank
      FROM patients p
      JOIN services s ON s.id=p.service_id
       WHERE s.uses_theatre=1 AND p.duration_hours BETWEEN 0.25 AND 24
         ${caseFilter}
    )
    SELECT * FROM ranked
    ORDER BY service_rank, CASE WHEN service_code='emergency' THEN 0 ELSE 1 END, requested_datetime DESC
    LIMIT ?`, parameters);
  if (!patientRows.length) throw new Error('No theatre cases are available in MySQL for optimization.');

  const [doctorRows, nurseRows, theatreRows, bedRows] = await Promise.all([
    pool.query<ResourceRow[]>('SELECT d.id,d.code,s.code AS service_code FROM doctors d JOIN services s ON s.id=d.service_id ORDER BY d.code'),
    pool.query<ResourceRow[]>('SELECT n.id,n.code,s.code AS service_code FROM nurses n JOIN services s ON s.id=n.service_id ORDER BY n.code'),
    pool.query<ResourceRow[]>('SELECT t.id,t.code,s.code AS service_code FROM theatres t JOIN services s ON s.id=t.service_id ORDER BY t.code'),
    pool.query<ResourceRow[]>('SELECT b.id,b.code,s.code AS service_code FROM real_beds b JOIN services s ON s.id=b.service_id ORDER BY b.code')
  ]);
  return {
    patients: patientRows,
    doctors: groupResources(doctorRows[0]),
    nurses: groupResources(nurseRows[0]),
    theatres: groupResources(theatreRows[0]),
    beds: groupResources(bedRows[0])
  };
}

function buildResourceAvailability(
  data: Awaited<ReturnType<typeof loadWorkflowData>>,
  horizonStart: string,
  horizonEnd: string,
  extractions: CaseExtraction[]
) {
  const resources: ResourceAvailability[] = [];
  const services = [...new Set(data.patients.map((row) => row.service_code))];
  for (const service of services) {
    const maxNurses = Math.max(...data.patients.filter((row) => row.service_code === service).map((row) => Number(row.nurses_needed)), 1);
    const add = (type: ResourceType, row: ResourceRow, attributes: Record<string, unknown>) => {
      resources.push({
        resource_type: type,
        resource_code: row.code,
        speciality: service,
        available_from: horizonStart,
        available_to: horizonEnd,
        attributes
      });
    };
    const maxDoctors = Math.max(
      ...extractions
        .filter((extraction) => extraction.speciality === service)
        .map((extraction) => extraction.required_doctors.length),
      1
    );
    const theatre = data.theatres.get(service)?.[0];
    const bed = data.beds.get(service)?.[0];
    for (const doctor of (data.doctors.get(service) ?? []).slice(0, maxDoctors)) {
      add('doctor', doctor, { role: service, roles: [service], source_id: doctor.id });
    }
    for (const nurse of (data.nurses.get(service) ?? []).slice(0, maxNurses)) {
      add('nurse', nurse, { source_id: nurse.id });
    }
    if (theatre) add('theatre', theatre, { theatre_type: service, source_id: theatre.id });
    if (bed) add('bed', bed, { bed_type: service, source_id: bed.id });
  }
  return resources;
}

async function assertWorkflowSchema() {
  const required = ['priority_assessments', 'optimization_runs', 'optimization_assignments', 'evaluation_reports'];
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT table_name AS tableName FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN (?)`, [required]);
  const found = new Set(rows.map((row) => String(row.tableName)));
  const missing = required.filter((name) => !found.has(name));
  if (missing.length) throw new Error(`Workflow schema is missing: ${missing.join(', ')}. Run npm run db:modules.`);
}

async function persistWorkflow(
  runDbId: number,
  runKey: string,
  patients: PatientRow[],
  extractions: CaseExtraction[],
  priorities: PriorityAssessment[],
  result: OptimizationResult,
  evaluation: EvaluationReport,
  baselineRunKey: string | null
) {
  const connection = await pool.getConnection();
  const patientByCase = new Map(patients.map((patient) => [patient.appointment_id, patient]));
  const extractionByCase = new Map(extractions.map((extraction) => [extraction.case_id, extraction]));
  const resourceTables: Record<ResourceType, string> = {
    doctor: 'doctors', nurse: 'nurses', theatre: 'theatres', bed: 'real_beds'
  };
  const resourceIds = new Map<string, number>();
  for (const [type, table] of Object.entries(resourceTables) as [ResourceType, string][]) {
    const [rows] = await connection.query<ResourceRow[]>(`SELECT id,code,'' AS service_code FROM ${table}`);
    for (const row of rows) resourceIds.set(`${type}:${row.code}`, row.id);
  }
  try {
    await connection.beginTransaction();
    for (let index = 0; index < priorities.length; index += 1) {
      const priority = priorities[index];
      const patient = patientByCase.get(priority.case_id);
      await connection.execute(`
        INSERT INTO priority_assessments
          (patient_id,extraction_id,external_case_id,contract_version,policy_version,priority_score,priority_level,components_json,explanation_json,assessed_at)
        VALUES (?,NULL,?,?,?,?,?,?,?,?)`, [
        patient?.id ?? null, priority.case_id, priority.contract_version, priority.policy_version,
        priority.priority_score, priority.priority_level, JSON.stringify(priority.components),
        JSON.stringify(priority.explanation), sqlDate(priority.assessed_at)
      ]);
    }
    for (const allocation of result.allocations) {
      const patient = patientByCase.get(allocation.case_id);
      await connection.execute(`
        INSERT INTO optimization_assignments
          (optimization_run_id,patient_id,external_case_id,status,start_datetime,end_datetime,resources_json,rejection_code,rejection_reason)
        VALUES (?,?,?,?,?,?,?,?,?)`, [
        runDbId, patient?.id ?? null, allocation.case_id, allocation.status,
        allocation.start_datetime ? sqlDate(allocation.start_datetime) : null,
        allocation.end_datetime ? sqlDate(allocation.end_datetime) : null,
        JSON.stringify(allocation.resources), allocation.rejection_code, allocation.rejection_reason
      ]);
      const requested = extractionByCase.get(allocation.case_id)
        ? new Date(extractionByCase.get(allocation.case_id)!.requested_datetime)
        : null;
      const scheduled = allocation.start_datetime ? new Date(allocation.start_datetime) : null;
      const delayDays = requested && scheduled ? Math.max(0, (scheduled.getTime() - requested.getTime()) / 86_400_000) : null;
      await connection.execute(`
        INSERT INTO schedule_results
          (patient_id,algorithm,status,scheduled_datetime,scheduled_end_datetime,delay_days,run_id)
        VALUES (?,?,?,?,?,?,?)`, [
        patient?.id ?? null, result.algorithm, allocation.status,
        allocation.start_datetime ? sqlDate(allocation.start_datetime) : null,
        allocation.end_datetime ? sqlDate(allocation.end_datetime) : null,
        delayDays, runKey
      ]);
      if (allocation.status !== 'SCHEDULED' || !patient || !allocation.start_datetime || !allocation.end_datetime) continue;
      for (const resource of allocation.resources) {
        const resourceId = resourceIds.get(`${resource.resource_type}:${resource.resource_code}`) ?? null;
        await connection.execute(`
          INSERT INTO resource_bookings
            (patient_id,run_id,resource_type,resource_code,stage,start_datetime,end_datetime,doctor_id,nurse_id,theatre_id,bed_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
          patient.id, runKey, resource.resource_type, resource.resource_code, resource.stage,
          sqlDate(allocation.start_datetime), sqlDate(allocation.end_datetime),
          resource.resource_type === 'doctor' ? resourceId : null,
          resource.resource_type === 'nurse' ? resourceId : null,
          resource.resource_type === 'theatre' ? resourceId : null,
          resource.resource_type === 'bed' ? resourceId : null
        ]);
      }
    }
    await connection.execute(`
      INSERT INTO evaluation_reports
        (optimization_run_id,baseline_run_key,contract_version,evaluation_version,metrics_json,conflicts_json,workload_json,generated_at)
      VALUES (?,?,?,?,?,?,?,?)`, [
      runDbId, baselineRunKey, evaluation.contract_version, 'evaluation-v1.0', JSON.stringify(evaluation.metrics),
      JSON.stringify(evaluation.conflicts_by_resource), JSON.stringify(evaluation.workload_summary),
      sqlDate(evaluation.generated_at)
    ]);
    for (const type of ['doctor', 'nurse', 'theatre', 'bed'] as ResourceType[]) {
      await connection.execute(`
        INSERT INTO evaluation_conflict_summary (run_id,resource_type,conflict_pairs)
        VALUES (?,?,?) ON DUPLICATE KEY UPDATE conflict_pairs=VALUES(conflict_pairs)`, [
        runKey, type, evaluation.conflicts_by_resource[type] ?? 0
      ]);
    }
    await connection.execute(`
      UPDATE optimization_runs
      SET algorithm=?,status=?,objective_value=?,best_bound=?,optimality_gap=?,runtime_ms=?,completed_at=NOW()
      WHERE id=?`, [
      result.algorithm, result.solver_status, result.objective_value, result.best_bound,
      result.optimality_gap, result.runtime_ms, runDbId
    ]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function runDatabaseWorkflow(input: WorkflowInput) {
  await assertWorkflowSchema();
  const data = await loadWorkflowData(input);
  const horizonStart = `${input.date}T08:00:00Z`;
  const horizonEnd = `${input.date}T18:00:00Z`;
  const latestHistoricalRequestByService = new Map<string, number>();
  for (const patient of data.patients) {
    const requested = new Date(asUtcIso(patient.requested_datetime)).getTime();
    latestHistoricalRequestByService.set(
      patient.service_code,
      Math.max(requested, latestHistoricalRequestByService.get(patient.service_code) ?? -Infinity)
    );
  }
  const overrideByCase = new Map(
    (input.extractionOverrides ?? []).map((extraction) => [extraction.case_id, extraction])
  );
  const extractions = data.patients.map((patient) => overrideByCase.get(patient.appointment_id) ?? toExtraction(
    patient,
    new Date(
      new Date(asUtcIso(patient.requested_datetime)).getTime()
      + new Date(horizonStart).getTime()
      - latestHistoricalRequestByService.get(patient.service_code)!
    ).toISOString()
  ));
  const priorities = await mapWithConcurrency(
    extractions,
    8,
    (extraction) => postService<PriorityAssessment>(`${serviceUrls.priority}/score`, extraction, 30_000)
  );
  const resources = buildResourceAvailability(data, horizonStart, horizonEnd, extractions);
  if (!resources.length) throw new Error('No compatible MySQL resources are available for the selected cases.');
  const runType = input.runType ?? 'STANDARD';
  const runPrefix = runType === 'EMERGENCY_INSERTION' ? 'ER' : 'WF';
  const runKey = `${runPrefix}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const optimizationRequest = {
    contract_version: 'v1',
    run_id: runKey,
    horizon_start: horizonStart,
    horizon_end: horizonEnd,
    slot_minutes: input.slotMinutes,
    max_solve_seconds: input.maxSolveSeconds,
    cases: extractions.map((caseData, index) => ({ case: caseData, priority: priorities[index] })),
    resources,
    locked_assignments: input.lockedAssignments ?? [],
    preferred_assignments: input.preferredAssignments ?? [],
    objective_weights: {
      unscheduled_penalty: 1000,
      priority: 10,
      weighted_delay: 2,
      keep_assignment: 300,
      disruption_time: 35,
      disruption_resource: 60
    }
  };
  const [insertResult] = await pool.execute<ResultSetHeader>(`
    INSERT INTO optimization_runs
      (run_key,contract_version,run_type,baseline_run_key,algorithm,status,horizon_start,horizon_end,slot_minutes,max_solve_seconds,request_json)
    VALUES (?,'v1',?,?,'PENDING','RUNNING',?,?,?,?,?)`, [
    runKey, runType, input.baselineRunKey ?? null, sqlDate(horizonStart), sqlDate(horizonEnd), input.slotMinutes,
    input.maxSolveSeconds, JSON.stringify(optimizationRequest)
  ]);
  const runDbId = insertResult.insertId;
  try {
    const result = await postService<OptimizationResult>(
      `${serviceUrls.optimizer}/solve`, optimizationRequest, (input.maxSolveSeconds + 15) * 1000
    );
    const evaluation = await postService<EvaluationReport>(
      `${serviceUrls.evaluation}/evaluate`, result, 30_000
    );
    await persistWorkflow(
      runDbId,
      runKey,
      data.patients,
      extractions,
      priorities,
      result,
      evaluation,
      input.baselineRunKey ?? null
    );
    return {
      runId: runDbId,
      runKey,
      sourceCaseCount: data.patients.length,
      resourceCount: resources.length,
      runType,
      baselineRunKey: input.baselineRunKey ?? null,
      result,
      evaluation
    };
  } catch (error) {
    await pool.execute(`
      UPDATE optimization_runs SET status='FAILED',error_message=?,completed_at=NOW() WHERE id=?`, [
      error instanceof Error ? error.message.slice(0, 1000) : 'Unknown workflow error', runDbId
    ]);
    throw error;
  }
}

export async function latestDatabaseWorkflow() {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT r.id,r.run_key,r.run_type,r.baseline_run_key,r.algorithm,r.status,r.horizon_start,r.horizon_end,r.runtime_ms,
           r.objective_value,r.optimality_gap,r.created_at,r.completed_at,
           e.metrics_json,e.conflicts_json,e.workload_json,e.generated_at
    FROM optimization_runs r
    LEFT JOIN evaluation_reports e ON e.optimization_run_id=r.id
    ORDER BY r.created_at DESC,r.id DESC LIMIT 1`);
  const run = rows[0];
  if (!run) return null;
  const [assignments] = await pool.query<RowDataPacket[]>(`
    SELECT external_case_id,status,start_datetime,end_datetime,resources_json,
           rejection_code,rejection_reason
    FROM optimization_assignments
    WHERE optimization_run_id=?
    ORDER BY status,start_datetime,external_case_id`, [run.id]);
  return { ...run, assignments };
}
