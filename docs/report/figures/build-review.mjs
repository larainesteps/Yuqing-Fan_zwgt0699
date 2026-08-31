import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2];
const svg = n => readFileSync(join(DIR, n + '.svg'), 'utf8').replace(/^<\?xml[^>]*\?>/, '');

const tbl = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

const figs = [
  {
    id: '5.2',
    title: "CP-SAT's advantage over the greedy baseline appears only as instances grow",
    cap: "BASELINE scenario, mean of 5 repetitions. At 10 cases the two methods schedule identical numbers of cases in all 20 paired instances, yet CP-SAT still places them earlier. The throughput gap opens at 25 cases and widens at 50.",
    panels: [['(a) Cases scheduled', 'fig-5-2a-throughput'], ['(b) Mean waiting time', 'fig-5-2b-waiting']],
    note: "At 50 cases the solver reached its 20-second limit in 36 of 40 CP-SAT runs, so the +19.0% figure is a lower bound.",
    table: tbl(['Scale', 'Greedy sched.', 'CP-SAT sched.', 'Greedy wait (h)', 'CP-SAT wait (h)', 'Δ wait (h)', 't'],
      [['10', '7.40', '7.40', '1.63', '0.97', '−0.63', '−7.62'],
       ['25', '13.40', '15.20', '3.96', '2.05', '−1.81', '−14.78'],
       ['50', '24.00', '28.60', '8.03', '3.64', '−3.80', '−17.80']])
  },
  {
    id: '5.3',
    title: 'Adding 50% more capacity treated no additional patients',
    cap: "Hybrid CP-SAT. RESOURCE_MODERATE adds 50% to every resource pool while holding the case set and the horizon fixed. Throughput is unchanged at every scale; utilisation falls only because its denominator grew. The binding constraint is the clinical time windows, not capacity.",
    panels: [['(a) Cases scheduled — identical', 'fig-5-3a-capacity-throughput'], ['(b) Theatre utilisation — falls', 'fig-5-3b-capacity-utilisation']],
    note: "Two measures on separate panels rather than one dual-axis chart. Utilisation moved 28 percentage points between two configurations that treated exactly the same patients.",
    table: tbl(['Scale', 'Sched. baseline', 'Sched. +50%', 'Util. baseline %', 'Util. +50% %'],
      [['10', '7.40', '7.40', '82.5', '55.0'], ['25', '15.20', '15.20', '85.0', '56.7'], ['50', '28.60', '28.60', '79.7', '53.2']])
  },
  {
    id: '5.4',
    title: 'Of the two objective terms, only the waiting cost does any work',
    cap: "Mean waiting time by objective configuration, BASELINE scenario. Configurations retaining the waiting cost (first two bars per group) cluster together; those without it sit markedly higher. Removing the priority reward changes almost nothing.",
    panels: [[null, 'fig-5-4-ablation-waiting']],
    note: "All four configurations scheduled the same number of cases at every scale, so the waiting-time differences are not bought by treating fewer patients. Every bar is directly labelled — the required relief for the two light-mode hues below 3:1 contrast.",
    table: tbl(['Scale', 'Full', '− priority', '− waiting', 'Throughput only'],
      [['10', '0.97', '0.98', '1.47', '1.52'], ['25', '2.05', '2.01', '2.58', '2.83'], ['50', '3.62', '3.47', '4.98', '4.58']])
  },
  {
    id: '5.5',
    title: 'The priority reward changed nothing in 58 of 60 paired instances',
    cap: "Paired outcomes over 60 instances (3 scales x 4 scenarios x 5 repetitions), each bar centred on its no-change segment. Counts are oriented per metric: 'helps' means shorter waiting OR more cases scheduled, because the two metrics run in opposite directions. The contrast is the finding: the waiting cost improves almost every instance, whereas the priority reward leaves almost every instance untouched - and where it acts, it acts adversely.",
    panels: [[null, 'fig-5-5-paired-outcomes']],
    note: "The waiting cost is not quite free: in 2 of 60 instances the configuration without it scheduled one case more, the expected trade-off for refusing later slots. The priority reward's mean effect on throughput is exactly 0.000; on emergency waiting time — the metric it was designed to improve — it is +0.047 h, the wrong direction.",
    table: tbl(['Term', 'Metric', 'Helps', 'No change', 'Hurts', 'Mean Δ', 't'],
      [['Waiting cost', 'Mean wait', '55', '3', '2', '−0.659 h', '9.00'],
       ['Waiting cost', 'Cases scheduled', '0', '58', '2', '−0.033', '1.43'],
       ['Priority reward', 'Mean wait', '9', '35', '16', '+0.063 h', '2.30'],
       ['Priority reward', 'Emergency wait', '5', '42', '13', '+0.047 h', '2.15'],
       ['Priority reward', 'Cases scheduled', '1', '58', '1', '0.000', '0.00']])
  },
  {
    id: '5.6',
    title: 'Solution quality is bought with computation time',
    cap: "Mean runtime, BASELINE scenario, logarithmic scale. The greedy baseline stays interactive throughout. CP-SAT is interactive to 25 cases and reaches its 20-second budget at 50, where 36 of 40 runs returned FEASIBLE rather than OPTIMAL.",
    panels: [[null, 'fig-5-6-runtime']],
    note: "The 100-case scale is absent because it could not be solved at all: 75 s to UNKNOWN with zero allocations under a 90 s budget, while greedy scheduled 46 cases in 690 ms (Section 5.11).",
    table: tbl(['Scale', 'Greedy (ms)', 'CP-SAT (ms)', 'Solver status'],
      [['10', '16', '184', '40/40 OPTIMAL'], ['25', '44', '3 387', '40/40 OPTIMAL'],
       ['50', '179', '20 732', '4/40 OPTIMAL, 36/40 FEASIBLE'], ['100', '690', '— (UNKNOWN)', '0 allocations']])
  }
];

const body = figs.map(f => `
<section class="fig">
  <h2>Figure ${f.id} — ${f.title}</h2>
  <p class="cap">${f.cap}</p>
  <div class="panels">
    ${f.panels.map(([t, n]) => `<div class="panel">${t ? `<p class="ptitle">${t}</p>` : ''}${svg(n)}</div>`).join('')}
  </div>
  <p class="note">${f.note}</p>
  <details><summary>Table view</summary>${f.table}</details>
  <p class="src">Source files: ${f.panels.map(([, n]) => `<code>${n}.svg</code>`).join(', ')}</p>
</section>`).join('');

writeFileSync(join(DIR, '..', 'ch5-figures-review.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Chapter 5 — candidate figures</title>
<style>
 body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f9f9f7;color:#0b0b0b;margin:0;padding:28px 22px 60px;}
 h1{font-size:21px;margin:0 0 4px;letter-spacing:-.01em}
 .sub{color:#52514e;font-size:13px;margin:0 0 26px;max-width:74ch;line-height:1.55}
 .fig{background:#fcfcfb;border:1px solid rgba(11,11,11,.10);border-radius:10px;padding:18px 18px 14px;margin:0 0 22px;max-width:1180px}
 .fig h2{font-size:14.5px;margin:0 0 3px;font-weight:600}
 .cap{font-size:12.5px;color:#52514e;margin:0 0 14px;line-height:1.55;max-width:82ch}
 .note{font-size:11.5px;color:#898781;margin:10px 0 0;line-height:1.55;max-width:82ch}
 .src{font-size:11px;color:#898781;margin:6px 0 0}
 .panels{display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start}
 .panel{flex:1 1 380px;min-width:340px;max-width:100%}
 .panel svg{width:100%;height:auto;display:block}
 .ptitle{font-size:12px;color:#52514e;margin:0 0 6px;font-weight:500}
 details{margin-top:12px}
 summary{font-size:12px;color:#52514e;cursor:pointer}
 table{border-collapse:collapse;font-size:12px;margin-top:8px;font-variant-numeric:tabular-nums}
 th,td{text-align:right;padding:4px 11px;border-bottom:1px solid #e1e0d9}
 th:first-child,td:first-child,td:nth-child(2){text-align:left}
 th{color:#52514e;font-weight:600}
 code{font-size:11px;background:#f0efec;padding:1px 5px;border-radius:3px}
</style></head><body>
<h1>Chapter 5 — candidate figures</h1>
<p class="sub">Draft for review before insertion. Data: <code>EXP-20260825012438-42</code> (comparison, 180 runs) and <code>ABL-20260825014044-42</code> (ablation, 240 runs), 25 August 2026. Palette validated with the six-checks validator in both light and dark; these exports are light-mode for print. Every figure carries a table view.</p>
${body}
</body></html>`, 'utf8');
console.log('review page written');

