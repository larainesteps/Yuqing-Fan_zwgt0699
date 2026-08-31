import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Always load the project-level .env, regardless of the process working directory.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'scheduler',
  password: process.env.DB_PASSWORD ?? 'scheduler',
  database: process.env.DB_NAME ?? 'theatre_flow',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});
