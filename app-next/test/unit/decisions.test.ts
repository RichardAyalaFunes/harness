import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, baseline, change, out } from './helpers.ts';
import { approveProposal, approveReview, rejectReview } from '../../lib/domain/approvals.ts';
import { completeItem, publishedItems, itemsFor } from '../../lib/domain/learning.ts';
import { roleView } from '../../lib/domain/views.ts';
import { currentVersion } from '../../lib/domain/brief.ts';

const SCREEN = 'Q1 Ana: How many years of Go?\nQ2 Ana: Tell me about Postgres load.\nQ3 Ana: Any questions?\n';
const DECISION = 'Dana did not convince us.\nPlease check design depth first.\n';
const cov = [
  { criterion: 'req.go', status: 'asked', quote: 'How many years of Go?' },
  { criterion: 'req.postgres', status: 'asked', quote: 'Tell me about Postgres load.' },
];
const review = (screening: any, coverage: any = cov, extra: any = {}) => ({
  candidate: 'Dana', screening, coverage, overweighted: [{ topic: 'Go', count: 1, total: 3, quote: 'How many years of Go?' }],
  suggested: [{ text: 'Ask about design', why: 'client asked' }], ...extra,
});
const decOut = (id: any, rv: any, changes = []) => out(id, changes, { decision: { candidate: 'Dana', outcome: 'rejected', reason: 'design' }, review: rv });
const screen = (env: any, id: any, date: any, body = SCREEN, role = 'r1') => env.feed(id, { channel: 'screening-transcript', candidate: 'Dana', date, role }, body, out(id, []));
const decide = (env: any, id: any, date: any, rv: any, changes?: any) => env.feed(id, { channel: 'client-decision', candidate: 'Dana', decision: 'rejected', date }, `${DECISION}Ref ${id}.
`, decOut(id, rv, changes));
const reviewRow = (env: any, rowId: any) => env.db.prepare('SELECT * FROM screening_reviews WHERE source_row_id = ?').get(rowId);

test('client decision with a matching screening gets a review against the brief at the screening', async () => {
  const env = makeEnv();
  await baseline(env);
  await screen(env, 's1', '2026-10-03');
  const d = await decide(env, 'd1', '2026-10-06', review('s1'));
  assert.equal(d.res.failedAt, null);
  const r = reviewRow(env, d.row_id);
  assert.equal(r.status, 'ok');
  assert.equal(r.screening_source_id, 's1');
  assert.equal(r.brief_version_at_screening, 1);
  assert.equal(r.purpose, 'retrospective');
  assert.equal(r.state, 'proposed');
  assert.deepEqual(JSON.parse(r.must_have_snapshot_json).map((m: any) => m.criterion).sort(), ['req.go', 'req.postgres']);
  env.cleanup();
});

test('no transcript: insufficient_evidence, never a pass, and the review item still exists asking for notes', async () => {
  const env = makeEnv();
  await baseline(env);
  const d = await decide(env, 'd1', '2026-10-06', review(null, []));
  assert.equal(d.res.failedAt, null);
  const r = reviewRow(env, d.row_id);
  assert.equal(r.status, 'insufficient_evidence');
  assert.equal(r.screening_source_id, null);
  approveReview(env.db, r.id, 'lead');
  const item = publishedItems(env.db, 'r1').find((i: any) => i.kind === 'review');
  assert.match(item.detail.note, /Add screening notes/);
  env.cleanup();
});

test('a model that cites a screening the harness could not match fails stage 6', async () => {
  const env = makeEnv();
  await baseline(env);
  const d = await decide(env, 'd1', '2026-10-06', review('s9'));
  assert.equal(d.res.failedAt, 6);
  env.cleanup();
});

test('several screenings: the latest dated on or before the decision wins', async () => {
  const env = makeEnv();
  await baseline(env);
  await screen(env, 's1', '2026-10-02');
  await screen(env, 's2', '2026-10-04', SCREEN + 'Q4 Ana: Extra question.\n');
  const wrong = await decide(env, 'd1', '2026-10-06', review('s1'));
  assert.equal(wrong.res.failedAt, 6, 'citing the older transcript is a failure');
  const ok = await decide(env, 'd2', '2026-10-06', review('s2'), []);
  assert.equal(reviewRow(env, ok.row_id).screening_source_id, 's2');
  env.cleanup();
});

test('same-date screenings: the later ingest order wins', async () => {
  const env = makeEnv();
  await baseline(env);
  await screen(env, 's1', '2026-10-03');
  await screen(env, 's2', '2026-10-03', SCREEN + 'Q4 Ana: Another.\n');
  const d = await decide(env, 'd1', '2026-10-06', review('s2'));
  assert.equal(reviewRow(env, d.row_id).screening_source_id, 's2');
  env.cleanup();
});

test('decision dated before every transcript: insufficient_evidence', async () => {
  const env = makeEnv();
  await baseline(env);
  await screen(env, 's1', '2026-10-08');
  const d = await decide(env, 'd1', '2026-10-06', review(null, []));
  assert.equal(reviewRow(env, d.row_id).status, 'insufficient_evidence');
  env.cleanup();
});

test('a screening for another role or another candidate is never matched', async () => {
  const env = makeEnv();
  await baseline(env);
  await screen(env, 's1', '2026-10-03', SCREEN, 'r2');
  await env.feed('s2', { channel: 'screening-transcript', candidate: 'Someone Else', date: '2026-10-03' }, SCREEN + 'x', out('s2', []));
  const d = await decide(env, 'd1', '2026-10-06', review(null, []));
  assert.equal(reviewRow(env, d.row_id).status, 'insufficient_evidence');
  env.cleanup();
});

test('historical brief: a must-have added after the screening is not_applicable_historical, never a gap', async () => {
  const env = makeEnv();
  await baseline(env);
  await screen(env, 's1', '2026-10-03');
  const k = await env.feed('k1', { date: '2026-10-04' }, 'Design depth is now a must.\n', out('k1', [change('req.design', 'add', 'Design depth', 'Design depth is now a must.', 'material', { weight: 'must' })], { study: [{ field: 'req.design', prompt: 'p', points: ['a'], keys: [['x']] }] }));
  approveProposal(env.db, k.proposal.id, 'lead');
  assert.equal(currentVersion(env.db, 'r1').n, 2);
  const withLater = [...cov, { criterion: 'req.design', status: 'not_applicable_historical' }];
  const d = await decide(env, 'd1', '2026-10-06', review('s1', withLater));
  assert.equal(d.res.failedAt, null);
  const r = reviewRow(env, d.row_id);
  assert.equal(r.brief_version_at_screening, 1);
  assert.deepEqual(JSON.parse(r.must_have_snapshot_json).map((m: any) => m.criterion).sort(), ['req.go', 'req.postgres']);
  const asGap = await decide(env, 'd2', '2026-10-06', review('s1', [...cov, { criterion: 'req.design', status: 'not_asked' }]));
  assert.equal(asGap.res.failedAt, 6, 'listing the later criterion as not_asked is rejected');
  env.cleanup();
});

test('coverage must list every must-have of the brief at the screening, and quotes must come from that transcript', async () => {
  const env = makeEnv();
  await baseline(env);
  await screen(env, 's1', '2026-10-03');
  const missing = await decide(env, 'd1', '2026-10-06', review('s1', [cov[0]]));
  assert.equal(missing.res.failedAt, 6);
  const badQuote = await decide(env, 'd2', '2026-10-06', review('s1', [cov[0], { criterion: 'req.postgres', status: 'asked', quote: 'Not said in the call.' }]));
  assert.equal(badQuote.res.failedAt, 6);
  const needsQuote = await decide(env, 'd3', '2026-10-06', review('s1', [cov[0], { criterion: 'req.postgres', status: 'asked' }]));
  assert.equal(needsQuote.res.failedAt, 6);
  env.cleanup();
});

test('decision metadata in the model output must match the source', async () => {
  const env = makeEnv();
  await baseline(env);
  const o = decOut('d1', review(null, []));
  o.decision.candidate = 'Somebody Else';
  const d = await env.feed('d1', { channel: 'client-decision', candidate: 'Dana', decision: 'rejected', date: '2026-10-06' }, DECISION, o);
  assert.equal(d.res.failedAt, 2);
  env.cleanup();
});

test('review approval is separate from brief approval; rejected reviews stay visible but publish nothing', async () => {
  const env = makeEnv();
  await baseline(env);
  await screen(env, 's1', '2026-10-03');
  const d = await decide(env, 'd1', '2026-10-06', review('s1'), [change('req.design', 'add', 'Design depth', 'Please check design depth first.', 'material', { weight: 'proposed', confirmed: false })]);
  const rv = reviewRow(env, d.row_id);
  assert.ok(d.proposal, 'the decision also proposes a brief change');
  // nothing is visible to recruiters yet
  assert.equal(itemsFor(env.db, 'r1', 'ana').length, 0);
  assert.equal(roleView(env.db, 'r1').reviews[0].state, 'proposed');
  // approve the review only
  approveReview(env.db, rv.id, 'lead');
  assert.equal(currentVersion(env.db, 'r1').n, 1, 'brief unchanged: proposal still awaits its own approval');
  assert.equal(env.db.prepare('SELECT state FROM proposals WHERE id = ?').get(d.proposal.id).state, 'proposed');
  const mine = itemsFor(env.db, 'r1', 'ana');
  assert.deepEqual(mine.map((i: any) => i.kind), ['review']);
  assert.equal(env.stages(d.row_id)[7], undefined, 'stage 7 still waits for the proposal');
  // reject-path on a second decision
  const d2 = await decide(env, 'd2', '2026-10-07', review('s1'));
  rejectReview(env.db, reviewRow(env, d2.row_id).id, 'lead', 'not helpful');
  const view = roleView(env.db, 'r1');
  assert.equal(view.reviews.find((r: any) => r.source_id === 'd2').state, 'rejected');
  assert.equal(view.items.length, 1, 'rejected review created no item');
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM learning_items WHERE review_id = ? AND published = 1').get(reviewRow(env, d2.row_id).id).n, 0);
  env.cleanup();
});

test('review completion: accept a suggestion, or say none is needed with a reason', async () => {
  const env = makeEnv();
  await baseline(env);
  await screen(env, 's1', '2026-10-03');
  const d = await decide(env, 'd1', '2026-10-06', review('s1'));
  approveReview(env.db, reviewRow(env, d.row_id).id, 'lead');
  const it = publishedItems(env.db, 'r1').find((i: any) => i.kind === 'review');
  assert.equal(completeItem(env.db, it.id, 'ana', {}).passed, false, 'nothing accepted');
  assert.equal(completeItem(env.db, it.id, 'ana', { accepted: [5] }).passed, false, 'unknown suggestion');
  assert.equal(completeItem(env.db, it.id, 'ana', { none_needed: true, response: 'x' }).passed, false, 'reason too short');
  assert.equal(completeItem(env.db, it.id, 'ana', { none_needed: true, response: 'Already covered in my template.' }).passed, true);
  assert.equal(completeItem(env.db, it.id, 'luis', { accepted: [0] }).passed, true);
  env.cleanup();
});
