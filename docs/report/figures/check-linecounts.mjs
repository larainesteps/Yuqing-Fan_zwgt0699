// Chapter 4 cites the length of several source files. Those numbers go stale the moment the
// file is touched — four of them were wrong when the chapter was verified, and one went stale
// again during the same session. This checks every "<path>`, N lines" claim in the drafts
// against the file it names.
//
//   node docs/report/figures/check-linecounts.mjs <repo-root>
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] ?? '.';
const DRAFTS = join(ROOT, 'docs', 'report');
const SKIP = new Set(['node_modules', '.venv', '.git', 'dist', '__pycache__']);

// The drafts cite lengths in two shapes:
//   `services/common/runtime.py`, a 159-line wrapper
//   `experiments.ts` (513)
const PATTERNS = [
  /`([\w./-]+\.(?:py|ts|tsx|mjs))`,?\s+(?:a\s+)?(\d[\d,]*)[- ]lines?\b/g,
  /`([\w./-]+\.(?:py|ts|tsx|mjs))`\s*\((\d[\d,]*)\)/g
];

// A draft may name a file without its directory. Resolve those by searching the tree.
const index = new Map();
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (!index.has(entry.name)) index.set(entry.name, full);
  }
})(ROOT);

function resolve(relative) {
  const direct = join(ROOT, relative);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  return index.get(relative.split('/').pop()) ?? null;
}

let checked = 0;
let failures = 0;

for (const name of readdirSync(DRAFTS).filter(n => n.endsWith('.md'))) {
  const text = readFileSync(join(DRAFTS, name), 'utf8');
  const seen = new Set();

  for (const pattern of PATTERNS) {
    for (const [, relative, claimedRaw] of text.matchAll(pattern)) {
      const key = `${relative}:${claimedRaw}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const path = resolve(relative);
      if (!path) {
        console.log(`[MISS] ${name}: ${relative} does not exist`);
        failures += 1;
        continue;
      }

      const actual = readFileSync(path, 'utf8').split('\n').length - 1;
      const claimed = Number(claimedRaw.replace(/,/g, ''));
      checked += 1;

      if (actual === claimed) {
        console.log(`[OK]   ${relative.padEnd(46)} ${claimed}`);
      } else {
        console.log(`[FAIL] ${relative.padEnd(46)} draft says ${claimed}, file has ${actual}  (${name})`);
        failures += 1;
      }
    }
  }
}

console.log(
  failures
    ? `\n${failures} line count(s) out of date — update the draft or drop the number`
    : `\nall ${checked} cited line counts match`
);
process.exit(failures ? 1 : 0);
