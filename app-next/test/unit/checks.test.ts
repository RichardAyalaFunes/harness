import test from 'node:test';
import assert from 'node:assert/strict';
import { locateQuote, truncateForModel, checkBias, checkExtraction, isAllowedField, MAX_CONTEXT_CHARS, TRUNCATION_MARKER } from '../../lib/domain/checks.ts';
import { parseSource, sha256 } from '../../lib/domain/sources.ts';
import { validateExtraction } from '../../lib/contracts/extraction.ts';
import { out, change } from './helpers.ts';

const BODY = 'Alpha beta.\nGamma delta.\nGamma delta.\n';

test('quote with correct offsets is accepted unchanged', () => {
  const r = locateQuote(BODY, 'Alpha beta.', 0, 11);
  assert.deepEqual([r.ok, r.start, r.end, r.recomputed], [true, 0, 11, false]);
});

test('quote with wrong offsets is recomputed when it occurs exactly once', () => {
  const r = locateQuote(BODY, 'Alpha beta.', 5, 9);
  assert.equal(r.ok, true);
  assert.equal(r.recomputed, true);
  assert.equal(BODY.slice(r.start, r.end), 'Alpha beta.');
});

test('quote that occurs more than once without valid offsets fails as ambiguous', () => {
  const r = locateQuote(BODY, 'Gamma delta.');
  assert.equal(r.ok, false);
  assert.match(r.error, /ambiguous/);
  assert.equal(locateQuote(BODY, 'Gamma delta.', 12, 24).ok, true, 'explicit offsets disambiguate');
});

test('quote that is not in the source fails', () => {
  const r = locateQuote(BODY, 'Epsilon.');
  assert.equal(r.ok, false);
  assert.match(r.error, /not found/);
});

test('CRLF source and CRLF quote normalise to the same body and hash', () => {
  const lf = '---\nid: x\n---\nLine one.\nLine two.\n';
  const crlf = lf.replace(/\n/g, '\r\n');
  const a = parseSource(lf);
  const b = parseSource(crlf);
  assert.equal(b.body, a.body);
  assert.equal(sha256(b.body), sha256(a.body));
  assert.equal(locateQuote(b.body, 'Line one.\r\nLine two.').ok, true);
});

test('truncation: marker added, budget respected, quote past the cut fails the extraction check', () => {
  const body = `${'x'.repeat(12500)} TAILQUOTE here.`;
  const t = truncateForModel(body);
  assert.equal(t.truncated, true);
  assert.ok(t.text.endsWith(TRUNCATION_MARKER));
  assert.equal(t.seen.length, MAX_CONTEXT_CHARS);
  const o = out('s1', [change('offer.budget', 'set', '1', 'TAILQUOTE here.')]);
  const r = checkExtraction(o, { source: { source_id: 's1', channel: 'email' }, seen: t.seen });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /not found/);
});

test('field whitelist', () => {
  for (const f of ['company.direction', 'req.go', 'req.system-design', 'restriction.no-carrio', 'expect.18m', 'offer.equity']) assert.ok(isAllowedField(f), f);
  for (const f of ['salary', 'req.', 'req.Go', 'offer.bonus', 'expect.24m', 'company.name', 'x.y']) assert.ok(!isAllowedField(f), f);
});

test('schema rejects unknown keys and wrong types', () => {
  assert.match(validateExtraction({ source_id: 'a', summary: '', no_change: true, changes: [], study: [], extra: 1 }).join(), /unknown top-level key/);
  const c = { field: 'req.go', op: 'add', value: 'Go', severity: 'material', quote: 'Go', weight: 'must', colour: 'red' };
  assert.match(validateExtraction(out('a', [c])).join(), /unknown key "colour"/);
  assert.match(validateExtraction('nope').join(), /not a JSON object/);
});

const r = (over: any) => ({ field: 'restriction.x', op: 'add', value: 'v', severity: 'material', quote: 'q', status: 'applied', bias: null, ...over });

test('bias rule: protected restriction must be not_applied_bias and critical', () => {
  assert.ok(checkBias([r({ status: 'applied', bias: { kind: 'protected' }, severity: 'critical' })]).length);
  assert.ok(checkBias([r({ status: 'not_applied_bias', bias: { kind: 'protected' }, severity: 'material' })]).some((e) => /critical/.test(e)));
  assert.deepEqual(checkBias([r({ status: 'not_applied_bias', bias: { kind: 'protected' }, severity: 'critical' })]), []);
});

test('bias rule: unflagged age wording is caught as a safety net', () => {
  const errs = checkBias([r({ value: 'Prefers candidates under 35', quote: 'someone under 35' })]);
  assert.ok(errs.some((e) => /protected characteristic/.test(e)));
});

test('bias rule: lawful partner no-poach restriction is not flagged', () => {
  assert.deepEqual(checkBias([r({ field: 'restriction.no-carrio', value: 'Do not approach current Carrio staff (integration partner)', quote: 'do not approach anyone currently at Carrio' })]), []);
});
