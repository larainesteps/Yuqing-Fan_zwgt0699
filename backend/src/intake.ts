import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from './db.js';
import { runDatabaseWorkflow, type CaseExtraction } from './workflow.js';

type PriorityAssessment = {
  contract_version: 'v1';
  case_id: string;
  priority_score: number;
  priority_level: string;
  components: Record<string, number>;
  explanation: string[];
  policy_version: string;
  assessed_at: string;
};

type ReviewRow = RowDataPacket & {
  id: number;
  clinical_note_id: number;
  extraction_id: number;
  patient_id: number | null;
  external_case_id: string;
  status: 'DRAFT' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED' | 'SCHEDULED';
  reviewed_json: unknown;
  priority_json: unknown;
  reviewer: string | null;
  note_text: string;
  language: string;
  source: string;
  service_code: string | null;
  last_run_key: string | null;
  last_schedule_status: string | null;
  last_rejection_code: string | null;
  last_rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export class IntakeError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
  }
}

export const reviewedCaseSchema = z.object({
  contract_version: z.literal('v1').default('v1'),
  case_id: z.string().trim().min(1).max(100),
  procedure: z.string().trim().min(1).max(200),
  speciality: z.string().trim().min(1).max(100),
  urgency: z.enum(['UNKNOWN', 'ROUTINE', 'EXPEDITED', 'URGENT', 'EMERGENCY']),
  requested_datetime: z.string().datetime(),
  estimated_duration_minutes: z.number().int().min(15).max(1440),
  maximum_delay_hours: z.number().int().min(0).max(8760),
  required_doctors: z.array(z.string().trim().min(1).max(100)).max(20),
  required_nurses: z.number().int().min(0).max(20),
  required_theatre_type: z.string().trim().min(1).max(100).nullable(),
  required_bed_type: z.string().trim().min(1).max(100).nullable(),
  constraints: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  human_review_required: z.boolean(),
  evidence: z.array(z.string()).max(50).default([]),
  urgency_confidence: z.number().min(0).max(1).default(0),
  urgency_source: z.enum(['explicit', 'inferred', 'unknown']).default('unknown'),
  recommended_time_window_hours: z.number().int().min(0).max(8760).nullable(),
  urgency_evidence: z.array(z.string()).max(20).default([]),
  warnings: z.array(z.string()).max(50).default([]),
  extractor_version: z.string().trim().min(1).max(100)
});

const serviceUrls = {
  nlp: (process.env.NLP_SERVICE_URL ?? 'http://127.0.0.1:8101').replace(/\/$/, ''),
  priority: (process.env.PRIORITY_SERVICE_URL ?? 'http://127.0.0.1:8102').replace(/\/$/, '')
};

function jsonValue<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

function sqlDate(value: string) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function postJson<T>(url: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => ({ message: 'Service returned invalid JSON' }));
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload
      ? String((payload as { message?: unknown }).message)
      : `${url} returned HTTP ${response.status}`;
    throw new IntakeError(message, 502);
  }
  return payload as T;
}

function presentReview(row: ReviewRow, audit: RowDataPacket[] = []) {
  return {
    id: Number(row.id),
    clinicalNoteId: Number(row.clinical_note_id),
    extractionId: Number(row.extraction_id),
    patientId: row.patient_id ? Number(row.patient_id) : null,
    caseId: row.external_case_id,
    status: row.status,
    case: jsonValue<CaseExtraction>(row.reviewed_json),
    priority: row.priority_json ? jsonValue<PriorityAssessment>(row.priority_json) : null,
    noteText: row.note_text,
    language: row.language,
    source: row.source,
    serviceCode: row.service_code,
    reviewer: row.reviewer,
    lastRunKey: row.last_run_key,
    lastScheduleStatus: row.last_schedule_status,
    lastRejectionCode: row.last_rejection_code,
    lastRejectionReason: row.last_rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    audit: audit.map((event) => ({
      id: Number(event.id),
      actor: event.actor,
      action: event.action,
      before: event.before_json ? jsonValue(event.before_json) : null,
      after: event.after_json ? jsonValue(event.after_json) : null,
      details: event.details_json ? jsonValue(event.details_json) : null,
      createdAt: event.created_at
    }))
  };
}

async function reviewRow(id: number) {
  const [rows] = await pool.query<ReviewRow[]>(`
    SELECT cr.*,cn.note_text,cn.language,cn.source,s.code AS service_code
    FROM case_reviews cr
    JOIN clinical_notes cn ON cn.id=cr.clinical_note_id
    LEFT JOIN patients p ON p.id=cr.patient_id
    LEFT JOIN services s ON s.id=p.service_id
    WHERE cr.id=?`, [id]);
  if (!rows[0]) throw new IntakeError('Intake case was not found.', 404);
  return rows[0];
}

async function addAudit(
  connection: PoolConnection,
  reviewId: number,
  actor: string,
  action: string,
  before: unknown,
  after: unknown,
  details: unknown = null
) {
  await connection.execute(`
    INSERT INTO case_audit_events
      (case_review_id,actor,action,before_json,after_json,details_json)
    VALUES (?,?,?,?,?,?)`, [
    reviewId, actor, action,
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
    details === null ? null : JSON.stringify(details)
  ]);
}

export async function createIntakeCase(input: {
  contract_version: 'v1';
  case_id: string;
  note_text: string;
  language: string;
  source: string;
  deidentified: boolean;
  submitted_at: string | null;
}, actor: string) {
  const extractionPayload = await postJson<unknown>(`${serviceUrls.nlp}/extract`, input);
  const extraction = reviewedCaseSchema.parse(extractionPayload) as CaseExtraction;
  const priority = await postJson<PriorityAssessment>(`${serviceUrls.priority}/score`, extraction, 30_000);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [noteResult] = await connection.execute<ResultSetHeader>(`
      INSERT INTO clinical_notes
        (patient_id,external_case_id,note_text,language,source,deidentified)
      VALUES (NULL,?,?,?,?,?)`, [
      input.case_id, input.note_text, input.language, input.source, input.deidentified
    ]);
    const provider = extraction.extractor_version.toLowerCase().includes('openai') ? 'openai' : 'rules';
    const [extractionResult] = await connection.execute<ResultSetHeader>(`
      INSERT INTO nlp_extractions
        (clinical_note_id,contract_version,provider,model_name,prompt_version,status,output_json,confidence,human_review_required,completed_at)
      VALUES (?,'v1',?,?,?,'REVIEW_REQUIRED',?,?,?,NOW())`, [
      noteResult.insertId, provider, extraction.extractor_version, 'contract-v1',
      JSON.stringify(extraction), extraction.confidence, extraction.human_review_required
    ]);
    const [reviewResult] = await connection.execute<ResultSetHeader>(`
      INSERT INTO case_reviews
        (clinical_note_id,extraction_id,external_case_id,status,reviewed_json,priority_json,reviewer,reviewed_at)
      VALUES (?,?,?,'REVIEW_REQUIRED',?,?,?,NOW())`, [
      noteResult.insertId, extractionResult.insertId, input.case_id,
      JSON.stringify(extraction), JSON.stringify(priority), actor
    ]);
    await addAudit(connection, reviewResult.insertId, actor, 'CREATED', null, extraction, {
      priority_score: priority.priority_score,
      priority_level: priority.priority_level
    });
    await connection.commit();
    return getIntakeCase(reviewResult.insertId);
  } catch (error: any) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new IntakeError('This case reference already exists in the review queue.', 409);
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function listIntakeCases(limit = 50) {
  const [rows] = await pool.query<ReviewRow[]>(`
    SELECT cr.*,cn.note_text,cn.language,cn.source,s.code AS service_code
    FROM case_reviews cr
    JOIN clinical_notes cn ON cn.id=cr.clinical_note_id
    LEFT JOIN patients p ON p.id=cr.patient_id
    LEFT JOIN services s ON s.id=p.service_id
    ORDER BY cr.updated_at DESC,cr.id DESC
    LIMIT ?`, [limit]);
  return rows.map((row) => presentReview(row));
}

export async function getIntakeCase(id: number) {
  const row = await reviewRow(id);
  const [audit] = await pool.query<RowDataPacket[]>(`
    SELECT * FROM case_audit_events WHERE case_review_id=? ORDER BY created_at,id`, [id]);
  return presentReview(row, audit);
}

export async function updateIntakeCase(
  id: number,
  casePayload: unknown,
  actor: string
) {
  const row = await reviewRow(id);
  if (!['DRAFT', 'REVIEW_REQUIRED'].includes(row.status)) {
    throw new IntakeError('Only draft or review-required cases can be edited.', 409);
  }
  const reviewed = reviewedCaseSchema.parse(casePayload) as CaseExtraction;
  if (reviewed.case_id !== row.external_case_id) {
    throw new IntakeError('The case reference cannot be changed during review.');
  }
  const priority = await postJson<PriorityAssessment>(`${serviceUrls.priority}/score`, reviewed, 30_000);
  const before = jsonValue<CaseExtraction>(row.reviewed_json);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`
      UPDATE case_reviews
      SET status='REVIEW_REQUIRED',reviewed_json=?,priority_json=?,reviewer=?,reviewed_at=NOW()
      WHERE id=?`, [JSON.stringify(reviewed), JSON.stringify(priority), actor, id]);
    await connection.execute(`
      UPDATE nlp_extractions
      SET status='REVIEW_REQUIRED',output_json=?,confidence=?,human_review_required=?
      WHERE id=?`, [
      JSON.stringify(reviewed), reviewed.confidence, reviewed.human_review_required, row.extraction_id
    ]);
    await addAudit(connection, id, actor, 'UPDATED', before, reviewed, {
      priority_score: priority.priority_score,
      priority_level: priority.priority_level
    });
    await connection.commit();
    return getIntakeCase(id);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function resolveService(extraction: CaseExtraction) {
  const [services] = await pool.query<RowDataPacket[]>(`
    SELECT id,code,name,uses_theatre FROM services ORDER BY id`);
  const target = normalise(extraction.speciality);
  const exact = services.find((service) =>
    normalise(String(service.code)) === target || normalise(String(service.name)) === target
  );
  if (exact) return exact;
  if (extraction.urgency === 'EMERGENCY') {
    const emergency = services.find((service) => String(service.code).toLowerCase() === 'emergency');
    if (emergency) return emergency;
  }
  const surgery = services.find((service) => String(service.code).toLowerCase() === 'surgery');
  const theatreService = services.find((service) => Number(service.uses_theatre) === 1);
  if (!surgery && !theatreService) throw new IntakeError('No theatre service is configured for approval.', 409);
  return surgery ?? theatreService!;
}

export async function approveIntakeCase(id: number, actor: string) {
  const row = await reviewRow(id);
  if (!['DRAFT', 'REVIEW_REQUIRED'].includes(row.status)) {
    throw new IntakeError('Only a case awaiting review can be approved.', 409);
  }
  const reviewed = reviewedCaseSchema.parse(jsonValue(row.reviewed_json)) as CaseExtraction;
  const priority = await postJson<PriorityAssessment>(`${serviceUrls.priority}/score`, reviewed, 30_000);
  const service = await resolveService(reviewed);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [patientResult] = await connection.execute<ResultSetHeader>(`
      INSERT INTO patients
        (appointment_id,source_patient_id,sex,age,age_group,service_id,requested_datetime,duration_hours,nurses_needed,real_dataset_status,original_duration_minutes)
      VALUES (?,?,NULL,NULL,NULL,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        id=LAST_INSERT_ID(id),service_id=VALUES(service_id),requested_datetime=VALUES(requested_datetime),
        duration_hours=VALUES(duration_hours),nurses_needed=VALUES(nurses_needed),
        real_dataset_status=VALUES(real_dataset_status),original_duration_minutes=VALUES(original_duration_minutes)`, [
      row.external_case_id, `INTAKE-${id}`, Number(service.id), sqlDate(reviewed.requested_datetime),
      reviewed.estimated_duration_minutes / 60, reviewed.required_nurses,
      'approved_intake', reviewed.estimated_duration_minutes
    ]);
    const patientId = patientResult.insertId;
    await connection.execute('UPDATE clinical_notes SET patient_id=? WHERE id=?', [patientId, row.clinical_note_id]);
    await connection.execute(`
      INSERT INTO priority_assessments
        (patient_id,extraction_id,external_case_id,contract_version,policy_version,priority_score,priority_level,components_json,explanation_json,assessed_at)
      VALUES (?,? ,?,'v1',?,?,?,?,?,?)`, [
      patientId, row.extraction_id, row.external_case_id, priority.policy_version,
      priority.priority_score, priority.priority_level, JSON.stringify(priority.components),
      JSON.stringify(priority.explanation), sqlDate(priority.assessed_at)
    ]);
    await connection.execute(`
      UPDATE nlp_extractions SET status='COMPLETED' WHERE id=?`, [row.extraction_id]);
    await connection.execute(`
      UPDATE case_reviews
      SET patient_id=?,status='APPROVED',priority_json=?,reviewer=?,approved_at=NOW()
      WHERE id=?`, [patientId, JSON.stringify(priority), actor, id]);
    await addAudit(connection, id, actor, 'APPROVED', { status: row.status }, {
      status: 'APPROVED', patient_id: patientId, service_code: service.code
    });
    await connection.commit();
    return getIntakeCase(id);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function rejectIntakeCase(id: number, actor: string, reason: string) {
  const row = await reviewRow(id);
  if (!['DRAFT', 'REVIEW_REQUIRED'].includes(row.status)) {
    throw new IntakeError('Only a case awaiting review can be rejected.', 409);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`
      UPDATE case_reviews SET status='REJECTED',reviewer=?,reviewed_at=NOW() WHERE id=?`, [actor, id]);
    await addAudit(connection, id, actor, 'REJECTED', { status: row.status }, {
      status: 'REJECTED', reason
    });
    await connection.commit();
    return getIntakeCase(id);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function schedulingExtraction(reviewed: CaseExtraction, serviceCode: string): CaseExtraction {
  const requiredDoctorCount = Math.max(1, reviewed.required_doctors.length);
  return {
    ...reviewed,
    speciality: serviceCode,
    required_doctors: Array.from({ length: requiredDoctorCount }, () => serviceCode),
    required_theatre_type: serviceCode,
    required_bed_type: reviewed.required_bed_type ? serviceCode : null,
    constraints: {
      ...reviewed.constraints,
      approved_service_code: serviceCode,
      reviewed_requirements: {
        speciality: reviewed.speciality,
        required_doctors: reviewed.required_doctors,
        required_theatre_type: reviewed.required_theatre_type,
        required_bed_type: reviewed.required_bed_type
      }
    },
    warnings: [
      ...reviewed.warnings,
      'Reviewed resource labels were mapped to normalized MySQL service resources for scheduling.'
    ],
    extractor_version: `${reviewed.extractor_version}+human-review`
  };
}

export async function scheduleIntakeCase(
  id: number,
  actor: string,
  input: { date: string; slotMinutes: number; maxSolveSeconds: number }
) {
  const row = await reviewRow(id);
  if (row.status !== 'APPROVED') {
    throw new IntakeError('The case must be approved before scheduling.', 409);
  }
  if (!row.service_code) throw new IntakeError('The approved case has no normalized service.', 409);
  const reviewed = reviewedCaseSchema.parse(jsonValue(row.reviewed_json)) as CaseExtraction;
  const workflow = await runDatabaseWorkflow({
    date: input.date,
    caseLimit: 1,
    slotMinutes: input.slotMinutes,
    maxSolveSeconds: input.maxSolveSeconds,
    caseIds: [row.external_case_id],
    extractionOverrides: [schedulingExtraction(reviewed, row.service_code)]
  });
  const allocation = workflow.result.allocations.find((entry) => entry.case_id === row.external_case_id);
  if (!allocation) throw new IntakeError('Optimizer returned no allocation for the approved case.', 502);
  const nextStatus = allocation.status === 'SCHEDULED' ? 'SCHEDULED' : 'APPROVED';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`
      UPDATE case_reviews
      SET status=?,reviewer=?,last_run_key=?,last_schedule_status=?,
          last_rejection_code=?,last_rejection_reason=?,scheduled_at=IF(?='SCHEDULED',NOW(),scheduled_at)
      WHERE id=?`, [
      nextStatus, actor, workflow.runKey, allocation.status,
      allocation.rejection_code, allocation.rejection_reason, allocation.status, id
    ]);
    await addAudit(connection, id, actor, 'SCHEDULE_ATTEMPT', { status: row.status }, {
      status: nextStatus,
      run_key: workflow.runKey,
      allocation_status: allocation.status,
      rejection_code: allocation.rejection_code
    }, { algorithm: workflow.result.algorithm });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { review: await getIntakeCase(id), workflow, allocation };
}
