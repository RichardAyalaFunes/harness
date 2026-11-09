// Regression tests for pass 2 of the pre-merge review (Codex, 2026-11-08).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../lib/db/connection.ts';
import { capText, redactBounded } from '../../lib/obs/redact.ts';
import { checkOrigin } from '../../lib/obs/route.ts';
import { configureTracing, getTrace, recordLlmAttempt, withSpan, withTrace } from '../../lib/obs/tracer.ts';
import { logger, setLogSink } from '../../lib/obs/logger.ts';

const newDb = () => { const db = openDb(':memory:'); configureTracing({ getDb: () => db }); return db; };

test('P2-1. the logger redacts Error values and their keys in one pass: nothing is restored afterwards', () => {
  const lines: string[] = [];
  const restore = setLogSink((l) => lines.push(l));
  try {
    logger.warn('x', { password: new Error('hunter2'), 'jane@example.org': new Error('contact jane@example.org'), ok: new Error('sk-live-0123456789abcdef failed') });
  } finally { restore(); }
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0]!, /hunter2|jane@example|sk-live/);
  assert.match(lines[0]!, /"password":"\[redacted\]"/);
});

test('P2-2. containment: BigInt payloads, throwing getters, a failing clock and a throwing message never change the application result or exception', async () => {
  const db = newDb();
  const restore = setLogSink(() => {});
  try {
    const out = await withTrace({ kind: 'http', name: 'x' }, async () => {
      await withSpan('llm', 'x', {}, async () => {
        recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok', request: { big: 10n, nested: { n: 5n } } as any });
        const evil = { get boom(): string { throw new Error('getter exploded'); } };
        recordLlmAttempt({ attempt: 2, provider: 'p', status: 'ok', request: evil as any });
      });
      return 'application result';
    });
    assert.equal(out, 'application result');
    // the original exception is preserved even when its message cannot be converted
    const nasty: any = new Error('real');
    Object.defineProperty(nasty, 'message', { get() { throw new Error('message getter'); } });
    await assert.rejects(withTrace({ kind: 'http', name: 'y' }, () => withSpan('stage', 'z', {}, () => { throw nasty; })), (e: any) => e === nasty);
    // a failing clock
    let ticks = 0;
    configureTracing({ getDb: () => db, now: () => { ticks += 1; if (ticks > 2) throw new Error('clock failed'); return Date.now(); } });
    assert.equal(await withTrace({ kind: 'http', name: 'clock' }, async () => withSpan('stage', 's', {}, async () => 'still fine')), 'still fine');
    // trace set-up failure (an attribute getter) still runs the callback
    const badInit: any = { kind: 'http', name: 'n', attrs: { get method(): string { throw new Error('attr getter'); } } };
    assert.equal(await withTrace(badInit, async () => 'ran untraced'), 'ran untraced');
  } finally { restore(); configureTracing({ getDb: () => db }); }
});

test('P2-3. boundary-safe redaction: a secret straddling the cut leaves no prefix, even when earlier redactions shrink the text', () => {
  process.env.OPENAI_API_KEY = 'straddleSecret-0123456789abcdef';
  try {
    const limit = 10_000;
    const emails = 'jane.doe@example.org '.repeat(300); // shrinks a lot when redacted
    const padding = 'a'.repeat(limit - emails.length - 10); // the secret starts 10 characters before the cut
    const text = `${emails}${padding}${process.env.OPENAI_API_KEY}${'z'.repeat(5000)}`;
    const r = redactBounded(text, limit);
    assert.ok(r.cut);
    assert.doesNotMatch(r.text, /straddle|Secret-0123|0123456789abcdef/);
    assert.doesNotMatch(r.text, /jane\.doe@example/);
    assert.ok(r.text.length < limit);
    // without a cut nothing is dropped
    const small = redactBounded('hello jane.doe@example.org', limit);
    assert.deepEqual(small, { text: 'hello [redacted]', cut: false });
  } finally { process.env.OPENAI_API_KEY = ''; }
});

test('P2-4. work is bounded by the cap, not the input; tiny caps keep nothing; a capped request is valid JSON', async () => {
  assert.equal(capText('x'.repeat(100), 8).text, '');
  assert.equal(capText('abc', 8).text, 'abc');
  const huge = 'é'.repeat(5_000_000);
  const t0 = Date.now();
  const c = capText(huge, 4096);
  assert.ok(Buffer.byteLength(c.text) <= 4096 && c.truncated);
  assert.ok(Date.now() - t0 < 2000, 'capping a 10 MB string is fast (no whole-input buffer copy)');
  const db = newDb();
  const id = await withTrace({ kind: 'http', name: 'envelope' }, async (tid) => {
    await withSpan('llm', 'x', {}, async () => { recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok', request: { text: 'q'.repeat(200_000) }, response: 'r'.repeat(300_000) }); });
    return tid;
  });
  const l = getTrace(db, id)!.llm[0];
  const parsed = JSON.parse(l.request_json); // valid JSON even though it was capped
  assert.equal(parsed.truncated, true);
  assert.ok(l.original_bytes >= 500_000, 'original_bytes counts the provider text and the request before capping');
});

test('P2-5. origin: only a bare origin is accepted (no path or credentials); the Host header decides host and port', () => {
  const fake = (url: string, headers: Record<string, string>) => ({ url, headers: new Headers(headers) }) as unknown as Request;
  const pass = (r: Request, trusted: string[] = []) => { try { checkOrigin(r, trusted); return true; } catch { return false; } };
  // Next builds req.url from its bind address (localhost); the browser asked for 127.0.0.1:3000
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' })), true);
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: '127.0.0.1:3000', origin: 'http://localhost:3000' })), false, 'Origin must equal the Host that was asked for');
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: 'evil.example', origin: 'http://127.0.0.1:3000' })), false);
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000/path' })), false);
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: '127.0.0.1:3000', origin: 'http://user:pw@127.0.0.1:3000' })), false);
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: 'app.internal', origin: 'https://app.example.org' }), ['https://app.example.org']), true, 'proxy origin listed in TRUSTED_ORIGINS');
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: 'app.internal', origin: 'https://app.example.org' })), false, 'not listed');
});
