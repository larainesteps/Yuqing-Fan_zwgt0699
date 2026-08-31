// Layout checker. The earlier version only tested the SVG canvas bounds, which is why it
// passed a bar that had run into the row-label column: the bar was inside the canvas but
// outside its plot area. This checks the regions that actually matter.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2];
// Per-figure plot-area left edge: nothing but axis/row labels may be drawn left of this.
const PLOT_LEFT = { 'fig-5-5-paired-outcomes': 210, default: 60 };

// This checker understands plotted charts: it assumes an axis/row-label column on the left
// that no mark may enter. Diagrams have no such column — their boxes legitimately start at
// the canvas edge — so running it over them reported three failures for figures that were
// correct. Diagram layout is checked by check-diagrams.mjs instead.
const DIAGRAMS = new Set([
  'fig-3-1-architecture',
  'fig-3-2-er-diagram',
  'fig-3-3-review-state-machine',
  'fig-4-1-candidate-enumeration',
  'fig-5-1-opt001-before-after'
]);

let failures = 0;
let skipped = 0;
for (const f of readdirSync(DIR).filter(n => n.endsWith('.svg')).sort()) {
  if (DIAGRAMS.has(f.replace(/\.svg$/, ''))) { skipped += 1; continue; }
  const name = f.replace(/\.svg$/, '');
  const src = readFileSync(join(DIR, f), 'utf8');
  const vb = src.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const [VW, VH] = [parseFloat(vb[1]), parseFloat(vb[2])];
  const left = PLOT_LEFT[name] ?? PLOT_LEFT.default;

  const issues = [];
  if (/NaN|Infinity|undefined/.test(src)) issues.push('non-finite value in markup');

  // Legend rects sit above the plot in their own band; skip them by their 11px size.
  const rects = [...src.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)]
    .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }))
    .filter(r => !(r.w === 11 && r.h === 11));

  for (const r of rects) {
    if (r.w <= 0 || r.h <= 0) issues.push(`zero/negative size rect at x=${r.x}`);
    if (r.x + r.w > VW + 0.5) issues.push(`rect overflows right edge: x+w=${(r.x + r.w).toFixed(1)} > ${VW}`);
    if (r.x < left - 0.5) issues.push(`rect intrudes into the label column: x=${r.x.toFixed(1)} < ${left}`);
  }

  // Value labels drawn inside a bar must not sit left of the plot area either.
  for (const m of src.matchAll(/<text x="([-\d.]+)"[^>]*text-anchor="middle"[^>]*>(\d[\d.]*)<\/text>/g)) {
    const x = parseFloat(m[1]);
    if (x < left - 0.5) issues.push(`value label "${m[2]}" at x=${x.toFixed(1)} sits in the label column`);
  }

  const status = issues.length ? 'FAIL' : 'PASS';
  if (issues.length) failures++;
  console.log(`[${status}] ${name.padEnd(34)} viewBox ${VW}x${VH}, ${rects.length} marks, plot starts x=${left}`);
  for (const i of [...new Set(issues)]) console.log(`        - ${i}`);
}
console.log(
  failures
    ? `\n${failures} figure(s) FAILED`
    : `\nall charts pass layout checks (${skipped} diagram(s) skipped — see check-diagrams.mjs)`
);
process.exit(failures ? 1 : 0);
