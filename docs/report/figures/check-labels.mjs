// A bar label that rounds to 1.0 while the table says 0.97 makes the figure and its table
// disagree. This asserts that every value label in a figure appears verbatim in that
// figure's expected value list.
import { readFileSync } from 'node:fs';

const DIR = process.argv[2];

const expected = {
  'fig-5-2a-throughput': ['7.40', '13.40', '15.20', '24.00', '28.60'],
  'fig-5-2b-waiting': ['1.63', '0.97', '3.96', '2.05', '8.03', '3.64'],
  'fig-5-3a-capacity-throughput': ['7.40', '15.20', '28.60'],
  'fig-5-3b-capacity-utilisation': ['82.5', '55.0', '85.0', '56.7', '79.7', '53.2'],
  'fig-5-4-ablation-waiting': ['0.97', '0.98', '1.47', '1.52', '2.05', '2.01', '2.58', '2.83', '3.62', '3.47', '4.98', '4.58'],
  'fig-5-6-runtime': ['16 ms', '184 ms', '44 ms', '3.387 s', '179 ms', '20.732 s']
};

let bad = 0;
for (const [name, want] of Object.entries(expected)) {
  const src = readFileSync(`${DIR}/${name}.svg`, 'utf8');
  // Bar labels are the bold middle-anchored texts; axis ticks are end-anchored and muted.
  const got = [...src.matchAll(/<text [^>]*text-anchor="middle"[^>]*font-weight="600"[^>]*>([^<]+)<\/text>/g)]
    .map(m => m[1]);
  const missing = want.filter(v => !got.includes(v));
  const extra = got.filter(v => !want.includes(v));
  if (missing.length || extra.length) {
    bad++;
    console.log(`[FAIL] ${name}`);
    if (missing.length) console.log(`        expected but not drawn: ${missing.join(', ')}`);
    if (extra.length) console.log(`        drawn but not expected: ${extra.join(', ')}`);
  } else {
    console.log(`[PASS] ${name.padEnd(32)} ${got.length} labels match the table`);
  }
}
console.log(bad ? `\n${bad} figure(s) disagree with their table` : '\nevery bar label matches its table value');
process.exit(bad ? 1 : 0);
