import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rebuild } from '../../lib/domain/seed.ts';
import { getModel } from '../../lib/model/index.ts';
import { runChecks } from '../../lib/domain/consistency.ts';
import { teamStatus, publishedItems } from '../../lib/domain/learning.ts';
import { currentVersion } from '../../lib/domain/brief.ts';
import { stagesView } from '../../lib/domain/views.ts';
import { createApp } from './api-shim.ts';

let db: any;
let dir: any;
test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mock-'));
  db = await rebuild({ model: getModel({}), file: path.join(dir, 'h.db') });
});
test.after(() => { db?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('full rebuild of the real mock data passes every harness check', () => {
  const res = runChecks(db);
  assert.deepEqual(res.filter((c) => !c.ok), []);
  assert.ok(res.length >= 10);
});

test('mock data: versions, pending Kestrel proposal and seed completions match the demo story', () => {
  assert.equal(currentVersion(db, 'nw-be').n, 4);
  assert.equal(currentVersion(db, 'ks-fe').n, 2, 'ks-04 is left unapproved');
  assert.equal(db.prepare("SELECT state FROM proposals WHERE source_row_id = (SELECT id FROM sources WHERE source_id = 'ks-04')").get().state, 'proposed');
  const t = Object.fromEntries(teamStatus(db, 'nw-be').map((x: any) => [x.id, x]));
  assert.equal(t.luis.up_to_date && t.marta.up_to_date, true);
  assert.equal(t.jon.up_to_date, false);
  assert.deepEqual([t.jon.by_kind.ack.done, t.jon.by_kind.study.done, t.jon.by_kind.review.done], [5, 0, 0]);
  assert.equal(t.ana.done, 0);
  assert.ok(teamStatus(db, 'ks-fe').every((x: any) => x.done === 0));
});

test('mock data: bias and review results', () => {
  const f = currentVersion(db, 'nw-be').fields;
  assert.equal(f['restriction.no-carrio'].status, 'applied');
  assert.equal(f['restriction.top-university'].status, 'not_applied_bias');
  const age = db.prepare("SELECT status, severity, bias_kind FROM changes WHERE field = 'restriction.age-under-35'").get();
  assert.deepEqual({ ...age }, { status: 'not_applied_bias', severity: 'critical', bias_kind: 'protected' });
  const nw08 = db.prepare("SELECT * FROM screening_reviews WHERE candidate = 'D. Ruiz'").get();
  assert.equal(nw08.screening_source_id, 'nw-07');
  assert.equal(nw08.brief_version_at_screening, 3);
  assert.equal(db.prepare("SELECT status FROM screening_reviews WHERE candidate = 'J. Moreau'").get().status, 'insufficient_evidence');
});

test('mock data: stage_runs tell the story of nw-08 (all stages, publish passed) and ks-04 (publish pending)', () => {
  const nw08 = stagesView(db, 'nw-08');
  assert.deepEqual(nw08.map((s) => s.status), ['passed', 'passed', 'passed', 'skipped', 'passed', 'passed', 'passed']);
  const ks04 = stagesView(db, 'ks-04');
  assert.deepEqual(ks04.map((s) => s.status), ['passed', 'passed', 'passed', 'passed', 'passed', 'skipped', 'pending']);
});

test('API: positions, role, stages, approve the pending Kestrel proposal, complete an item, move a candidate', async () => {
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p: any) => (await fetch(base + p)).json();
  const post = async (p: any, body: any) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  try {
    const positions = await get('/api/positions');
    assert.equal(positions.length, 3);
    assert.equal(positions.find((p: any) => p.id === 'ks-fe').pending_proposals, 1);
    const role = await get('/api/roles/nw-be');
    assert.equal(role.brief.version, 4);
    assert.ok(role.timeline.length >= 6);
    assert.ok(role.verify.suggestions.length >= 1);
    assert.equal((await get('/api/stages?source=nw-08')).length, 7);
    assert.equal((await fetch(`${base}/api/roles/nope`)).status, 404);
    // moving a candidate is never gated, even for the demo user who has completed nothing
    const cand = (await get('/api/roles/nw-be/pipeline'))[0];
    assert.equal((await post(`/api/candidates/${cand.id}/move`, { to: 1 })).body.stage, 1);
    // approve Kestrel's pending proposal
    const ks = await get('/api/roles/ks-fe');
    const pending = ks.proposals.find((p: any) => p.state === 'proposed');
    assert.ok(pending.changes.some((c: any) => c.bias && c.bias.kind === 'protected'));
    assert.equal((await post(`/api/proposals/${pending.id}/approve`, {})).body.version, 3);
    // Ana completes an ack item on nw-be, twice (idempotent)
    const ack = role.items.find((i: any) => i.kind === 'ack');
    assert.equal((await post(`/api/items/${ack.id}/complete`, { recruiter: 'ana' })).body.already, false);
    assert.equal((await post(`/api/items/${ack.id}/complete`, { recruiter: 'ana' })).body.already, true);
    // a short study answer is refused with the check result
    const study = role.items.find((i: any) => i.kind === 'study');
    const short = await post(`/api/items/${study.id}/complete`, { recruiter: 'ana', response: 'short' });
    assert.equal(short.body.passed, false);
    assert.equal(short.body.result.stub, true);
    assert.equal((await post('/api/proposals/9999/approve', {})).status, 404); // was 400 before the migration: unknown entity is now 404 (parity-exceptions X9)
    assert.equal((await fetch(`${base}/%2e%2e/src/db.js`)).status, 404, 'static files cannot escape web/');
  } finally { server.close(); }
  assert.ok(publishedItems(db, 'ks-fe').length > 3);
});
