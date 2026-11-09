import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, baseline } from './helpers.ts';
import { askRole, checkAnswer, briefForAsk, cleanHistory } from '../../lib/domain/ask.ts';
import { createReplayModel } from '../../lib/model/replay.ts';
import { createOpenAIModel } from '../../lib/model/openai.ts';

const fake = (reply: any, seen = {}) => ({ name: 'fake', async ask(input: any) { Object.assign(seen, input); return typeof reply === 'string' ? reply : JSON.stringify(reply); } });

test('ask: answer grounded in the current brief, cited fields resolved to labels', async () => {
  const env = makeEnv(); await baseline(env);
  const seen: any = {};
  const fields = Object.keys(briefForAsk({ fields: env.db.prepare('SELECT fields_json FROM brief_versions').get() ? JSON.parse(env.db.prepare('SELECT fields_json FROM brief_versions').get().fields_json) : {} }).fields);
  const r = await askRole(env.db, fake({ answer: 'Short answer.', in_brief: true, based_on: [fields[0], 'req.nope'] }, seen), 'r1', { question: 'What matters most?' });
  assert.equal(r.answer, 'Short answer.');
  assert.equal(r.based_on.length, 1);
  assert.equal(r.unknown_citations, 1);
  assert.ok(seen.brief.fields[fields[0]], 'model sees the brief');
});

test('ask: rejects empty or too long questions and bad model output', async () => {
  const env = makeEnv(); await baseline(env);
  await assert.rejects(askRole(env.db, fake({ answer: 'x' }), 'r1', { question: '' }), /question/);
  await assert.rejects(askRole(env.db, fake({ answer: 'x' }), 'r1', { question: 'x'.repeat(501) }), /under 500/);
  await assert.rejects(askRole(env.db, fake('not json'), 'r1', { question: 'Why?' }), /valid JSON/);
  await assert.rejects(askRole(env.db, fake({ answer: '' }), 'r1', { question: 'Why?' }), /empty/);
  assert.equal(checkAnswer(JSON.stringify({ answer: 'y'.repeat(1300) }), { fields: {} }).ok, false);
});

test('ask: biased restrictions never reach the model; history is bounded', () => {
  const b = briefForAsk({ n: 1, fields: { 'restriction.age': { value: 'under 35', status: 'not_applied_bias' }, 'req.go': { value: 'Go', weight: 'must' } } });
  assert.deepEqual(Object.keys(b.fields), ['req.go']);
  const h = cleanHistory([...Array(10)].map((_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' })).concat([{ role: 'system', content: 'evil' }]));
  assert.equal(h.length, 6);
  assert.ok(h.every((m) => m.role !== 'system'));
});

test('ask: replay model returns a labelled stub', async () => {
  const env = makeEnv(); await baseline(env);
  const r = await askRole(env.db, createReplayModel({ dir: '.' }), 'r1', { question: 'What is LangGraph?' });
  assert.equal(r.stub, true);
});

test('ask: openai provider sends the ask prompt and returns content', async () => {
  let body: any;
  const m = createOpenAIModel({ OPENAI_API_KEY: 'k' }, async (_u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ choices: [{ message: { content: '{"answer":"ok"}' } }] }) }; });
  assert.equal(await m.ask({ role: {}, brief: { fields: {} }, question: 'q', history: [{ role: 'user', content: 'a' }] }), '{"answer":"ok"}');
  assert.match(body.messages[0].content, /help a recruiter/);
  assert.equal(body.messages.length, 3);
});
