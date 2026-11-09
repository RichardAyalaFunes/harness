// Golden capture (migration phase P0): drives the CURRENT Node server through scripted workflows on a fresh replay database
// and records, per step, the request, status, relevant response headers, body and a database state dump.
// The Next.js app is later driven through the same steps (test/golden/steps.mjs) and compared with these files.
// Run:  node --disable-warning=ExperimentalWarning test/golden/capture.mjs [outDir]
// No network, no key: the replay model only (HARNESS_ASSIST=replay is forced).
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] || here);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-'));
process.env.HARNESS_DB = path.join(tmp, 'golden.db');
process.env.HARNESS_MODEL = 'replay';
process.env.HARNESS_ASSIST = 'replay';
delete process.env.OPENAI_API_KEY;

const { rebuild } = await import('../../src/seed.js');
const { getModel } = await import('../../src/model/index.js');
const { createApp } = await import('../../src/server.js');
const { SCENARIOS } = await import('./steps.mjs');

const KEEP_HEADERS = ['content-type', 'cache-control', 'x-content-type-options', 'content-security-policy'];
const TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;
const normalise = (v) => JSON.parse(JSON.stringify(v).replace(TS, '<ts>').replace(/(run|approval)-[0-9a-z]{6,}/g, '<$1-id>'));

function request(port, step) {
  return new Promise((resolve, reject) => {
    const body = step.raw !== undefined ? step.raw : step.body !== undefined ? JSON.stringify(step.body) : undefined;
    const headers = Object.fromEntries(Object.entries(step.headers || {}).map(([k, v]) => [k, String(v).replace('__HOST__', `127.0.0.1:${port}`)]));
    if (body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
    const req = http.request({ host: '127.0.0.1', port, path: step.path, method: step.method || 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const h = {};
        for (const k of KEEP_HEADERS) if (res.headers[k] !== undefined) h[k] = res.headers[k];
        let parsed = text;
        if (String(res.headers['content-type'] || '').includes('json')) { try { parsed = JSON.parse(text); } catch { /* keep text */ } }
        resolve({ status: res.statusCode, headers: h, body: step.bodyHash ? { length: text.length } : parsed });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// What the database looks like after a step: row counts for every table, plus full rows for the tables the API changes.
// Long text columns in the state dump are replaced by a short hash plus length: any change is still detected.
const squash = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && v.length > 200 ? `<sha256:${crypto.createHash('sha256').update(v).digest('hex').slice(0, 12)} len=${v.length}>` : v]));
const FULL = ['proposals', 'screening_reviews', 'brief_versions', 'approvals', 'completions', 'candidates', 'assignments'];
function dbState(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((t) => t.name);
  const counts = {};
  for (const t of tables) counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  const rows = {};
  for (const t of FULL) rows[t] = db.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all().map((r) => squash({ ...r }));
  return normalise({ counts, rows });
}

fs.mkdirSync(outDir, { recursive: true });
const summary = [];
for (const sc of SCENARIOS) {
  const db = await rebuild({ model: getModel() });
  const server = createApp(db);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const steps = [];
  for (const s of sc.steps) {
    const step = typeof s === 'function' ? s(db) : s;
    // An oversized body can make the old server reset the socket before the client has read the 413: retry that race.
    let res;
    for (let attempt = 1; ; attempt++) {
      try { res = await request(port, step); break; } catch (e) { if (attempt >= 5 || !['ECONNRESET', 'EPIPE'].includes(e.code)) throw e; }
    }
    steps.push(normalise({ name: step.name, request: { method: step.method || 'GET', path: step.path, headers: step.headers || {}, body: step.raw !== undefined ? '<raw>' : step.body ?? null }, response: res, db: step.noDb || !step.method ? undefined : dbState(db) }));
  }
  await new Promise((r) => server.close(r));
  db.close();
  fs.writeFileSync(path.join(outDir, `${sc.id}.json`), `${JSON.stringify({ scenario: sc.id, description: sc.description, steps }, null, 2)}\n`);
  summary.push(`${sc.id}: ${steps.length} steps`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(summary.join('\n'));
