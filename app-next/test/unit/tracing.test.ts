// T-O: observability. Traces, spans, llm_calls, redaction, caps, leases and best-effort persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, closeDb } from '../../lib/db/connection.ts';
import { LIMITS, OWNER_ID, configureTracing, getTrace, lastTraceId, pruneTraces, recoverStale, recordLlmAttempt, renderTrace, renewLeases, withSpan, withTrace } from '../../lib/obs/tracer.ts';
import { setLogSink, logger } from '../../lib/obs/logger.ts';
import { redactText, safeError } from '../../lib/obs/redact.ts';
import { createOpenAIModel } from '../../lib/model/openai.ts';

process.env.OPENAI_API_KEY = ''; // never use a real key in this file
const FAKE_KEY = 'sk-test-0123456789abcdefghij';
const newDb = () => { const db = openDb(':memory:'); configureTracing({ getDb: () => db }); return db; };
const logs = () => { const lines: string[] = []; const restore = setLogSink((l) => lines.push(l)); return { lines, restore }; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('O1: one trace, nested spans with correct parents and timing', async () => {
  const db = newDb();
  const id = await withTrace({ kind: 'cli', name: 'cli.test', attrs: { command: 'rebuild' } }, async (tid) => {
    await withSpan('source', 'nw-01', { source_id: 'nw-01', channel: 'jd' }, async () => {
      await sleep(5);
      await withSpan('stage', '2 Extract changes', { stage: 2 }, async () => { await sleep(5); });
    });
    return tid;
  });
  const t = getTrace(db, id)!;
  assert.equal(t.trace.status, 'ok');
  assert.equal(t.spans.length, 2);
  const [source, stage] = t.spans;
  assert.equal(source.parent_id, null);
  assert.equal(stage.parent_id, source.id);
  assert.ok(Date.parse(stage.start) >= Date.parse(source.start) && Date.parse(stage.end) <= Date.parse(source.end));
  assert.match(renderTrace(db, id), /source nw-01[\s\S]*stage 2 Extract changes/);
});

test('O1: 20 concurrent traces never mix spans, across awaits and thrown errors', async () => {
  const db = newDb();
  const ids = await Promise.all(Array.from({ length: 20 }, (_, i) => withTrace({ kind: 'http', name: `req ${i}` }, async (tid) => {
    try {
      await withSpan('stage', `a${i}`, {}, async () => { await sleep(Math.random() * 15); await withSpan('check', `b${i}`, {}, async () => { await sleep(Math.random() * 15); if (i % 5 === 0) throw new Error(`boom ${i}`); }); });
    } catch { /* expected for every fifth */ }
    return tid;
  })));
  assert.equal(new Set(ids).size, 20);
  ids.forEach((tid, i) => {
    const t = getTrace(db, tid)!;
    assert.deepEqual(t.spans.map((s: any) => s.name).sort(), [`a${i}`, `b${i}`]);
    assert.equal(t.trace.name, `req ${i}`);
    const b = t.spans.find((s: any) => s.name === `b${i}`);
    assert.equal(b.status, i % 5 === 0 ? 'error' : 'ok');
  });
});

test('O1: a failing request marks the trace error and records a redacted, short error', async () => {
  const db = newDb();
  let tid = '';
  await assert.rejects(withTrace({ kind: 'http', name: 'bad' }, async (id) => { tid = id; await withSpan('stage', 'x', {}, () => { throw new Error(`failed with ${FAKE_KEY} and a@b.example ${'x'.repeat(900)}`); }); }));
  const t = getTrace(db, tid)!;
  assert.equal(t.trace.status, 'error');
  assert.ok(t.spans[0].error.length <= 520);
  assert.doesNotMatch(t.spans[0].error, /sk-test|a@b\.example/);
});

test('O2: llm attempts: 2 retries make 3 rows under one llm span, with prompt hash and usage; the check result sits on the span', async () => {
  const db = newDb();
  const responses = [{ ok: false, status: 429, headers: { get: () => '0' } }, { ok: false, status: 503, headers: { get: () => null } },
    { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"answer":"hi"}' } }], usage: { prompt_tokens: 11, completion_tokens: 7 } }) }];
  let n = 0;
  const m = createOpenAIModel({ OPENAI_API_KEY: FAKE_KEY, OPENAI_MODEL: 'gpt-test' }, async () => responses[n++], { sleep: async () => {} });
  const id = await withTrace({ kind: 'http', name: 'POST /api/roles/:id/ask' }, async (tid) => {
    await withSpan('llm', 'ask', { model: 'openai', purpose: 'ask' }, async (span) => {
      await m.ask({ role: { title: 'T', client: 'C' }, brief: { version: 1, fields: {} }, question: 'What?', history: [] });
      span.set({ check: 'pass', errors: 0 });
    });
    return tid;
  });
  const t = getTrace(db, id)!;
  assert.equal(t.llm.length, 3);
  assert.deepEqual(t.llm.map((l: any) => [l.attempt, l.status, l.http_status]), [[1, 'error', 429], [2, 'error', 503], [3, 'ok', 200]]);
  assert.equal(new Set(t.llm.map((l: any) => l.span_id)).size, 1);
  assert.match(t.llm[2].prompt_id, /ask\.md/);
  assert.match(t.llm[2].prompt_sha, /^[0-9a-f]{12}$/);
  assert.equal(t.llm[2].prompt_tokens, 11);
  assert.equal(t.llm[2].completion_tokens, 7);
  assert.equal(JSON.parse(t.spans[0].attributes_json).check, 'pass');
  assert.doesNotMatch(t.llm[2].request_json, /system prompt text/); // the system prompt is referenced by id@hash, not repeated
  assert.match(t.llm[2].request_json, /system prompt ask\.md@/);
});

test('O3: privacy: the key, email and phone never reach logs, trace rows, error bodies or the database files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-priv-'));
  const file = path.join(dir, 't.db');
  const db = openDb(file);
  configureTracing({ getDb: () => db });
  const { lines, restore } = logs();
  process.env.OPENAI_API_KEY = FAKE_KEY;
  const email = 'jane.private@example.org';
  const phone = '+34 600 123 456';
  const echoing = async (_u: any, o: any) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ echoed: JSON.parse(o.body).messages.at(-1).content, key: FAKE_KEY }) } }] }) });
  const m = createOpenAIModel({ OPENAI_API_KEY: FAKE_KEY }, echoing);
  let errorText = '';
  let tid = '';
  try {
    await assert.rejects(withTrace({ kind: 'http', name: 'privacy' }, async (id) => {
      tid = id;
      await withSpan('llm', 'ask', {}, async () => { await m.ask({ role: { title: 'T', client: 'C' }, brief: { version: 1, fields: {} }, question: `Contact ${email} or ${phone}`, history: [] }); });
      logger.info('request', { note: `mail ${email} key ${FAKE_KEY}`, authorization: `Bearer ${FAKE_KEY}` });
      const e = new Error(`exception echoing source text ${email} ${phone} ${FAKE_KEY}`);
      errorText = safeError(e);
      throw e;
    }));
  } finally { restore(); process.env.OPENAI_API_KEY = ''; }
  const rows = JSON.stringify([db.prepare('SELECT * FROM traces').all(), db.prepare('SELECT * FROM spans').all(), db.prepare('SELECT * FROM llm_calls').all()]);
  const stdout = lines.join('\n');
  const files = ['', '-wal', '-shm'].map((s) => (fs.existsSync(file + s) ? fs.readFileSync(file + s).toString('latin1') : '')).join('\n');
  for (const [label, text] of [['trace rows', rows], ['stdout', stdout], ['error text', errorText], ['db files', files]] as const) {
    assert.doesNotMatch(text, /sk-test-0123/, `${label}: key`);
    assert.doesNotMatch(text, /jane\.private@example\.org/, `${label}: email`);
    assert.doesNotMatch(text, /600 123 456/, `${label}: phone`);
  }
  assert.ok(rows.includes('[redacted]'), 'redaction left a marker');
  assert.ok(stdout.includes(tid), 'log lines carry the trace id');
  closeDb(file);
});

test('O3: TRACE_PAYLOADS=meta keeps only sizes; off keeps nothing', async () => {
  const db = newDb();
  for (const mode of ['meta', 'off'] as const) {
    process.env.TRACE_PAYLOADS = mode;
    try {
      const id = await withTrace({ kind: 'http', name: mode }, async (tid) => { await withSpan('llm', 'x', {}, async () => { recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok', request: { q: 'hello world' }, response: 'a long answer here' }); }); return tid; });
      const l = getTrace(db, id)!.llm[0];
      assert.equal(l.request_json, null);
      assert.equal(l.response_raw, null);
      assert.equal(l.original_bytes > 0, mode === 'meta');
    } finally { delete process.env.TRACE_PAYLOADS; }
  }
});

test('O4/O9: caps: payload field 64 KB, payload budget 2 MB (checked before buffering), attribute size, 6 attempt rows, 2000 spans', async () => {
  const db = newDb();
  // payload field cap
  let id = await withTrace({ kind: 'http', name: 'big' }, async (tid) => { await withSpan('llm', 'x', {}, async () => { recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok', response: 'z'.repeat(200_000) }); }); return tid; });
  let l = getTrace(db, id)!.llm[0];
  assert.ok(l.response_raw.length < 66_000 && l.truncated === 1 && l.original_bytes >= 200_000);
  // trace payload budget: ~64 KB each, so 40 attempts overflow 2 MB; rows past the cap carry no payload and the trace is flagged
  id = await withTrace({ kind: 'http', name: 'budget' }, async (tid) => {
    for (let i = 0; i < 40; i++) await withSpan('llm', `c${i}`, {}, async () => { recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok', response: String.fromCharCode(97 + (i % 26)).repeat(70_000) }); });
    return tid;
  });
  const t = getTrace(db, id)!;
  assert.equal(t.trace.truncated, 1);
  const stored = t.llm.reduce((n: number, x: any) => n + (x.response_raw ? x.response_raw.length : 0), 0);
  assert.ok(stored <= LIMITS.payloadTrace + 1000, `stored ${stored}`);
  assert.ok(t.llm.some((x: any) => x.response_raw === null));
  // attempts per logical call
  id = await withTrace({ kind: 'http', name: 'attempts' }, async (tid) => { await withSpan('llm', 'x', {}, async () => { for (let i = 0; i < 10; i++) recordLlmAttempt({ attempt: i, provider: 'p', status: 'error' }); }); return tid; });
  assert.equal(getTrace(db, id)!.llm.length, LIMITS.attempts);
  // attribute size and allowlist
  id = await withTrace({ kind: 'http', name: 'attrs' }, async (tid) => { await withSpan('stage', 'x', { name: 'y'.repeat(5000), free_text: 'must not be stored', stage: 2 } as any, async () => {}); return tid; });
  const a = JSON.parse(getTrace(db, id)!.spans[0].attributes_json);
  assert.ok(!('free_text' in a));
  assert.ok(JSON.stringify(a).length <= LIMITS.attrBytes + 50);
  // span cap: 2500 parents with one child each (5000 spans) keep 2000; no kept span points at a dropped parent
  id = await withTrace({ kind: 'cli', name: 'many' }, async (tid) => {
    for (let i = 0; i < 2500; i++) await withSpan('check', `s${i}`, {}, async () => { await withSpan('check', `c${i}`, {}, async () => {}); });
    return tid;
  });
  const many = getTrace(db, id)!;
  assert.equal(many.spans.length, LIMITS.spans);
  assert.equal(many.trace.dropped_spans, 3000);
  const kept = new Set(many.spans.map((s: any) => s.id));
  assert.ok(many.spans.every((s: any) => s.parent_id === null || kept.has(s.parent_id)));
});

test('O5/O7: persistence is best-effort: a failing flush or root insert never fails the request', async () => {
  const db = openDb(':memory:');
  const lg = logs();
  try {
    // flush failure
    let boom = false;
    const flaky: any = { prepare: (sql: string) => db.prepare(sql), exec: (sql: string) => { if (boom && sql.startsWith('BEGIN IMMEDIATE')) throw new Error('disk I/O error'); db.exec(sql); }, close: () => {} };
    configureTracing({ getDb: () => flaky });
    const out = await withTrace({ kind: 'http', name: 'flush-fails' }, async (tid) => { boom = true; return `ok ${tid.length}`; });
    boom = false;
    assert.match(out, /^ok /);
    // root insert failure
    const noInsert: any = { prepare: (sql: string) => { if (sql.startsWith('INSERT INTO traces')) throw new Error('read-only database'); return db.prepare(sql); }, exec: (s: string) => db.exec(s), close: () => {} };
    configureTracing({ getDb: () => noInsert });
    const out2 = await withTrace({ kind: 'http', name: 'insert-fails' }, async () => 'fine');
    assert.equal(out2, 'fine');
  } finally { lg.restore(); }
  const warnings = lg.lines.map((l) => JSON.parse(l)).filter((r) => r.msg === 'trace.persist_failed');
  assert.deepEqual(warnings.map((w) => w.stage).sort(), ['flush', 'root-insert']);
  assert.ok(warnings.every((w) => typeof w.traceId === 'string'));
});

test('O6: leases: a live owner survives recovery and prune; an expired lease becomes interrupted; prune keeps running traces', () => {
  const db = newDb();
  const t0 = Date.parse('2026-11-08T10:00:00Z');
  const row = (id: string, status: string, started: string, heartbeat: string, owner = 'other') =>
    db.prepare("INSERT INTO traces(id, name, kind, status, started_at, owner_id, heartbeat_at) VALUES (?,?,?,?,?,?,?)").run(id, id, 'cli', status, started, owner, heartbeat);
  row('live', 'running', '2026-11-01T00:00:00Z', '2026-11-08T09:59:30Z'); // old trace, fresh heartbeat: a long run
  row('dead', 'running', '2026-11-08T09:00:00Z', '2026-11-08T09:30:00Z');
  row('old-ok', 'ok', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
  row('new-ok', 'ok', '2026-11-08T09:00:00Z', '2026-11-08T09:00:00Z');
  assert.equal(recoverStale(db, { nowMs: t0 }), 1);
  const st = (id: string) => db.prepare('SELECT status FROM traces WHERE id = ?').get(id)?.status;
  assert.equal(st('live'), 'running');
  assert.equal(st('dead'), 'interrupted');
  assert.equal(pruneTraces(db, { olderThanDays: 7, nowMs: t0 }), 1); // only old-ok; "live" is old but running; "dead" is recent
  assert.equal(st('old-ok'), undefined);
  assert.equal(st('live'), 'running');
  assert.equal(pruneTraces(db, { olderThanDays: 1, nowMs: t0 + 10 * 86_400_000 }), 2); // new-ok and dead (finished); live is still running
  assert.equal(st('live'), 'running');
});

test('O6: fencing: if the lease is lost mid-trace, the owner writes nothing, logs trace.lease_lost, and a renewal cannot revive it', async () => {
  const db = newDb();
  const lg = logs();
  let tid = '';
  try {
    await withTrace({ kind: 'cli', name: 'paused-owner' }, async (id) => {
      tid = id;
      await withSpan('stage', 'before', {}, async () => {});
      // another process recovers this trace while the owner is paused
      db.prepare("UPDATE traces SET status = 'interrupted', ended_at = ? WHERE id = ?").run(new Date().toISOString(), id);
      renewLeases(); // the resumed owner tries to renew: must not revive it
    });
  } finally { lg.restore(); }
  assert.equal(db.prepare('SELECT status FROM traces WHERE id = ?').get(tid).status, 'interrupted');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM spans WHERE trace_id = ?').get(tid).n, 0);
  assert.ok(lg.lines.some((l) => JSON.parse(l).msg === 'trace.lease_lost'));
  assert.ok(OWNER_ID.length > 4);
});

test('O6: the link from a stage record to its trace resolves, and reads as "pruned" once the trace is gone', async () => {
  const db = newDb();
  const id = await withTrace({ kind: 'cli', name: 'link' }, async (tid) => tid);
  assert.match(renderTrace(db, id), /cli link/);
  db.prepare('DELETE FROM traces WHERE id = ?').run(id);
  assert.match(renderTrace(db, id), /pruned/);
  assert.equal(lastTraceId(db), null);
});

test('logger: JSON lines with trace ids, LOG_LEVEL filtering and redaction', async () => {
  const lg = logs();
  try {
    process.env.LOG_LEVEL = 'warn';
    logger.info('hidden');
    logger.warn('shown', { token: FAKE_KEY, nested: { mail: 'x.y@z.example' } });
    process.env.LOG_LEVEL = 'info';
    logger.info('inside', {});
  } finally { delete process.env.LOG_LEVEL; lg.restore(); }
  assert.equal(lg.lines.length, 2);
  const rec = JSON.parse(lg.lines[0]!);
  assert.equal(rec.level, 'warn');
  assert.ok(rec.time && rec.msg === 'shown');
  assert.doesNotMatch(lg.lines[0]!, /sk-test|x\.y@z/);
  assert.equal(redactText('call 555-123-4567 now'), 'call [redacted] now');
});
