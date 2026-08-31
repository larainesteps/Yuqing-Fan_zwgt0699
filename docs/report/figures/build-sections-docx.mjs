// Export a contiguous run of sections from one chapter as a standalone .docx.
//
// The full build (build-docx.mjs) exports whole chapters. Supervision drafts often need a
// part of one — "sections 5.1 to 5.7" — so this takes the chapter file, a start heading and
// an end heading, applies the same figure handling and the same reference document, and
// checks that every figure named in the markdown actually landed in the archive.
//
//   node build-sections-docx.mjs <chapter-file> "## 5.1 " "## 5.8 " <out-name> "<title>"
//
// The end heading is exclusive: everything before it is exported.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const [chapterFile, startMarker, endMarker, outName, title] = process.argv.slice(2);
if (!chapterFile || !startMarker || !outName) {
  throw new Error('usage: build-sections-docx.mjs <chapter-file> <start> <end> <out-name> [title]');
}

const FIGURES = dirname(resolve(process.argv[1]));
const SRC = dirname(FIGURES);
const ROOT = dirname(dirname(SRC));
const RASTER = join(ROOT, 'build', 'raster');
const OUT = join(ROOT, 'build', 'docx');
const REFDOC = process.env.REFDOC ?? join(FIGURES, 'SoC-report-Template.prepared.docx');
mkdirSync(OUT, { recursive: true });

const full = readFileSync(join(SRC, chapterFile), 'utf8');
const start = full.indexOf(startMarker);
if (start < 0) throw new Error(`start marker not found: ${startMarker}`);
const end = endMarker ? full.indexOf(endMarker, start) : -1;
const body = end < 0 ? full.slice(start) : full.slice(start, end);

let md = (title ? `# ${title}\n\n` : '') + body.trimEnd() + '\n';

// Figure callouts are blockquotes that may span several lines and name more than one file.
// Same rule as build-docx.mjs, kept in step with it deliberately.
const lines = md.split('\n');
const rendered = [];
let i = 0;
while (i < lines.length) {
  if (!/^> \*\*Figures? [A-Z]?[\d.]/.test(lines[i])) { rendered.push(lines[i++]); continue; }
  const run = [];
  while (i < lines.length && /^>/.test(lines[i])) run.push(lines[i++].replace(/^>\s?/, ''));
  const text = run.join(' ').replace(/\s+/g, ' ');
  const entries = [...text.matchAll(/\*\*(Figures? [A-Z]?[\d.\u2013-]+)\*\*\s*\u2014\s*(.*?)(?=\*\*Figures? [A-Z]?[\d.]|$)/g)];
  for (const [, label, bodyRaw] of entries) {
    const caption = bodyRaw.trim()
      .replace(/`figures\/[a-z0-9-]+\.(svg|png)`/g, '\u00a7')
      .replace(/\u00a7(\s*(and|through)\s*\u00a7)*/g, '')
      .replace(/^[\s:,.]+/, '')
      .replace(/\s+([:,.])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    for (const m of bodyRaw.matchAll(/`figures\/([a-z0-9-]+)\.(svg|png)`/g)) {
      const png = `${m[1]}.png`;
      const path = existsSync(join(RASTER, png)) ? join(RASTER, png) : join(FIGURES, png);
      rendered.push(`![](${path.split('\\').join('/')})`, '');
    }
    rendered.push(`**${label}** \u2014 ${caption}`, '');
  }
}
md = rendered.join('\n');

const tmp = join(OUT, `_${outName}.md`);
writeFileSync(tmp, md, 'utf8');
const dest = join(OUT, `${outName}.docx`);
execFileSync('pandoc', [tmp, '-o', dest, '--resource-path', SRC, '--reference-doc', REFDOC,
                        '--no-highlight', '--toc', '--toc-depth=3'], { stdio: 'pipe' });

// A .docx is a zip. Scan for local-file-header signatures and count word/media entries: the
// only way to know the export is complete, since a missing image fails silently.
const buf = readFileSync(dest);
let embedded = 0;
for (let p = 0; p + 30 < buf.length; p += 1) {
  if (buf.readUInt32LE(p) !== 0x04034b50) continue;
  const nameLen = buf.readUInt16LE(p + 26);
  if (buf.subarray(p + 30, p + 30 + nameLen).toString('latin1').startsWith('word/media/')) embedded += 1;
}
const referenced = (md.match(/^!\[\]\(/gm) || []).length;
console.log(`  ${dest.split('\\').join('/')}`);
console.log(`  figures referenced: ${referenced}   images embedded: ${embedded}`);
if (referenced !== embedded) {
  console.log('  MISMATCH — the export is missing a figure');
  process.exitCode = 1;
}
