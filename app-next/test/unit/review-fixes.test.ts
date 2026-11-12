// Regression tests for the pre-merge review findings (Codex, 2026-11-08): redaction coverage, origin scheme, tracing
// containment, byte caps, error-code membership, retry back-off and payload encoding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ApproveBody, parseOrThrow } from '../../lib/contracts/api.ts';
import { openDb } from '../../lib/db/connection.ts';
import { createOpenAIModel } from '../../lib/model/openai.ts';
import { capText, redactDeep, redactText } from '../../lib/obs/redact.ts';
import { checkOrigin, defineRoute, toErrorResponse } from '../../lib/obs/route.ts';
import { LIMITS, configureTracing, getTrace, recordLlmAttempt, renewLeases, withSpan, withTrace } from '../../lib/obs/tracer.ts';
import { logger, setLogSink } from '../../lib/obs/logger.ts';
import { AppError } from '../../lib/contracts/errors.ts';
import { z } from 'zod';

const newDb = () => { const db = openDb(':memory:'); configureTracing({ getDb: () => db }); return db; };
const req = (url: string, headers: Record<string, string> = {}, method = 'POST') => new Request(url, { method, headers });

test('1. redaction: secret-named keys are blanked BEFORE serialisation, arbitrary env secrets are removed by value, key names are redacted', async () => {
  const db = newDb();
  process.env.OPENAI_API_KEY = 'plainSecretValue-9f8e7d6c';
  try {
    const id = await withTrace({ kind: 'http', name: 'x' }, async (tid) => {
      await withSpan('llm', 'x', {}, async () => {
        recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok',
          request: { password: 'hunter2', nested: { Authorization: 'Bearer abcdefgh12345678', 'jane@example.org': 'k' }, text: 'uses plainSecretValue-9f8e7d6c here' },
          response: 'echo plainSecretValue-9f8e7d6c and jane@example.org' });
      });
      return tid;
    });
    const l = getTrace(db, id)!.llm[0];
    for (const text of [l.request_json, l.response_raw]) { assert.doesNotMatch(text, /hunter2|plainSecretValue|abcdefgh12345678|jane@example/); }
    assert.ok(l.request_json.includes('[redacted]'));
  } finally { process.env.OPENAI_API_KEY = ''; }
});

test('1. redaction: trace names, span names and metadata are redacted; request-derived error text never repeats secrets or field names', async () => {
  const db = newDb();
  const id = await withTrace({ kind: 'http', name: 'POST /x for jane@example.org' }, async (tid) => {
    await withSpan('stage', 'step sk-live-0123456789abcdef', {}, async () => {
      recordLlmAttempt({ attempt: 1, provider: 'prov jane@example.org', model: 'm sk-live-0123456789abcdef', promptId: 'p@example.org', status: 'ok' });
    });
    return tid;
  });
  const t = getTrace(db, id)!;
  assert.doesNotMatch(JSON.stringify(t), /jane@example|sk-live|p@example/);
  // a field NAME that is an email or a secret is not echoed back
  let err: AppError | null = null;
  try { parseOrThrow(ApproveBody, { 'jane@example.org': 1, 'sk-live-0123456789abcdef': 2 }); } catch (e) { err = e as AppError; }
  assert.ok(err);
  const body = JSON.stringify(await toErrorResponse(err, 't1').json());
  assert.doesNotMatch(body, /jane@example|sk-live/);
  assert.match(body, /invalid name/);
  assert.deepEqual(redactDeep({ token: 'x', ok: 'sk-abcdefghij' }), { token: '[redacted]', ok: '[redacted]' });
  assert.equal(redactText('a b'), 'a b');
});

test('2. origin: scheme, host and port must all match; null, malformed and missing Origin are refused; TRUSTED_ORIGINS allows a proxy', () => {
  const url = 'http://example.com:3000/api/x';
  const ok = (origin: string, trusted: string[] = []) => { try { checkOrigin(req(url, { origin }), trusted); return true; } catch { return false; } };
  assert.equal(ok('http://example.com:3000'), true);
  assert.equal(ok('https://example.com:3000'), false, 'scheme');
  assert.equal(ok('http://example.com:3001'), false, 'port');
  assert.equal(ok('http://evil.example'), false);
  assert.equal(ok('null'), false);
  assert.equal(ok('not a url'), false);
  assert.equal(ok('https://app.example.org', ['https://app.example.org']), true, 'listed proxy origin');
  assert.throws(() => checkOrigin(req(url), []), /no Origin header/);
  assert.doesNotThrow(() => checkOrigin(req(url, { 'sec-fetch-site': 'same-origin' }), []));
  assert.throws(() => checkOrigin(req(url, { 'sec-fetch-site': 'cross-site' }), []));
});

test('3. containment: a trace store that fails at flush, or a throwing log sink, never changes the application result', async () => {
  let calls = 0;
  configureTracing({ getDb: () => { calls += 1; if (calls > 1) throw new Error('cannot open database'); return openDb(':memory:'); } }); // first call (root insert) works, the flush cannot get a connection
  const restore = setLogSink(() => { throw new Error('sink exploded'); });
  try {
    assert.equal(await withTrace({ kind: 'http', name: 'a' }, async () => 'result'), 'result');
    await assert.rejects(withTrace({ kind: 'http', name: 'b' }, async () => { throw new Error('app error'); }), /app error/); // the application error survives
    logger.error('this must not throw');
  } finally { restore(); }
});

test('3. containment: an API route always returns a response, even when the trace store is unusable', async () => {
  configureTracing({ getDb: () => { throw new Error('no database'); } });
  const restore = setLogSink(() => {});
  try {
    const okRoute = defineRoute({ method: 'GET', pattern: '/api/t', query: z.object({}).strict() }, () => ({ fine: true }));
    const res = await okRoute(new Request('http://localhost/api/t'));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { fine: true });
    assert.ok(res.headers.get('x-trace-id'));
    const badRoute = defineRoute({ method: 'GET', pattern: '/api/t2', query: z.object({}).strict() }, () => { throw new Error('boom'); });
    const bad = await badRoute(new Request('http://localhost/api/t2'));
    assert.equal(bad.status, 500);
    assert.equal((await bad.json() as any).error.code, 'internal');
  } finally { restore(); }
});

test('4. caps are in UTF-8 bytes and include the truncation marker; merged attributes stay within the limit', async () => {
  const db = newDb();
  const c = capText('é'.repeat(100_000), LIMITS.payloadField);
  assert.ok(Buffer.byteLength(c.text) <= LIMITS.payloadField, `cut text is ${Buffer.byteLength(c.text)} bytes`);
  assert.ok(c.truncated && c.original_bytes === 200_000);
  const id = await withTrace({ kind: 'http', name: 'caps' }, async (tid) => {
    await withSpan('stage', 'x', { name: 'a' }, async (s) => { for (let i = 0; i < 50; i++) s.set({ name: 'é'.repeat(100), status: `s${i}`.repeat(40), errors: i }); recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok' }); });
    await withSpan('llm', 'big', {}, async () => { recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok', response: 'é'.repeat(300_000) }); });
    return tid;
  });
  const t = getTrace(db, id)!;
  assert.ok(Buffer.byteLength(t.spans[0].attributes_json) <= LIMITS.attrBytes + 80, `attributes ${Buffer.byteLength(t.spans[0].attributes_json)} bytes`);
  assert.ok(Buffer.byteLength(t.llm.find((l: any) => l.response_raw)?.response_raw) <= LIMITS.payloadField);
});

test('5. error mapping uses own properties only: inherited names are not error codes', () => {
  const restore = setLogSink(() => {});
  try {
  for (const code of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    const res = toErrorResponse(Object.assign(new Error('x'), { code }), 't');
    assert.equal(res.status, 500, code);
  }
  assert.equal(toErrorResponse(Object.assign(new Error('x'), { code: 'not_found' }), 't').status, 404);
  } finally { restore(); }
});

test('6. a missing Retry-After header backs off exponentially (not 0 seconds); trace payloads are stored as plain JSON and plain text', async () => {
  const sleeps: number[] = [];
  const bad = { ok: false, status: 503, headers: { get: () => null } };
  const good = { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"answer":"he said \\"hi\\"\\n"}' } }] }) };
  const seq = [bad, bad, good]; let n = 0;
  const m = createOpenAIModel({ OPENAI_API_KEY: 'sk-test-0123456789abcdef' }, async () => seq[n++], { sleep: async (ms: number) => { sleeps.push(ms); } });
  const db = newDb();
  const id = await withTrace({ kind: 'http', name: 'retry' }, async (tid) => { await withSpan('llm', 'ask', {}, async () => { await m.ask({ role: { title: 'T', client: 'C' }, brief: { version: 1, fields: {} }, question: 'What "quoted" thing?', history: [] }); }); return tid; });
  assert.deepEqual(sleeps, [500, 1000]);
  const l = getTrace(db, id)!.llm.at(-1);
  const req = JSON.parse(l.request_json); // valid JSON, not an escaped fragment
  assert.equal(req.messages.at(-1).role, 'user');
  assert.match(req.messages.at(-1).content, /What \\"quoted\\" thing\?/);
  assert.equal(l.response_raw, '{"answer":"he said \\"hi\\"\\n"}'); // the provider text, byte for byte
});

test('7. lease recovery also runs on every heartbeat tick, not only at start-up', () => {
  const db = newDb();
  const t0 = Date.now();
  db.prepare("INSERT INTO traces(id, name, kind, status, started_at, owner_id, heartbeat_at) VALUES ('late','late','cli','running',?,?,?)")
    .run(new Date(t0 - 3_600_000).toISOString(), 'other-process', new Date(t0 - 3_000_000).toISOString());
  assert.equal(db.prepare("SELECT status FROM traces WHERE id = 'late'").get().status, 'running');
  renewLeases(); // what the timer does each tick
  const tickRecovered = db.prepare("SELECT status FROM traces WHERE id = 'late'").get().status;
  assert.equal(tickRecovered, 'interrupted');
});
