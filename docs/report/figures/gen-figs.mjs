import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

// Light-mode palette (validated: see validate_palette.js runs). Literal hex so the
// standalone .svg files drop straight into Word/LaTeX without a stylesheet.
const C = {
  surface: '#fcfcfb', textPrimary: '#0b0b0b', textSecondary: '#52514e', muted: '#898781',
  grid: '#e1e0d9', axis: '#c3c2b7',
  s1: '#2a78d6', s2: '#008300', s3: '#e87ba4', s4: '#eda100',
  neutral: '#f0efec', pos: '#2a78d6', neg: '#e34948',
  // Emphasis pair for the ablation figure: the finding is a two-way split (waiting cost
  // retained vs removed), so hue carries the group and shade the member within it. Four
  // categorical hues would have made the reader consult the legend to reconstruct the
  // split that is the whole point of the chart.
  emph1: '#2a78d6', emph2: '#86b6ef', mute1: '#5f5e5a', mute2: '#b4b2a9'
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';

// `fmt` labels the bars and must match the table view digit for digit — rounding a bar
// label to 1.0 when the table says 0.97 makes the two disagree. `tickFmt` labels the axis,
// where trailing zeros are noise, so it defaults to a coarser rendering.
// `groupSplit` inserts extra space before that bar index, so a sub-grouping reads
// spatially as well as chromatically.
function groupedBars({ data, colors, yMax, yLabel, fmt = v => v, tickFmt = null, W = 560, H = 300, log = false, groupSplit = 0 }) {
  const tf = tickFmt ?? fmt;
  const SPLIT_GAP = 10;
  const L = 60, R = 16, T = 18, B = 46;
  const pw = W - L - R, ph = H - T - B;
  const yv = v => log
    ? T + ph - ((Math.log10(Math.max(v, 1)) - 0) / (Math.log10(yMax) - 0)) * ph
    : T + ph - (v / yMax) * ph;
  let s = '';
  const ticks = log ? [1, 10, 100, 1000, 10000, 100000].filter(t => t <= yMax)
                    : Array.from({ length: 6 }, (_, i) => yMax * i / 5);
  for (const t of ticks) {
    const y = yv(t);
    s += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${W - R}" y2="${y.toFixed(1)}" stroke="${C.grid}" stroke-width="1"/>`;
    s += `<text x="${L - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10.5" fill="${C.muted}">${tf(t)}</text>`;
  }
  const gw = pw / data.length;
  const n = data[0].v.length;
  const bw = Math.min(52, (gw - 30) / n - 2);
  data.forEach((row, gi) => {
    const cx = L + gw * gi + gw / 2;
    const extra = groupSplit ? SPLIT_GAP : 0;
    const total = n * bw + (n - 1) * 2 + extra;
    row.v.forEach((v, si) => {
      const x = cx - total / 2 + si * (bw + 2) + (groupSplit && si >= groupSplit ? SPLIT_GAP : 0);
      const y = yv(v), h = Math.max(2, T + ph - y);
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${C[colors[si]]}"/>`;
      s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${C.textSecondary}">${fmt(v)}</text>`;
    });
    s += `<text x="${cx.toFixed(1)}" y="${H - 24}" text-anchor="middle" font-size="11.5" fill="${C.textPrimary}">${esc(row.k)}</text>`;
    if (row.tag) s += `<text x="${cx.toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="10.5" fill="${C.muted}">${esc(row.tag)}</text>`;
  });
  s += `<line x1="${L}" y1="${T + ph}" x2="${W - R}" y2="${T + ph}" stroke="${C.axis}" stroke-width="1"/>`;
  s += `<text transform="translate(14,${T + ph / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="${C.textSecondary}">${esc(yLabel)}</text>`;
  return { body: s, W, H };
}

function legend(items, W) {
  let x = 60, s = '';
  for (const [label, col] of items) {
    s += `<rect x="${x}" y="4" width="11" height="11" rx="3" fill="${C[col]}"/>`;
    s += `<text x="${x + 17}" y="14" font-size="11.5" fill="${C.textSecondary}">${esc(label)}</text>`;
    x += 17 + label.length * 6.6 + 20;
  }
  return s;
}

function wrap({ body, W, H }, legendItems) {
  const lh = legendItems ? 24 : 0;
  const inner = legendItems ? `<g>${legend(legendItems, W)}</g><g transform="translate(0,${lh})">${body}</g>` : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + lh}" width="${W}" height="${H + lh}" font-family="${FONT}">`
    + `<rect width="${W}" height="${H + lh}" fill="${C.surface}"/>${inner}</svg>`;
}

function divergingStack({ rows, W = 700 }) {
  const rowH = 46, L = 210, R = 66, T = 26;
  const H = T + rows.length * rowH + 14;
  const pw = W - L - R;
  // Centring every row on its own no-change segment means a lopsided row runs off one
  // side: with 55 of 60 in one arm the bar reached into the label column. Derive the
  // scale from the widest left and right extents across all rows so the whole set fits
  // the plot area exactly, and place the centre line accordingly.
  const leftMax = Math.max(...rows.map(r => r.worse + r.tied / 2));
  const rightMax = Math.max(...rows.map(r => r.better + r.tied / 2));
  const u = pw / (leftMax + rightMax);
  const cx = L + leftMax * u;
  let s = `<text x="${L}" y="14" font-size="10.5" fill="${C.muted}">&#8592; term hurts this metric</text>`;
  s += `<text x="${W - R}" y="14" text-anchor="end" font-size="10.5" fill="${C.muted}">term helps this metric &#8594;</text>`;
  rows.forEach((r, i) => {
    const y = T + i * rowH;
    const wW = r.worse * u, tW = r.tied * u, bW = r.better * u;
    const x0 = cx - (wW + tW / 2);
    s += `<text x="${L - 12}" y="${y + 15}" text-anchor="end" font-size="11.5" fill="${C.textPrimary}">${esc(r.label)}</text>`;
    s += `<text x="${L - 12}" y="${y + 29}" text-anchor="end" font-size="10" fill="${C.muted}">${esc(r.sub)}</text>`;
    if (wW > 0) {
      s += `<rect x="${x0.toFixed(1)}" y="${y + 4}" width="${Math.max(1, wW - 2).toFixed(1)}" height="22" rx="4" fill="${C.neg}"/>`;
      if (wW > 24) s += `<text x="${(x0 + wW / 2 - 1).toFixed(1)}" y="${y + 19}" text-anchor="middle" font-size="10.5" font-weight="600" fill="#ffffff">${r.worse}</text>`;
    }
    s += `<rect x="${(x0 + wW).toFixed(1)}" y="${y + 4}" width="${Math.max(1, tW - 2).toFixed(1)}" height="22" rx="4" fill="${C.neutral}"/>`;
    if (tW > 24) s += `<text x="${(x0 + wW + tW / 2 - 1).toFixed(1)}" y="${y + 19}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${C.textSecondary}">${r.tied}</text>`;
    if (bW > 0) {
      s += `<rect x="${(x0 + wW + tW).toFixed(1)}" y="${y + 4}" width="${Math.max(1, bW - 2).toFixed(1)}" height="22" rx="4" fill="${C.pos}"/>`;
      if (bW > 24) s += `<text x="${(x0 + wW + tW + bW / 2).toFixed(1)}" y="${y + 19}" text-anchor="middle" font-size="10.5" font-weight="600" fill="#ffffff">${r.better}</text>`;
    }
    s += `<text x="${W - R + 8}" y="${y + 19}" font-size="10.5" fill="${C.textSecondary}">t = ${r.t}</text>`;
  });
  s += `<line x1="${cx}" y1="${T - 4}" x2="${cx}" y2="${T + rows.length * rowH - 6}" stroke="${C.axis}" stroke-width="1" stroke-dasharray="3 3"/>`;
  return { body: s, W, H };
}

const figs = {};

figs['fig-5-2a-throughput'] = wrap(groupedBars({
  // Pooled over all four scenarios (20 paired instances per scale), matching the
  // percentages and the paired analysis in Section 5.8.2. Earlier versions drew the
  // BASELINE bars against pooled tags, which could not be reconciled by a reader.
  data: [{ k: '10 cases', v: [7.00, 7.00], tag: 'no difference' },
         { k: '25 cases', v: [12.60, 14.65], tag: '+16.3%' },
         { k: '50 cases', v: [23.10, 27.50], tag: '+19.0%' }],
  colors: ['s2', 's1'], yMax: 30, yLabel: 'cases scheduled',
  fmt: v => v.toFixed(2), tickFmt: v => v.toFixed(0)
}), [['Priority greedy', 's2'], ['Hybrid CP-SAT', 's1']]);

figs['fig-5-2b-waiting'] = wrap(groupedBars({
  // Pooled over all four scenarios, as 5-2a.
  data: [{ k: '10 cases', v: [1.50, 0.88], tag: '−0.63 h' },
         { k: '25 cases', v: [3.59, 1.79], tag: '−1.80 h' },
         { k: '50 cases', v: [6.88, 3.08], tag: '−3.79 h' }],
  colors: ['s2', 's1'], yMax: 9, yLabel: 'mean waiting time (h)',
  fmt: v => v.toFixed(2), tickFmt: v => v.toFixed(1)
}), [['Priority greedy', 's2'], ['Hybrid CP-SAT', 's1']]);

figs['fig-5-3a-capacity-throughput'] = wrap(groupedBars({
  // HYBRID_PRIORITY_CP_SAT, BASELINE against RESOURCE_MODERATE. The 50-case pair was
  // previously entered as 28.60/28.60; the measured values are 28.60/28.80.
  data: [{ k: '10', v: [7.40, 7.40] }, { k: '25', v: [15.20, 15.20] }, { k: '50', v: [28.60, 28.80] }],
  colors: ['s1', 's4'], yMax: 30, yLabel: 'cases scheduled',
  fmt: v => v.toFixed(2), tickFmt: v => v.toFixed(0)
}), [['Baseline', 's1'], ['+50% capacity', 's4']]);

figs['fig-5-3b-capacity-utilisation'] = wrap(groupedBars({
  data: [{ k: '10', v: [82.5, 55.0], tag: '−27.5 pp' },
         { k: '25', v: [85.0, 56.7], tag: '−28.3 pp' },
         { k: '50', v: [79.7, 53.7], tag: '−26.0 pp' }],
  colors: ['s1', 's4'], yMax: 100, yLabel: 'theatre utilisation (%)',
  fmt: v => v.toFixed(1), tickFmt: v => v.toFixed(0)
}), [['Baseline', 's1'], ['+50% capacity', 's4']]);

// Pooled over all four scenarios (60 paired instances), matching the statistics in the
// table of Section 5.9.1. Previously BASELINE only, which showed a larger gap than the
// text reported and could not be reconciled with it.
figs['fig-5-4-ablation-waiting'] = wrap(groupedBars({
  data: [{ k: '10 cases', v: [0.87, 0.84, 1.41, 1.41] },
         { k: '25 cases', v: [1.79, 1.76, 2.22, 2.33] },
         { k: '50 cases', v: [3.11, 2.98, 4.11, 3.89] }],
  colors: ['emph1', 'emph2', 'mute1', 'mute2'], yMax: 5.5, yLabel: 'mean waiting time (h)',
  fmt: v => v.toFixed(2), tickFmt: v => v.toFixed(1), W: 700, H: 320, groupSplit: 2
}), [['Full objective', 'emph1'], ['− priority reward', 'emph2'],
     ['− waiting cost', 'mute1'], ['Throughput only', 'mute2']]);

// Orientation is per metric, not per raw difference: "helps" means shorter waiting OR
// more cases scheduled. Applying "higher = worse" uniformly inverts the throughput rows,
// because scheduling more cases is an improvement while waiting longer is not.
figs['fig-5-5-paired-outcomes'] = wrap(divergingStack({
  rows: [
    { label: 'Waiting cost term', sub: 'mean waiting time', worse: 2, tied: 3, better: 55, t: '9.00' },
    { label: 'Waiting cost term', sub: 'cases scheduled', worse: 2, tied: 58, better: 0, t: '1.43' },
    { label: 'Priority reward term', sub: 'mean waiting time', worse: 16, tied: 35, better: 9, t: '2.30' },
    { label: 'Priority reward term', sub: 'emergency waiting time', worse: 13, tied: 42, better: 5, t: '2.15' },
    { label: 'Priority reward term', sub: 'cases scheduled', worse: 1, tied: 58, better: 1, t: '0.00' }
  ]
}), [['Term hurts', 'neg'], ['No change', 'neutral'], ['Term helps', 'pos']]);

// Pooled over all four scenarios, as figures 5-2 and 5-4. The bars were previously
// BASELINE means while the tags counted all four scenarios, which could not be
// reconciled from the figure alone.
figs['fig-5-6-runtime'] = wrap(groupedBars({
  data: [{ k: '10 cases', v: [56, 186], tag: 'both interactive' },
         { k: '25 cases', v: [142, 2545], tag: 'all runs OPTIMAL' },
         { k: '50 cases', v: [327, 19466], tag: '36/40 hit time limit' }],
  colors: ['s2', 's1'], yMax: 100000, yLabel: 'mean runtime (log scale)',
  // Bar labels stay exact (3.387 s is 3387 ms exactly); ticks carry their unit so the
  // axis does not read as a bare mix of "100" and "1s".
  fmt: v => v >= 1000 ? (v / 1000) + ' s' : v + ' ms',
  tickFmt: v => v >= 1000 ? (v / 1000) + ' s' : v + ' ms',
  W: 640, H: 310, log: true
}), [['Priority greedy', 's2'], ['Hybrid CP-SAT', 's1']]);

for (const [name, svg] of Object.entries(figs)) {
  writeFileSync(join(OUT, name + '.svg'), svg, 'utf8');
}
console.log('wrote ' + Object.keys(figs).length + ' SVG files to ' + OUT);
console.log(Object.keys(figs).join('\n'));
