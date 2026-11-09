// Prompt lint: the live prompts must not teach the model a wrong output shape. Found by the first live run
// (OpenAI copied "weight?" and "decision?" literally from an earlier contract line), which no replay-based test could catch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../../lib/model/openai.ts';
import { checkExtraction } from '../../lib/domain/checks.ts';

const prompt = systemPrompt();
const examples = [...prompt.matchAll(/^Example \d+:.*\n(\{.*\})$/gm)].map((m) => JSON.parse(m[1]));

test('the extraction prompt never shows a key with a question mark or an enum written with pipes in an example', () => {
  assert.doesNotMatch(prompt, /"[a-z_]+\?"/, 'quoted key with ?');
  for (const ex of examples) assert.doesNotMatch(JSON.stringify(ex), /"[a-z_]+\?"\s*:|\|/);
});

test('the worked examples are valid extractions (shape, whitelist, severities, verbatim quotes)', () => {
  assert.equal(examples.length, 2);
  const body = 'Quick update: we need someone who runs our workloads on Kubernetes. Also, the March start is no longer fixed.';
  const r = checkExtraction(examples[0], { source: { source_id: 'ex-01', channel: 'email' }, seen: body });
  assert.deepEqual(r.errors, []);
  const r2 = checkExtraction(examples[1], { source: { source_id: 'ex-02', channel: 'email' }, seen: 'Can we move the call to 3pm?' });
  assert.deepEqual(r2.errors, []);
  for (const ex of examples) for (const s of ex.study) assert.equal(s.keys.length, s.points.length);
});

test('the prompt states the decision/review rule and that optional keys are omitted', () => {
  assert.match(prompt, /ONLY when source.channel is "client-decision", and then both are required/);
  assert.match(prompt, /left out completely/);
});
