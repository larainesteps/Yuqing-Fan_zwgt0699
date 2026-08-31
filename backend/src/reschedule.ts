import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from './db.js';
import {
  getIntakeCase,
  IntakeError,
  reviewedCaseSchema,
  schedulingExtraction
} from './intake.js';
import {
  runDatabaseWorkflow,
  type CaseExtraction,
  type ContinuityAssignment
} from './workflow.js';

type BaselineRunRow = RowDataPacket & {
  id: number;
  run_key: string;
  request_json: unknown;
  horizon_start: string;
};

type BaselineAssignmentRow = RowDataPacket & {
  external_case_id: string;
  start_datetime: string;
  end_datetime: string;
  resources_json: unknown;
};

type Allocation = {
  case_id: string;
  status: 'SCHEDULED' | 'UNSCHEDULED';
  start_datetime: string | null;
  end_datetime: string | null;
  resources: Array<{ resource_code: string }>;
  rejection_code: string | null;
  rejection_reason: string | null;
};

type ScheduleChange = {
  caseId: string;
  changeType: 'UNCHANGED' | 'MOVED' | 'RESOURCE_CHANGED' | 'MOVED_AND_RESOURCE_CHANGED' | 'DROPPED' | 'INSERTED' | 'REJECTED';
  locked: boolean;
  previousStart: string | null;
  nextStart: string | null;
  shiftMinutes: number | null;
  resourceChanges: number;
  rejectionCode: string | null;
  rejectionReason: string | null;
};

function jsonValue<T>(value: unknown): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

function iso(value: string) {
  return new Date(value.replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z')).toISOString();
}

function resourceCodes(value: unknown) {
  const resources = jsonValue<Array<{ resource_code?: string }>>(value) ?? [];
  return resources.map((resource) => resource.resource_code).filter((code): code is string => Boolean(code));
}

function sameSet(first: string[], second: string[]) {
  const a = new Set(first);
  const b = new Set(second);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

export async function listScheduleLocks() {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT l.external_case_id AS caseId,l.lock_reason AS reason,l.actor,
           l.created_at AS createdAt,l.updated_at AS updatedAt
    FROM schedule_case_locks l ORDER BY l.updated_at DESC`);
  return rows;
}

export async function lockScheduledCase(caseId: string, actor: string, reason: string) {
  const [patients] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM patients WHERE appointment_id=? LIMIT 1', [caseId]
  );
  if (!patients.length) throw new IntakeError('The case does not exist in the patient database.', 404);
  await pool.execute(`
    INSERT INTO schedule_case_locks (external_case_id,patient_id,lock_reason,actor)
    VALUES (?,?,?,?)
    ON DUPLICATE KEY UPDATE patient_id=VALUES(patient_id),lock_reason=VALUES(lock_reason),
      actor=VALUES(actor),updated_at=NOW()`, [caseId, patients[0].id, reason, actor]);
  return listScheduleLocks();
}

export async function unlockScheduledCase(caseId: string) {
  const [result] = await pool.execute<ResultSetHeader>(
    'DELETE FROM schedule_case_locks WHERE external_case_id=?', [caseId]
  );
  if (!result.affectedRows) throw new IntakeError('The case is not locked.', 404);
  return listScheduleLocks();
}

export async function insertEmergencyCase(
  reviewId: number,
  actor: string,
  input: {
    date: string;
    slotMinutes: number;
    maxSolveSeconds: number;
    freezeMinutes: number;
  }
) {
  const review = await getIntakeCase(reviewId) as any;
  if (review.status !== 'APPROVED') {
    throw new IntakeError('The emergency case must be approved before insertion.', 409);
  }
  if (!['EMERGENCY', 'URGENT'].includes(review.case.urgency)) {
    throw new IntakeError('Dynamic insertion is restricted to urgent or emergency cases.', 409);
  }
  if (!review.serviceCode) throw new IntakeError('The approved case has no normalized service.', 409);

  const [baselineRows] = await pool.query<BaselineRunRow[]>(`
    SELECT id,run_key,request_json,horizon_start
    FROM optimization_runs
    WHERE DATE(horizon_start)=? AND status IN ('OPTIMAL','FEASIBLE')
    ORDER BY id DESC LIMIT 1`, [input.date]);
  const baseline = baselineRows[0];
  if (!baseline) {
    throw new IntakeError('No successful schedule exists for the selected date.', 409);
  }
  const [assignmentRows] = await pool.query<BaselineAssignmentRow[]>(`
    SELECT external_case_id,start_datetime,end_datetime,resources_json
    FROM optimization_assignments
    WHERE optimization_run_id=? AND status='SCHEDULED'
    ORDER BY start_datetime,external_case_id`, [baseline.id]);
  if (!assignmentRows.length) throw new IntakeError('The baseline run has no scheduled cases.', 409);

  const baselineRequest = jsonValue<{
    cases?: Array<{ case?: CaseExtraction }>;
  }>(baseline.request_json);
  const baselineExtractions = new Map(
    (baselineRequest.cases ?? [])
      .filter((item): item is { case: CaseExtraction } => Boolean(item.case?.case_id))
      .map((item) => [item.case.case_id, item.case])
  );
  const preferredAssignments: ContinuityAssignment[] = assignmentRows.map((row) => ({
    case_id: row.external_case_id,
    start_datetime: iso(row.start_datetime),
    end_datetime: iso(row.end_datetime),
    resource_codes: resourceCodes(row.resources_json)
  }));
  const baselineIds = preferredAssignments.map((assignment) => assignment.case_id);
  const [manualLockRows] = await pool.query<RowDataPacket[]>(`
    SELECT external_case_id FROM schedule_case_locks WHERE external_case_id IN (?)`, [baselineIds]);
  const manualLocks = new Set(manualLockRows.map((row) => String(row.external_case_id)));
  const horizonStart = new Date(`${input.date}T08:00:00Z`);
  const freezeBefore = new Date(horizonStart.getTime() + input.freezeMinutes * 60_000);
  const lockedAssignments = preferredAssignments.filter((assignment) =>
    manualLocks.has(assignment.case_id) || new Date(assignment.start_datetime) < freezeBefore
  );
  const emergencyExtraction = schedulingExtraction(
    reviewedCaseSchema.parse(review.case) as CaseExtraction,
    review.serviceCode
  );
  const caseIds = [...new Set([...baselineIds, review.caseId])];
  const extractionOverrides = [
    ...baselineIds.map((caseId) => baselineExtractions.get(caseId)).filter((value): value is CaseExtraction => Boolean(value)),
    emergencyExtraction
  ];

  const workflow = await runDatabaseWorkflow({
    date: input.date,
    caseLimit: Math.min(12, caseIds.length),
    slotMinutes: input.slotMinutes,
    maxSolveSeconds: input.maxSolveSeconds,
    caseIds,
    extractionOverrides,
    lockedAssignments,
    preferredAssignments,
    runType: 'EMERGENCY_INSERTION',
    baselineRunKey: baseline.run_key
  });
  const resultByCase = new Map(
    (workflow.result.allocations as Allocation[]).map((allocation) => [allocation.case_id, allocation])
  );
  const changes: ScheduleChange[] = preferredAssignments.map((previous): ScheduleChange => {
    const next = resultByCase.get(previous.case_id);
    if (!next || next.status !== 'SCHEDULED' || !next.start_datetime || !next.end_datetime) {
      return {
        caseId: previous.case_id,
        changeType: 'DROPPED',
        locked: lockedAssignments.some((entry) => entry.case_id === previous.case_id),
        previousStart: previous.start_datetime,
        nextStart: null,
        shiftMinutes: null,
        resourceChanges: previous.resource_codes.length,
        rejectionCode: next?.rejection_code ?? null,
        rejectionReason: next?.rejection_reason ?? null
      };
    }
    const nextCodes = next.resources.map((resource) => resource.resource_code);
    const shiftMinutes = Math.round(
      Math.abs(new Date(next.start_datetime).getTime() - new Date(previous.start_datetime).getTime()) / 60_000
    );
    const resourcesChanged = !sameSet(previous.resource_codes, nextCodes);
    const resourceChangeCount = new Set(
      [...previous.resource_codes.filter((code) => !nextCodes.includes(code)), ...nextCodes.filter((code) => !previous.resource_codes.includes(code))]
    ).size;
    return {
      caseId: previous.case_id,
      changeType: shiftMinutes === 0 && !resourcesChanged
        ? 'UNCHANGED'
        : shiftMinutes > 0 && resourcesChanged ? 'MOVED_AND_RESOURCE_CHANGED'
          : shiftMinutes > 0 ? 'MOVED' : 'RESOURCE_CHANGED',
      locked: lockedAssignments.some((entry) => entry.case_id === previous.case_id),
      previousStart: previous.start_datetime,
      nextStart: next.start_datetime,
      shiftMinutes,
      resourceChanges: resourceChangeCount,
      rejectionCode: null,
      rejectionReason: null
    };
  });
  const emergencyAllocation = resultByCase.get(review.caseId);
  if (!emergencyAllocation) throw new IntakeError('Optimizer returned no emergency allocation.', 502);
  changes.push({
    caseId: review.caseId,
    changeType: emergencyAllocation.status === 'SCHEDULED' ? 'INSERTED' : 'REJECTED',
    locked: false,
    previousStart: null,
    nextStart: emergencyAllocation.start_datetime,
    shiftMinutes: null,
    resourceChanges: emergencyAllocation.resources.length,
    rejectionCode: emergencyAllocation.rejection_code,
    rejectionReason: emergencyAllocation.rejection_reason
  });
  const impact = {
    unchangedCases: changes.filter((change) => change.changeType === 'UNCHANGED').length,
    movedCases: changes.filter((change) => ['MOVED', 'RESOURCE_CHANGED', 'MOVED_AND_RESOURCE_CHANGED'].includes(change.changeType)).length,
    droppedCases: changes.filter((change) => change.changeType === 'DROPPED').length,
    insertedCases: changes.filter((change) => change.changeType === 'INSERTED').length,
    totalShiftMinutes: changes.reduce((sum, change) => sum + (change.shiftMinutes ?? 0), 0),
    resourceChanges: changes.reduce((sum, change) => sum + change.resourceChanges, 0),
    lockedCases: lockedAssignments.length
  };
  const nextStatus = emergencyAllocation.status === 'SCHEDULED' ? 'SCHEDULED' : 'APPROVED';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`
      INSERT INTO reschedule_runs
        (optimization_run_id,baseline_run_key,emergency_case_review_id,emergency_case_id,
         freeze_before_datetime,actor,status,unchanged_cases,moved_cases,dropped_cases,
         inserted_cases,total_shift_minutes,resource_changes,changes_json)
      VALUES (?,?,?,?,?,?,'COMPLETED',?,?,?,?,?,?,?)`, [
      workflow.runId, baseline.run_key, reviewId, review.caseId,
      freezeBefore.toISOString().slice(0, 19).replace('T', ' '), actor,
      impact.unchangedCases, impact.movedCases, impact.droppedCases, impact.insertedCases,
      impact.totalShiftMinutes, impact.resourceChanges, JSON.stringify(changes)
    ]);
    await connection.execute(`
      UPDATE case_reviews
      SET status=?,reviewer=?,last_run_key=?,last_schedule_status=?,
          last_rejection_code=?,last_rejection_reason=?,scheduled_at=IF(?='SCHEDULED',NOW(),scheduled_at)
      WHERE id=?`, [
      nextStatus, actor, workflow.runKey, emergencyAllocation.status,
      emergencyAllocation.rejection_code, emergencyAllocation.rejection_reason,
      emergencyAllocation.status, reviewId
    ]);
    await connection.execute(`
      INSERT INTO case_audit_events
        (case_review_id,actor,action,before_json,after_json,details_json)
      VALUES (?,?, 'EMERGENCY_RESCHEDULE',?,?,?)`, [
      reviewId, actor, JSON.stringify({ status: review.status, baseline_run_key: baseline.run_key }),
      JSON.stringify({ status: nextStatus, run_key: workflow.runKey, allocation_status: emergencyAllocation.status }),
      JSON.stringify(impact)
    ]);

    // A case displaced by the insertion is no longer in the schedule, so its review row must
    // stop claiming that it is. Without this the status stays SCHEDULED while the current run
    // does not contain the case, and the case list shows a patient as scheduled after their
    // slot has been taken. The case returns to APPROVED — it is still approved for surgery,
    // simply not placed — carrying the reason it was displaced.
    for (const change of changes) {
      if (change.changeType !== 'DROPPED') continue;
      await connection.execute(`
        UPDATE case_reviews
        SET status='APPROVED',reviewer=?,last_run_key=?,last_schedule_status='UNSCHEDULED',
            last_rejection_code=?,last_rejection_reason=?
        WHERE external_case_id=? AND status='SCHEDULED'`, [
        actor, workflow.runKey,
        change.rejectionCode ?? 'DISPLACED_BY_EMERGENCY',
        change.rejectionReason ?? `Displaced when emergency case ${review.caseId} was inserted.`,
        change.caseId
      ]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return {
    review: await getIntakeCase(reviewId),
    workflow,
    baselineRunKey: baseline.run_key,
    freezeBefore: freezeBefore.toISOString(),
    impact,
    changes,
    emergencyAllocation
  };
}

export async function latestRescheduleRun() {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT rr.*,r.run_key,r.algorithm,r.status AS optimizer_status
    FROM reschedule_runs rr
    JOIN optimization_runs r ON r.id=rr.optimization_run_id
    ORDER BY rr.created_at DESC,rr.id DESC LIMIT 1`);
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: Number(row.id),
    runKey: row.run_key,
    baselineRunKey: row.baseline_run_key,
    emergencyCaseId: row.emergency_case_id,
    freezeBefore: row.freeze_before_datetime,
    actor: row.actor,
    status: row.status,
    optimizerStatus: row.optimizer_status,
    algorithm: row.algorithm,
    impact: {
      unchangedCases: Number(row.unchanged_cases),
      movedCases: Number(row.moved_cases),
      droppedCases: Number(row.dropped_cases),
      insertedCases: Number(row.inserted_cases),
      totalShiftMinutes: Number(row.total_shift_minutes),
      resourceChanges: Number(row.resource_changes)
    },
    changes: jsonValue(row.changes_json),
    createdAt: row.created_at
  };
}
