// T-I1: parity. Replays the golden workflows (recorded from the old Node server, tag pre-next) against a PRODUCTION
// `next start` on a temp port and a fresh replay database, and compares status, relevant headers, body and database state.
// The only allowed differences are listed in EXPECTED_DIFFS below, each with the reason (see parity-exceptions.md).
// Needs a build first: pnpm test:integration runs `next build` before this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rebuild } from '../../lib/domain/seed.ts';
import { getModel } from '../../lib/model/index.ts';
import { closeDb } from '../../lib/db/connection.ts';
import { SCENARIOS } from '../golden/steps.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, '..', '..');
const TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;
const normalise = (v: unknown) => JSON.parse(JSON.stringify(v).replace(TS, '<ts>').replace(/(run|approval)-[0-9a-z]{6,}/g, '<$1-id>'));
const squash = (row: any) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && v.length > 200 ? `<sha256:${crypto.createHash('sha256').update(v).digest('hex').slice(0, 12)} len=${v.length}>` : v]));
const FULL = ['proposals', 'screening_reviews', 'brief_versions', 'approvals', 'completions', 'candidates', 'assignments'];
function dbState(db: any) {
  const counts: Record<string, number> = {};
  for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((x: any) => x.name)) counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  const rows: Record<string, any[]> = {};
  for (const t of FULL) rows[t] = db.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all().map((r: any) => squash({ ...r }));
  return normalise({ counts, rows });
}

const freePort = () => new Promise<number>((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startServer(dbFile: string) {
  const port = await freePort();
  const env = { ...process.env, HARNESS_DB: dbFile, HARNESS_MODEL: 'replay', HARNESS_ASSIST: 'replay', OPENAI_API_KEY: '', LOG_LEVEL: 'silent', NODE_ENV: 'production', NODE_NO_WARNINGS: '1' };
  const child = spawn(process.execPath, [path.join(APP, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd: APP, env, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/me`, { headers: { 'sec-fetch-site': 'same-origin' } }); if (r.ok) return { child, port }; } catch { /* not up yet */ }
    await sleep(200);
  }
  child.kill();
  throw new Error('next start did not come up (did you run next build?)');
}
const stop = (child: ChildProcess) => new Promise<void>((r) => { child.once('exit', () => r()); child.kill(); setTimeout(r, 3000); });

const KEEP = ['content-type', 'cache-control', 'x-content-type-options'];
function send(port: number, step: any) {
  return new Promise<any>((resolve, reject) => {
    const raw = step.raw !== undefined ? step.raw : step.body !== undefined ? JSON.stringify(step.body) : undefined;
    const headers: Record<string, string> = Object.fromEntries(Object.entries(step.headers || {}).map(([k, v]) => [k, String(v).replace('__HOST__', `127.0.0.1:${port}`)]));
    if (raw !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
    // The Node server accepted a POST with no Origin; the Next app wants Sec-Fetch-Site (parity-exceptions X5). Everything except the step that tests it sends it.
    if ((step.method || 'GET') !== 'GET' && !headers.origin && step.name !== 'POST without Origin' && step.name !== 'cross-origin POST') headers['sec-fetch-site'] = 'same-origin';
    const req = http.request({ host: '127.0.0.1', port, path: step.path, method: step.method || 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const h: Record<string, string> = {};
        for (const k of KEEP) if (res.headers[k] !== undefined) h[k] = String(res.headers[k]);
        let body: any = text;
        if (String(res.headers['content-type'] || '').includes('json')) { try { body = JSON.parse(text); } catch { /* keep text */ } }
        resolve({ status: res.statusCode, headers: h, traceId: res.headers['x-trace-id'], body: step.bodyHash ? { length: text.length } : body });
      });
    });
    req.on('error', reject);
    if (raw !== undefined) req.write(raw);
    req.end();
  });
}
async function sendRetry(port: number, step: any) {
  for (let a = 1; ; a++) { try { return await send(port, step); } catch (e: any) { if (a >= 5 || !['ECONNRESET', 'EPIPE'].includes(e.code)) throw e; } }
}

// ---- allowed differences, each with its reason ---------------------------------------------------------------------------
// A step that is not listed must match the golden recording exactly (status, body, database state).
const errorCode = (res: any) => res.body?.error?.code;
type Check = (res: any, golden: any, db?: any) => void;
const err = (status: number, code: string, msg?: RegExp): Check => (res) => { assert.equal(res.status, status); assert.equal(errorCode(res), code); assert.ok(res.traceId, 'x-trace-id header'); assert.equal(res.body.error.traceId, res.traceId); if (msg) assert.match(res.body.error.message, msg); };
const EXPECTED_DIFFS: Record<string, Check> = {
  // X1 new error body everywhere; X9 unknown entity 404 instead of 400; X10 state conflict 409 instead of 400
  'reads/unknown role': err(404, 'not_found', /unknown role nope/),
  'reads/diff non numeric': err(400, 'validation', /from: must be a whole number/),
  // X11: /api/stages rows gained one additive key, trace_id (links an audit row to its trace). Everything else must match.
  'reads/stages all': (res, g) => { assert.equal(res.status, 200); assert.deepEqual(normalise(res.body.map(({ trace_id, ...r }: any) => r)), g.response.body); },
  'reads/stages for one source': (res, g) => { assert.equal(res.status, 200); assert.deepEqual(normalise(res.body.map(({ trace_id, ...r }: any) => r)), g.response.body); },
  'approvals/approve proposal 6 again': err(409, 'conflict', /is approved, not proposed/),
  'approvals/approve unknown proposal': err(404, 'not_found', /unknown proposal 999/),
  'approvals/approve non numeric id': err(400, 'validation', /id: must be a whole number/),
  'approvals/approve review 1 (already approved)': err(409, 'conflict', /review 1 is approved/),
  'approvals/reject review 2 (already approved)': err(409, 'conflict', /review 2 is approved/),
  'approvals/approve with explicit approver': err(409, 'conflict', /proposal 6 is approved/),
  'reject-short-reason/reject with too short a reason': err(400, 'validation', /reason: write at least 10 characters/), // X3
  // the first reject is refused, so the proposal is still open and the second one (valid reason) succeeds: states diverge from the golden on purpose
  'reject-short-reason/reject again': (res, _g, db) => { assert.equal(res.status, 200); const p = db.prepare('SELECT state, reason FROM proposals WHERE id = 6').get(); assert.equal(p.state, 'rejected'); assert.match(p.reason, /contradicted this/); },
  'reject-short-reason/role ks-fe after reject': (res, _g, db) => { assert.equal(res.status, 200); assert.equal(db.prepare('SELECT state FROM proposals WHERE id = 6').get().state, 'rejected'); },
  'reject-default-reason/reject with no body': err(400, 'validation', /reason/), // X3
  'candidates/move 1 to stage 99': err(400, 'validation', /choose a stage/), // X4
  'candidates/move 1 to stage -1': err(400, 'validation', /choose a stage/),
  'candidates/move 1 with no target': err(400, 'validation', /choose a stage/),
  'candidates/move 1 with a string target': err(400, 'validation', /choose a stage/),
  'candidates/move an unknown candidate': err(404, 'not_found', /unknown candidate 999/),
  'learning/unknown item': err(404, 'not_found', /unknown item 999/),
  'ask/empty question': err(400, 'validation', /write a question first/),
  'ask/too short a question': err(400, 'validation', /write a question first/),
  'ask/too long a question': err(400, 'validation', /under 500/),
  'ask/unknown role': err(404, 'not_found', /unknown role nope/),
  'http-edges/malformed JSON': err(400, 'validation', /not valid JSON/),
  'http-edges/body over 1 MB': err(413, 'payload_too_large'),
  'http-edges/cross-origin POST': err(403, 'forbidden', /cross-origin/),
  'http-edges/POST without Origin': err(403, 'forbidden'), // X5
  'http-edges/DELETE on an API route': (res) => assert.equal(res.status, 405), // X6: Next answers; no trace id expected (plan I2b)
  'http-edges/unknown API path': err(404, 'not_found', /no route GET \/api\/does\/not\/exist/),
  // X8: pages belong to Next, which answers a POST to a page like a GET (200). Pages are read-only and define no server actions, so nothing can change; the database check below proves it.
  'http-edges/POST to a page': (res, _g, db) => { assert.ok([200, 404, 405].includes(res.status)); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM approvals').get().n, 10); },
  'http-edges/index page headers': (res) => { assert.equal(res.status, 200); assert.match(res.headers['content-type'], /text\/html/); assert.equal(res.headers['x-content-type-options'], 'nosniff'); },
  'http-edges/unknown static file': (res) => assert.equal(res.status, 404),
  'http-edges/path traversal': (res) => assert.ok([400, 404].includes(res.status)),
};
const ALWAYS_ALLOWED_BODY_ERRORS = new Set(['1']); // placeholder to keep the table typed; not used

for (const sc of SCENARIOS) {
  test(`I1 golden parity: ${sc.id}`, { timeout: 180_000 }, async () => {
    const golden = JSON.parse(fs.readFileSync(path.join(here, '..', 'golden', `${sc.id}.json`), 'utf8'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-next-'));
    const file = path.join(dir, 'g.db');
    const db = await rebuild({ model: getModel({}), file });
    const { child, port } = await startServer(file);
    const problems: string[] = [];
    try {
      for (let i = 0; i < sc.steps.length; i++) {
        const step: any = typeof sc.steps[i] === 'function' ? (sc.steps[i] as any)(db) : sc.steps[i];
        const g = golden.steps[i];
        assert.equal(g.name, step.name, 'golden and steps are in the same order');
        const res = await sendRetry(port, step);
        const key = `${sc.id}/${step.name}`;
        const allowed = EXPECTED_DIFFS[key];
        try {
          if (allowed) allowed(res, g, db);
          else {
            assert.equal(res.status, g.response.status, 'status');
            for (const [h, v] of Object.entries(g.response.headers) as [string, string][]) if (h !== 'content-security-policy') assert.equal(res.headers[h], v, `header ${h}`);
            assert.deepEqual(normalise(res.body), g.response.body, 'body');
            if (res.status < 400 && step.path.startsWith('/api/')) assert.ok(res.traceId, 'x-trace-id on instrumented routes');
          }
          if (g.db && (!allowed || (res.status >= 400 && g.response.status >= 400))) {
            const now = dbState(db);
            assert.deepEqual(now.rows, g.db.rows, 'database rows');
            for (const [t, n] of Object.entries(g.db.counts)) assert.equal(now.counts[t], n, `row count of ${t}`);
          }
        } catch (e: any) { problems.push(`${key}: ${e.message.split('\n').slice(0, 6).join(' | ')}`); }
      }
    } finally { await stop(child); db.close(); closeDb(file); fs.rmSync(dir, { recursive: true, force: true }); }
    assert.deepEqual(problems, []);
  });
}
void ALWAYS_ALLOWED_BODY_ERRORS;
