// Regression tests for the Codex pre-merge review findings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, baseline, change, out, studyEntry } from './helpers.ts';
import { createOpenAIModel } from '../../lib/model/openai.ts';
import { approveProposal } from '../../lib/domain/approvals.ts';
import { currentVersion, mergeChanges, appliedRestrictions } from '../../lib/domain/brief.ts';
import { publishedItems, removeRecruiter } from '../../lib/domain/learning.ts';
import { verifyVersionRule } from '../../lib/domain/pipeline.ts';
import { isCalendarDate } from '../../lib/domain/checks.ts';

// ---- 1. stale proposals ----
const A = 'Strong Go.\nBudget 70k.\n';
const B = 'PostgreSQL needed.\nBudget 80k.\n';
const aOut = out('pa', [change('req.go', 'add', 'Go', 'Strong Go.', 'material', { weight: 'must' }), change('offer.budget', 'set', '70k', 'Budget 70k.')], { study: [studyEntry('req.go')] });
const bOut = out('pb', [change('req.postgres', 'add', 'PostgreSQL', 'PostgreSQL needed.', 'material', { weight: 'must' }), change('offer.budget', 'set', '80k', 'Budget 80k.')], { study: [studyEntry('req.postgres')] });

async function twoBaselines() {
  const env = makeEnv();
  const a = await env.feed('pa', { date: '2026-10-01' }, A, aOut);
  const b = await env.feed('pb', { date: '2026-10-02' }, B, bOut);
  assert.equal(a.proposal.base_version, 0);
  assert.equal(b.proposal.base_version, 0);
  return { env, a: a.proposal.id, b: b.proposal.id };
}

test('stale proposals: two baseline proposals approved a then b: the second still creates learning items', async () => {
  const { env, a, b } = await twoBaselines();
  assert.equal(approveProposal(env.db, a, 'lead').version, 1);
  assert.equal(publishedItems(env.db, 'r1').length, 0, 'the first one is the baseline');
  const r = approveProposal(env.db, b, 'lead');
  assert.deepEqual([r.version, r.rebased], [2, true]);
  assert.deepEqual(publishedItems(env.db, 'r1').map((i: any) => `${i.kind}:${i.field}`).sort(), ['ack:offer.budget', 'study:req.postgres']);
  const f = currentVersion(env.db, 'r1').fields;
  assert.ok(f['req.go'] && f['req.postgres'], 'both sets of requirements survive');
  assert.equal(env.db.prepare("SELECT old_value FROM changes WHERE proposal_id = ? AND field = 'offer.budget'").get(b).old_value, '70k', 'diff recomputed against the current brief');
  env.cleanup();
});

test('stale proposals: approved b then a gives the same shape (order does not skip training)', async () => {
  const { env, a, b } = await twoBaselines();
  approveProposal(env.db, b, 'lead');
  approveProposal(env.db, a, 'lead');
  assert.equal(currentVersion(env.db, 'r1').n, 2);
  assert.deepEqual(publishedItems(env.db, 'r1').map((i: any) => `${i.kind}:${i.field}`).sort(), ['ack:offer.budget', 'study:req.go']);
  env.cleanup();
});

test('stale proposals: a proposal made redundant by a newer version is superseded_noop with an audit row and no new version', async () => {
  const env = makeEnv();
  const a = await env.feed('pa', { date: '2026-10-01' }, 'Strong Go.\n', out('pa', [change('req.go', 'add', 'Go', 'Strong Go.', 'material', { weight: 'must' })]));
  const b = await env.feed('pb', { date: '2026-10-02' }, 'Go is a must too.\n', out('pb', [change('req.go', 'add', 'Go', 'Go is a must too.', 'material', { weight: 'must' })]));
  approveProposal(env.db, a.proposal.id, 'lead');
  const r = approveProposal(env.db, b.proposal.id, 'lead');
  assert.equal(r.state, 'superseded_noop');
  assert.equal(currentVersion(env.db, 'r1').n, 1);
  assert.equal(env.db.prepare('SELECT state FROM proposals WHERE id = ?').get(b.proposal.id).state, 'superseded_noop');
  assert.equal(env.db.prepare("SELECT action FROM approvals WHERE target_type = 'proposal' AND target_id = ?").get(b.proposal.id).action, 'superseded_noop');
  assert.equal(publishedItems(env.db, 'r1').length, 0);
  env.cleanup();
});

// ---- 2. bias exclusion ----
test('bias: mergeChanges stores a biased restriction only as not_applied_bias and refuses to apply it', () => {
  const row = { field: 'restriction.age', op: 'add', value: 'under 35', weight: null, status: 'not_applied_bias', bias_kind: 'protected', bias_note: 'age', confirmed: null, severity: 'critical', quote: 'q', start: 0, end: 1, conflicts_with: null };
  const fields = mergeChanges({}, [row], { sourceId: 's', n: 1 });
  assert.equal(fields['restriction.age'].status, 'not_applied_bias');
  assert.throws(() => mergeChanges({}, [{ ...row, status: 'applied' }], { sourceId: 's', n: 1 }), /cannot be applied/);
  assert.equal(mergeChanges({}, [{ ...row, status: null }], { sourceId: 's', n: 1 })['restriction.age'].status, 'not_applied_bias', 'status cannot be left to default to applied');
});

test('bias: an approved brief lists the biased restriction as not_applied_bias and appliedRestrictions excludes it', async () => {
  const env = makeEnv();
  await baseline(env);
  const body = 'Someone under 35 please.\nIdeally top-10 university.\nDo not approach Carrio staff.\n';
  const f = await env.feed('bz', { date: '2026-10-05' }, body, out('bz', [
    change('restriction.age', 'add', 'Under 35', 'Someone under 35 please.', 'critical', { status: 'not_applied_bias', bias: { kind: 'protected', note: 'age' } }),
    change('restriction.uni', 'add', 'Top-10 university', 'Ideally top-10 university.', 'material', { status: 'not_applied_bias', bias: { kind: 'proxy', note: 'proxy' } }),
    change('restriction.carrio', 'add', 'No Carrio', 'Do not approach Carrio staff.', 'material', { status: 'applied' }),
  ]));
  approveProposal(env.db, f.proposal.id, 'lead');
  const fields = currentVersion(env.db, 'r1').fields;
  assert.equal(fields['restriction.age'].status, 'not_applied_bias');
  assert.equal(fields['restriction.uni'].status, 'not_applied_bias');
  assert.deepEqual(appliedRestrictions(fields), ['restriction.carrio']);
  env.cleanup();
});

// ---- 3. stage 7 with no recruiters ----
test('stage 7 fails with "no assigned recruiters" when approved items have nobody to go to', async () => {
  const env = makeEnv();
  await env.feed('j2', { role: 'r2', channel: 'jd' }, 'Strong Go.\nBudget 70k.\n', out('j2', [change('req.go', 'add', 'Go', 'Strong Go.', 'material', { weight: 'must' }), change('offer.budget', 'set', '70k', 'Budget 70k.')]))
    .then((f) => approveProposal(env.db, f.proposal.id, 'lead'));
  const f = await env.feed('b2', { role: 'r2', date: '2026-10-05' }, 'Budget 65k now.\n', out('b2', [change('offer.budget', 'set', '65k', 'Budget 65k now.')]));
  removeRecruiter(env.db, 'r2', 'ana');
  approveProposal(env.db, f.proposal.id, 'lead');
  const s7 = env.db.prepare('SELECT status, check_result FROM stage_runs WHERE source_row_id = ? AND stage = 7').get(f.row_id);
  assert.equal(s7.status, 'failed');
  assert.match(s7.check_result, /no assigned recruiters/);
  env.cleanup();
});

// ---- 4. OpenAI errors and retries ----
const hdr = (o = {}) => ({ get: (k: any) => o[k.toLowerCase()] ?? null });
const resp = (status: any, { headers, json, text }: any = {}) => ({ ok: status < 300, status, headers: hdr(headers), json: json ?? (async () => ({ choices: [{ message: { content: '{"ok":1}' } }] })), text: text ?? (async () => { throw new Error('body must never be read'); }) });
const mk = (responses: any, sleeps = []) => {
  let calls = 0;
  const fetchImpl = async () => { const r = responses[Math.min(calls++, responses.length - 1)]; if (r instanceof Error) throw r; return r; };
  const m = createOpenAIModel({ OPENAI_API_KEY: 'k' }, fetchImpl, { sleep: async (ms) => { sleeps.push(ms); } });
  return { m, calls: () => calls, sleeps };
};
const named = (name: any) => Object.assign(new Error('x'), { name });

test('openai: 429 is retried honouring Retry-After and then succeeds', async () => {
  const t = mk([resp(429, { headers: { 'retry-after': '3' } }), resp(200)]);
  assert.equal(await t.m.extract({}), '{"ok":1}');
  assert.deepEqual([t.calls(), t.sleeps], [2, [3000]]);
});

test('openai: Retry-After is capped at 10 s and retries stop after 2', async () => {
  const t = mk([resp(429, { headers: { 'retry-after': '999', 'x-request-id': 'req_9' } })]);
  await assert.rejects(t.m.extract({}), (e: any) => e.message === 'OpenAI API error 429 (request id req_9)');
  assert.equal(t.calls(), 3);
  assert.deepEqual(t.sleeps, [10000, 10000]);
});

test('openai: 5xx is retried with backoff, then reported generically', async () => {
  const t = mk([resp(503)]);
  await assert.rejects(t.m.extract({}), (e: any) => e.message === 'OpenAI API error 503');
  assert.equal(t.calls(), 3);
  assert.equal(t.sleeps.length, 2);
  const ok = mk([resp(500), resp(502), resp(200)]);
  assert.equal(await ok.m.extract({}), '{"ok":1}');
});

test('openai: 4xx other than 429 is not retried', async () => {
  const t = mk([resp(401)]);
  await assert.rejects(t.m.extract({}), /error 401/);
  assert.equal(t.calls(), 1);
});

test('openai: timeout is classified and not retried; network errors are retried then reported', async () => {
  const to = mk([named('TimeoutError')]);
  await assert.rejects(to.m.extract({}), (e: any) => e.message === 'OpenAI API timeout');
  assert.equal(to.calls(), 1);
  const net = mk([new TypeError('fetch failed: connect ECONNREFUSED sk-secret-123')]);
  await assert.rejects(net.m.extract({}), (e: any) => e.message === 'OpenAI API network error');
  assert.equal(net.calls(), 3);
});

test('openai: non-JSON response is a generic error', async () => {
  const t = mk([resp(200, { json: async () => { throw new SyntaxError('Unexpected token < in JSON'); } })]);
  await assert.rejects(t.m.extract({}), (e: any) => e.message === 'OpenAI API returned a non-JSON response');
});

test('openai: an error body containing a non-sk secret never leaks (the body is not read)', async () => {
  const leaky = resp(400, { text: async () => 'bad request token=ghp_SECRET123 org-AbCdEf Bearer abc.def', json: async () => ({ error: { message: 'ghp_SECRET123' } }) });
  leaky.text = async () => 'ghp_SECRET123';
  const t = mk([leaky]);
  await assert.rejects(t.m.extract({}), (e: any) => e.message === 'OpenAI API error 400' && !/SECRET|ghp_|Bearer/.test(e.message));
});

test('openai: the stored stage error is generic', async () => {
  const env = makeEnv();
  const t = mk([resp(500, { headers: { 'x-request-id': 'req_1' } })]);
  const r = env.add('o9', {}, 'Text.\n');
  const { runSource } = await import('../../lib/domain/pipeline.ts');
  await runSource(env.db, r.row_id, { model: t.m });
  const stored = env.db.prepare('SELECT check_result FROM stage_runs WHERE source_row_id = ? AND stage = 2').get(r.row_id).check_result;
  assert.match(stored, /OpenAI API error 500 \(request id req_1\)/);
  env.cleanup();
});

// ---- 5. dates ----
test('calendar dates are validated by round trip', () => {
  for (const d of ['2026-02-30', '2026-99-99', '2027-02-29', '2026-13-01', '2026-00-10', '2026-1-01', '', null]) assert.equal(isCalendarDate(d), false, String(d));
  for (const d of ['2026-02-28', '2028-02-29', '2026-12-31', '2026-01-01']) assert.equal(isCalendarDate(d), true, d);
});

test('stage 1 rejects impossible dates', async () => {
  const env = makeEnv();
  for (const [i, date] of ['2026-02-30', '2026-99-99'].entries()) {
    const r = await env.feed(`dt${i}`, { date }, `Text ${i}.\n`, out(`dt${i}`, []));
    assert.equal(env.stages(r.row_id)[1], 'failed');
    assert.match(env.db.prepare('SELECT check_result FROM stage_runs WHERE source_row_id = ? AND stage = 1').get(r.row_id).check_result, /real calendar date/);
  }
  const ok = await env.feed('dt9', { date: '2028-02-29' }, 'Leap day.\n', out('dt9', []));
  assert.equal(env.stages(ok.row_id)[1], 'passed');
  env.cleanup();
});

// ---- 6. offsets ----
test('offsets: wrong-but-unique offsets are recomputed and stored correctly; duplicates with wrong offsets fail', async () => {
  const env = makeEnv();
  const body = 'Alpha line.\nBudget is 90k.\n';
  const ok = await env.feed('of1', {}, body, out('of1', [change('offer.budget', 'set', '90k', 'Budget is 90k.', 'material', { start: 0, end: 3 })]));
  assert.equal(env.stages(ok.row_id)[2], 'passed');
  const c = env.db.prepare('SELECT start, "end", quote FROM changes WHERE source_row_id = ?').get(ok.row_id);
  assert.equal(body.slice(c.start, c.end), c.quote);
  const dup = 'Budget is 90k.\nBudget is 90k.\n';
  const bad = await env.feed('of2', {}, dup, out('of2', [change('offer.budget', 'set', '90k', 'Budget is 90k.', 'material', { start: 0, end: 3 })]));
  assert.equal(bad.res.failedAt, 2);
  const fixed = await env.feed('of3', {}, dup + 'x\n', out('of3', [change('offer.budget', 'set', '90k', 'Budget is 90k.', 'material', { start: 15, end: 29 })]));
  assert.equal(fixed.res.failedAt, null);
  env.cleanup();
});

// ---- 7. stage 3 self-check ----
test('stage 3 self-check reads persisted rows: it catches a missing proposal or a stray one', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('sc1', { date: '2026-10-05' }, 'Budget 65k now.\n', out('sc1', [change('offer.budget', 'set', '65k', 'Budget 65k now.')]));
  const row = env.db.prepare('SELECT * FROM sources WHERE id = ?').get(f.row_id);
  assert.deepEqual(verifyVersionRule(env.db, row), []);
  env.db.prepare('DELETE FROM proposals WHERE id = ?').run(f.proposal.id);
  assert.match(verifyVersionRule(env.db, row).join(), /material change but no proposal/);
  const k = await env.feed('sc2', { date: '2026-10-06' }, 'Kubernetes helps.\n', out('sc2', [change('req.k8s', 'add', 'K8s', 'Kubernetes helps.', 'minor', { weight: 'nice' })]));
  env.db.prepare("INSERT INTO proposals(source_row_id, role_id, state, severity, kind, base_version, created_at) VALUES (?, 'r1', 'proposed', 'minor', 'source', 1, 'x')").run(k.row_id);
  assert.match(verifyVersionRule(env.db, env.db.prepare('SELECT * FROM sources WHERE id = ?').get(k.row_id)).join(), /proposal without a material change/);
  env.cleanup();
});
