import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnv, baseline, change, out, studyEntry, JD_BODY, jdOut } from './helpers.js';
import { createOpenAIModel } from '../src/model/openai.js';
import { runSource } from '../src/pipeline.js';
import { registerSource } from '../src/sources.js';
import { approveProposal } from '../src/approvals.js';
import { currentVersion } from '../src/brief.js';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const FX_BODY = 'Update from client.\nThe budget is now 90k.\nStart in January.\n';
const fixture = (n) => fs.readFileSync(path.join(FX, n), 'utf8');
const errorsOf = (env, rowId, stage) => JSON.parse(env.db.prepare('SELECT check_result FROM stage_runs WHERE source_row_id = ? AND stage = ?').get(rowId, stage).check_result).errors;

// fixtures run against a role that already has a v1, so budget/severity rules apply
async function withFixture(name, fn) {
  const env = makeEnv();
  try {
    await baseline(env);
    const r = await env.feed('fx-01', { date: '2026-10-05' }, FX_BODY, fixture(name));
    await fn(env, r);
  } finally { env.cleanup(); }
}

test('negative fixture: malformed JSON fails stage 2 and stores no analysis', () => withFixture('malformed.json', (env, r) => {
  assert.equal(env.stages(r.row_id)[2], 'failed');
  assert.match(errorsOf(env, r.row_id, 2)[0], /malformed JSON/);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM analyses WHERE source_row_id = ?').get(r.row_id).n, 0);
  assert.equal(r.res.failedAt, 2);
  assert.equal(env.stages(r.row_id)[3], undefined, 'later stages do not run');
}));

test('negative fixture: unknown field is rejected', () => withFixture('unknown-field.json', (env, r) => {
  assert.equal(env.stages(r.row_id)[2], 'failed');
  assert.match(errorsOf(env, r.row_id, 2).join(), /not in the whitelist/);
}));

test('negative fixture: severity outside the enum is rejected', () => withFixture('bad-severity.json', (env, r) => {
  assert.equal(env.stages(r.row_id)[2], 'failed');
  assert.match(errorsOf(env, r.row_id, 2).join(), /severity "huge"/);
}));

test('negative fixture: non-verbatim quote is rejected', () => withFixture('non-verbatim.json', (env, r) => {
  assert.equal(env.stages(r.row_id)[2], 'failed');
  assert.match(errorsOf(env, r.row_id, 2).join(), /not found verbatim/);
}));

test('negative fixture: no-change result passes, creates no version, skips stages 4 and 5 with reasons', () => withFixture('no-change.json', (env, r) => {
  assert.deepEqual(env.stages(r.row_id), { 1: 'passed', 2: 'passed', 3: 'passed', 4: 'skipped', 5: 'skipped', 6: 'skipped', 7: 'skipped' });
  assert.equal(r.proposal, undefined);
  const skipped = env.db.prepare("SELECT skip_reason FROM stage_runs WHERE source_row_id = ? AND status = 'skipped'").all(r.row_id);
  assert.ok(skipped.every((s) => s.skip_reason));
}));

test('negative fixture: conflicting claim still becomes a proposal, flagged conflicts_with the earlier source', () => withFixture('conflict.json', (env, r) => {
  assert.equal(env.stages(r.row_id)[3], 'passed');
  assert.ok(r.proposal);
  assert.equal(env.db.prepare('SELECT conflicts_with FROM changes WHERE proposal_id = ?').get(r.proposal.id).conflicts_with, 'j1');
}));

test('conflicts_with must name a known source', async () => {
  const env = makeEnv();
  const o = out('fx-01', [change('offer.budget', 'set', '90k', 'The budget is now 90k.', 'material', { conflicts_with: 'nope-99' })]);
  const r = await env.feed('fx-01', {}, FX_BODY, o);
  assert.equal(env.stages(r.row_id)[2], 'failed');
  env.cleanup();
});

test('quote repeated in the source fails as ambiguous, offsets fix it', async () => {
  const env = makeEnv();
  const body = 'Budget is 90k.\nBudget is 90k.\n';
  const bad = await env.feed('a1', {}, body, out('a1', [change('offer.budget', 'set', '90k', 'Budget is 90k.')]));
  assert.match(errorsOf(env, bad.row_id, 2).join(), /ambiguous/);
  const good = await env.feed('a2', {}, body + 'x', out('a2', [change('offer.budget', 'set', '90k', 'Budget is 90k.', 'material', { start: 15, end: 29 })]));
  assert.equal(env.stages(good.row_id)[2], 'passed');
  env.cleanup();
});

test('quote beyond the truncation point fails in the pipeline', async () => {
  const env = makeEnv();
  const body = `${'filler words. '.repeat(1000)}The budget is now 90k.`;
  const r = await env.feed('long1', {}, body, out('long1', [change('offer.budget', 'set', '90k', 'The budget is now 90k.')]));
  assert.equal(env.stages(r.row_id)[2], 'failed');
  env.cleanup();
});

test('context budget: model receives the compact current brief plus one truncated source', async () => {
  const env = makeEnv();
  await baseline(env);
  let seen;
  const spy = { name: 'spy', async extract(input) { seen = input; return JSON.stringify(out('big1', [])); } };
  const r = env.add('big1', { date: '2026-10-09' }, 'z'.repeat(20000));
  await runSource(env.db, r.row_id, { model: spy });
  assert.ok(seen.body.endsWith('[TRUNCATED]'));
  assert.ok(seen.body.length <= 12000 + 20);
  assert.equal(seen.brief.version, 1);
  assert.ok(seen.brief.fields['req.go']);
  assert.equal(JSON.stringify(seen).includes('Backend role.'), false, 'history of earlier sources is not sent');
  env.cleanup();
});

test('stage 1 fails on role/client mismatch with a visible error', async () => {
  const env = makeEnv();
  const r = await env.feed('m1', { client: 'other', role: 'r1' }, 'Some text.\n', out('m1', []));
  assert.equal(env.stages(r.row_id)[1], 'failed');
  assert.match(errorsOf(env, r.row_id, 1).join(), /role mismatch/);
  assert.equal(env.stages(r.row_id)[2], undefined);
  const unknown = await env.feed('m2', { role: 'zzz' }, 'Other text.\n', out('m2', []));
  assert.match(errorsOf(env, unknown.row_id, 1).join(), /unknown role/);
  env.cleanup();
});

test('stage 1 fails for a client decision without a role', async () => {
  const env = makeEnv();
  const r = await env.feed('d1', { role: 'company', channel: 'client-decision', candidate: 'X', decision: 'rejected' }, 'We pass.\n', out('d1', []));
  assert.match(errorsOf(env, r.row_id, 1).join(), /must name a role/);
  env.cleanup();
});

test('rerun is idempotent: no new rows, stages not redone', async () => {
  const env = makeEnv();
  const f = await env.feed('j1', { channel: 'jd' }, JD_BODY, jdOut());
  const before = env.db.prepare('SELECT stage, run_id, created_at FROM stage_runs WHERE source_row_id = ? ORDER BY stage').all(f.row_id);
  const counts = () => ['proposals', 'changes', 'analyses', 'learning_items'].map((t) => env.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n);
  const c1 = counts();
  await env.run(f.row_id);
  await env.run(f.row_id);
  assert.deepEqual(counts(), c1);
  assert.deepEqual(env.db.prepare('SELECT stage, run_id, created_at FROM stage_runs WHERE source_row_id = ? ORDER BY stage').all(f.row_id), before);
  env.cleanup();
});

test('re-ingesting identical content is a no-op; changed content supersedes the old row and reruns', async () => {
  const env = makeEnv();
  const f = await env.feed('j1', { channel: 'jd' }, JD_BODY, jdOut());
  assert.equal(env.add('j1', { channel: 'jd' }, JD_BODY).action, 'unchanged');
  const changed = JD_BODY.replace('Salary 70k.', 'Salary 75k.');
  const again = env.add('j1', { channel: 'jd' }, changed);
  assert.equal(again.action, 'superseded');
  assert.equal(env.db.prepare('SELECT status FROM sources WHERE id = ?').get(f.row_id).status, 'superseded');
  assert.equal(env.db.prepare('SELECT state FROM proposals WHERE id = ?').get(f.proposal.id).state, 'superseded', 'old open proposal can no longer be approved');
  assert.throws(() => approveProposal(env.db, f.proposal.id, 'lead'), /superseded/);
  // the old quote "Salary 70k." is gone, so the rerun on the new text must fail visibly
  const r2 = await env.run(again.row_id);
  assert.equal(r2.failedAt, 2);
  env.replay('j1', out('j1', [change('offer.budget', 'set', '75k', 'Salary 75k.')]));
  const r3 = await env.run(again.row_id);
  assert.equal(r3.failedAt, null);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM sources WHERE source_id = 'j1' AND status <> 'superseded'").get().n, 1);
  env.cleanup();
});

test('partial failure: stage 2 fails, rerun after fixing the model output completes without redoing stage 1', async () => {
  const env = makeEnv();
  const bad = out('p1', [change('req.go', 'add', 'Go', 'Not in the text.', 'material', { weight: 'must' })]);
  const f = await env.feed('p1', { channel: 'jd' }, JD_BODY, bad);
  assert.equal(f.res.failedAt, 2);
  const run1 = env.db.prepare('SELECT run_id FROM stage_runs WHERE source_row_id = ? AND stage = 1').get(f.row_id).run_id;
  env.replay('p1', out('p1', [change('req.go', 'add', 'Go', 'Strong Go.', 'material', { weight: 'must' })]));
  await new Promise((r) => setTimeout(r, 5));
  const r2 = await env.run(f.row_id);
  assert.equal(r2.failedAt, null);
  assert.equal(env.db.prepare('SELECT run_id FROM stage_runs WHERE source_row_id = ? AND stage = 1').get(f.row_id).run_id, run1, 'stage 1 not redone');
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM proposals WHERE source_row_id = ?').get(f.row_id).n, 1);
  env.cleanup();
});

test('stage 5 fails visibly when a study item has no study entry; forced rerun after fixing completes', async () => {
  const env = makeEnv();
  await baseline(env);
  const k = out('k1', [change('req.incident', 'add', 'Owns incidents', 'Incident ownership matters.', 'material', { weight: 'must' })]);
  const f = await env.feed('k1', { date: '2026-10-05' }, 'Incident ownership matters.\n', k);
  assert.equal(f.res.failedAt, 5);
  assert.match(errorsOf(env, f.row_id, 5).join(), /study item needed for req.incident/);
  assert.throws(() => approveProposal(env.db, f.proposal.id, 'lead'), /stage 5 is failed/);
  env.replay('k1', { ...k, study: [studyEntry('req.incident')] });
  const r2 = await env.run(f.row_id, { force: true });
  assert.equal(r2.failedAt, null);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM proposals WHERE source_row_id = ?").get(f.row_id).n, 1);
  env.cleanup();
});

test('OpenAI provider is a stub: stage 2 fails with "not configured", never replaced by replay', async () => {
  const env = makeEnv();
  const r = env.add('o1', {}, 'Text.\n');
  const res = await runSource(env.db, r.row_id, { model: createOpenAIModel() });
  assert.equal(res.failedAt, 2);
  assert.match(errorsOf(env, r.row_id, 2).join(), /not configured/);
  env.cleanup();
});

test('minor-only changes are recorded but create no proposal', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('mn1', { date: '2026-10-03' }, 'Kubernetes helps.\n', out('mn1', [change('req.k8s', 'add', 'Kubernetes', 'Kubernetes helps.', 'minor', { weight: 'nice' })]));
  assert.equal(f.proposal, undefined);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM changes WHERE source_row_id = ?').get(f.row_id).n, 1);
  assert.equal(env.stages(f.row_id)[5], 'skipped');
  env.cleanup();
});

test('a value that repeats the current brief is not a change', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('rp1', { date: '2026-10-03' }, 'Salary stays 70k.\n', out('rp1', [change('offer.budget', 'set', '70k', 'Salary stays 70k.')]));
  assert.equal(f.proposal, undefined);
  assert.equal(env.db.prepare('SELECT noop FROM changes WHERE source_row_id = ?').get(f.row_id).noop, 1);
  env.cleanup();
});

test('severity below the minimum for the kind of change is rejected', async () => {
  const env = makeEnv();
  const f = await env.feed('sv1', {}, 'Salary 70k.\n', out('sv1', [change('offer.budget', 'set', '70k', 'Salary 70k.', 'minor')]));
  assert.match(errorsOf(env, f.row_id, 2).join(), /below the minimum/);
  env.cleanup();
});

test('a company-scoped source applies to every role of that client that has a brief', async () => {
  const env = makeEnv();
  await baseline(env);
  const f2 = await env.feed('j2', { role: 'r2', channel: 'jd' }, JD_BODY.replace('Backend', 'Data'), out('j2', [change('req.sql', 'add', 'SQL', 'PostgreSQL under load.', 'material', { weight: 'must' })]));
  approveProposal(env.db, f2.proposal.id, 'lead');
  const c = await env.feed('co1', { role: 'company', channel: 'news', date: '2026-10-04' }, 'Acme moves to Mars.\n', out('co1', [change('company.direction', 'set', 'Mars', 'Acme moves to Mars.', 'material')]));
  const props = env.db.prepare('SELECT role_id FROM proposals WHERE source_row_id = ? ORDER BY role_id').all(c.row_id).map((p) => p.role_id);
  assert.deepEqual(props, ['r1', 'r2']);
  env.cleanup();
});

test('registerSource rejects a file without an id', () => {
  const env = makeEnv();
  assert.equal(registerSource(env.db, {}, 'x', 'x.md').action, 'invalid');
  env.cleanup();
});

test('first approved source creates v1; later approvals append versions with merged provenance', async () => {
  const env = makeEnv();
  await baseline(env);
  assert.equal(currentVersion(env.db, 'r1').n, 1);
  const f = await env.feed('k1', { date: '2026-10-05' }, 'Go can be learned.\n', out('k1', [change('req.go', 'set', 'Go', 'Go can be learned.', 'material', { weight: 'trainable' })]));
  approveProposal(env.db, f.proposal.id, 'lead');
  const v2 = currentVersion(env.db, 'r1');
  assert.equal(v2.n, 2);
  assert.equal(v2.fields['req.go'].weight, 'trainable');
  assert.equal(v2.fields['req.go'].source_id, 'k1');
  assert.equal(v2.fields['req.postgres'].source_id, 'j1', 'untouched fields keep their original provenance');
  env.cleanup();
});
