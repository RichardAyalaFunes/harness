// One bounded repair attempt for live models: first answer rejected by the checks -> the errors are sent back once ->
// the corrected answer goes through the same checks. Found necessary by the first live run (small models break
// small rules: quotes, weights, severities). The checks themselves are not relaxed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, baseline, change, out } from './helpers.ts';
import { runSource } from '../../lib/domain/pipeline.ts';

const BODY = 'Update from client.\nThe budget is now 90k.\n';
const good = out('r-01', [change('offer.budget', 'set', '90k', 'The budget is now 90k.')]);
const badQuote = out('r-01', [change('offer.budget', 'set', '90k', 'The budget has risen to 90k.')]);

// A fake live model: returns the queued answers in order and records what it was sent.
function fakeModel(answers: any, { repairs = true }: any = {}) {
  const calls: any[] = [];
  return { name: 'fake-live', repairs, calls, async extract(input: any) { calls.push(input); return JSON.stringify(answers[Math.min(calls.length - 1, answers.length - 1)]); } };
}
const record = (env: any, rowId: any) => JSON.parse(env.db.prepare('SELECT check_result FROM stage_runs WHERE source_row_id = ? AND stage = 2').get(rowId).check_result);

async function scenario(model: any) {
  const env = makeEnv();
  await baseline(env);
  const r = env.add('r-01', { date: '2026-10-05' }, BODY);
  const res = await runSource(env.db, r.row_id, { model });
  return { env, row_id: r.row_id, res };
}

test('a rejected first answer is repaired once, passes the same checks, and the first errors are recorded', async () => {
  const model = fakeModel([badQuote, good]);
  const { env, row_id } = await scenario(model);
  try {
    assert.equal(model.calls.length, 2);
    assert.equal(model.calls[0].repair, undefined);
    assert.match(model.calls[1].repair.errors.join(' '), /quote not found verbatim/);
    assert.equal(env.stages(row_id)[2], 'passed');
    const rec = record(env, row_id);
    assert.equal(rec.repair.attempts, 2);
    assert.match(rec.repair.first_errors[0], /quote not found verbatim/);
  } finally { env.cleanup(); }
});

test('a second bad answer fails stage 2 with the second answer\'s errors; never a third call', async () => {
  const model = fakeModel([badQuote, badQuote]);
  const { env, row_id } = await scenario(model);
  try {
    assert.equal(model.calls.length, 2);
    assert.equal(env.stages(row_id)[2], 'failed');
    const rec = record(env, row_id);
    assert.match(rec.errors[0], /quote not found verbatim/);
    assert.equal(rec.repair.attempts, 2);
    assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM analyses WHERE source_row_id = ?').get(row_id).n, 0);
  } finally { env.cleanup(); }
});

test('an answer that passes the checks is not repaired (one call)', async () => {
  const model = fakeModel([good]);
  const { env, row_id } = await scenario(model);
  try {
    assert.equal(model.calls.length, 1);
    assert.equal(record(env, row_id).repair, undefined);
  } finally { env.cleanup(); }
});

test('a model without repair support (replay) gets exactly one call and keeps its failure', async () => {
  const model = fakeModel([badQuote], { repairs: false });
  const { env, row_id } = await scenario(model);
  try {
    assert.equal(model.calls.length, 1);
    assert.equal(env.stages(row_id)[2], 'failed');
  } finally { env.cleanup(); }
});
