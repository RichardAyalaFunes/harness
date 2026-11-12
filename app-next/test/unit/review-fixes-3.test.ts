// Regression tests for pass 3 of the pre-merge review (Codex, 2026-11-08).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../lib/db/connection.ts';
import { boundedEntries, redactBounded, redactDeep } from '../../lib/obs/redact.ts';
import { configureTracing, getTrace, recordLlmAttempt, setTraceAttrs, withSpan, withTrace } from '../../lib/obs/tracer.ts';
import { logger, setLogSink } from '../../lib/obs/logger.ts';

const newDb = () => { const db = openDb(':memory:'); configureTracing({ getDb: () => db }); return db; };

test('P3-1. a configured secret LONGER than 256 characters crossing the scan boundary leaves no prefix', () => {
  const secret = `longSecret-${'0123456789abcdef'.repeat(40)}`; // 651 characters
  process.env.OPENAI_API_KEY = secret;
  try {
    const limit = 10_000;
    for (const offset of [5, 100, 300, 500, 640]) { // the cut falls at different depths inside the secret
      const text = `${'a'.repeat(limit - offset)}${secret}${'z'.repeat(5000)}`;
      const r = redactBounded(text, limit);
      assert.ok(r.cut);
      assert.doesNotMatch(r.text, /longSecret|0123456789abcdef/, `offset ${offset}`);
    }
  } finally { process.env.OPENAI_API_KEY = ''; }
});

test('P3-1. key names: a long key is replaced whole, never cut before redaction', () => {
  const longKey = `${'k'.repeat(190)}jane.doe@example.org${'k'.repeat(40)}`;
  const out = redactDeep({ [longKey]: 'v', 'short@example.org': 'v' }) as Record<string, string>;
  assert.doesNotMatch(JSON.stringify(out), /jane\.doe|example\.org/);
  assert.ok('(long key)' in out);
});

test('P3-2. a throwing attribute getter in span.set() and setTraceAttrs() never reaches the application', async () => {
  newDb();
  const bad: any = { get status(): string { throw new Error('getter'); } };
  const out = await withTrace({ kind: 'http', name: 'x' }, async () => {
    setTraceAttrs(bad);
    return withSpan('stage', 's', { stage: 2 }, async (span) => { span.set(bad); span.set({ status: 'ok' }); return 'result'; });
  });
  assert.equal(out, 'result');
  await assert.rejects(withTrace({ kind: 'http', name: 'y' }, () => withSpan('stage', 's', {}, (span) => { span.set(bad); throw new Error('application error'); })), /application error/);
});

test('P3-3. wide objects: only the permitted number of properties is read (getters beyond it never run); the node budget stops traversal', () => {
  let reads = 0;
  const wide: Record<string, unknown> = {};
  for (let i = 0; i < 5000; i++) Object.defineProperty(wide, `p${i}`, { enumerable: true, get() { reads += 1; return `v${i}`; } });
  assert.equal(boundedEntries(wide, 200).length, 200);
  assert.equal(reads, 200);
  reads = 0;
  redactDeep(wide);
  assert.ok(reads <= 200, `redactDeep read ${reads} properties`);
  // an exhausted node budget turns the rest into a marker instead of walking it
  const deepWide = Array.from({ length: 1000 }, () => ({ a: { b: { c: { d: { e: 1 } } } } })); // 6 nodes each, far above the 5,000-node budget
  const out = JSON.stringify(redactDeep({ list: deepWide }));
  assert.match(out, /\[truncated\]/);
  // the logger reads at most 50 fields
  reads = 0;
  const lines: string[] = [];
  const restore = setLogSink((l) => lines.push(l));
  try { logger.info('wide', wide); } finally { restore(); }
  assert.ok(reads <= 50, `logger read ${reads} fields`);
});

test('P3-3. meta mode never serialises the request: sizes come from the caller; a request whose toJSON throws is harmless', async () => {
  const db = newDb();
  process.env.TRACE_PAYLOADS = 'meta';
  try {
    const poison = { toJSON() { throw new Error('must not be serialised in meta mode'); } };
    const id = await withTrace({ kind: 'http', name: 'meta' }, async (tid) => {
      await withSpan('llm', 'x', {}, async () => { recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok', request: poison, requestBytes: 1234, response: 'hello', responseBytes: 5 }); });
      return tid;
    });
    const l = getTrace(db, id)!.llm[0];
    assert.equal(l.request_json, null);
    assert.equal(l.original_bytes, 1239);
  } finally { delete process.env.TRACE_PAYLOADS; }
});

test('P3-4. original_bytes of a request is the size as sent, not of the redacted copy', async () => {
  const db = newDb();
  const id = await withTrace({ kind: 'http', name: 'sizes' }, async (tid) => {
    await withSpan('llm', 'x', {}, async () => { recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok', request: { text: 'jane.doe@example.org '.repeat(100) }, requestBytes: 99_999, response: 'ok', responseBytes: 7 }); });
    return tid;
  });
  assert.equal(getTrace(db, id)!.llm[0].original_bytes, 99_999 + 7);
});
