import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, baseline, change, out, studyEntry } from './helpers.ts';
import { approveProposal } from '../../lib/domain/approvals.ts';
import { completeItem, teamStatus, publishedItems, addRecruiter, removeRecruiter, itemsFor } from '../../lib/domain/learning.ts';
import { moveCandidate } from '../../lib/domain/candidates.ts';
import { currentVersion } from '../../lib/domain/brief.ts';

const status = (env: any, who: any) => teamStatus(env.db, 'r1').find((t: any) => t.id === who);

// approved v2: budget ack + a new must-have (study)
async function withV2() {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('k1', { date: '2026-10-05' }, 'Budget is now 65k.\nIncident ownership is key.\n', out('k1', [
    change('offer.budget', 'set', '65k', 'Budget is now 65k.'),
    change('req.incident', 'add', 'Owns incidents', 'Incident ownership is key.', 'material', { weight: 'must' }),
  ], { study: [studyEntry('req.incident')] }));
  approveProposal(env.db, f.proposal.id, 'lead');
  return env;
}
const itemOf = (env: any, kind: any) => publishedItems(env.db, 'r1').find((i: any) => i.kind === kind);

test('new must-have creates a study item from the model\'s study entry; budget creates an ack', async () => {
  const env = await withV2();
  const s = itemOf(env, 'study');
  assert.equal(s.field, 'req.incident');
  assert.match(s.detail.prompt, /req.incident/);
  assert.equal(itemOf(env, 'ack').field, 'offer.budget');
  env.cleanup();
});

test('study completion needs a written answer of 20+ characters; shorter stores nothing', async () => {
  const env = await withV2();
  const s = itemOf(env, 'study');
  const short = completeItem(env.db, s.id, 'ana', { response: 'too short' });
  assert.equal(short.passed, false);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM completions').get().n, 0);
  const ok = completeItem(env.db, s.id, 'ana', { response: 'I would ask alpha first, then beta details.' });
  assert.equal(ok.passed, true);
  assert.equal(ok.result.stub, true, 'labelled as the replay stub');
  assert.deepEqual(ok.result.points.map((p: any) => p.hit), [true, true]);
  env.cleanup();
});

test('repeated completion clicks are idempotent', async () => {
  const env = await withV2();
  const a = itemOf(env, 'ack');
  const first = completeItem(env.db, a.id, 'ana', {});
  const second = completeItem(env.db, a.id, 'ana', {});
  assert.equal(first.already, false);
  assert.equal(second.already, true);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM completions WHERE item_id = ?').get(a.id).n, 1);
  env.cleanup();
});

test('up to date requires every published item; completion is per recruiter', async () => {
  const env = await withV2();
  for (const it of publishedItems(env.db, 'r1')) completeItem(env.db, it.id, 'ana', { response: 'alpha and beta, in my own words.' });
  assert.equal(status(env, 'ana').up_to_date, true);
  assert.equal(status(env, 'luis').up_to_date, false);
  assert.equal(status(env, 'luis').pending, 2);
  env.cleanup();
});

test('completion is per version: a later version with a new item makes a recruiter out of date again', async () => {
  const env = await withV2();
  for (const it of publishedItems(env.db, 'r1')) completeItem(env.db, it.id, 'ana', { response: 'alpha and beta, in my own words.' });
  assert.equal(status(env, 'ana').up_to_date, true);
  const f = await env.feed('k2', { date: '2026-10-06' }, 'Start in Q2.\n', out('k2', [change('offer.start', 'set', 'Q2', 'Start in Q2.')]));
  assert.equal(status(env, 'ana').up_to_date, true, 'unapproved proposal does not count');
  approveProposal(env.db, f.proposal.id, 'lead');
  const s = status(env, 'ana');
  assert.equal(s.up_to_date, false);
  assert.equal(s.pending, 1);
  assert.equal(publishedItems(env.db, 'r1').at(-1).version_n, 3);
  completeItem(env.db, publishedItems(env.db, 'r1').at(-1).id, 'ana', {});
  assert.equal(status(env, 'ana').up_to_date, true);
  env.cleanup();
});

test('team membership change: a new member gets every published item, a removed member is no longer counted', async () => {
  const env = await withV2();
  addRecruiter(env.db, 'r1', 'marta');
  assert.equal(status(env, 'marta').pending, 2);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM assignments WHERE recruiter_id = ?').get('marta').n, 2);
  removeRecruiter(env.db, 'r1', 'luis');
  assert.equal(teamStatus(env.db, 'r1').some((t: any) => t.id === 'luis'), false);
  assert.throws(() => completeItem(env.db, itemOf(env, 'ack').id, 'luis', {}), /not on the team/);
  env.cleanup();
});

test('a removed must-have creates no study item, only an acknowledgement that it is no longer required', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('rm1', { date: '2026-10-05' }, 'Postgres is no longer needed.\n', out('rm1', [change('req.postgres', 'remove', undefined, 'Postgres is no longer needed.')]));
  approveProposal(env.db, f.proposal.id, 'lead');
  const items = publishedItems(env.db, 'r1');
  assert.deepEqual(items.map((i: any) => i.kind), ['ack']);
  assert.match(items[0].title, /No longer (required|a must-have)/);
  assert.equal(currentVersion(env.db, 'r1').fields['req.postgres'], undefined);
  env.cleanup();
});

test('lowering a must-have to trainable creates an ack, not a study item', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('lw1', { date: '2026-10-05' }, 'Go can be learned.\n', out('lw1', [change('req.go', 'set', 'Go', 'Go can be learned.', 'material', { weight: 'trainable' })]));
  approveProposal(env.db, f.proposal.id, 'lead');
  assert.deepEqual(publishedItems(env.db, 'r1').map((i: any) => [i.kind, i.field]), [['ack', 'req.go']]);
  env.cleanup();
});

test('level-only change creates a study item', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('lv1', { date: '2026-10-05' }, 'Mid level may do.\n', out('lv1', [change('offer.level', 'set', 'Mid', 'Mid level may do.')], { study: [studyEntry('offer.level')] }));
  approveProposal(env.db, f.proposal.id, 'lead');
  assert.deepEqual(publishedItems(env.db, 'r1').map((i: any) => [i.kind, i.field]), [['study', 'offer.level']]);
  env.cleanup();
});

test('the first version of a role is a baseline and creates no learning items', async () => {
  const env = makeEnv();
  await baseline(env);
  assert.equal(publishedItems(env.db, 'r1').length, 0);
  env.cleanup();
});

test('unpublished items and recruiters outside the team cannot complete', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('b1', { date: '2026-10-05' }, 'Budget is now 65k.\n', out('b1', [change('offer.budget', 'set', '65k', 'Budget is now 65k.')]));
  const draft = env.db.prepare('SELECT id FROM learning_items WHERE proposal_id = ?').get(f.proposal.id);
  assert.throws(() => completeItem(env.db, draft.id, 'ana', {}), /not published/);
  approveProposal(env.db, f.proposal.id, 'lead');
  // approval regenerates items from the approval-time diff, so look the published item up again
  const published = env.db.prepare('SELECT id FROM learning_items WHERE proposal_id = ? AND published = 1').get(f.proposal.id);
  assert.throws(() => completeItem(env.db, published.id, 'marta', {}), /not on the team/);
  env.cleanup();
});

test('moving a candidate succeeds with incomplete learning and unapproved changes', async () => {
  const env = await withV2();
  assert.equal(status(env, 'ana').up_to_date, false);
  const id = env.db.prepare("SELECT id FROM candidates WHERE name = 'C. One'").get().id;
  assert.equal(moveCandidate(env.db, id, 3).stage_name, 'Interview');
  assert.equal(moveCandidate(env.db, id, 'Offer').stage, 4);
  assert.throws(() => moveCandidate(env.db, id, 9), /unknown stage/);
  env.cleanup();
});

test('an applied restriction is shown in the brief only: it never affects moves', async () => {
  const env = makeEnv();
  await baseline(env);
  const f = await env.feed('nr1', { date: '2026-10-05' }, 'Do not approach Carrio staff.\n', out('nr1', [change('restriction.no-carrio', 'add', 'No Carrio staff', 'Do not approach Carrio staff.', 'material', { status: 'applied' })]));
  approveProposal(env.db, f.proposal.id, 'lead');
  assert.equal(currentVersion(env.db, 'r1').fields['restriction.no-carrio'].status, 'applied');
  const id = env.db.prepare("SELECT id FROM candidates WHERE name = 'C. Two'").get().id;
  assert.equal(moveCandidate(env.db, id, 4).stage, 4);
  // moveCandidate must not even import the brief or learning modules
  const src = (await import('node:fs')).readFileSync(new URL('../../lib/domain/candidates.ts', import.meta.url), 'utf8');
  assert.equal(/import .* from/.test(src), false);
  env.cleanup();
});

test('itemsFor reports completion state for the recruiter', async () => {
  const env = await withV2();
  const a = itemOf(env, 'ack');
  completeItem(env.db, a.id, 'ana', {});
  const mine = itemsFor(env.db, 'r1', 'ana');
  assert.equal(mine.find((i: any) => i.id === a.id).completion !== null, true);
  assert.equal(mine.find((i: any) => i.kind === 'study').completion, null);
  env.cleanup();
});
