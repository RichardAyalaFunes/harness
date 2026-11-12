import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, baseline, change, out, studyEntry } from './helpers.ts';
import { approveProposal } from '../../lib/domain/approvals.ts';
import { completeItem, publishedItems } from '../../lib/domain/learning.ts';
import { checkFeedback, studyFeedback } from '../../lib/domain/feedback.ts';
import { getAssistModel } from '../../lib/model/index.ts';

async function withStudy() {
  const env = makeEnv(); await baseline(env);
  const f = await env.feed('k1', { date: '2026-10-05' }, 'Incident ownership is key.\n', out('k1', [
    change('req.incident', 'add', 'Owns incidents', 'Incident ownership is key.', 'material', { weight: 'must' }),
  ], { study: [studyEntry('req.incident')] }));
  approveProposal(env.db, f.proposal.id, 'lead');
  const item = publishedItems(env.db, 'r1').find((i: any) => i.kind === 'study');
  const who = env.db.prepare("SELECT recruiter_id AS id FROM role_recruiters WHERE role_id = 'r1'").get().id;
  return { env, item, who };
}

test('feedback: output checks', () => {
  assert.equal(checkFeedback('nope', 2).ok, false);
  assert.equal(checkFeedback(JSON.stringify({ covered: [true], comment: 'x' }), 2).ok, false);
  assert.equal(checkFeedback(JSON.stringify({ covered: [true, false], comment: '' }), 2).ok, false);
  const ok = checkFeedback(JSON.stringify({ covered: [true, false], comment: 'Good start.', try_asking: 'What did you do?' }), 2);
  assert.deepEqual(ok.covered, [true, false]);
});

test('feedback: stored with the completion; gets brief, change, points and answer; failure never undoes completion', async () => {
  const { env, item, who } = await withStudy();
  assert.equal(completeItem(env.db, item.id, who, { response: 'I would ask them to walk me through an outage they led.' }).passed, true);
  let seen: any;
  const n = item.detail.points.length;
  const ai = await studyFeedback(env.db, { name: 'fake', async feedback(i: any) { seen = i; return JSON.stringify({ covered: Array(n).fill(true), comment: 'Clear and practical.', try_asking: '' }); } }, item.id, who);
  assert.equal(ai.comment, 'Clear and practical.');
  assert.ok(seen.brief.fields['req.incident'] && seen.change.question && seen.points.length === n && /outage/.test(seen.answer));
  const bad = await studyFeedback(env.db, { name: 'fake', async feedback() { throw new Error('OpenAI API error 500'); } }, item.id, who);
  assert.match(bad.error, /500/);
  const row = env.db.prepare('SELECT result_json FROM completions WHERE item_id = ?').get(item.id);
  assert.ok(JSON.parse(row.result_json).passed, 'completion stays recorded');
});

test('assist model: live when a key is set, pipeline model unaffected; can be turned off', () => {
  assert.equal(getAssistModel({ OPENAI_API_KEY: 'k' }).name, 'openai');
  assert.equal(getAssistModel({}).name, 'replay');
  assert.equal(getAssistModel({ OPENAI_API_KEY: 'k', HARNESS_ASSIST: 'replay' }).name, 'replay');
});
