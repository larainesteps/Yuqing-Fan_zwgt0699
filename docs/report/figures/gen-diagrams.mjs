// Structural diagrams for Chapters 3, 4 and 5. Same palette and type as gen-figs.mjs so the
// figures read as one set. Light-mode literal hex: these drop into Word/LaTeX unchanged.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const C = {
  surface: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781',
  grid: '#e1e0d9', axis: '#c3c2b7',
  blue: '#2a78d6', blueLight: '#cde2fb', blueMid: '#86b6ef',
  green: '#008300', greenLight: '#eaf3de',
  grey: '#5f5e5a', greyLight: '#f0efec', greyMid: '#b4b2a9',
  red: '#e34948', redLight: '#fcebeb',
  amber: '#eda100', amberLight: '#faeeda'
};
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const svg = (W, H, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">`
  + `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`
  + `<path d="M0,0 L10,5 L0,10 z" fill="${C.axis}"/></marker>`
  + `<marker id="ad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`
  + `<path d="M0,0 L10,5 L0,10 z" fill="${C.ink2}"/></marker></defs>`
  + `<rect width="${W}" height="${H}" fill="${C.surface}"/>${body}</svg>`;

const box = (x, y, w, h, fill, stroke, r = 6) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
const txt = (x, y, s, { size = 11.5, fill = C.ink, anchor = 'middle', weight = 400 } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`;
const arrow = (x1, y1, x2, y2, dark = false) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${dark ? C.ink2 : C.axis}" stroke-width="1.5" marker-end="url(#${dark ? 'ad' : 'a'})"/>`;

// ---------------------------------------------------------------- Figure 3.1
{
  const W = 700, H = 430;
  let s = '';
  const bands = [
    { y: 34, h: 56, label: 'Presentation', fill: C.blueLight, stroke: C.blueMid,
      items: [['React 19 SPA — Vite, port 5173', 110, 400]],
      sub: 'Overview · Schedule · Cases · Clinical Intake · Resources · Evaluation' },
    { y: 132, h: 56, label: 'Application', fill: C.greenLight, stroke: C.green,
      items: [['Express 5 REST API — TypeScript, port 4000', 110, 400]],
      sub: 'server · workflow · intake · reschedule · experiments' },
    { y: 244, h: 62, label: 'Domain services', fill: C.amberLight, stroke: C.amber, split: true },
    { y: 352, h: 46, label: 'Persistence', fill: C.greyLight, stroke: C.greyMid,
      items: [['MySQL 8 — 28 tables', 110, 400]] }
  ];

  for (const b of bands) {
    s += txt(102, b.y + b.h / 2 + 4, b.label, { anchor: 'end', size: 11, fill: C.muted });
    if (b.split) {
      const names = [['NLP', '8101'], ['Priority', '8102'], ['Optimizer', '8103'], ['Evaluation', '8104']];
      const w = 94, gap = 8, total = names.length * w + (names.length - 1) * gap;
      let x = 110 + (400 - total) / 2;
      for (const [n, p] of names) {
        s += box(x, b.y, w, b.h, b.fill, b.stroke);
        s += txt(x + w / 2, b.y + 25, n, { size: 11.5, weight: 500 });
        s += txt(x + w / 2, b.y + 42, ':' + p, { size: 10.5, fill: C.ink2 });
        x += w + gap;
      }
      s += txt(310, b.y + b.h + 17, 'Python 3.13 · stdlib HTTP runtime · OR-Tools CP-SAT in the optimiser',
        { size: 10, fill: C.muted });
    } else {
      const [label, x, w] = b.items[0];
      s += box(x, b.y, w, b.h, b.fill, b.stroke);
      s += txt(x + w / 2, b.y + (b.sub ? 24 : b.h / 2 + 4), label, { size: 12, weight: 500 });
      if (b.sub) s += txt(x + w / 2, b.y + 42, b.sub, { size: 10, fill: C.ink2 });
    }
  }

  s += arrow(310, 90, 310, 130, true);
  s += txt(320, 114, 'HTTP / JSON', { anchor: 'start', size: 10, fill: C.muted });
  s += arrow(244, 188, 244, 242, true);
  s += txt(236, 218, 'contract-validated HTTP', { anchor: 'end', size: 10, fill: C.muted });
  s += arrow(444, 188, 444, 350, true);
  s += txt(454, 250, 'SQL', { anchor: 'start', size: 10, fill: C.muted });

  // Contracts spine
  s += box(524, 132, 152, 174, C.surface, C.blue, 6);
  s += txt(600, 154, 'contracts/v1', { size: 11.5, weight: 500, fill: C.blue });
  s += txt(600, 170, 'six versioned JSON Schemas', { size: 9.5, fill: C.ink2 });
  const contracts = ['clinical-note-input', 'case-extraction', 'priority-assessment',
    'optimization-request', 'optimization-result', 'evaluation-report'];
  contracts.forEach((c, i) => { s += txt(600, 190 + i * 17, c, { size: 9.5, fill: C.ink2 }); });
  s += `<line x1="510" y1="160" x2="522" y2="160" stroke="${C.blue}" stroke-width="1" stroke-dasharray="3 3"/>`;
  s += `<line x1="510" y1="275" x2="522" y2="275" stroke="${C.blue}" stroke-width="1" stroke-dasharray="3 3"/>`;
  s += txt(600, 320, 'generated from the Pydantic models', { size: 9.5, fill: C.muted });
  s += txt(600, 334, 'and asserted by the contract tests', { size: 9.5, fill: C.muted });

  writeFileSync(join(OUT, 'fig-3-1-architecture.svg'), svg(W, H, s), 'utf8');
}

// ---------------------------------------------------------------- Figure 3.2
{
  const W = 700, H = 470;
  let s = '';
  const ents = {
    patients:      { x: 24,  y: 28,  w: 128, h: 40, t: 'patients', k: 'id' },
    notes:         { x: 24,  y: 108, w: 128, h: 52, t: 'clinical_notes', k: 'id · patient_id' },
    extractions:   { x: 24,  y: 200, w: 128, h: 52, t: 'nlp_extractions', k: 'id · clinical_note_id' },
    reviews:       { x: 210, y: 200, w: 150, h: 66, t: 'case_reviews', k: 'clinical_note_id\nextraction_id · status' },
    audit:         { x: 210, y: 308, w: 150, h: 52, t: 'case_audit_events', k: 'case_review_id' },
    priority:      { x: 24,  y: 300, w: 128, h: 52, t: 'priority_assessments', k: 'extraction_id' },
    runs:          { x: 410, y: 108, w: 150, h: 52, t: 'optimization_runs', k: 'run_key · status' },
    assignments:   { x: 410, y: 200, w: 150, h: 52, t: 'optimization_assignments', k: 'optimization_run_id' },
    evalrep:       { x: 410, y: 28,  w: 150, h: 52, t: 'evaluation_reports', k: 'optimization_run_id' },
    bookings:      { x: 410, y: 300, w: 150, h: 66, t: 'resource_bookings', k: 'one row per occupied\nresource' },
    resources:     { x: 410, y: 400, w: 150, h: 44, t: 'doctors · nurses', k: 'theatres · real_beds' }
  };
  for (const e of Object.values(ents)) {
    s += box(e.x, e.y, e.w, e.h, C.surface, C.axis);
    s += txt(e.x + e.w / 2, e.y + 19, e.t, { size: 11, weight: 500 });
    const lines = String(e.k).split('\n');
    lines.forEach((l, i) => { s += txt(e.x + e.w / 2, e.y + 35 + i * 13, l, { size: 9.5, fill: C.muted }); });
  }
  const link = (a, b, side) => {
    const A = ents[a], B = ents[b];
    if (side === 'down') return arrow(A.x + A.w / 2, A.y + A.h, B.x + B.w / 2, B.y - 2);
    if (side === 'up') return arrow(A.x + A.w / 2, A.y, B.x + B.w / 2, B.y + B.h + 2);
    return arrow(A.x + A.w, A.y + A.h / 2, B.x - 2, B.y + B.h / 2);
  };
  s += link('patients', 'notes', 'down');
  s += link('notes', 'extractions', 'down');
  s += link('extractions', 'reviews', 'right');
  s += link('extractions', 'priority', 'down');
  s += link('reviews', 'audit', 'down');
  s += link('runs', 'assignments', 'down');
  s += link('runs', 'evalrep', 'up');
  s += link('assignments', 'bookings', 'down');
  s += link('bookings', 'resources', 'down');
  s += arrow(360, 226, 408, 200);
  s += txt(384, 246, 'feeds', { size: 9.5, fill: C.muted });

  s += txt(24, 458, 'Arrows point from the referenced table to the referencing table; every relationship shown is a declared foreign key.',
    { anchor: 'start', size: 9.5, fill: C.muted });
  writeFileSync(join(OUT, 'fig-3-2-er-diagram.svg'), svg(W, H, s), 'utf8');
}

// ---------------------------------------------------------------- Figure 3.3
{
  const W = 700, H = 250;
  let s = '';
  const st = (x, y, w, label, fill, stroke) => box(x, y, w, 40, fill, stroke) + txt(x + w / 2, y + 25, label, { size: 11.5, weight: 500 });
  s += st(40, 90, 160, 'REVIEW_REQUIRED', C.amberLight, C.amber);
  s += st(268, 90, 130, 'APPROVED', C.blueLight, C.blueMid);
  s += st(486, 90, 130, 'SCHEDULED', C.greenLight, C.green);
  s += st(268, 186, 130, 'REJECTED', C.redLight, C.red);

  s += arrow(200, 110, 266, 110, true);
  s += txt(233, 102, 'approve', { size: 10, fill: C.ink2 });
  s += arrow(398, 110, 484, 110, true);
  s += txt(441, 102, 'schedule', { size: 10, fill: C.ink2 });
  s += arrow(120, 130, 300, 184, true);
  s += txt(196, 168, 'reject', { size: 10, fill: C.ink2 });

  s += `<path d="M40,110 C10,110 10,60 60,60 L180,60 C222,60 222,92 200,92" fill="none" stroke="${C.ink2}" stroke-width="1.5" marker-end="url(#ad)"/>`;
  s += txt(120, 52, 'edit extraction · rescore', { size: 10, fill: C.ink2 });
  s += `<path d="M333,90 C333,50 430,50 430,90" fill="none" stroke="${C.ink2}" stroke-width="1.5" marker-end="url(#ad)"/>`;
  s += txt(382, 44, 'infeasible — stays APPROVED,', { size: 10, fill: C.ink2 });
  s += txt(382, 57, 'rejection code retained', { size: 10, fill: C.ink2 });

  s += txt(40, 232, 'No extraction — from either the language model or the rule engine — can leave REVIEW_REQUIRED without a human decision.',
    { anchor: 'start', size: 9.5, fill: C.muted });
  writeFileSync(join(OUT, 'fig-3-3-review-state-machine.svg'), svg(W, H, s), 'utf8');
}

// ---------------------------------------------------------------- Figure 4.1
{
  const W = 700, H = 360;
  let s = '';
  s += txt(24, 26, 'Per-case candidates = resource combinations × feasible start slots', { anchor: 'start', size: 11.5, weight: 500 });

  const row = (y, title, combos, slots, per, fill, stroke, note) => {
    let r = box(24, y, 200, 54, fill, stroke);
    r += txt(124, y + 21, title, { size: 11, weight: 500 });
    r += txt(124, y + 38, combos, { size: 9.5, fill: C.ink2 });
    r += txt(248, y + 27, '×', { size: 13, fill: C.muted });
    r += box(268, y, 96, 54, fill, stroke);
    r += txt(316, y + 21, slots, { size: 11, weight: 500 });
    r += txt(316, y + 38, 'start slots', { size: 9.5, fill: C.ink2 });
    r += txt(386, y + 27, '=', { size: 13, fill: C.muted });
    r += box(406, y, 130, 54, fill, stroke);
    r += txt(471, y + 32, per, { size: 13, weight: 500 });
    if (note) r += txt(548, y + 32, note, { anchor: 'start', size: 10, fill: C.ink2 });
    return r;
  };
  s += row(44, 'Baseline pool', '2 × C(6,3) × 2 × 2 = 160', '40', '6 400', C.blueLight, C.blueMid, 'tractable');
  s += row(120, '+50% capacity', '3 × C(9,3) × 3 × 3 = 2 268', '26', '≈ 59 000', C.redLight, C.red, '≈1.5M booleans — UNKNOWN');
  s += row(196, 'After restriction', '2 highest-scoring per slot', '26', '≤ 300', C.greenLight, C.green, 'feasible incumbent');

  s += txt(24, 286, 'Growth is multiplicative in every resource pool: enlarging the nurse pool from six to nine multiplies', { anchor: 'start', size: 10, fill: C.ink2 });
  s += txt(24, 301, 'C(n,3) by 4.2 and the whole combination count by 14. The redundancy removed is in the resource dimension —', { anchor: 'start', size: 10, fill: C.ink2 });
  s += txt(24, 316, 'at one start time most combinations are interchangeable — so full temporal coverage is preserved. CP-SAT', { anchor: 'start', size: 10, fill: C.ink2 });
  s += txt(24, 331, 'therefore optimises over a subset: OPTIMAL means optimal with respect to the restricted model.', { anchor: 'start', size: 10, fill: C.ink2 });
  writeFileSync(join(OUT, 'fig-4-1-candidate-enumeration.svg'), svg(W, H, s), 'utf8');
}

// ---------------------------------------------------------------- Figure 5.1
{
  const before = [
    { n: '01', u: 'EMERGENCY', due: 0, s: 1.5, e: 4.5 }, { n: '02', u: 'URGENT', due: 12, s: 0, e: 1.5 },
    { n: '03', u: 'EXPEDITED', due: 72, s: 4.5, e: 6.5 }, { n: '04', u: 'ROUTINE', due: 1344, s: 0, e: 1 },
    { n: '05', u: 'URGENT', due: 6, s: 7.5, e: 11 }, { n: '06', u: 'ROUTINE', due: 672, s: 6.5, e: 7.5 }
  ];
  const after = [
    { n: '01', u: 'EMERGENCY', due: 0, s: 0, e: 3 }, { n: '02', u: 'URGENT', due: 12, s: 3, e: 4.5 },
    { n: '03', u: 'EXPEDITED', due: 72, s: 9, e: 11 }, { n: '04', u: 'ROUTINE', due: 1344, s: 3, e: 4 },
    { n: '05', u: 'URGENT', due: 6, s: 5.5, e: 9 }, { n: '06', u: 'ROUTINE', due: 4.5, s: 4.5, e: 5.5 }
  ];
  after[5].due = 672;

  // Height must clear: panel 2 rows (ends 258 + 6*26 = 414), its tick labels (+14 = 428)
  // and the caption below them. An earlier version used H = 430, which put the tick labels
  // outside the canvas and the caption on top of the last row.
  const W = 700, H = 500, HZ = 12;
  const L = 118, R = 24, rowH = 26;
  const pw = W - L - R, u = pw / HZ;
  let s = '';

  const panel = (y0, title, rows) => {
    let p = txt(24, y0 - 10, title, { anchor: 'start', size: 11.5, weight: 500 });
    for (let t = 0; t <= HZ; t += 2) {
      const x = L + t * u;
      p += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + rows.length * rowH}" stroke="${C.grid}" stroke-width="1"/>`;
      p += txt(x, y0 + rows.length * rowH + 14, '+' + t + ' h', { size: 9.5, fill: C.muted });
    }
    rows.forEach((r, i) => {
      const y = y0 + i * rowH;
      const breach = r.s > r.due;
      p += txt(L - 10, y + 17, 'Case ' + r.n + ' · ' + r.u, { anchor: 'end', size: 9.5, fill: C.ink2 });
      p += `<rect x="${(L + r.s * u).toFixed(1)}" y="${y + 5}" width="${Math.max(3, (r.e - r.s) * u).toFixed(1)}" height="16" rx="4" fill="${breach ? C.red : C.blue}"/>`;
      if (r.due <= HZ) {
        const dx = L + r.due * u;
        p += `<line x1="${dx}" y1="${y + 2}" x2="${dx}" y2="${y + 24}" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="2 2"/>`;
      }
      if (breach) p += txt(L + r.e * u + 8, y + 17, 'breach', { anchor: 'start', size: 9.5, fill: C.red, weight: 500 });
    });
    return p;
  };

  s += panel(52, 'Before the fix — deadline as an objective term', before);
  s += panel(258, 'After the fix — deadline as a hard constraint', after);

  s += `<rect x="24" y="14" width="11" height="11" rx="3" fill="${C.blue}"/>`;
  s += txt(41, 24, 'within deadline', { anchor: 'start', size: 10, fill: C.ink2 });
  s += `<rect x="146" y="14" width="11" height="11" rx="3" fill="${C.red}"/>`;
  s += txt(163, 24, 'deadline breached', { anchor: 'start', size: 10, fill: C.ink2 });
  s += `<line x1="290" y1="12" x2="290" y2="27" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="2 2"/>`;
  s += txt(298, 24, 'latest permitted start', { anchor: 'start', size: 10, fill: C.ink2 });

  const caption = [
    'Two end-to-end runs over the same six-case workload profile and a 12-hour horizon. The',
    'runs generated fresh case identifiers, so this is the same workload structure rather than',
    'literally the same instance. Cases 01 and 05 breached their deadlines before the fix;',
    'neither does after.'
  ];
  caption.forEach((line, i) => {
    s += txt(24, 442 + i * 13, line, { anchor: 'start', size: 9.5, fill: C.muted });
  });
  writeFileSync(join(OUT, 'fig-5-1-opt001-before-after.svg'), svg(W, H, s), 'utf8');
}

console.log('wrote 5 diagrams to ' + OUT);
