// Deterministic acceptance checks. Nothing here trusts the model: every rule is re-checked in code.
import { normalise } from './sources.ts';

export const MAX_CONTEXT_CHARS = 12000;
export const TRUNCATION_MARKER = '[TRUNCATED]';
export const SEVERITIES = ['none', 'minor', 'material', 'critical'];
export const rank = (s: any) => SEVERITIES.indexOf(s);

const FIELD_RE = /^(company\.(direction|team)|req\.[a-z0-9]+(-[a-z0-9]+)*|restriction\.[a-z0-9]+(-[a-z0-9]+)*|expect\.(6m|12m|18m)|offer\.(level|budget|start|location|equity))$/;
// Real calendar date (round trip), so 2026-02-30 and 2026-99-99 fail.
export function isCalendarDate(s: any) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const isAllowedField = (f: any) => typeof f === 'string' && FIELD_RE.test(f);

// Safety net for restrictions the model did not flag. Not exhaustive; a human still reviews every proposal.
const PROTECTED_HINT = /\b(under|over|below|above|younger|older)\s+\d{2}\b|\byoung\b|\bgender\b|\b(wom[ae]n|m[ae]n|male|female)\b|\bmarried\b|pregnan|religio|nationalit|\brace\b|ethnic|disabilit|native speaker/i;

// What the model sees (budgeted) and what quotes are checked against (the visible part only).
export function truncateForModel(body: any, max = MAX_CONTEXT_CHARS) {
  if (body.length <= max) return { text: body, seen: body, truncated: false };
  const seen = body.slice(0, max);
  return { text: `${seen}\n${TRUNCATION_MARKER}`, seen, truncated: true };
}

// Verify a quote against a body. Offsets are used when right; recomputed when the quote occurs exactly once.
export function locateQuote(body: any, rawQuote: any, start?: any, end?: any) {
  const quote = normalise(rawQuote);
  if (Number.isInteger(start) && Number.isInteger(end) && body.slice(start, end) === quote) {
    return { ok: true, start, end, recomputed: false };
  }
  let count = 0;
  let at = -1;
  for (let i = body.indexOf(quote); i !== -1; i = body.indexOf(quote, i + 1)) { count += 1; at = i; if (count > 1) break; }
  if (count === 0) return { ok: false, error: 'quote not found verbatim in the source' };
  if (count > 1) return { ok: false, error: 'quote is ambiguous (occurs more than once; give start/end offsets)' };
  return { ok: true, start: at, end: at + quote.length, recomputed: true };
}

// Lowest severity a change may carry given the rules in the plan revision (item 5).
export function minSeverity(c: any, currentFields = {}) {
  if (c.field.startsWith('restriction.')) return c.bias?.kind === 'protected' ? 'critical' : 'material';
  if (/^offer\.(level|budget|start|location)$/.test(c.field)) return 'material';
  if (c.field.startsWith('req.')) {
    const old = (currentFields as any)[c.field];
    const wasMust = old?.weight === 'must';
    const nowMust = c.op !== 'remove' && (c.weight ?? old?.weight) === 'must';
    return wasMust || nowMust ? 'material' : 'none';
  }
  return 'none';
}

export function checkExtraction(out: any, { source, seen, current = {}, knownSources = new Set() }: any) {
  const errors: any[] = [];
  const changes: any[] = [];
  let recomputed = 0;
  let verified = 0;
  if (out.source_id !== source.source_id) errors.push(`source_id "${out.source_id}" does not match "${source.source_id}"`);
  if (out.no_change && out.changes.length) errors.push('no_change is true but changes are listed');
  if (!out.no_change && out.changes.length === 0) errors.push('no_change is false but no changes are listed');
  const isDecision = source.channel === 'client-decision';
  if (isDecision) {
    if (!out.decision) errors.push('client-decision source needs a decision');
    else {
      if (source.candidate && out.decision.candidate !== source.candidate) errors.push(`decision candidate "${out.decision.candidate}" differs from source candidate "${source.candidate}"`);
      if (source.decision && out.decision.outcome !== source.decision) errors.push(`decision outcome "${out.decision.outcome}" differs from source decision "${source.decision}"`);
    }
    if (!out.review) errors.push('client-decision source needs a review');
  } else if (out.decision || out.review) errors.push('decision/review given for a source that is not a client decision');

  const seenFields = new Set();
  out.changes.forEach((c: any, i: any) => {
    const p = `changes[${i}] (${c.field})`;
    if (!isAllowedField(c.field)) return errors.push(`${p}: field is not in the whitelist`);
    if (!SEVERITIES.includes(c.severity)) errors.push(`${p}: severity "${c.severity}" is not one of ${SEVERITIES.join('|')}`);
    if (seenFields.has(c.field)) errors.push(`${p}: field appears twice in one source`);
    seenFields.add(c.field);
    if (c.weight !== undefined && !c.field.startsWith('req.')) errors.push(`${p}: weight only applies to req.* fields`);
    if (c.op === 'add' && c.field.startsWith('req.') && c.weight === undefined) errors.push(`${p}: a new requirement needs a weight`);
    if ((c.status !== undefined || c.bias !== undefined) && !c.field.startsWith('restriction.')) errors.push(`${p}: status/bias only apply to restriction.* fields`);
    if (c.conflicts_with !== undefined && !knownSources.has(c.conflicts_with)) errors.push(`${p}: conflicts_with "${c.conflicts_with}" is not a known source`);
    const loc = locateQuote(seen, c.quote, c.start, c.end);
    if (!loc.ok) errors.push(`${p}: ${loc.error}`);
    else { verified += 1; if (loc.recomputed) recomputed += 1; }
    if (SEVERITIES.includes(c.severity) && rank(c.severity) < rank(minSeverity(c, current))) {
      errors.push(`${p}: severity "${c.severity}" is below the minimum "${minSeverity(c, current)}" for this kind of change`);
    }
    changes.push({
      field: c.field, op: c.op, value: c.value ?? null, severity: c.severity, quote: normalise(c.quote),
      start: loc.start ?? null, end: loc.end ?? null, weight: c.weight ?? null, status: c.status ?? null,
      bias: c.bias ?? null, confirmed: c.confirmed ?? null, conflicts_with: c.conflicts_with ?? null,
    });
  });
  return { ok: errors.length === 0, errors, changes, stats: { quotes_verified: verified, offsets_recomputed: recomputed } };
}

// Stage 4: bias rule. Biased restrictions are never applied; protected ones are critical.
export function checkBias(changes: any) {
  const errors: any[] = [];
  for (const c of changes.filter((x: any) => x.field.startsWith('restriction.'))) {
    if (c.bias) {
      if (c.status === 'applied') errors.push(`${c.field}: flagged as bias (${c.bias.kind}) but status is "applied"`);
      if (c.status !== 'not_applied_bias') errors.push(`${c.field}: biased restriction must have status not_applied_bias`);
      if (c.bias.kind === 'protected' && c.severity !== 'critical') errors.push(`${c.field}: protected characteristic must be severity critical`);
    } else if (c.op !== 'remove' && PROTECTED_HINT.test(`${c.value} ${c.quote}`)) {
      errors.push(`${c.field}: wording looks like a protected characteristic but no bias flag was given`);
    }
  }
  return errors;
}

export function mustHaves(fields: any) {
  return Object.entries<any>(fields || {}).filter(([k, v]) => k.startsWith('req.') && v.weight === 'must').map(([k, v]) => ({ criterion: k, value: v.value }));
}

// Stage 6: review quotes come from the matched screening transcript, coverage is against the historical brief.
export function checkReview(review: any, { decision, screening, snapshot, laterCriteria }: any) {
  const errors: any[] = [];
  if (review.candidate !== decision.candidate) errors.push(`review candidate "${review.candidate}" differs from decision candidate "${decision.candidate}"`);
  if (!screening) {
    if (review.screening) errors.push(`review cites screening "${review.screening}" but the harness found no matching transcript`);
    return errors;
  }
  if (review.screening !== screening.source_id) errors.push(`review cites screening "${review.screening}" but the harness matched "${screening.source_id}"`);
  const quoteErr = (label: any, q: any) => { const l = locateQuote(screening.body, q); return l.ok ? null : `${label}: ${l.error}`; };
  const snap = new Set(snapshot.map((s: any) => s.criterion));
  const listed = new Set();
  for (const c of review.coverage) {
    listed.add(c.criterion);
    if ((c.status === 'asked' || c.status === 'briefly') && !c.quote) errors.push(`coverage ${c.criterion}: ${c.status} needs a transcript quote`);
    if (c.quote) { const m = quoteErr(`coverage ${c.criterion}`, c.quote); if (m) errors.push(m); }
    if (snap.has(c.criterion) && c.status === 'not_applicable_historical') errors.push(`coverage ${c.criterion}: was a must-have at screening time, cannot be not_applicable_historical`);
    if (!snap.has(c.criterion)) {
      if (!laterCriteria.has(c.criterion)) errors.push(`coverage ${c.criterion}: not a must-have at screening time and not a later criterion`);
      else if (c.status !== 'not_applicable_historical') errors.push(`coverage ${c.criterion}: added after the screening, must be not_applicable_historical`);
    }
  }
  for (const s of snap) if (!listed.has(s)) errors.push(`coverage is missing must-have ${s} of the brief at screening time`);
  for (const o of review.overweighted) {
    const m = quoteErr(`overweighted "${o.topic}"`, o.quote);
    if (m) errors.push(m);
    if (o.count > o.total || o.count < 1) errors.push(`overweighted "${o.topic}": count ${o.count} of ${o.total} is not valid`);
  }
  return errors;
}
