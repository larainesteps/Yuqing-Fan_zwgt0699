// Layout checker for the structural diagrams.
//
// The chart checker only inspected <rect> elements. That missed two real defects in an
// earlier fig-5-1: a tick label placed below the canvas bottom, and a caption drawn on top
// of the last timeline row. Text is where diagram layout actually goes wrong, so this
// checks text baselines and vertical collisions as well as shapes.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2];
const TARGETS = /^fig-(3|4|5-1)/;

// Rough per-character advance for the sizes in use; enough to catch a label running off
// the right edge, not a substitute for real text metrics.
const widthOf = (s, size) => s.length * size * 0.55;

let failures = 0;
for (const f of readdirSync(DIR).filter(n => n.endsWith('.svg') && TARGETS.test(n)).sort()) {
  const src = readFileSync(join(DIR, f), 'utf8');
  const [, W, H] = src.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
  const issues = [];

  if (/NaN|Infinity|undefined/.test(src)) issues.push('non-finite value in markup');

  for (const m of src.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)) {
    const [x, y, w, h] = m.slice(1).map(Number);
    if (w <= 0 || h <= 0) issues.push(`zero/negative rect at (${x},${y})`);
    if (x < -0.5 || y < -0.5 || x + w > W + 0.5 || y + h > H + 0.5)
      issues.push(`rect outside canvas: (${x},${y}) ${w}x${h}`);
  }

  const texts = [];
  for (const m of src.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*text-anchor="(\w+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) {
    const [x, y, anchor, size, body] = [Number(m[1]), Number(m[2]), m[3], Number(m[4]), m[5]];
    const w = widthOf(body, size);
    const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    texts.push({ x0, x1: x0 + w, y, size, body });
    // y is the baseline; descenders sit a little below it.
    if (y + size * 0.25 > H + 0.5) issues.push(`text below canvas: "${body.slice(0, 32)}" baseline y=${y}, canvas ${H}`);
    if (y - size < -0.5) issues.push(`text above canvas: "${body.slice(0, 32)}"`);
    if (x0 < -0.5) issues.push(`text past left edge: "${body.slice(0, 32)}"`);
    if (x0 + w > W + 0.5) issues.push(`text past right edge: "${body.slice(0, 32)}"`);
  }

  // Vertical overlap between texts that also overlap horizontally.
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      const vGap = Math.abs(a.y - b.y);
      const hOverlap = a.x0 < b.x1 - 2 && b.x0 < a.x1 - 2;
      if (hOverlap && vGap < Math.max(a.size, b.size) * 0.75)
        issues.push(`overlapping labels: "${a.body.slice(0, 24)}" / "${b.body.slice(0, 24)}"`);
    }
  }

  const uniq = [...new Set(issues)];
  if (uniq.length) failures++;
  console.log(`[${uniq.length ? 'FAIL' : 'PASS'}] ${f.replace(/\.svg$/, '').padEnd(34)} ${W}x${H}, ${texts.length} labels`);
  for (const i of uniq.slice(0, 8)) console.log(`        - ${i}`);
}
console.log(failures ? `\n${failures} diagram(s) FAILED` : '\nall diagrams pass layout checks');
process.exit(failures ? 1 : 0);
