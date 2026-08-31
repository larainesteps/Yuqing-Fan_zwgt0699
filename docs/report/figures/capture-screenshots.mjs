// Capture the six interface pages as PNGs for Chapter 4.
// Drives the already-installed Edge through puppeteer-core, so nothing downloads a browser.
//
// Each page now has its own URL, so this navigates rather than clicking the sidebar. The
// previous version drove the interface by clicking `nav button`; the sidebar renders links,
// not buttons, since the interface was split into routed pages, and a click-driven capture
// would silently miss every view.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ORIGIN = process.env.CAPTURE_ORIGIN ?? 'http://localhost:5173';
const PORT = Number(process.env.CAPTURE_DEBUG_PORT ?? 9333);
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

// deviceScaleFactor 2 so the PNGs stay sharp when placed at half width in a print document.
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

const views = [
  ['/', 'Overview', 'fig-4-2-ui-overview'],
  ['/schedule', 'Schedule', 'fig-4-3-ui-schedule'],
  ['/cases', 'Cases', 'fig-4-4-ui-cases'],
  ['/intake', 'Clinical Intake', 'fig-4-5-ui-clinical-intake'],
  ['/resources', 'Resources', 'fig-4-6-ui-resources'],
  ['/evaluation', 'Evaluation', 'fig-4-7-ui-evaluation']
];

// A dedicated profile directory: Edge refuses to start a second instance against the
// user's own profile, which fails with an empty stderr and is easy to misread as a bad path.
const PROFILE = mkdtempSync(join(tmpdir(), 'theatreflow-capture-'));

// Edge 151 exits immediately with code 0 and an empty stderr when asked for --headless,
// so puppeteer.launch() cannot be used. Start a normal Edge positioned off-screen with a
// DevTools port and attach to it instead; page.setViewport still drives the capture size
// through CDP emulation, so the output is identical to a headless run.
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-position=-32000,-32000',
  'about:blank'
], { stdio: 'ignore', detached: false });

async function connectWhenReady(deadlineMs = 30000) {
  const started = Date.now();
  for (;;) {
    try {
      return await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
    } catch (err) {
      if (Date.now() - started > deadlineMs) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

const browser = await connectWhenReady();

try {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  let captured = 0;
  for (const [path, label, file] of views) {
    await page.goto(ORIGIN + path, { waitUntil: 'networkidle0', timeout: 60000 });

    // Each page loads its own data, so wait for that page's placeholder rather than for a
    // single global one.
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading real database records'),
      { timeout: 30000 }
    ).catch(() => console.log(`  (${label}: loading placeholder still present — capturing anyway)`));

    // Confirm the router actually rendered the intended page before capturing.
    const heading = await page.evaluate(() => document.querySelector('main h1')?.textContent?.trim() ?? '');
    if (heading !== label) {
      console.log(`[MISS] ${label.padEnd(16)} heading was "${heading}" — not captured`);
      continue;
    }

    await new Promise(r => setTimeout(r, 1500));
    const h = await page.evaluate(() => document.body.scrollHeight);
    // Viewport rather than full page. A full-page capture of the Overview runs to 4242px;
    // scaled to fit a printed page it would be illegible. A 1440x900 capture stays readable
    // at half page width, at the cost of not showing content below the fold — which the
    // figure caption must state.
    await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: false });
    captured += 1;
    console.log(`[OK]   ${label.padEnd(16)} -> ${file}.png  (viewport 1440x900; full page is ${h}px)`);
  }

  console.log(`\ncaptured ${captured} of ${views.length} pages`);
  console.log(errors.length ? `console errors during capture:\n  ${[...new Set(errors)].slice(0, 5).join('\n  ')}`
                            : 'no console errors during capture');
  if (captured < views.length) process.exitCode = 1;
} finally {
  // close(), not disconnect(): the spawned `edge` handle is the launcher stub, which has
  // already exited, so killing it leaves the real browser running and holding the profile.
  await browser.close();
  await new Promise(r => setTimeout(r, 1500));
  // Windows can still hold a handle on the profile for a moment after the process goes.
  // Losing a temp directory is not worth failing a successful capture over.
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* left in %TEMP% */ }
}
