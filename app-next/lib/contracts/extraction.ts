// Hand-written validators for the model output contract (no dependencies).
// Structural checks only: types, required keys, unknown keys. Domain rules live in checks.js.

const TOP = new Set(['source_id', 'summary', 'no_change', 'changes', 'decision', 'study', 'review']);
const CHANGE = new Set(['field', 'op', 'value', 'severity', 'quote', 'weight', 'status', 'bias', 'confirmed', 'start', 'end', 'conflicts_with']);
const OPS = ['set', 'add', 'remove'];
const WEIGHTS = ['must', 'trainable', 'nice', 'proposed'];
const STATUSES = ['applied', 'not_applied_bias', 'pending'];
const COVERAGE = ['asked', 'briefly', 'not_asked', 'not_applicable_historical'];

const isObj = (x: any) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = (x: any) => typeof x === 'string' && x.length > 0;
const strArr = (x: any) => Array.isArray(x) && x.every((s) => typeof s === 'string');

export function validateExtraction(o: any) {
  const e: any[] = [];
  if (!isObj(o)) return ['output is not a JSON object'];
  for (const k of Object.keys(o)) if (!TOP.has(k)) e.push(`unknown top-level key "${k}"`);
  if (!isStr(o.source_id)) e.push('source_id must be a non-empty string');
  if (typeof o.summary !== 'string') e.push('summary must be a string');
  if (typeof o.no_change !== 'boolean') e.push('no_change must be a boolean');
  if (!Array.isArray(o.changes)) e.push('changes must be an array');
  else o.changes.forEach((c: any, i: any) => e.push(...validateChange(c, i)));
  if (!Array.isArray(o.study)) e.push('study must be an array');
  else o.study.forEach((s: any, i: any) => {
    const p = `study[${i}]`;
    if (!isObj(s)) return e.push(`${p} must be an object`);
    if (!isStr(s.field)) e.push(`${p}.field must be a string`);
    if (!isStr(s.prompt)) e.push(`${p}.prompt must be a string`);
    if (!strArr(s.points) || s.points.length === 0) e.push(`${p}.points must be a non-empty string array`);
    if (!Array.isArray(s.keys) || !s.keys.every(strArr)) e.push(`${p}.keys must be an array of string arrays`);
    else if (Array.isArray(s.points) && s.keys.length !== s.points.length) e.push(`${p}.keys must have one list per point`);
  });
  if (o.decision !== undefined) {
    const d = o.decision;
    if (!isObj(d) || !isStr(d.candidate) || !['rejected', 'advanced'].includes(d.outcome) || typeof d.reason !== 'string') {
      e.push('decision must be {candidate, outcome: rejected|advanced, reason}');
    }
  }
  if (o.review !== undefined) e.push(...validateReview(o.review));
  return e;
}

function validateChange(c: any, i: any) {
  const p = `changes[${i}]`;
  const e: any[] = [];
  if (!isObj(c)) return [`${p} must be an object`];
  for (const k of Object.keys(c)) if (!CHANGE.has(k)) e.push(`${p}: unknown key "${k}"`);
  if (!isStr(c.field)) e.push(`${p}.field must be a string`);
  if (!OPS.includes(c.op)) e.push(`${p}.op must be one of ${OPS.join('|')}`);
  if (c.op !== 'remove' && !isStr(c.value)) e.push(`${p}.value must be a non-empty string`);
  if (typeof c.severity !== 'string') e.push(`${p}.severity must be a string`);
  if (!isStr(c.quote)) e.push(`${p}.quote must be a non-empty string`);
  if (c.weight !== undefined && !WEIGHTS.includes(c.weight)) e.push(`${p}.weight must be one of ${WEIGHTS.join('|')}`);
  if (c.status !== undefined && !STATUSES.includes(c.status)) e.push(`${p}.status must be one of ${STATUSES.join('|')}`);
  if (c.bias !== undefined && !(isObj(c.bias) && ['protected', 'proxy'].includes(c.bias.kind) && typeof c.bias.note === 'string')) {
    e.push(`${p}.bias must be {kind: protected|proxy, note}`);
  }
  if (c.confirmed !== undefined && typeof c.confirmed !== 'boolean') e.push(`${p}.confirmed must be a boolean`);
  for (const k of ['start', 'end']) if (c[k] !== undefined && !Number.isInteger(c[k])) e.push(`${p}.${k} must be an integer`);
  if (c.conflicts_with !== undefined && !isStr(c.conflicts_with)) e.push(`${p}.conflicts_with must be a source id string`);
  return e;
}

function validateReview(r: any) {
  const e: any[] = [];
  if (!isObj(r)) return ['review must be an object'];
  if (!isStr(r.candidate)) e.push('review.candidate must be a string');
  if (r.screening !== null && !isStr(r.screening)) e.push('review.screening must be a source id or null');
  if (!Array.isArray(r.coverage)) e.push('review.coverage must be an array');
  else r.coverage.forEach((c: any, i: any) => {
    if (!isObj(c) || !isStr(c.criterion) || !COVERAGE.includes(c.status)) e.push(`review.coverage[${i}] must be {criterion, status: ${COVERAGE.join('|')}, quote?}`);
    else if (c.quote !== undefined && !isStr(c.quote)) e.push(`review.coverage[${i}].quote must be a string`);
  });
  if (!Array.isArray(r.overweighted)) e.push('review.overweighted must be an array');
  else r.overweighted.forEach((c: any, i: any) => {
    if (!isObj(c) || !isStr(c.topic) || !Number.isInteger(c.count) || !Number.isInteger(c.total) || !isStr(c.quote)) {
      e.push(`review.overweighted[${i}] must be {topic, count, total, quote}`);
    }
  });
  if (!Array.isArray(r.suggested)) e.push('review.suggested must be an array');
  else r.suggested.forEach((c: any, i: any) => {
    if (!isObj(c) || !isStr(c.text) || typeof c.why !== 'string') e.push(`review.suggested[${i}] must be {text, why}`);
  });
  return e;
}
