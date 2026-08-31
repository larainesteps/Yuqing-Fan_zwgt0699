import { runAlgorithmExperiments } from '../backend/dist/experiments.js';
import { pool } from '../backend/dist/db.js';

const parseList = (value) => value?.split(',').map((item) => item.trim()).filter(Boolean);
const parseNumbers = (value) => parseList(value)?.map(Number).filter(Number.isFinite);

const payload = {
  suiteType: process.argv.includes('--ablation') ? 'ABLATION' : 'COMPARISON',
  algorithms: parseList(process.env.EXPERIMENT_ALGORITHMS),
  scenarios: parseList(process.env.EXPERIMENT_SCENARIOS),
  caseCounts: parseNumbers(process.env.EXPERIMENT_CASE_COUNTS),
  repetitions: Number(process.env.EXPERIMENT_REPETITIONS ?? 3),
  randomSeed: Number(process.env.EXPERIMENT_RANDOM_SEED ?? 42),
  maxSolveSeconds: Number(process.env.EXPERIMENT_MAX_SOLVE_SECONDS ?? 30),
  ...(process.env.EXPERIMENT_SOURCE_RUN ? { sourceRunKey: process.env.EXPERIMENT_SOURCE_RUN } : {})
};

for (const key of Object.keys(payload)) {
  if (payload[key] === undefined) delete payload[key];
}

console.log('Running reproducible algorithm suite ...');
const result = await runAlgorithmExperiments(payload);

console.log(`Suite: ${result.suiteKey}`);
console.log(`Suite type: ${result.suiteType}`);
console.log(`Source workflow: ${result.sourceRunKey}`);
console.table(result.summary.map((row) => ({
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
await pool.end();
