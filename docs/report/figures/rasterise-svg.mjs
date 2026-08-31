// Rasterise the SVG figures to PNG so pandoc can embed them in the .docx.
// Word 2016+ can display SVG natively, so the SVGs remain the better source for final
// typesetting — these PNGs exist only so the exported draft carries its figures inline.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.RASTER_DEBUG_PORT ?? 9388);
const [SRC, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter(n => n.endsWith('.svg')).sort();
// Edge 151 exits with code 0 and an empty stderr when asked for --headless, so
// puppeteer.launch() cannot be used. Start a normal Edge off-screen with a DevTools port
// and attach; setViewport still drives the capture size through CDP emulation.
const PROFILE = mkdtempSync(join(tmpdir(), 'theatreflow-raster-'));
spawn(EDGE, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-position=-32000,-32000',
  'about:blank'
], { stdio: 'ignore' });

let browser;
for (let i = 0; i < 60; i += 1) {
  try {
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
    break;
  } catch {
    await new Promise(r => setTimeout(r, 500));
  }
}
if (!browser) throw new Error(`Edge did not open a DevTools port on ${PORT}`);
try {
  const page = await browser.newPage();
  for (const f of files) {
    const svg = readFileSync(join(SRC, f), 'utf8');
    const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
    await page.setViewport({ width: Math.ceil(w), height: Math.ceil(h), deviceScaleFactor: 3 });
    await page.setContent(
      `<style>html,body{margin:0;padding:0}svg{display:block}</style>${svg}`,
      { waitUntil: 'load' }
    );
    const name = f.replace(/\.svg$/, '.png');
    await page.screenshot({ path: join(OUT, name), omitBackground: false });
    console.log(`  ${f}  ->  ${name}  (${w}x${h} @3x)`);
  }
} finally {
  await browser.close();
  await new Promise(r => setTimeout(r, 1500));
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* left in %TEMP% */ }
}
console.log(`\nrasterised ${files.length} figures`);
