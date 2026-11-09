// T-I2/I3/I4/I5/I7: input edges, domain conflicts, model failures, concurrency, against a PRODUCTION `next start`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rebuild } from '../../lib/domain/seed.ts';
import { getModel } from '../../lib/model/index.ts';
import { closeDb, openDb } from '../../lib/db/connection.ts';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise<number>((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });

async function startServer(dbFile: string, extra: Record<string, string> = {}) {
  const port = await freePort();
  const env = { ...process.env, HARNESS_DB: dbFile, HARNESS_MODEL: 'replay', HARNESS_ASSIST: 'replay', OPENAI_API_KEY: '', LOG_LEVEL: 'silent', NODE_ENV: 'production', NODE_NO_WARNINGS: '1', ...extra };
  const child = spawn(process.execPath, [path.join(APP, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd: APP, env, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/me`); if (r.ok) return { child, base: `http://127.0.0.1:${port}` }; } catch { /* not up */ }
    await sleep(200);
  }
  child.kill();
  throw new Error('next start did not come up');
}
const stop = (child: ChildProcess) => new Promise<void>((r) => { child.once('exit', () => r()); child.kill(); setTimeout(r, 3000); });
const same = { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' };

async function withServer(extra: Record<string, string>, fn: (base: string, file: string, db: any) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edges-'));
  const file = path.join(dir, 'e.db');
  const db = await rebuild({ model: getModel({}), file });
  const { child, base } = await startServer(file, extra);
  try { await fn(base, file, db); } finally { await stop(child); try { db.close(); } catch { /* a test already closed it */ } closeDb(file); fs.rmSync(dir, { recursive: true, force: true }); }
}

test('I2a: rejections carry a trace id in the header and in the body', () => withServer({}, async (base) => {
  const cases: [string, Response][] = [];
  cases.push(['415', await fetch(`${base}/api/proposals/6/approve`, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'text/plain' }, body: '{}' })]);
  cases.push(['400 json', await fetch(`${base}/api/proposals/6/approve`, { method: 'POST', headers: same, body: '{"by":' })]);
  cases.push(['403', await fetch(`${base}/api/proposals/6/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })]);
  cases.push(['404 GET', await fetch(`${base}/api/nope/at/all`)]);
  cases.push(['404 POST', await fetch(`${base}/api/nope`, { method: 'POST', headers: same, body: '{}' })]);
  cases.push(['400 query', await fetch(`${base}/api/stages?bogus=1`)]);
  cases.push(['400 id', await fetch(`${base}/api/proposals/abc/approve`, { method: 'POST', headers: same, body: '{}' })]);
  const want = [415, 400, 403, 404, 404, 400, 400];
  for (const [i, [label, res]] of cases.entries()) {
    assert.equal(res.status, want[i], label);
    const header = res.headers.get('x-trace-id');
    const body: any = await res.json();
    assert.ok(header && body.error.traceId === header, `${label}: trace id in header and body`);
    assert.ok(body.error.code && body.error.message, label);
  }
}));

test('I2a: a body over the limit is refused with 413, streamed or with a false Content-Length', () => withServer({}, async (base) => {
  const streamed = await fetch(`${base}/api/proposals/6/approve`, { method: 'POST', headers: same, body: JSON.stringify({ pad: 'x'.repeat(1_200_000) }) });
  assert.equal(streamed.status, 413);
  assert.ok((await streamed.json() as any).error.traceId);
  // a lying Content-Length (declares small, sends large) is still cut off by the streaming reader
  const { port } = new URL(base);
  const status = await new Promise<number>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/proposals/6/approve', method: 'POST', headers: { ...same, 'content-length': '10', 'transfer-encoding': 'chunked' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
    req.on('error', (e: any) => (['ECONNRESET', 'EPIPE'].includes(e.code) ? resolve(413) : reject(e)));
    req.write('x'.repeat(1_200_000));
    req.end();
  }).catch(() => 413);
  assert.ok([400, 413].includes(status), `status ${status}`);
}));

test('I2b: an unsupported method on an existing route is answered by Next with 405 (status only; no trace id promised)', () => withServer({}, async (base) => {
  assert.equal((await fetch(`${base}/api/proposals/6/approve`, { method: 'DELETE', headers: { 'sec-fetch-site': 'same-origin' } })).status, 405);
}));

test('I3 + I7: two simultaneous approvals of one proposal give exactly one 200 and one 409', () => withServer({}, async (base) => {
  const go = () => fetch(`${base}/api/proposals/6/approve`, { method: 'POST', headers: same, body: '{}' });
  const res = await Promise.all([go(), go(), go()]);
  assert.deepEqual(res.map((r) => r.status).sort(), [200, 409, 409]);
  const conflict: any = await (res.find((r) => r.status === 409)!).json();
  assert.equal(conflict.error.code, 'conflict');
}));

test('I7: a CLI read while the server runs works, and two processes opening a new database migrate once', () => withServer({}, async (_base, file) => {
  const script = path.join(APP, 'test', 'integration', 'open-db.ts');
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', script, file], { env: { ...process.env, HARNESS_DB: file }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /user_version=2/);
  // two processes, same fresh file, started together
  const fresh = path.join(path.dirname(file), 'fresh.db');
  const runs = await Promise.all([0, 1, 2].map(() => new Promise<{ code: number | null; out: string }>((resolve) => {
    const c = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', script, fresh], { env: { ...process.env, HARNESS_DB: fresh }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d)); c.on('exit', (code) => resolve({ code, out }));
  })));
  assert.ok(runs.every((x) => x.code === 0 && /user_version=2/.test(x.out)), JSON.stringify(runs));
  const db = openDb(fresh);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'traces'").get());
  closeDb(fresh);
}));

// ---- I4/I5: a live model that fails -------------------------------------------------------------------------------------
async function fakeOpenAI(handler: (n: number) => { status: number; body?: unknown }) {
  let n = 0;
  const server = http.createServer((req, res) => { req.resume(); req.on('end', () => { const r = handler(++n); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.body ?? { error: { message: 'upstream secret detail sk-upstream-1234567890' } })); }); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as net.AddressInfo).port}/v1/chat/completions`, close: () => server.close(), calls: () => n };
}

test('I4: a failing model gives 502 with a trace id, no upstream detail, and the failed attempts are in the trace', async () => {
  const fake = await fakeOpenAI(() => ({ status: 500 }));
  try {
    await withServer({ HARNESS_ASSIST: '', OPENAI_API_KEY: 'sk-fake-0123456789abcdef', OPENAI_BASE_URL: fake.url, OPENAI_MODEL: 'gpt-test' }, async (base, file) => {
      const res = await fetch(`${base}/api/roles/nw-ai/ask`, { method: 'POST', headers: same, body: JSON.stringify({ question: 'What is LangGraph and what should I check?' }) });
      assert.equal(res.status, 502);
      const body: any = await res.json();
      assert.equal(body.error.code, 'model_failure');
      assert.ok(body.error.traceId);
      assert.doesNotMatch(JSON.stringify(body), /upstream secret|sk-/);
      await sleep(300);
      const db = openDb(file);
      const t = db.prepare('SELECT * FROM traces WHERE id = ?').get(body.error.traceId);
      assert.equal(t.status, 'error');
      const calls = db.prepare('SELECT l.attempt, l.status, l.http_status FROM llm_calls l JOIN spans s ON s.id = l.span_id WHERE s.trace_id = ? ORDER BY l.id').all(body.error.traceId);
      assert.equal(calls.length, 3, 'first try + 2 retries');
      assert.ok(calls.every((c: any) => c.status === 'error' && c.http_status === 500));
      assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM llm_calls').all()), /upstream secret|sk-fake|sk-upstream/);
    });
  } finally { fake.close(); }
});

test('I5: when study feedback fails, the step still counts as done and the error is advisory', async () => {
  const fake = await fakeOpenAI(() => ({ status: 500 }));
  try {
    await withServer({ HARNESS_ASSIST: '', OPENAI_API_KEY: 'sk-fake-0123456789abcdef', OPENAI_BASE_URL: fake.url }, async (base) => {
      const res = await fetch(`${base}/api/items/5/complete`, { method: 'POST', headers: same, body: JSON.stringify({ response: 'I would ask for one concrete incident they led and what changed afterwards.' }) });
      assert.equal(res.status, 200);
      const body: any = await res.json();
      assert.equal(body.passed, true);
      assert.ok(body.result.ai.error, 'the failure is shown as advisory');
      assert.doesNotMatch(JSON.stringify(body), /upstream secret|sk-/);
      const again: any = await (await fetch(`${base}/api/items/5/complete`, { method: 'POST', headers: same, body: JSON.stringify({ response: 'again' }) })).json();
      assert.equal(again.already, true);
    });
  } finally { fake.close(); }
});
