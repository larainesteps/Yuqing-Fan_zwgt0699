import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { pool } from './db.js';
import { buildSchedule } from './scheduler.js';
import type { Algorithm, Bed, Case, Resource } from './scheduler.js';
import { latestDatabaseWorkflow, runDatabaseWorkflow } from './workflow.js';
import {
  getAlgorithmExperimentSuite,
  latestAlgorithmExperiments,
  listAlgorithmExperimentSuites,
  runAlgorithmExperiments
} from './experiments.js';
import {
  approveIntakeCase,
  createIntakeCase,
  getIntakeCase,
  listIntakeCases,
  rejectIntakeCase,
  reviewedCaseSchema,
  scheduleIntakeCase,
  updateIntakeCase
} from './intake.js';
import {
  insertEmergencyCase,
  latestRescheduleRun,
  listScheduleLocks,
  lockScheduledCase,
  unlockScheduledCase
} from './reschedule.js';

const app = express();
const allowedFrontendOrigins = new Set([
  process.env.FRONTEND_ORIGIN,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
].filter((origin): origin is string => Boolean(origin)));

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedFrontendOrigins.has(origin));
  }
}));
app.use(express.json());

app.get('/', (_req, res) => res.json({
  name: 'TheatreFlow API',
  status: 'running',
  health: '/api/health',
  frontend: 'http://127.0.0.1:5173'
}));

app.get('/api/health', async (_req, res) => {
  if (process.env.SKIP_DB === 'true') return res.json({ status: 'ok', database: 'skipped' });
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'database unavailable' });
  }
});

app.get('/api/dashboard', async (_req, res, next) => {
  try {
    if (await tableExists('patients')) return res.json(await realDashboard());
    return res.json(await legacyDashboard());
  } catch (e) { next(e); }
});

app.get('/api/cases', async (_req, res, next) => {
  try {
    if (await tableExists('patients')) {
      const [rows] = await pool.query(`
        SELECT p.appointment_id, p.source_patient_id, p.sex, p.age, s.code AS service_type,
               p.requested_datetime, p.duration_hours, p.nurses_needed, p.real_dataset_status,
               sr.status AS schedule_status, sr.scheduled_datetime, sr.scheduled_end_datetime, sr.delay_days
        FROM patients p
        JOIN services s ON s.id = p.service_id
        LEFT JOIN schedule_results sr ON sr.patient_id = p.id AND sr.run_id = (SELECT run_id FROM schedule_results ORDER BY created_at DESC,id DESC LIMIT 1)
        ORDER BY p.requested_datetime DESC
        LIMIT 250`);
      return res.json(rows);
    }
    const [rows] = await pool.query('SELECT * FROM surgical_cases ORDER BY requested_date DESC LIMIT 250');
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/api/resources', async (_req, res, next) => {
  try {
    if (await tableExists('doctors')) {
      const [[doctors], [nurses], [theatres], [beds], [services]] = await Promise.all([
        pool.query('SELECT s.code AS service_type, d.code FROM doctors d JOIN services s ON s.id=d.service_id ORDER BY s.code,d.code'),
        pool.query('SELECT s.code AS service_type, n.code FROM nurses n JOIN services s ON s.id=n.service_id ORDER BY s.code,n.code'),
        pool.query('SELECT s.code AS service_type, t.code FROM theatres t JOIN services s ON s.id=t.service_id ORDER BY s.code,t.code'),
        pool.query('SELECT s.code AS service_type, b.code FROM real_beds b JOIN services s ON s.id=b.service_id ORDER BY s.code,b.code'),
        pool.query('SELECT code, name, uses_theatre, max_delay_days FROM services ORDER BY code')
      ]);
      return res.json({ doctors, nurses, theatres, beds, services });
    }
    const [[staff], [theatres], [beds]] = await Promise.all([
      pool.query('SELECT * FROM staff WHERE active=1'),
      pool.query('SELECT * FROM operating_theatres WHERE active=1'),
      pool.query('SELECT * FROM beds WHERE active=1')
    ]);
    res.json({ staff, theatres, beds, services: [] });
  } catch (e) { next(e); }
});

app.get('/api/schedules/latest', async (_req, res, next) => {
  try {
    if (await tableExists('resource_bookings')) {
      const [rows] = await pool.query(`
        WITH latest_schedule AS (
          SELECT id, patient_id, run_id, algorithm, status, scheduled_datetime, scheduled_end_datetime, delay_days
          FROM schedule_results
          WHERE run_id = (SELECT run_id FROM schedule_results ORDER BY created_at DESC,id DESC LIMIT 1)
            AND status = 'SCHEDULED'
          ORDER BY scheduled_datetime
          LIMIT 300
        )
        SELECT p.appointment_id, p.source_patient_id, s.code AS service_type, ls.algorithm, ls.status,
               ls.scheduled_datetime, ls.scheduled_end_datetime, ls.delay_days,
               GROUP_CONCAT(DISTINCT CASE WHEN rb.resource_type='doctor' THEN rb.resource_code END ORDER BY rb.resource_code) AS doctors,
               GROUP_CONCAT(DISTINCT CASE WHEN rb.resource_type='nurse' THEN rb.resource_code END ORDER BY rb.resource_code) AS nurses,
               GROUP_CONCAT(DISTINCT CASE WHEN rb.resource_type='theatre' THEN rb.resource_code END ORDER BY rb.resource_code) AS theatres,
               GROUP_CONCAT(DISTINCT CASE WHEN rb.resource_type='bed' THEN rb.resource_code END ORDER BY rb.resource_code) AS beds
        FROM latest_schedule ls
        JOIN patients p ON p.id = ls.patient_id
        JOIN services s ON s.id = p.service_id
        LEFT JOIN resource_bookings rb ON rb.patient_id = p.id AND rb.run_id = ls.run_id
        GROUP BY p.id, ls.id, s.code
        ORDER BY ls.scheduled_datetime`);
      return res.json(rows);
    }
    const [rows] = await pool.query(`SELECT so.*,sc.case_ref,sc.procedure_name,sc.priority,ot.name theatre_name,s.name surgeon_name,b.bed_code FROM scheduled_operations so JOIN schedule_runs sr ON sr.id=so.run_id JOIN surgical_cases sc ON sc.id=so.case_id JOIN operating_theatres ot ON ot.id=so.theatre_id JOIN staff s ON s.id=so.surgeon_id JOIN beds b ON b.id=so.bed_id WHERE so.run_id=(SELECT MAX(id) FROM schedule_runs) ORDER BY starts_at`);
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/api/evaluations', async (_req, res, next) => {
  try {
    if (await tableExists('resource_bookings')) return res.json(await realEvaluation());
    const [rows] = await pool.query('SELECT * FROM schedule_runs ORDER BY created_at DESC LIMIT 12');
    res.json({ legacyRuns: rows });
  } catch (e) { next(e); }
});

const workflowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  caseLimit: z.number().int().min(1).max(500).default(100),
  slotMinutes: z.number().int().min(5).max(60).default(30),
  maxSolveSeconds: z.number().int().min(1).max(120).default(30)
});

app.post('/api/workflows/run', async (req, res, next) => {
  try {
    const input = workflowSchema.parse(req.body);
    const result = await runDatabaseWorkflow(input);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/workflows/latest', async (_req, res, next) => {
  try {
    res.json(await latestDatabaseWorkflow());
  } catch (error) {
    next(error);
  }
});

const experimentSchema = z.object({
  sourceRunKey: z.string().trim().min(1).max(100).optional(),
  algorithms: z.array(z.enum([
    'PRIORITY_GREEDY', 'PURE_CP_SAT', 'HYBRID_PRIORITY_CP_SAT',
    'ABLATION_NO_PRIORITY', 'ABLATION_NO_WAITING', 'ABLATION_THROUGHPUT_ONLY'
  ])).min(1).max(6).optional(),
  scenarios: z.array(z.enum(['BASELINE', 'RESOURCE_MODERATE', 'RESOURCE_TIGHT', 'EMERGENCY_SURGE'])).min(1).max(4).optional(),
  caseCounts: z.array(z.number().int().min(1).max(500)).min(1).max(8).optional(),
  repetitions: z.number().int().min(1).max(20).default(3),
  randomSeed: z.number().int().min(0).max(2_147_483_647).default(42),
  maxSolveSeconds: z.number().int().min(1).max(300).default(30),
  suiteType: z.enum(['COMPARISON', 'ABLATION']).default('COMPARISON')
});

app.post('/api/experiments/run', async (req, res, next) => {
  try {
    const input = experimentSchema.parse(req.body ?? {});
    res.status(201).json(await runAlgorithmExperiments(input));
  } catch (error) {
    next(error);
  }
});

app.post('/api/experiments/ablation', async (req, res, next) => {
  try {
    const input = experimentSchema.omit({ algorithms: true, suiteType: true }).parse(req.body ?? {});
    res.status(201).json(await runAlgorithmExperiments({ ...input, suiteType: 'ABLATION' }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/experiments/latest', async (req, res, next) => {
  try {
    const suiteType = z.enum(['COMPARISON', 'ABLATION']).optional().parse(req.query.type);
    res.json(await latestAlgorithmExperiments(suiteType));
  } catch (error) {
    next(error);
  }
});

app.get('/api/experiments', async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(100).default(20).parse(req.query.limit);
    res.json(await listAlgorithmExperimentSuites(limit));
  } catch (error) {
    next(error);
  }
});

app.get('/api/experiments/:suiteKey', async (req, res, next) => {
  try {
    const suiteKey = z.string().trim().min(1).max(100).parse(req.params.suiteKey);
    const suite = await getAlgorithmExperimentSuite(suiteKey);
    if (!suite) return res.status(404).json({ message: 'Experiment suite not found.' });
    res.json(suite);
  } catch (error) {
    next(error);
  }
});

const clinicalNoteSchema = z.object({
  contract_version: z.literal('v1').default('v1'),
  case_id: z.string().trim().min(1).max(100),
  note_text: z.string().trim().min(1).max(20_000),
  language: z.string().trim().min(2).max(20).default('en'),
  source: z.string().trim().min(1).max(50).default('frontend'),
  deidentified: z.boolean().default(true),
  submitted_at: z.string().datetime().nullable().default(null)
});

app.post('/api/nlp/extract', async (req, res, next) => {
  try {
    const input = clinicalNoteSchema.parse(req.body);
    const nlpServiceUrl = (process.env.NLP_SERVICE_URL ?? 'http://127.0.0.1:8101').replace(/\/$/, '');
    const response = await fetch(`${nlpServiceUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120_000)
    });
    const rawBody = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new Error('NLP service returned an invalid response');
    }
    if (!response.ok) {
      const serviceMessage = typeof payload === 'object' && payload && 'message' in payload
        ? String((payload as { message?: unknown }).message)
        : `NLP service returned ${response.status}`;
      return res.status(502).json({ message: serviceMessage });
    }
    res.json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) return next(error);
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return res.status(504).json({ message: 'NLP processing timed out' });
    }
    res.status(502).json({ message: 'NLP service is unavailable' });
  }
});

const actorSchema = z.string().trim().min(1).max(100).default('Scheduler admin');

app.post('/api/intake/process', async (req, res, next) => {
  try {
    const parsed = clinicalNoteSchema.extend({ actor: actorSchema }).parse(req.body);
    const { actor, ...input } = parsed;
    res.status(201).json(await createIntakeCase(input, actor));
  } catch (error) { next(error); }
});

app.get('/api/intake/cases', async (req, res, next) => {
  try {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    res.json(await listIntakeCases(limit));
  } catch (error) { next(error); }
});

app.get('/api/intake/cases/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    res.json(await getIntakeCase(id));
  } catch (error) { next(error); }
});

app.patch('/api/intake/cases/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { case: casePayload, actor } = z.object({ case: reviewedCaseSchema, actor: actorSchema }).parse(req.body);
    res.json(await updateIntakeCase(id, casePayload, actor));
  } catch (error) { next(error); }
});

app.post('/api/intake/cases/:id/approve', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { actor } = z.object({ actor: actorSchema }).parse(req.body);
    res.json(await approveIntakeCase(id, actor));
  } catch (error) { next(error); }
});

app.post('/api/intake/cases/:id/reject', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { actor, reason } = z.object({
      actor: actorSchema,
      reason: z.string().trim().min(1).max(500)
    }).parse(req.body);
    res.json(await rejectIntakeCase(id, actor, reason));
  } catch (error) { next(error); }
});

app.post('/api/intake/cases/:id/schedule', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const input = z.object({
      actor: actorSchema,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      slotMinutes: z.number().int().min(5).max(60).default(30),
      maxSolveSeconds: z.number().int().min(1).max(120).default(30)
    }).parse(req.body);
    res.json(await scheduleIntakeCase(id, input.actor, input));
  } catch (error) { next(error); }
});

app.post('/api/intake/cases/:id/emergency-insert', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const input = z.object({
      actor: actorSchema,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      slotMinutes: z.number().int().min(5).max(60).default(30),
      maxSolveSeconds: z.number().int().min(1).max(120).default(30),
      freezeMinutes: z.number().int().min(0).max(600).default(60)
    }).parse(req.body);
    res.json(await insertEmergencyCase(id, input.actor, input));
  } catch (error) { next(error); }
});

app.get('/api/reschedules/latest', async (_req, res, next) => {
  try { res.json(await latestRescheduleRun()); } catch (error) { next(error); }
});

app.get('/api/schedules/locks', async (_req, res, next) => {
  try { res.json(await listScheduleLocks()); } catch (error) { next(error); }
});

app.post('/api/schedules/locks', async (req, res, next) => {
  try {
    const input = z.object({
      caseId: z.string().trim().min(1).max(100),
      actor: actorSchema,
      reason: z.string().trim().min(1).max(500)
    }).parse(req.body);
    res.status(201).json(await lockScheduledCase(input.caseId, input.actor, input.reason));
  } catch (error) { next(error); }
});

app.delete('/api/schedules/locks/:caseId', async (req, res, next) => {
  try {
    const caseId = z.string().trim().min(1).max(100).parse(req.params.caseId);
    res.json(await unlockScheduledCase(caseId));
  } catch (error) { next(error); }
});

app.post('/api/schedules/generate', async (req, res, next) => {
  try {
    const input = z.object({ algorithm: z.enum(['GREEDY', 'PRIORITY_FIT']), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
    const started = performance.now();
    const [cases, staff, theatres, beds] = await Promise.all([
      pool.query("SELECT * FROM surgical_cases WHERE status='WAITING'"),
      pool.query('SELECT * FROM staff WHERE active=1'),
      pool.query('SELECT * FROM operating_theatres WHERE active=1'),
      pool.query('SELECT * FROM beds WHERE active=1')
    ]);
    const result = buildSchedule(cases[0] as Case[], staff[0] as Resource[], theatres[0] as Resource[], beds[0] as Bed[], input.date, input.algorithm as Algorithm);
    const runtime = Math.max(1, Math.round(performance.now() - started));
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [runResult] = await connection.execute('INSERT INTO schedule_runs (algorithm,schedule_date,scheduled_count,unscheduled_count,theatre_utilisation,runtime_ms) VALUES (?,?,?,?,?,?)', [input.algorithm, input.date, result.allocations.length, result.rejected.length, result.utilisation, runtime]);
      const runId = (runResult as any).insertId;
      for (const a of result.allocations) await connection.execute('INSERT INTO scheduled_operations (run_id,case_id,theatre_id,surgeon_id,anaesthetist_id,nurse_id,bed_id,starts_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?)', [runId, a.caseId, a.theatreId, a.surgeonId, a.anaesthetistId, a.nurseId, a.bedId, a.start, a.end]);
      await connection.commit();
      res.status(201).json({ runId, runtimeMs: runtime, ...result });
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  } catch (e) { next(e); }
});

async function tableExists(table: string) {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [table]);
  return Number((rows as any[])[0]?.n ?? 0) > 0;
}

async function realDashboard() {
  const [[summaryRows], [serviceRows], [caseRows], [scheduleRows], [resourceRows]] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) AS totalCases,
        SUM(sr.status='SCHEDULED') AS scheduledCases,
        SUM(sr.status='UNSCHEDULED') AS unscheduledCases,
        ROUND(AVG(CASE WHEN sr.status='SCHEDULED' THEN sr.delay_days END),2) AS avgDelayDays,
        ROUND(AVG(p.duration_hours),2) AS avgDurationHours
      FROM patients p
      LEFT JOIN schedule_results sr ON sr.patient_id=p.id AND sr.run_id=(SELECT run_id FROM schedule_results ORDER BY created_at DESC,id DESC LIMIT 1)`),
    pool.query(`SELECT s.code AS service_type, COUNT(*) AS cases FROM patients p JOIN services s ON s.id=p.service_id GROUP BY s.code ORDER BY cases DESC`),
    pool.query(`
      SELECT p.appointment_id, s.code AS service_type, p.requested_datetime, p.duration_hours,
             COALESCE(sr.status,'UNSCHEDULED') AS schedule_status, sr.delay_days
      FROM patients p
      JOIN services s ON s.id=p.service_id
      LEFT JOIN schedule_results sr ON sr.patient_id=p.id AND sr.run_id=(SELECT run_id FROM schedule_results ORDER BY created_at DESC,id DESC LIMIT 1)
      ORDER BY p.requested_datetime DESC
      LIMIT 40`),
    pool.query(`
      SELECT DATE(sr.scheduled_datetime) AS schedule_date, COUNT(*) AS scheduled
      FROM schedule_results sr
      WHERE sr.status='SCHEDULED'
      GROUP BY DATE(sr.scheduled_datetime)
      ORDER BY schedule_date DESC
      LIMIT 14`),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM doctors) AS doctors,
        (SELECT COUNT(*) FROM nurses) AS nurses,
        (SELECT COUNT(*) FROM theatres) AS theatres,
        (SELECT COUNT(*) FROM real_beds) AS beds`)
  ]);
  return {
    summary: (summaryRows as any[])[0],
    services: serviceRows,
    cases: caseRows,
    scheduleTrend: scheduleRows,
    resources: (resourceRows as any[])[0]
  };
}

async function legacyDashboard() {
  const [[counts], [cases], [staff], [theatres], [beds]] = await Promise.all([
    pool.query(`SELECT (SELECT COUNT(*) FROM surgical_cases WHERE status='WAITING') waitingCases,(SELECT COUNT(*) FROM staff WHERE active=1) activeStaff,(SELECT COUNT(*) FROM operating_theatres WHERE active=1) theatres,(SELECT COUNT(*) FROM beds WHERE active=1) beds`),
    pool.query('SELECT * FROM surgical_cases ORDER BY FIELD(priority,\'EMERGENCY\',\'URGENT\',\'ROUTINE\'), requested_date LIMIT 20'),
    pool.query('SELECT * FROM staff WHERE active=1'),
    pool.query('SELECT * FROM operating_theatres WHERE active=1'),
    pool.query('SELECT * FROM beds WHERE active=1')
  ]);
  return { summary: (counts as any[])[0], cases, staff, theatres, beds };
}

async function realEvaluation() {
  const [[overallRows], [conflictRows], [workloadRows], [utilRows], [importRows], [moduleRows]] = await Promise.all([
    pool.query(`
      SELECT sr.run_id, sr.algorithm,
             COUNT(*) AS total_cases,
             SUM(sr.status='SCHEDULED') AS scheduled_cases,
             SUM(sr.status='UNSCHEDULED') AS unscheduled_cases,
             ROUND(AVG(CASE WHEN sr.status='SCHEDULED' THEN sr.delay_days END),2) AS avg_delay_days,
             ROUND(AVG(CASE WHEN sr.status='SCHEDULED' THEN TIMESTAMPDIFF(MINUTE, sr.scheduled_datetime, sr.scheduled_end_datetime)/60 END),2) AS avg_duration_hours
      FROM schedule_results sr
      GROUP BY sr.run_id, sr.algorithm
      ORDER BY MAX(sr.created_at) DESC
      LIMIT 5`),
    pool.query(`
      SELECT resource_type, conflict_pairs
      FROM evaluation_conflict_summary
      WHERE run_id = (SELECT run_id FROM schedule_results ORDER BY created_at DESC,id DESC LIMIT 1)
      ORDER BY resource_type`),
    pool.query(`
      SELECT resource_code AS doctor_id,
             ROUND(SUM(TIMESTAMPDIFF(MINUTE,start_datetime,end_datetime))/60,2) AS total_hours
      FROM resource_bookings
      WHERE resource_type='doctor'
        AND run_id=(SELECT run_id FROM schedule_results ORDER BY created_at DESC,id DESC LIMIT 1)
      GROUP BY resource_code
      ORDER BY total_hours DESC
      LIMIT 20`),
    pool.query(`
      SELECT resource_type,
             COUNT(DISTINCT resource_code) AS resources_used,
             ROUND(SUM(TIMESTAMPDIFF(MINUTE,start_datetime,end_datetime))/60,2) AS booked_hours
      FROM resource_bookings
      WHERE run_id=(SELECT run_id FROM schedule_results ORDER BY created_at DESC,id DESC LIMIT 1)
      GROUP BY resource_type`),
    pool.query('SELECT * FROM import_audit ORDER BY imported_at DESC LIMIT 5'),
    pool.query(`
      SELECT r.run_key,r.algorithm,r.status,e.metrics_json,e.conflicts_json,e.workload_json,e.generated_at
      FROM evaluation_reports e
      JOIN optimization_runs r ON r.id=e.optimization_run_id
      ORDER BY e.generated_at DESC,e.id DESC
      LIMIT 1`)
  ]);
  const workloads = workloadRows as any[];
  const hours = workloads.map((w) => Number(w.total_hours));
  const mean = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;
  const variance = hours.length ? hours.reduce((a, b) => a + (b - mean) ** 2, 0) / hours.length : 0;
  const moduleRow = (moduleRows as any[])[0];
  const jsonObject = (value: unknown) => {
    if (!value) return {};
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return {}; }
    }
    return value;
  };
  return {
    overall: overallRows,
    conflicts: conflictRows,
    workloadTop: workloadRows,
    utilisation: utilRows,
    importAudit: importRows,
    moduleReport: moduleRow ? {
      runKey: moduleRow.run_key,
      algorithm: moduleRow.algorithm,
      status: moduleRow.status,
      metrics: jsonObject(moduleRow.metrics_json),
      conflicts: jsonObject(moduleRow.conflicts_json),
      workload: jsonObject(moduleRow.workload_json),
      generatedAt: moduleRow.generated_at
    } : null,
    workloadBalance: {
      doctorCount: hours.length,
      meanHours: Number(mean.toFixed(2)),
      standardDeviationHours: Number(Math.sqrt(variance).toFixed(2)),
      fairnessIndex: mean ? Number((1 / (1 + Math.sqrt(variance) / mean)).toFixed(3)) : 0
    }
  };
}

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  const status = err instanceof z.ZodError ? 400 : Number(err?.statusCode ?? 500);
  res.status(status).json({
    message: err instanceof z.ZodError
      ? 'Invalid request parameters'
      : status < 500 && err instanceof Error
        ? err.message
        : 'Server error'
  });
});

app.listen(Number(process.env.PORT ?? 4000), () => console.log('API ready on http://localhost:4000'));
