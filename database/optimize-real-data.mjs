import mysql from 'mysql2/promise';
import 'dotenv/config';

const requestedRunId = process.argv[2];
const resourceTypes = ['doctor', 'nurse', 'theatre', 'bed'];

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '123456',
    database: process.env.DB_NAME ?? 'theatre_flow',
    connectionLimit: 2
  });
  const connection = await pool.getConnection();
  const startedAt = Date.now();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS evaluation_conflict_summary (
        run_id VARCHAR(50) NOT NULL,
        resource_type ENUM('doctor','nurse','theatre','bed') NOT NULL,
        conflict_pairs BIGINT UNSIGNED NOT NULL DEFAULT 0,
        computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (run_id, resource_type)
      )`);

    const [runRows] = await connection.query(
      requestedRunId
        ? 'SELECT ? AS run_id'
        : 'SELECT MAX(run_id) AS run_id FROM resource_bookings',
      requestedRunId ? [requestedRunId] : []
    );
    const runId = runRows[0]?.run_id;
    if (!runId) throw new Error('No imported resource booking run was found.');

    const [indexRows] = await connection.query(`
      SELECT COUNT(*) AS total
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'resource_bookings'
        AND index_name = 'ix_booking_run_resource_time'`);
    if (Number(indexRows[0]?.total ?? 0) === 0) {
      await connection.query(`
        ALTER TABLE resource_bookings
        ADD INDEX ix_booking_run_resource_time
          (run_id, resource_type, resource_code, start_datetime, end_datetime)`);
    }

    await connection.query('ANALYZE TABLE patients, schedule_results, resource_bookings');

    const [conflictRows] = await connection.query(`
      WITH raw_events AS (
        SELECT resource_type, resource_code, start_datetime AS event_time, 1 AS starts, 0 AS ends
        FROM resource_bookings WHERE run_id = ?
        UNION ALL
        SELECT resource_type, resource_code, end_datetime AS event_time, 0 AS starts, 1 AS ends
        FROM resource_bookings WHERE run_id = ?
      ), grouped_events AS (
        SELECT resource_type, resource_code, event_time, SUM(starts) AS starts, SUM(ends) AS ends
        FROM raw_events
        GROUP BY resource_type, resource_code, event_time
      ), timeline AS (
        SELECT resource_type, resource_code, event_time, starts, ends,
          COALESCE(SUM(starts - ends) OVER (
            PARTITION BY resource_type, resource_code
            ORDER BY event_time
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0) AS active_before
        FROM grouped_events
      )
      SELECT resource_type,
             CAST(SUM(
               starts * GREATEST(active_before - ends, 0)
               + starts * (starts - 1) / 2
             ) AS UNSIGNED) AS conflict_pairs
      FROM timeline
      GROUP BY resource_type`, [runId, runId]);

    const counts = new Map(conflictRows.map((row) => [row.resource_type, Number(row.conflict_pairs)]));
    await connection.beginTransaction();
    try {
      await connection.query('DELETE FROM evaluation_conflict_summary WHERE run_id = ?', [runId]);
      await connection.query(
        'INSERT INTO evaluation_conflict_summary (run_id, resource_type, conflict_pairs) VALUES ?',
        [resourceTypes.map((type) => [runId, type, counts.get(type) ?? 0])]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    console.log(JSON.stringify({
      runId,
      conflicts: Object.fromEntries(resourceTypes.map((type) => [type, counts.get(type) ?? 0])),
      elapsedMs: Date.now() - startedAt
    }, null, 2));
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
