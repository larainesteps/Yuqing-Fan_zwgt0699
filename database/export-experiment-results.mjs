import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../backend/dist/db.js';

const parseJson = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') return JSON.parse(value);
  return value;
};

const csvCell = (value) => {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const toCsv = (rows) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
  ].join('\r\n') + '\r\n';
};

const metricColumns = [
  'algorithmCode', 'scenarioCode', 'caseCount', 'repetitions', 'scheduledCases',
  'unscheduledCases', 'theatreUtilisationPercent', 'averageWaitingHours',
  'maxWaitingHours', 'emergencyAverageWaitingHours', 'conflictCount',
  'hardConstraintViolations', 'jainFairnessIndex', 'continuityMovedCases', 'runtimeMs'
];

const summaryRows = (suite) => parseJson(suite.summary_json).map((row) =>
  Object.fromEntries(metricColumns.map((column) => [column, row[column]]))
);

const rawRows = (rows) => rows.map((row) => ({
  algorithmCode: row.algorithm_code,
  scenarioCode: row.scenario_code,
  caseCount: row.case_count,
  repetition: row.repetition_number,
  randomSeed: row.random_seed,
  solverAlgorithm: row.solver_algorithm,
  solverStatus: row.solver_status,
  scheduledCases: row.scheduled_cases,
  unscheduledCases: row.unscheduled_cases,
  theatreUtilisationPercent: row.theatre_utilisation_percent,
  averageWaitingHours: row.average_waiting_hours,
  maxWaitingHours: row.max_waiting_hours,
  emergencyAverageWaitingHours: row.emergency_average_waiting_hours,
  conflictCount: row.conflict_count,
  hardConstraintViolations: row.hard_constraint_violations,
  jainFairnessIndex: row.jain_fairness_index,
  continuityMovedCases: row.continuity_moved_cases,
  runtimeMs: row.runtime_ms,
  createdAt: row.created_at
}));

async function latestSuite(type, requestedKey) {
  const params = requestedKey ? [requestedKey, type] : [type];
  const where = requestedKey ? 'suite_key=? AND suite_type=?' : "suite_type=? AND status='COMPLETED'";
  const [rows] = await pool.query(`
    SELECT id,suite_key,source_run_key,suite_type,status,scenario_count,repetition_count,
           random_seed,source_case_count,config_json,summary_json,created_at,completed_at
    FROM experiment_suites WHERE ${where} ORDER BY id DESC LIMIT 1`, params);
  if (!rows[0]) throw new Error(`No completed ${type} experiment suite was found.`);
  const [results] = await pool.query(`
    SELECT algorithm_code,scenario_code,case_count,repetition_number,random_seed,
           solver_algorithm,solver_status,runtime_ms,scheduled_cases,unscheduled_cases,
           theatre_utilisation_percent,average_waiting_hours,max_waiting_hours,
           emergency_average_waiting_hours,conflict_count,hard_constraint_violations,
           jain_fairness_index,continuity_moved_cases,created_at
    FROM experiment_results WHERE experiment_suite_id=?
    ORDER BY case_count,scenario_code,algorithm_code,repetition_number`, [rows[0].id]);
  return { suite: rows[0], results: rawRows(results) };
}

const markdownTable = (rows) => {
  const headers = ['Algorithm', 'Scenario', 'Cases', 'Scheduled', 'Utilisation %', 'Avg wait h', 'Emergency wait h', 'Conflicts', 'Fairness', 'Runtime ms'];
  const body = rows.map((row) => [
    row.algorithmCode, row.scenarioCode, row.caseCount, row.scheduledCases,
    row.theatreUtilisationPercent, row.averageWaitingHours, row.emergencyAverageWaitingHours,
    row.conflictCount, row.jainFairnessIndex, row.runtimeMs
  ]);
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`)
  ].join('\n');
};

const comparison = await latestSuite('COMPARISON', process.env.COMPARISON_SUITE_KEY);
const ablation = await latestSuite('ABLATION', process.env.ABLATION_SUITE_KEY);
const comparisonSummary = summaryRows(comparison.suite);
const ablationSummary = summaryRows(ablation.suite);
const comparisonConfig = parseJson(comparison.suite.config_json);
const ablationConfig = parseJson(ablation.suite.config_json);
const usesReplay = String(comparisonConfig.scalingMethod).includes('replay')
  || String(ablationConfig.scalingMethod).includes('replay');
const folderName = `${comparison.suite.suite_key}__${ablation.suite.suite_key}`;
const outputRoot = path.resolve(process.env.EXPERIMENT_OUTPUT_DIR ?? path.join('docs', 'experiment-results', folderName));
await mkdir(outputRoot, { recursive: true });

const manifest = {
  exportedAt: new Date().toISOString(),
  sourceDataNotice: usesReplay
    ? 'The source workflow contains real imported project records. Scales above the source size use deterministic bootstrap replay and must not be described as additional real patients.'
    : 'All configured case scales are deterministic subsets of unique cases in the real imported source workflow; no bootstrap replay is used.',
  comparison: {
    suiteKey: comparison.suite.suite_key,
    sourceRunKey: comparison.suite.source_run_key,
    sourceCaseCount: comparison.suite.source_case_count,
    status: comparison.suite.status,
    config: comparisonConfig,
    rawResultCount: comparison.results.length,
    summaryResultCount: comparisonSummary.length
  },
  ablation: {
    suiteKey: ablation.suite.suite_key,
    sourceRunKey: ablation.suite.source_run_key,
    sourceCaseCount: ablation.suite.source_case_count,
    status: ablation.suite.status,
    config: ablationConfig,
    rawResultCount: ablation.results.length,
    summaryResultCount: ablationSummary.length
  }
};

const markdown = `# Surgical scheduling experiment results\n\n` +
  `Exported: ${manifest.exportedAt}\n\n` +
  `## Experimental protocol\n\n` +
  `- Comparison suite: \`${manifest.comparison.suiteKey}\`\n` +
  `- Ablation suite: \`${manifest.ablation.suiteKey}\`\n` +
  `- Source workflow: \`${manifest.comparison.sourceRunKey}\` (${manifest.comparison.sourceCaseCount} source cases)\n` +
  `- Case scales: ${manifest.comparison.config.caseCounts.join(', ')}\n` +
  `- Scenarios: ${manifest.comparison.config.scenarios.join(', ')}\n` +
  `- Repetitions: ${manifest.comparison.config.repetitions}; random seeds ${manifest.comparison.config.randomSeed}-${manifest.comparison.config.randomSeed + manifest.comparison.config.repetitions - 1}\n` +
  `- Maximum solver time: ${manifest.comparison.config.maxSolveSeconds} seconds per run\n` +
  `- Scaling method: ${manifest.comparison.config.scalingMethod}\n\n` +
  `> Data note: ${manifest.sourceDataNotice}\n\n` +
  `## Algorithm comparison (mean over repetitions)\n\n${markdownTable(comparisonSummary)}\n\n` +
  `## Ablation study (mean over repetitions)\n\n${markdownTable(ablationSummary)}\n\n` +
  `## Interpretation guardrails\n\n` +
  `- Zero conflicts and zero hard-constraint violations establish feasibility for these runs, but do not prove correctness for every possible input.\n` +
  `- Results at ${manifest.comparison.config.caseCounts.join(', ')} cases use the scaling method recorded above.\n` +
  `- Three repetitions provide an initial comparison; increase the repetition count for final statistical inference.\n`;

await Promise.all([
  writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8'),
  writeFile(path.join(outputRoot, 'comparison-summary.csv'), toCsv(comparisonSummary), 'utf8'),
  writeFile(path.join(outputRoot, 'comparison-raw.csv'), toCsv(comparison.results), 'utf8'),
  writeFile(path.join(outputRoot, 'ablation-summary.csv'), toCsv(ablationSummary), 'utf8'),
  writeFile(path.join(outputRoot, 'ablation-raw.csv'), toCsv(ablation.results), 'utf8'),
  writeFile(path.join(outputRoot, 'results-summary.md'), markdown, 'utf8')
]);

console.log(JSON.stringify({ outputRoot, manifest }, null, 2));
await pool.end();
