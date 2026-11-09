// Regression test for pass 4 of the pre-merge review: attribute updates read at most 64 incoming values, and keep what they had.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../lib/db/connection.ts';
import { configureTracing, getTrace, setTraceAttrs, withSpan, withTrace } from '../../lib/obs/tracer.ts';

test('P4-1. span.set() and setTraceAttrs() read at most 64 incoming values and keep existing attributes when an update fails', async () => {
  const db = openDb(':memory:');
  configureTracing({ getDb: () => db });
  let reads = 0;
  const wide: Record<string, unknown> = {};
  for (let i = 0; i < 5000; i++) Object.defineProperty(wide, `k${i}`, { enumerable: true, get() { reads += 1; return i; } });
  const bad: any = { get status(): string { throw new Error('getter'); } };
  const id = await withTrace({ kind: 'http', name: 'x', attrs: { method: 'GET' } }, async (tid) => {
    setTraceAttrs(wide as any);
    assert.ok(reads <= 64, `setTraceAttrs read ${reads}`);
    reads = 0;
    setTraceAttrs(bad); // fails inside the guard: existing attributes stay
    setTraceAttrs({ status: 200 });
    await withSpan('stage', 's', { stage: 2, name: 'Extract' }, async (span) => {
      span.set(wide as any);
      assert.ok(reads <= 64, `span.set read ${reads}`);
      span.set(bad);
      span.set({ status: 'passed' });
    });
    return tid;
  });
  const t = getTrace(db, id)!;
  assert.deepEqual(JSON.parse(t.trace.attributes_json), { method: 'GET', status: 200 });
  assert.deepEqual(JSON.parse(t.spans[0].attributes_json), { stage: 2, name: 'Extract', status: 'passed' });
});
