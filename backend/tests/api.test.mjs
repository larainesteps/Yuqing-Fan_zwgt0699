// Integration tests for the Express API layer.
//
// Why these exist: the 36 Python tests cover the four domain services, but the API that
// orchestrates them — every service call and every database write in the system — had no
// automated coverage at all. These tests exercise the running server over HTTP, which is
// the only way to test the layer that exists to compose other layers.
//
// Run:  npm test           (read-only)
//       npm run test:write (also runs the tests that insert rows — see below)
//
// The API must be running on API_BASE (default http://127.0.0.1:4000) with MySQL reachable.
// Tests that would write to the database are skipped unless API_TEST_ALLOW_WRITES=1,
// because this suite is expected to be run against a working database holding real
// imported data, and a test run should not silently add rows to it.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4000';
const ALLOW_WRITES = process.env.API_TEST_ALLOW_WRITES === '1';
const TIMEOUT = 30_000;

async function api(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const text = await response.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = { __raw: text }; } }
  return { status: response.status, body };
}

let reachable = false;
before(async () => {
  try {
    const { status, body } = await api('/api/health');
    reachable = status === 200 && body?.status === 'ok';
  } catch { reachable = false; }
  if (!reachable) {
    console.error(`\n  API not reachable at ${BASE} — start it with scripts\\start-backend.cmd\n`);
  }
});

const guard = () => { if (!reachable) throw new Error('API not reachable'); };

// ---------------------------------------------------------------- health & contract

describe('health', () => {
  test('reports status and database connectivity', async () => {
    guard();
    const { status, body } = await api('/api/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.ok(['connected', 'skipped'].includes(body.database),
      `unexpected database state: ${body.database}`);
  });
});

// ---------------------------------------------------------------- read models
//
// Each assertion names the keys the front end actually consumes. If a query is rewritten
// and a key disappears, a view breaks silently in the browser; here it fails loudly.

const readModels = [
  ['/api/dashboard', ['summary', 'services', 'cases', 'scheduleTrend', 'resources'], 'object'],
  ['/api/resources', ['doctors', 'nurses', 'theatres', 'beds', 'services'], 'object'],
  ['/api/evaluations', ['overall', 'conflicts', 'utilisation', 'moduleReport'], 'object'],
  ['/api/cases', ['appointment_id', 'service_type', 'requested_datetime'], 'array'],
  ['/api/schedules/latest', ['appointment_id', 'status', 'scheduled_datetime'], 'array'],
  ['/api/schedules/locks', [], 'array'],
  ['/api/intake/cases', ['id', 'caseId', 'status'], 'array']
];

describe('read models', () => {
  for (const [path, keys, kind] of readModels) {
    test(`${path} returns the documented shape`, async () => {
      guard();
      const { status, body } = await api(path);
      assert.equal(status, 200, `${path} returned ${status}`);
      if (kind === 'array') {
        assert.ok(Array.isArray(body), `${path} should return an array`);
        if (body.length && keys.length) {
          for (const k of keys) assert.ok(k in body[0], `${path}[0] is missing "${k}"`);
        }
      } else {
        assert.equal(typeof body, 'object');
        assert.ok(!Array.isArray(body));
        for (const k of keys) assert.ok(k in body, `${path} is missing "${k}"`);
      }
    });
  }
});

// ---------------------------------------------------------------- known inconsistency
//
// This test documents current behaviour rather than desired behaviour, and says so.
// GET /api/cases hardcodes LIMIT 250 and ignores any ?limit= given to it, while
// GET /api/intake/cases honours its limit. A caller passing ?limit=2 to the first gets
// 250 rows and no indication that the parameter was discarded.
//
// If the route is ever fixed to honour ?limit=, this test SHOULD fail — that is the
// signal to update it, not a regression.

describe('query parameter handling', () => {
  test('GET /api/cases ignores ?limit= (documents current behaviour)', async () => {
    guard();
    const small = await api('/api/cases?limit=2');
    const large = await api('/api/cases?limit=500');
    assert.equal(small.status, 200);
    assert.equal(small.body.length, large.body.length,
      'the two responses differ, so ?limit= now has an effect — update this test');
    assert.ok(small.body.length <= 250, 'server-side cap should still apply');
  });

  test('GET /api/intake/cases honours ?limit=', async () => {
    guard();
    const { status, body } = await api('/api/intake/cases?limit=1');
    assert.equal(status, 200);
    assert.ok(body.length <= 1, `expected at most 1 row, got ${body.length}`);
  });
});

// ---------------------------------------------------------------- input validation
//
// The routes validate request bodies with zod. What matters is that a bad request is
// rejected as a client error: a 500 here would mean the validation was bypassed and the
// failure happened somewhere deeper, which is both a worse diagnostic and a sign that
// unvalidated input reached the database or a service.

const badRequests = [
  ['/api/intake/process', {}, 'empty body'],
  ['/api/intake/process', { case_id: '', note_text: '' }, 'blank required fields'],
  ['/api/schedules/generate', { caseLimit: -1 }, 'negative case limit'],
  ['/api/workflows/run', { slotMinutes: 0 }, 'zero slot length'],
  ['/api/experiments/run', { caseCounts: 'not-an-array' }, 'wrong type for caseCounts'],
  ['/api/schedules/locks', {}, 'lock without a case id']
];

describe('input validation', () => {
  for (const [path, payload, label] of badRequests) {
    test(`POST ${path} rejects ${label} with a 4xx`, async () => {
      guard();
      const { status } = await api(path, { method: 'POST', body: JSON.stringify(payload) });
      assert.ok(status >= 400 && status < 500,
        `expected a client error, got ${status} — a 5xx means validation did not catch this`);
    });
  }

  test('malformed JSON is a client error, not a crash', async () => {
    guard();
    const { status } = await api('/api/intake/process', { method: 'POST', body: '{not json' });
    assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
  });

  test('an unknown route returns 404', async () => {
    guard();
    const { status } = await api('/api/no-such-route');
    assert.equal(status, 404);
  });
});

// ---------------------------------------------------------------- locks round-trip

describe('schedule locks', () => {
  test('a lock can be created and removed', { skip: !ALLOW_WRITES && 'set API_TEST_ALLOW_WRITES=1' }, async () => {
    guard();
    const caseId = `APITEST-LOCK-${Date.now()}`;
    const created = await api('/api/schedules/locks', {
      method: 'POST',
      body: JSON.stringify({ caseId, actor: 'api.test', reason: 'integration test' })
    });
    assert.ok(created.status < 400, `lock creation failed with ${created.status}`);
    try {
      const list = await api('/api/schedules/locks');
      assert.ok(list.body.some(l => l.caseId === caseId || l.case_id === caseId),
        'the created lock does not appear in the lock list');
    } finally {
      const removed = await api(`/api/schedules/locks/${encodeURIComponent(caseId)}`, { method: 'DELETE' });
      assert.ok(removed.status < 400, `cleanup failed with ${removed.status} — ${caseId} may be left behind`);
    }
  });
});

// ---------------------------------------------------------------- the safety invariant
//
// This is the most important test in the file. Requirement N1 says no extraction may reach
// a schedule without human approval, and the design enforces it by not providing a route
// that creates an approved case. That is a property of the API surface, so it belongs in an
// API test: if someone later adds a convenience route, or changes the intake handler to
// auto-approve, nothing else in the project would notice.

describe('N1 — no unreviewed extraction can be scheduled', () => {
  test('POST /api/intake/process yields a case awaiting review, never approved', {
    skip: !ALLOW_WRITES && 'set API_TEST_ALLOW_WRITES=1 (this test inserts a case)'
  }, async () => {
    guard();
    const caseId = `APITEST-N1-${Date.now()}`;
    const { status, body } = await api('/api/intake/process', {
      method: 'POST',
      body: JSON.stringify({
        contract_version: 'v1',
        case_id: caseId,
        note_text: 'A de-identified patient is listed for laparoscopic appendectomy under '
                 + 'General Surgery. Emergency intervention is required within 4 hours. '
                 + 'The expected operating time is 75 minutes.',
        language: 'en',
        source: 'api-integration-test',
        deidentified: true,
        submitted_at: new Date().toISOString(),
        actor: 'api.test'
      })
    });

    assert.ok(status < 400, `intake failed with ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    assert.equal(body.status, 'REVIEW_REQUIRED',
      `a newly processed note must await review, but its status was "${body.status}"`);
    assert.notEqual(body.status, 'APPROVED');
    assert.notEqual(body.status, 'SCHEDULED');
  });

  // This one also writes: it has to actually post a note to see what the server does with a
  // client-supplied status. An earlier version of this file left it ungated, and a
  // read-only run silently inserted a case — hence the gate.
  test('a client-supplied status is not honoured', {
    skip: !ALLOW_WRITES && 'set API_TEST_ALLOW_WRITES=1 (this test inserts a case)'
  }, async () => {
    guard();
    // Approval must go through the explicit endpoint on an existing review. Posting an
    // approved status directly must not be honoured.
    const { status, body } = await api('/api/intake/process', {
      method: 'POST',
      body: JSON.stringify({
        contract_version: 'v1',
        case_id: `APITEST-N1-INJECT-${Date.now()}`,
        note_text: 'Routine procedure.',
        language: 'en',
        source: 'api-integration-test',
        deidentified: true,
        submitted_at: new Date().toISOString(),
        status: 'APPROVED',
        actor: 'api.test'
      })
    });
    if (status < 400) {
      assert.notEqual(body.status, 'APPROVED',
        'a client-supplied status was honoured — unreviewed output could reach a schedule');
    }
  });
});

after(() => {
  if (!reachable) process.exitCode = 1;
  else if (!ALLOW_WRITES) {
    console.log('\n  Write tests were skipped. Run with API_TEST_ALLOW_WRITES=1 to include');
    console.log('  them; they insert a lock and one or two intake cases into the database.\n');
  }
});
