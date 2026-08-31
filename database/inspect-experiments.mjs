import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
dotenv.config({ path: path.join(root, '.env') });
const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
const [suites] = await connection.query(`
  SELECT s.id,s.suite_key,s.status,s.source_run_key,s.created_at,s.completed_at,s.error_message,
         COUNT(r.id) AS completed_results
  FROM experiment_suites s LEFT JOIN experiment_results r ON r.experiment_suite_id=s.id
  GROUP BY s.id ORDER BY s.id DESC LIMIT 10`);
console.table(suites);
const [latest] = await connection.query(`SELECT suite_key,summary_json FROM experiment_suites WHERE status='COMPLETED' ORDER BY id DESC LIMIT 1`);
if (latest[0]) {
  const summary = typeof latest[0].summary_json === 'string'
    ? JSON.parse(latest[0].summary_json)
    : latest[0].summary_json;
  console.log(`Latest completed suite: ${latest[0].suite_key}`);
  console.table(summary.map((row) => ({
    algorithm: row.algorithmCode,
    scenario: row.scenarioCode,
    cases: row.caseCount,
    scheduled: row.scheduledCases,
    utilisation: row.theatreUtilisationPercent,
    averageWaitHours: row.averageWaitingHours,
    emergencyWaitHours: row.emergencyAverageWaitingHours,
    conflicts: row.conflictCount,
    fairness: row.jainFairnessIndex,
    runtimeMs: row.runtimeMs
  })));
}
await connection.end();
