// I6 (unexpected error -> generic 500), T-L (live path emits llm spans) and O8 (one cli trace with one span per source).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dispatch } from '../../lib/api/routes.ts';
import { toErrorResponse } from '../../lib/obs/route.ts';
import { AppError } from '../../lib/contracts/errors.ts';
import { openDb, closeDb, resetDbFiles } from '../../lib/db/connection.ts';
import { rebuild } from '../../lib/domain/seed.ts';
import { getModel } from '../../lib/model/index.ts';
import { createOpenAIModel } from '../../lib/model/openai.ts';
import { ROOT } from '../../lib/paths.ts';
import { configureTracing, getTrace, renderTrace, withTrace } from '../../lib/obs/tracer.ts';
import { setLogSink } from '../../lib/obs/logger.ts';

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rt-')), 'x.db');
const get = (p: string) => new Request(`http://localhost${p}`);

test('I6: an unexpected exception gives a generic 500 with a trace id; the stack goes to the log only', async () => {
  const file = tmpDb();
  const db = await rebuild({ model: getModel({}), file });
  process.env.HARNESS_DB = file;
  configureTracing({ getDb: () => openDb(file) });
  const lines: string[] = [];
  const restore = setLogSink((l) => lines.push(l));
  try {
    db.exec('DROP TABLE roles'); // a real fault: the next query throws "no such table"
    const res = await dispatch(get('/api/roles/nw-be'));
    assert.equal(res.status, 500);
    const body: any = await res.json();
    assert.equal(body.error.code, 'internal');
    assert.match(body.error.message, /Something went wrong/);
    assert.doesNotMatch(JSON.stringify(body), /no such table|roles|at .*\.ts/);
    assert.equal(res.headers.get('x-trace-id'), body.error.traceId);
    const logged = lines.map((l) => JSON.parse(l)).find((r) => r.msg === 'unexpected error');
    assert.ok(logged, 'the error was logged');
    assert.equal(logged.traceId, body.error.traceId);
    assert.match(JSON.stringify(logged), /no such table/);
    const trace = getTrace(openDb(file), body.error.traceId)!;
    assert.equal(trace.trace.status, 'error');
  } finally { restore(); closeDb(file); delete process.env.HARNESS_DB; }
});

test('error mapping: AppError keeps its status; a thrown code maps; an unknown error is hidden', async () => {
  assert.equal(toErrorResponse(new AppError('conflict', 'x'), 't1').status, 409);
  assert.equal(toErrorResponse(Object.assign(new Error('nope'), { code: 'not_found' }), 't2').status, 404);
  const r = toErrorResponse(new TypeError('secret internals'), 't3');
  assert.equal(r.status, 500);
  assert.doesNotMatch(JSON.stringify(await r.json()), /secret internals/);
  assert.equal(toErrorResponse(new Error('database is locked'), 't4').status, 503);
});

test('T-L + O8: the live path over all 13 sources emits one cli trace, 13 source spans, an llm span per source with check results, and stage rows linked to the trace', async () => {
  const fake = async (_u: any, o: any) => {
    const input = JSON.parse(JSON.parse(o.body).messages.at(-1).content);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: fs.readFileSync(path.join(ROOT, 'data', 'replay', `${input.source.id}.json`), 'utf8') } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }) };
  };
  const file = tmpDb();
  configureTracing({ getDb: () => openDb(file) });
  resetDbFiles(file); // like the CLI: recreate the database first, so the trace root lives in the new file
  let traceId = '';
  let db: any;
  await withTrace({ kind: 'cli', name: 'cli.rebuild', attrs: { command: 'rebuild' } }, async (id) => {
    traceId = id;
    db = await rebuild({ model: createOpenAIModel({ OPENAI_API_KEY: 'sk-test-0123456789abcdef' }, fake), file, reset: false });
  });
  const t = getTrace(db, traceId);
  assert.ok(t, 'trace stored in the rebuilt database');
  assert.equal(t.trace.name, 'cli.rebuild');
  assert.equal(t.trace.kind, 'cli');
  const sources = t.spans.filter((s: any) => s.kind === 'source');
  assert.equal(sources.length, 13);
  const llmSpans = t.spans.filter((s: any) => s.kind === 'llm');
  assert.equal(llmSpans.length, 13);
  assert.ok(llmSpans.every((s: any) => JSON.parse(s.attributes_json).check === 'pass'));
  assert.equal(t.llm.length, 13);
  assert.ok(t.llm.every((l: any) => l.prompt_id === 'extract+study+review+contract' && /^[0-9a-f]{12}$/.test(l.prompt_sha) && l.prompt_tokens === 100));
  assert.equal(new Set(t.llm.map((l: any) => l.prompt_sha)).size, 1, 'one prompt version across the run');
  const stageRows = db.prepare('SELECT DISTINCT trace_id FROM stage_runs').all().map((r: any) => r.trace_id);
  assert.deepEqual(stageRows, [traceId]);
  assert.ok(t.spans.filter((s: any) => s.kind === 'stage').length >= 13 * 6 - 10);
  assert.match(renderTrace(db, traceId), /cli cli\.rebuild[\s\S]*source nw-01[\s\S]*llm extract/);
  db.close(); closeDb(file);
});
