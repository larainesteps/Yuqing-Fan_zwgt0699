// Build the Word export.
//
// The chapter drafts reference figures as filenames inside blockquote callouts, which is
// right for a source document but leaves the exported .docx without its figures. This
// rewrites those callouts into real image embeds pointing at the rasterised PNGs, drops the
// drafting-status blockquotes that should not appear in a submitted document, then runs
// pandoc.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [SRC, RASTER, OUT] = process.argv.slice(2);
// Take fonts, margins and heading styles from the School template rather than pandoc's
// defaults, so the exported chapters paste into it cleanly.
const REFDOC = process.env.REFDOC ?? join(SRC, 'figures', 'SoC-report-Template.docx');
mkdirSync(OUT, { recursive: true });
const TMP = join(OUT, '_md');
mkdirSync(TMP, { recursive: true });

// front-matter-draft.md is deliberately excluded: it is a set of instructions for building
// the title page, contents and generated lists inside the Word template, not report content.
// Exporting it put pages of author instructions at the head of the document.
const chapters = [
  ['chapter-1-introduction-draft.md', 'Chapter 1'],
  ['chapter-2-background-research-draft.md', 'Chapter 2'],
  ['chapter-3-requirements-and-design-draft.md', 'Chapter 3'],
  ['chapter-4-implementation-draft.md', 'Chapter 4'],
  ['chapter-5-testing-and-evaluation-draft.md', 'Chapter 5'],
  ['chapter-6-conclusions-draft.md', 'Chapter 6'],
  ['references-and-appendices-draft.md', 'Refs + App']
];

// CHAPTERS restricts the export to a subset, e.g. CHAPTERS=1,2,3,4 for a partial draft.
// Without it every chapter is exported, which is the submission build.
const only = (process.env.CHAPTERS ?? '').split(',').map(s => s.trim()).filter(Boolean);
if (only.length) {
  const keep = new Set(only.map(n => `chapter-${n}-`));
  for (let i = chapters.length - 1; i >= 0; i -= 1) {
    if (![...keep].some(k => chapters[i][0].startsWith(k))) chapters.splice(i, 1);
  }
  if (!chapters.length) throw new Error(`CHAPTERS=${process.env.CHAPTERS} matched no chapter file`);
}

// Figure callouts are blockquotes that may span several lines and may name more than one
// file. An earlier version matched only single-line callouts and only the singular word
// "Figure", which silently dropped 8 of the 18 figures from the export — hence the assert
// at the end of this file.
//
// Work line by line over each blockquote run rather than with one multi-line regex.
// Explicit render widths, in inches, against a 6.27in text column. Without them pandoc uses
// each image's intrinsic size and every figure fills the column, which costs roughly six pages
// across the twelve figures of Chapters 4 and 5. Sized so the six interface captures stay
// readable while the body keeps inside its page budget.
const FIG_WIDTH_IN = {
  'fig-3-1-architecture': 4.3, 'fig-3-2-er-diagram': 4.5, 'fig-3-3-review-state-machine': 4.2,
  'fig-4-1-candidate-enumeration': 3.9,
  'fig-4-2-ui-overview': 2.8, 'fig-4-3-ui-schedule': 2.8, 'fig-4-4-ui-cases': 2.8,
  'fig-4-5-ui-clinical-intake': 2.8, 'fig-4-6-ui-resources': 2.8, 'fig-4-7-ui-evaluation': 2.8,
  'fig-5-1-opt001-before-after': 4.2, 'fig-5-2a-throughput': 3.05, 'fig-5-2b-waiting': 3.05,
  'fig-5-4-ablation-waiting': 4.2, 'fig-5-6-runtime': 4.1
};

function expandFigures(md) {
  const out = [];
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    if (!/^> \*\*Figures? [A-Z]?[\d.]/.test(lines[i])) { out.push(lines[i++]); continue; }

    // Collect the whole blockquote run.
    const run = [];
    while (i < lines.length && /^>/.test(lines[i])) run.push(lines[i++].replace(/^>\s?/, ''));

    // Split it into individual "**Figure N.N** — …" entries.
    const text = run.join(' ').replace(/\s+/g, ' ');
    const entries = [...text.matchAll(/\*\*(Figures? [A-Z]?[\d.–\-]+(?: and [A-Z]?[\d.–\-]+)?)\*\*\s*—\s*(.*?)(?=\*\*Figures? [A-Z]?[\d.]|$)/g)];
    for (const [, label, bodyRaw] of entries) {
      const body = bodyRaw.trim();
      const files = [...body.matchAll(/`figures\/([a-z0-9-]+)\.(svg|png)`/g)];
      const caption = body
        .replace(/`figures\/[a-z0-9-]+\.(svg|png)`/g, '§')
        .replace(/§(\s*(and|through)\s*§)*/g, '')
        .replace(/^[\s:,.]+/, '')
        .replace(/\s+([:,.])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
      const imgs = files.map((m) => {
        const png = `${m[1]}.png`;
        const path = existsSync(join(RASTER, png)) ? join(RASTER, png) : join(SRC, 'figures', png);
        const w = FIG_WIDTH_IN[m[1]];
        return `![](${path.replace(/\\/g, '/')})${w ? `{width=${w}in}` : ''}`;
      });
      if (imgs.length) out.push(imgs.join(' '), '');
      const cap = caption.charAt(0).toUpperCase() + caption.slice(1);
      out.push(`**${label}**  ${cap}`, '');
    }
  }
  return out.join('\n');
}

// Drafting scaffolding that must not reach a submitted document.
function stripDraftNotes(md) {
  return md
    .replace(/^> \*\*(Status|Citation warning|Structure|Verification status|Not specified by the handout|Cross-references pending|Note on a negative result|Numbering caution|Wording change required|Still to do before submission|Title|Check before use|Reference list moved|Merged list|This section is yours to write|To complete|Confirm and complete|Project type|Check your credit weighting|Complete this yourself|Numbering changed here|Two rules the template states directly|Proof-reading|Team contributions|Build this part in)\.?\*\*[\s\S]*?(?=\n(?!>)|\n*$)/gm, '')
    // Any remaining blockquote that opens by naming the handout or the template is guidance
    // to the author, not report content.
    .replace(/^> (The handout|The School's handout|The template)\b[\s\S]*?(?=\n(?!>)|\n*$)/gm, '')
    .replace(/^> \*\*Screenshots\*\*[\s\S]*?(?=\n(?!>)|\n*$)/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

const combined = [];
for (const [file, label] of chapters) {
  const raw = readFileSync(join(SRC, file), 'utf8');
  const md = stripDraftNotes(expandFigures(raw));
  const tmp = join(TMP, file);
  writeFileSync(tmp, md, 'utf8');

  const single = join(OUT, file.replace(/-draft\.md$/, '.docx'));
  execFileSync('pandoc', [tmp, '-o', single, '--resource-path', SRC, '--reference-doc', REFDOC, '--no-highlight', '--toc-depth=3'], { stdio: 'pipe' });
  console.log(`  ${label.padEnd(12)} -> ${single.split(/[\\/]/).pop()}`);
  combined.push(md);
}

const all = join(TMP, '_combined.md');
writeFileSync(all, combined.join('\n\n\\newpage\n\n'), 'utf8');
const dest = join(OUT, 'TheatreFlow-dissertation.docx');
execFileSync('pandoc', [all, '-o', dest, '--resource-path', SRC, '--reference-doc', REFDOC, '--no-highlight', '--toc', '--toc-depth=3'], { stdio: 'pipe' });
console.log(`\n  combined     -> ${dest.split(/[\\/]/).pop()}`);

// A .docx is a zip; count what actually landed in word/media. Comparing that against the
// figures named in the source is the only way to know the export is complete — the first
// version of this script produced a document that looked fine and was missing 8 figures.
//
// Scan the raw bytes for the zip local-file-header signature (PK\x03\x04) and read the
// name that follows. Converting the whole archive to a latin1 string and running a regex
// over it — the first attempt — reported zero every time on a correct document.
function countMedia(file) {
  const buf = readFileSync(file);
  const SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const seen = new Set();
  let at = 0;
  while ((at = buf.indexOf(SIG, at)) !== -1) {
    const nameLen = buf.readUInt16LE(at + 26);
    const extraLen = buf.readUInt16LE(at + 28);
    const name = buf.subarray(at + 30, at + 30 + nameLen).toString('utf8');
    if (name.startsWith('word/media/')) seen.add(name);
    at += 30 + nameLen + extraLen;
  }
  return seen.size;
}

const expected = combined.join('\n').match(/!\[\]\(/g)?.length ?? 0;
const embedded = countMedia(dest);
console.log(`\n  figures referenced in the markdown: ${expected}`);
console.log(`  images embedded in the .docx:       ${embedded}`);
if (embedded < expected) {
  console.error(`\n  MISMATCH — ${expected - embedded} figure(s) did not make it into the document.`);
  process.exitCode = 1;
} else {
  console.log('  all referenced figures are present.');
}
