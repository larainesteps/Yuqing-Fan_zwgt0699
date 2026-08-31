import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import mysql from 'mysql2/promise';
import 'dotenv/config';

// The appointment export is not distributed with this repository, so there is no default
// path that would work on another machine.
const sourceFile = process.argv[2];
if (!sourceFile) {
  console.error('Usage: node database/import-real-data.mjs <appointments.csv> [runId]');
  console.error('The appointment export is not part of this repository; supply the path to your own copy.');
  process.exit(1);
}

const schemaFile = new URL('./real-schema.sql', import.meta.url);
const runId = process.argv[3] ?? 'csv_import_v1';
const batchSize = 1000;

const services = {
  surgery: { name: 'Surgery', uses_theatre: 1, prep: 0.5, min: 1, max: 8, delay: 5 },
  ICU: { name: 'Intensive Care Unit', uses_theatre: 0, prep: 0, min: 6, max: 24, delay: 2 },
  emergency: { name: 'Emergency', uses_theatre: 1, prep: 0.25, min: 0.5, max: 6, delay: 0 },
  general_medicine: { name: 'General Medicine', uses_theatre: 0, prep: 0, min: 0.5, max: 8, delay: 7 }
};

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseDateTime(date, time) {
  if (!date || !time) return null;
  const normalizedTime = time.length === 7 ? `0${time}` : time;
  const dt = new Date(`${date}T${normalizedTime}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function sqlDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function fixedWindow(row) {
  const start = parseDateTime(row.surgery_date, row.surgery_start);
  let end = parseDateTime(row.surgery_date, row.surgery_end);
  if (!start || !end) return null;
  let overnight = false;
  while (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    overnight = true;
  }
  return { start, end, overnight };
}

function resourceService(code, fallback) {
  if (code.startsWith('SUR_')) return 'surgery';
  if (code.startsWith('ICU_')) return 'ICU';
  if (code.startsWith('EME_')) return 'emergency';
  if (code.startsWith('GEN_')) return 'general_medicine';
  return fallback;
}

async function executeSqlFile(connection, fileUrl) {
  const sql = fs.readFileSync(fileUrl, 'utf8');
  for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean)) {
    await connection.query(statement);
  }
}

async function loadRows(file) {
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  const rows = [];
  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line.replace(/^\uFEFF/, ''));
      continue;
    }
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    rows.push(row);
  }
  return rows;
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '123456',
    database: process.env.DB_NAME ?? 'theatre_flow',
    multipleStatements: false
  });
  const connection = await pool.getConnection();
  try {
    await executeSqlFile(connection, schemaFile);
    for (const [code, s] of Object.entries(services)) {
      await connection.execute(
        `INSERT INTO services (code,name,uses_theatre,prep_duration_hours,min_duration_hours,max_duration_hours,max_delay_days)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), uses_theatre=VALUES(uses_theatre), prep_duration_hours=VALUES(prep_duration_hours),
         min_duration_hours=VALUES(min_duration_hours), max_duration_hours=VALUES(max_duration_hours), max_delay_days=VALUES(max_delay_days)`,
        [code, s.name, s.uses_theatre, s.prep, s.min, s.max, s.delay]
      );
    }
    const [serviceRows] = await connection.query('SELECT id, code FROM services');
    const serviceIds = new Map(serviceRows.map((r) => [r.code, r.id]));

    const rows = await loadRows(sourceFile);
    const doctors = new Map();
    const nurses = new Map();
    const theatres = new Map();
    const beds = new Map();
    let invalidRows = 0;
    let overnightFixes = 0;
    const patients = [];
    const schedules = [];
    const bookingRows = [];

    for (const row of rows) {
      const service = row.service_type;
      const serviceId = serviceIds.get(service);
      const requested = parseDateTime(row.appointment_date, row.appointment_time);
      const window = row.schedule_status === 'SCHEDULED' ? fixedWindow(row) : null;
      if (!serviceId || !requested) {
        invalidRows += 1;
        continue;
      }
      if (window?.overnight) overnightFixes += 1;
      const durationHours = window ? (window.end - window.start) / 3600000 : Math.max(0.5, (toNumber(row.original_appointment_duration_minutes, 60) ?? 60) / 60);
      const nursesNeeded = row.assigned_nurses ? row.assigned_nurses.split(',').filter(Boolean).length : 1;
      patients.push([
        row.appointment_id,
        row.patient_id,
        row.sex || null,
        toNumber(row.age),
        row.age_group || null,
        serviceId,
        sqlDate(requested),
        durationHours,
        nursesNeeded,
        row.status || null,
        toNumber(row.original_appointment_duration_minutes)
      ]);
      schedules.push([
        row.appointment_id,
        'IMPORTED_BASELINE',
        row.schedule_status || 'UNSCHEDULED',
        window ? sqlDate(window.start) : null,
        window ? sqlDate(window.end) : null,
        toNumber(row.delay_days),
        runId
      ]);
      if (!window) continue;
      const addResource = (type, code, stage) => {
        if (!code) return;
        const svc = resourceService(code, service);
        const sid = serviceIds.get(svc) ?? serviceId;
        const target = type === 'doctor' ? doctors : type === 'nurse' ? nurses : type === 'theatre' ? theatres : beds;
        target.set(code, sid);
        bookingRows.push([row.appointment_id, runId, type, code, stage, sqlDate(window.start), sqlDate(window.end)]);
      };
      for (const code of row.assigned_doctors.split(',').map((x) => x.trim()).filter(Boolean)) addResource('doctor', code, 'care');
      for (const code of row.assigned_nurses.split(',').map((x) => x.trim()).filter(Boolean)) addResource('nurse', code, 'care');
      addResource('theatre', row.assigned_theatre.trim(), 'procedure');
      addResource('bed', row.assigned_bed.trim(), service === 'ICU' ? 'ward' : 'recovery');
    }

    for (const [table, entries] of [['doctors', doctors], ['nurses', nurses], ['theatres', theatres], ['real_beds', beds]]) {
      for (const chunk of chunks([...entries], batchSize)) {
        const values = chunk.map(([code, serviceId]) => [code, serviceId]);
        await connection.query(`INSERT INTO ${table} (code, service_id) VALUES ? ON DUPLICATE KEY UPDATE service_id=VALUES(service_id)`, [values]);
      }
    }

    await connection.query('DELETE FROM resource_bookings WHERE run_id=?', [runId]);
    await connection.query('DELETE sr FROM schedule_results sr WHERE sr.run_id=?', [runId]);

    for (const chunk of chunks(patients, batchSize)) {
      await connection.query(
        `INSERT INTO patients (appointment_id,source_patient_id,sex,age,age_group,service_id,requested_datetime,duration_hours,nurses_needed,real_dataset_status,original_duration_minutes)
         VALUES ?
         ON DUPLICATE KEY UPDATE source_patient_id=VALUES(source_patient_id), sex=VALUES(sex), age=VALUES(age), age_group=VALUES(age_group),
         service_id=VALUES(service_id), requested_datetime=VALUES(requested_datetime), duration_hours=VALUES(duration_hours),
         nurses_needed=VALUES(nurses_needed), real_dataset_status=VALUES(real_dataset_status), original_duration_minutes=VALUES(original_duration_minutes)`,
        [chunk]
      );
    }

    const [patientRows] = await connection.query('SELECT id, appointment_id FROM patients');
    const patientIds = new Map(patientRows.map((r) => [r.appointment_id, r.id]));
    const scheduleValues = schedules.map((s) => [patientIds.get(s[0]), ...s.slice(1)]).filter((s) => s[0]);
    for (const chunk of chunks(scheduleValues, batchSize)) {
      await connection.query(
        `INSERT INTO schedule_results (patient_id,algorithm,status,scheduled_datetime,scheduled_end_datetime,delay_days,run_id)
         VALUES ?
         ON DUPLICATE KEY UPDATE algorithm=VALUES(algorithm), status=VALUES(status), scheduled_datetime=VALUES(scheduled_datetime),
         scheduled_end_datetime=VALUES(scheduled_end_datetime), delay_days=VALUES(delay_days)`,
        [chunk]
      );
    }

    const resourceIds = await loadResourceIds(connection);
    const bookingValues = bookingRows.map(([appointmentId, run, type, code, stage, start, end]) => {
      const ids = resourceIds[type];
      return [
        patientIds.get(appointmentId), run, type, code, stage, start, end,
        type === 'doctor' ? ids.get(code) : null,
        type === 'nurse' ? ids.get(code) : null,
        type === 'theatre' ? ids.get(code) : null,
        type === 'bed' ? ids.get(code) : null
      ];
    }).filter((b) => b[0]);
    for (const chunk of chunks(bookingValues, batchSize)) {
      await connection.query(
        `INSERT INTO resource_bookings (patient_id,run_id,resource_type,resource_code,stage,start_datetime,end_datetime,doctor_id,nurse_id,theatre_id,bed_id)
         VALUES ?`,
        [chunk]
      );
    }
    await connection.execute(
      'INSERT INTO import_audit (source_file,rows_seen,patients_imported,bookings_imported,overnight_fixes,invalid_rows,run_id) VALUES (?,?,?,?,?,?,?)',
      [path.basename(sourceFile), rows.length, patients.length, bookingValues.length, overnightFixes, invalidRows, runId]
    );
    console.log(JSON.stringify({ rowsSeen: rows.length, patientsImported: patients.length, bookingsImported: bookingValues.length, overnightFixes, invalidRows, runId }, null, 2));
  } finally {
    connection.release();
    await pool.end();
  }
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadResourceIds(connection) {
  const configs = [
    ['doctor', 'doctors'],
    ['nurse', 'nurses'],
    ['theatre', 'theatres'],
    ['bed', 'real_beds']
  ];
  const result = {};
  for (const [type, table] of configs) {
    const [rows] = await connection.query(`SELECT id, code FROM ${table}`);
    result[type] = new Map(rows.map((r) => [r.code, r.id]));
  }
  return result;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
