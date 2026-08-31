import mysql from 'mysql2/promise';
import 'dotenv/config';

const runId = process.argv[2] ?? 'csv_import_v1';

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '123456',
  database: process.env.DB_NAME ?? 'theatre_flow'
});

const conflictSql = `
SELECT
  a.resource_type,
  a.resource_code,
  COUNT(*) AS conflict_pairs
FROM resource_bookings a
JOIN resource_bookings b
  ON a.id < b.id
 AND a.run_id = b.run_id
 AND a.resource_type = b.resource_type
 AND a.resource_code = b.resource_code
 AND a.start_datetime < b.end_datetime
 AND b.start_datetime < a.end_datetime
WHERE a.run_id = ?
GROUP BY a.resource_type, a.resource_code
ORDER BY conflict_pairs DESC
LIMIT 50`;

const examplesSql = `
SELECT
  a.resource_type,
  a.resource_code,
  p1.appointment_id AS appointment_a,
  p2.appointment_id AS appointment_b,
  a.start_datetime AS start_a,
  a.end_datetime AS end_a,
  b.start_datetime AS start_b,
  b.end_datetime AS end_b
FROM resource_bookings a
JOIN resource_bookings b
  ON a.id < b.id
 AND a.run_id = b.run_id
 AND a.resource_type = b.resource_type
 AND a.resource_code = b.resource_code
 AND a.start_datetime < b.end_datetime
 AND b.start_datetime < a.end_datetime
JOIN patients p1 ON p1.id = a.patient_id
JOIN patients p2 ON p2.id = b.patient_id
WHERE a.run_id = ?
ORDER BY a.resource_type, a.resource_code, a.start_datetime
LIMIT 20`;

try {
  const [summary] = await pool.query(conflictSql, [runId]);
  const [examples] = await pool.query(examplesSql, [runId]);
  const totalPairs = summary.reduce((sum, row) => sum + Number(row.conflict_pairs), 0);
  console.log(JSON.stringify({ runId, resourcesWithConflicts: summary.length, totalConflictPairs: totalPairs, summary, examples }, null, 2));
} finally {
  await pool.end();
}
