import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, baseline, change, out, studyEntry } from './helpers.js';
import { approveProposal, rejectProposal, editProposal } from '../src/approvals.js';
import { currentVersion } from '../src/brief.js';
import { teamStatus, publishedItems } from '../src/learning.js';

const BUDGET_BODY = 'Budget is now 65k.\nStart in Q1.\n';
const budgetOut = (id) => out(id, [
  change('offer.budget', 'set', '65k', 'Budget is now 65k.'),
  change('offer.start', 'set', 'Q1', 'Start in Q1.'),
]);

test('approval gating: a proposed version is not current, publishes nothing, assigns nobody and is not counted', async () => {
  const env = makeEnv();
  await baseline(env);
  const before = teamStatus(env.db, 'r1');
  const f = await env.feed('b1', { date: '2026-10-05' }, BUDGET_BODY, budgetOut('b1'));
  assert.equal(f.proposal.state, 'proposed');
  assert.equal(currentVersion(env.db, 'r1').n, 1, 'still v1');
  assert.equal(publishedItems(env.db, 'r1').length, 0);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM assignments').get().n, 0);
  assert.deepEqual(teamStatus(env.db, 'r1'), before, 'team status unchanged');
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM learning_items WHERE proposal_id = ?').get(f.proposal.id).n, 2, 'drafts exist but unpublished');
  assert.equal(env.stages(f.row_id)[7], undefined, 'stage 7 waits for the decision');
  env.cleanup();
});

test('approval creates the next version, publishes items, assigns the whole team and records stage 7', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('b1', { date: '2026-10-05' }, BUDGET_BODY, budgetOut('b1'));
  const r = approveProposal(env.db, f.proposal.id, 'ana');
  assert.equal(r.version, 2);
  assert.equal(currentVersion(env.db, 'r1').fields['offer.budget'].value, '65k');
  const items = publishedItems(env.db, 'r1');
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.kind === 'ack' && i.version_n === 2));
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM assignments').get().n, 4, '2 items x 2 recruiters');
  assert.equal(env.stages(f.row_id)[7], 'passed');
  assert.equal(env.db.prepare("SELECT actor FROM approvals WHERE target_type = 'proposal' AND target_id = ?").get(f.proposal.id).actor, 'ana');
  assert.throws(() => approveProposal(env.db, f.proposal.id, 'ana'), /not proposed/);
  env.cleanup();
});

test('reject keeps the proposal for audit, creates no version, no items and no assignments', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('b1', { date: '2026-10-05' }, BUDGET_BODY, budgetOut('b1'));
  rejectProposal(env.db, f.proposal.id, 'ana', 'client has not confirmed');
  const p = env.db.prepare('SELECT * FROM proposals WHERE id = ?').get(f.proposal.id);
  assert.equal(p.state, 'rejected');
  assert.equal(p.reason, 'client has not confirmed');
  assert.equal(currentVersion(env.db, 'r1').n, 1);
  assert.equal(publishedItems(env.db, 'r1').length, 0);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM changes WHERE proposal_id = ?').get(f.proposal.id).n, 2, 'changes kept');
  assert.equal(env.db.prepare("SELECT action FROM approvals WHERE target_type = 'proposal' AND target_id = ?").get(f.proposal.id).action, 'reject');
  assert.equal(env.stages(f.row_id)[7], 'skipped');
  assert.throws(() => approveProposal(env.db, f.proposal.id, 'ana'), /rejected, not proposed/);
  assert.throws(() => rejectProposal(env.db, f.proposal.id, 'ana', ''), /reason is required/);
  env.cleanup();
});

test('edit = reject + a new manual-correction proposal, approvable with the lead\'s value and provenance', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('b1', { date: '2026-10-05' }, BUDGET_BODY, budgetOut('b1'));
  const e = await editProposal(env.db, f.proposal.id, { by: 'ana', reason: 'Client confirmed 68k by phone', overrides: { 'offer.budget': { value: '68k' } }, drop: ['offer.start'] });
  assert.equal(env.db.prepare('SELECT state FROM proposals WHERE id = ?').get(f.proposal.id).state, 'rejected');
  const np = env.db.prepare('SELECT * FROM proposals WHERE id = ?').get(e.new_proposal_id);
  assert.equal(np.kind, 'manual-correction');
  assert.equal(np.corrects, f.proposal.id);
  assert.equal(env.db.prepare("SELECT channel FROM sources WHERE source_id = ?").get(e.source_id).channel, 'manual-correction');
  assert.equal(np.state, 'proposed');
  approveProposal(env.db, np.id, 'ana');
  const v = currentVersion(env.db, 'r1');
  assert.equal(v.fields['offer.budget'].value, '68k');
  assert.equal(v.fields['offer.budget'].source_id, e.source_id);
  assert.equal(v.fields['offer.start'], undefined, 'dropped change is not applied');
  env.cleanup();
});

test('approval requires an approver', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('b1', { date: '2026-10-05' }, BUDGET_BODY, budgetOut('b1'));
  assert.throws(() => approveProposal(env.db, f.proposal.id, ''), /approver is required/);
  env.cleanup();
});

test('bias: age restriction is not_applied_bias and critical; university is a proxy; Carrio no-poach is applied and not flagged', async () => {
  const env = makeEnv();
  await baseline(env);
  const body = 'Please hire someone under 35.\nIdeally top-10 university graduates.\nDo not approach Carrio staff.\n';
  const o = out('bz1', [
    change('restriction.age-under-35', 'add', 'Prefers under 35', 'Please hire someone under 35.', 'critical', { status: 'not_applied_bias', bias: { kind: 'protected', note: 'age' } }),
    change('restriction.top-university', 'add', 'Top-10 university', 'Ideally top-10 university graduates.', 'material', { status: 'not_applied_bias', bias: { kind: 'proxy', note: 'prestige proxy' } }),
    change('restriction.no-carrio', 'add', 'No Carrio staff', 'Do not approach Carrio staff.', 'material', { status: 'applied' }),
  ]);
  const f = await env.feed('bz1', { date: '2026-10-05' }, body, o);
  assert.equal(f.res.failedAt, null);
  approveProposal(env.db, f.proposal.id, 'lead');
  const v = currentVersion(env.db, 'r1').fields;
  assert.equal(v['restriction.age-under-35'].status, 'not_applied_bias');
  assert.equal(v['restriction.age-under-35'].severity, 'critical');
  assert.equal(v['restriction.top-university'].status, 'not_applied_bias');
  assert.equal(v['restriction.top-university'].bias.kind, 'proxy');
  assert.equal(v['restriction.no-carrio'].status, 'applied');
  assert.equal(v['restriction.no-carrio'].bias, null);
  env.cleanup();
});

test('bias: a model output that applies a biased restriction fails stage 4 and blocks approval', async () => {
  const env = makeEnv();
  await baseline(env);
  const o = out('bz2', [change('restriction.age', 'add', 'Under 35', 'Please hire someone under 35.', 'critical', { status: 'applied', bias: { kind: 'protected', note: 'age' } })]);
  const f = await env.feed('bz2', { date: '2026-10-05' }, 'Please hire someone under 35.\n', o);
  assert.equal(f.res.failedAt, 4);
  assert.throws(() => approveProposal(env.db, f.proposal.id, 'lead'), /stage 4 is failed/);
  env.cleanup();
});

test('bias: an unflagged age restriction is caught by the safety net', async () => {
  const env = makeEnv();
  await baseline(env);
  const o = out('bz3', [change('restriction.team-fit', 'add', 'Prefers someone under 35', 'someone under 35', 'material', { status: 'applied' })]);
  const f = await env.feed('bz3', { date: '2026-10-05' }, 'We want someone under 35.\n', o);
  assert.equal(f.res.failedAt, 4);
  env.cleanup();
});

test('study entries are carried to the manual correction (level change keeps its study item)', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('lv1', { date: '2026-10-05' }, 'Mid level is fine.\n', out('lv1', [change('offer.level', 'set', 'Mid or senior', 'Mid level is fine.')], { study: [studyEntry('offer.level')] }));
  const e = await editProposal(env.db, f.proposal.id, { by: 'ana', reason: 'Wording fix from the call' , overrides: { 'offer.level': { value: 'Mid' } } });
  assert.equal(e.run.failedAt, null);
  approveProposal(env.db, e.new_proposal_id, 'ana');
  assert.equal(publishedItems(env.db, 'r1').filter((i) => i.kind === 'study').length, 1);
  env.cleanup();
});
