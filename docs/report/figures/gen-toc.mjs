// Generate the table of contents, list of figures and list of tables from the actual
// chapter files, so they cannot drift from the headings they describe.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2];
const chapters = readdirSync(DIR)
  .filter(n => /^chapter-\d/.test(n))
  .sort();

const toc = [];
const figures = [];
const tables = [];

for (const file of chapters) {
  const src = readFileSync(join(DIR, file), 'utf8');
  const lines = src.split('\n');

  let inCodeFence = false;
  let pendingTableCaption = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) { inCodeFence = !inCodeFence; continue; }
    if (inCodeFence) continue;

    const h = line.match(/^(#{1,3}) (.+)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].replace(/\*\*/g, '').trim();
      if (/^(References|Corrections made|Claims re-checked|Content moved)/.test(text)) continue;
      toc.push({ level, text });
      pendingTableCaption = text;
      continue;
    }

    // Figure callouts are written as "> **Figure N.N** — ..."
    const f = line.match(/^> \*\*(Figure \d+\.\d+(?:–\d+\.\d+)?)\*\*\s*—\s*(.+)$/);
    if (f) {
      let desc = f[2].replace(/`[^`]*`/g, '').replace(/\s+/g, ' ').trim();
      desc = desc.replace(/^[:,]\s*/, '').replace(/\s*\*Not yet drawn\.\*/, '');
      figures.push({ id: f[1], desc: desc.slice(0, 96) });
    }

    // A markdown table header followed by a separator row.
    if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] ?? '')) {
      tables.push({ section: pendingTableCaption, cols: line.split('|').filter(s => s.trim()).length });
    }
  }
}

const num = { 1: 0, 2: 0, 3: 0 };
console.log('=== TABLE OF CONTENTS ===');
for (const e of toc) {
  const indent = '  '.repeat(e.level - 1);
  console.log(`${indent}${e.text}`);
}

console.log('\n=== LIST OF FIGURES ===');
for (const f of figures) console.log(`${f.id}  ${f.desc}`);

console.log('\n=== TABLE COUNT BY SECTION ===');
const bySection = new Map();
for (const t of tables) bySection.set(t.section, (bySection.get(t.section) ?? 0) + 1);
for (const [s, n] of bySection) console.log(`${n}  ${s}`);
console.log(`\ntotal tables: ${tables.length}`);
