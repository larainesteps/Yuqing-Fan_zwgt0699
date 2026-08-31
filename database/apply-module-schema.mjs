import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const root = fileURLToPath(new URL('..', import.meta.url));
dotenv.config({ path: path.join(root, '.env') });

const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '123456',
  database: process.env.DB_NAME ?? 'theatre_flow',
  multipleStatements: true
});

try {
  for (const filename of [
    '002-module-contracts.sql',
    '003-workflow-orchestration.sql',
    '004-hard-constraint-rejections.sql',
    '005-intake-review-workflow.sql',
    '006-dynamic-rescheduling.sql',
    '007-algorithm-experiments.sql',
    '008-experiment-ablation-and-scale.sql'
  ]) {
    const sql = await fs.readFile(path.join(root, 'database', filename), 'utf8');
    await connection.query(sql);
    console.log(`Applied ${filename}`);
  }
} finally {
  await connection.end();
}
