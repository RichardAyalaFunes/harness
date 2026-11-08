// The workflow (rule 13): ordered stages per source. Each stage has an artifact and an acceptance check;
// a stage is complete only when its check passed and the result is stored in stage_runs.
//
// Stage                 Artifact                          Skip allowed (reason is stored)
// 1 Register source     sources row                       never
// 2 Extract changes     analyses row                      never
// 3 Decide version      changes rows (+ proposals)        never ("no new version" is a result, not a skip)
// 4 Bias screen         checked restriction changes       when no restriction changed
// 5 Learning steps      draft learning_items              when stage 3 created no proposal
// 6 Screening review    screening_reviews + review item   when the source is not a client decision
// 7 Publish             assignments                       when nothing to publish or all rejected (recorded on approval)
import { tx, now, json, unjson } from './db.js';
import { sha256 } from './sources.js';
import { MAX_CONTEXT_CHARS, truncateForModel, checkExtraction, checkBias, checkReview, mustHaves, rank } from './checks.js';
import { validateExtraction } from './schema.js';
import { compactBrief, currentVersion, versionAt } from './brief.js';
import { draftItems, saveDraftItems, teamOf } from './learning.js';

export const STAGE_NAMES = { 1: 'Register source', 2: 'Extract changes', 3: 'Decide version', 4: 'Bias screen', 5: 'Learning steps', 6: 'Screening review', 7: 'Publish to recruiters' };
const DONE = new Set(['passed', 'skipped']);
const pass = (check) => ({ status: 'passed', check });
const fail = (check) => ({ status: 'failed', check });
const skip = (reason, check = {}) => ({ status: 'skipped', check, reason });

export function recordStage(db, runId, row, n, res) {
  db.prepare(`INSERT INTO stage_runs(run_id, source_row_id, source_id, stage, name, status, check_result, skip_reason, created_at)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(source_row_id, stage) DO UPDATE SET run_id = excluded.run_id, status = excluded.status,
    check_result = excluded.check_result, skip_reason = excluded.skip_reason, created_at = excluded.created_at`)
    .run(runId, row.id, row.source_id, n, STAGE_NAMES[n], res.status, json(res.check), res.reason ?? null, now());
}

export const stageRows = (db, rowId) => db.prepare('SELECT * FROM stage_runs WHERE source_row_id = ? ORDER BY stage').all(rowId);
const targetRoles = (db, row) => (row.scope === 'company'
  ? db.prepare('SELECT id FROM roles WHERE client_id = ? ORDER BY id').all(row.client_id).map((r) => r.id)
  : [row.role_id]);

// ---- stage 1 -------------------------------------------------------------------------------------------------
function stage1({ db, row }) {
  const errors = [];
  if (!row.body.trim()) errors.push('source body is empty');
  if (sha256(row.body) !== row.hash) errors.push('stored hash does not match body');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date || '')) errors.push('date is missing or not YYYY-MM-DD');
  if (!row.channel) errors.push('channel is missing');
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(row.client_id);
  if (!client) errors.push(`unknown client "${row.client_id}"`);
  if (row.scope === 'role') {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(row.role_id);
    if (!role) errors.push(`unknown role "${row.role_ref}"`);
    else if (role.client_id !== row.client_id) errors.push(`role mismatch: ${role.id} belongs to ${role.client_id}, source says client ${row.client_id}`);
  }
  if (['client-decision', 'screening-transcript'].includes(row.channel)) {
    if (row.scope !== 'role') errors.push(`${row.channel} must name a role, not "company"`);
    if (!row.candidate) errors.push(`${row.channel} must name a candidate`);
  }
  if (row.channel === 'client-decision' && !['rejected', 'advanced'].includes(row.decision)) errors.push('client-decision needs decision: rejected|advanced');
  const dup = db.prepare("SELECT source_id FROM sources WHERE hash = ? AND id <> ? AND status <> 'superseded' AND source_id <> ?").get(row.hash, row.id, row.source_id);
  if (dup) errors.push(`duplicate content of ${dup.source_id}`);
  if (errors.length) return fail({ errors });
  return pass({ hash: row.hash.slice(0, 12), client: row.client_id, role: row.role_id ?? 'company', channel: row.channel, date: row.date });
}

// ---- stage 2 -------------------------------------------------------------------------------------------------
function stage2({ db, row, modelOut }) {
  if (modelOut.error) return fail({ errors: [`model call failed: ${modelOut.error}`] });
  let obj = modelOut.raw;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (e) { return fail({ errors: [`malformed JSON: ${e.message}`] }); }
  }
  const schemaErrors = validateExtraction(obj);
  if (schemaErrors.length) return fail({ errors: schemaErrors });
  const roles = targetRoles(db, row);
  const cur = row.scope === 'role' ? currentVersion(db, row.role_id) : null;
  const known = new Set(db.prepare("SELECT source_id FROM sources WHERE status <> 'superseded'").all().map((s) => s.source_id));
  const { seen, truncated } = truncateForModel(row.body);
  const chk = checkExtraction(obj, { source: row, seen, current: cur?.fields || {}, knownSources: known });
  if (!chk.ok) return fail({ errors: chk.errors });
  db.prepare('INSERT INTO analyses(source_row_id, model, raw, parsed, summary, no_change, truncated) VALUES (?,?,?,?,?,?,?)')
    .run(row.id, modelOut.model, typeof modelOut.raw === 'string' ? modelOut.raw : json(modelOut.raw), json({ ...obj, changes: chk.changes }), obj.summary, obj.no_change ? 1 : 0, truncated ? 1 : 0);
  return pass({ model: modelOut.model, summary: obj.summary, no_change: obj.no_change, changes: chk.changes.length, ...chk.stats, truncated, roles });
}

// ---- stage 3 -------------------------------------------------------------------------------------------------
const isNoop = (c, old) => (c.op === 'remove' ? !old
  : !!old && old.value === c.value && (c.weight == null || c.weight === old.weight) && (c.status == null || c.status === old.status));

function stage3({ db, row }) {
  const a = unjson(db.prepare('SELECT parsed FROM analyses WHERE source_row_id = ?').get(row.id).parsed);
  const results = [];
  const insC = db.prepare(`INSERT INTO changes(source_row_id, role_id, field, op, value, old_value, old_weight, severity, quote, start, "end", weight, status,
    bias_kind, bias_note, confirmed, conflicts_with, noop) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const roleId of targetRoles(db, row)) {
    const cur = currentVersion(db, roleId);
    if (row.scope === 'company' && !cur) { results.push({ role: roleId, decision: 'no new version', reason: 'role has no brief yet; company news is not a baseline' }); continue; }
    const ids = [];
    let noops = 0;
    for (const c of a.changes) {
      const old = cur?.fields[c.field];
      const noop = isNoop(c, old);
      noops += noop ? 1 : 0;
      const r = insC.run(row.id, roleId, c.field, c.op, c.value, old?.value ?? null, old?.weight ?? null, c.severity, c.quote, c.start, c.end, c.weight,
        c.status, c.bias?.kind ?? null, c.bias?.note ?? null, c.confirmed == null ? null : +c.confirmed, c.conflicts_with, +noop);
      if (!noop) ids.push({ id: Number(r.lastInsertRowid), severity: c.severity });
    }
    const top = ids.reduce((m, x) => (rank(x.severity) > rank(m) ? x.severity : m), 'none');
    if (!ids.length) results.push({ role: roleId, decision: 'no new version', reason: a.no_change ? 'no change' : 'every value repeats the current brief', noops });
    else if (rank(top) < rank('material')) results.push({ role: roleId, decision: 'no new version', reason: `highest severity is ${top}; changes recorded only`, noops });
    else {
      const p = db.prepare('INSERT INTO proposals(source_row_id, role_id, state, severity, kind, created_at) VALUES (?,?,?,?,?,?)')
        .run(row.id, roleId, 'proposed', top, row.channel === 'manual-correction' ? 'manual-correction' : 'source', now());
      for (const c of ids) db.prepare('UPDATE changes SET proposal_id = ? WHERE id = ?').run(Number(p.lastInsertRowid), c.id);
      results.push({ role: roleId, decision: 'proposal', proposal_id: Number(p.lastInsertRowid), severity: top, changes: ids.length, noops });
    }
  }
  // Self-check of the version rule: a proposal exists iff a material/critical effective change exists.
  const bad = results.filter((r) => (r.decision === 'proposal') !== (r.severity !== undefined && rank(r.severity) >= rank('material')));
  if (bad.length) return fail({ errors: ['version rule violated'], results });
  return pass({ results });
}

// ---- stage 4 -------------------------------------------------------------------------------------------------
function stage4({ db, row }) {
  const rows = db.prepare("SELECT * FROM changes WHERE source_row_id = ? AND field LIKE 'restriction.%' AND noop = 0 GROUP BY field").all(row.id);
  if (!rows.length) return skip('no restriction changed');
  const errors = checkBias(rows.map((r) => ({ field: r.field, op: r.op, value: r.value, quote: r.quote, status: r.status, severity: r.severity, bias: r.bias_kind ? { kind: r.bias_kind } : null })));
  if (errors.length) return fail({ errors });
  return pass({ restrictions: rows.map((r) => ({ field: r.field, status: r.status ?? 'pending', bias: r.bias_kind, severity: r.severity })) });
}

// ---- stage 5 -------------------------------------------------------------------------------------------------
function stage5({ db, row }) {
  const props = db.prepare("SELECT * FROM proposals WHERE source_row_id = ? AND state = 'proposed'").all(row.id);
  if (!props.length) return skip('stage 3 created no proposal');
  const study = unjson(db.prepare('SELECT parsed FROM analyses WHERE source_row_id = ?').get(row.id).parsed).study;
  const out = [];
  const errors = [];
  const drafts = [];
  for (const p of props) {
    const changes = db.prepare('SELECT * FROM changes WHERE proposal_id = ? AND noop = 0 ORDER BY id').all(p.id);
    const { items, missingStudy } = draftItems({ changes, study, baseline: !currentVersion(db, p.role_id), sourceId: row.source_id });
    for (const f of missingStudy) errors.push(`study item needed for ${f} but the model output has no study entry for it`);
    drafts.push({ p, items });
    out.push({ proposal_id: p.id, role: p.role_id, items: items.length, kinds: items.map((i) => i.kind) });
  }
  if (errors.length) return fail({ errors, proposals: out });
  for (const { p, items } of drafts) saveDraftItems(db, { roleId: p.role_id, proposalId: p.id, sourceId: row.source_id, items });
  return pass({ proposals: out, note: 'drafts are unpublished until the proposal is approved' });
}

// ---- stage 6 -------------------------------------------------------------------------------------------------
// Latest screening of this candidate for this role dated on or before the decision; ties by ingest order.
export function findScreening(db, roleId, candidate, date) {
  return db.prepare(`SELECT * FROM sources WHERE status <> 'superseded' AND channel = 'screening-transcript' AND role_id = ? AND candidate = ? AND date <= ?
    ORDER BY date DESC, ingest_order DESC LIMIT 1`).get(roleId, candidate, date) || null;
}

function stage6({ db, row }) {
  if (row.channel !== 'client-decision') return skip('not a client-decision source');
  const a = unjson(db.prepare('SELECT parsed FROM analyses WHERE source_row_id = ?').get(row.id).parsed);
  const screening = findScreening(db, row.role_id, a.decision.candidate, row.date);
  const ver = screening ? versionAt(db, row.role_id, screening.date) : null;
  const snapshot = ver ? mustHaves(ver.fields) : [];
  const snapIds = new Set(snapshot.map((s) => s.criterion));
  const later = new Set();
  const cur = currentVersion(db, row.role_id);
  for (const [k, f] of Object.entries(cur?.fields || {})) if (k.startsWith('req.') && ['must', 'proposed'].includes(f.weight) && !snapIds.has(k)) later.add(k);
  for (const c of a.changes) if (c.field.startsWith('req.') && c.op !== 'remove' && !snapIds.has(c.field)) later.add(c.field);
  const errors = checkReview(a.review, { decision: a.decision, screening, snapshot, laterCriteria: later });
  if (errors.length) return fail({ errors });
  const status = screening ? 'ok' : 'insufficient_evidence';
  const suggested = a.review.suggested.map((s) => ({ ...s, future_screenings: true }));
  const r = db.prepare(`INSERT INTO screening_reviews(source_row_id, role_id, candidate, screening_source_id, brief_version_at_screening, must_have_snapshot_json,
    coverage_json, overweighted_json, suggested_json, status, purpose, decision_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(row.id, row.role_id, a.decision.candidate, screening?.source_id ?? null, ver?.n ?? null, json(snapshot), json(screening ? a.review.coverage : []),
      json(screening ? a.review.overweighted : []), json(suggested), status, 'retrospective', json(a.decision));
  const reviewId = Number(r.lastInsertRowid);
  const note = screening ? null : `No screening transcript for ${a.decision.candidate} on this role dated on or before ${row.date}. Add screening notes so the call can be reviewed.`;
  saveDraftItems(db, { roleId: row.role_id, reviewId, sourceId: row.source_id, items: [{
    kind: 'review', field: null, title: `Review: ${a.decision.candidate} ${a.decision.outcome} by the client`,
    detail: { candidate: a.decision.candidate, outcome: a.decision.outcome, reason: a.decision.reason, status, screening_source_id: screening?.source_id ?? null, note, suggested, review_id: reviewId },
  }] });
  return pass({ review_id: reviewId, status, screening: screening?.source_id ?? null, brief_version_at_screening: ver?.n ?? null,
    must_haves_at_screening: snapshot.length, coverage: screening ? a.review.coverage.length : 0, historical: screening ? a.review.coverage.filter((c) => c.status === 'not_applicable_historical').length : 0 });
}

// ---- stage 7 (recorded when the last pending proposal/review of the source is decided) ----------------------
export function updateStage7(db, rowId) {
  const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(rowId);
  const props = db.prepare('SELECT * FROM proposals WHERE source_row_id = ?').all(rowId);
  const revs = db.prepare('SELECT * FROM screening_reviews WHERE source_row_id = ?').all(rowId);
  const open = [...props, ...revs].filter((x) => x.state === 'proposed');
  if (open.length) { db.prepare('DELETE FROM stage_runs WHERE source_row_id = ? AND stage = 7').run(rowId); return null; }
  const approved = [...props, ...revs].filter((x) => x.state === 'approved');
  const items = db.prepare(`SELECT * FROM learning_items WHERE published = 1 AND (proposal_id IN (SELECT id FROM proposals WHERE source_row_id = ?) OR review_id IN
    (SELECT id FROM screening_reviews WHERE source_row_id = ?))`).all(rowId, rowId);
  let res;
  if (!props.length && !revs.length) res = skip('no proposal or review to publish');
  else if (!approved.length) res = skip('every proposal and review was rejected or superseded');
  else if (!items.length) res = skip('approved, but no learning items were created (baseline version or no must-have/offer change)', { approved: approved.length });
  else {
    const missing = [];
    for (const it of items) for (const m of teamOf(db, it.role_id)) {
      if (!db.prepare('SELECT 1 FROM assignments WHERE item_id = ? AND recruiter_id = ?').get(it.id, m.id)) missing.push(`${m.id}:${it.id}`);
    }
    res = missing.length ? fail({ missing }) : pass({ items: items.length, recruiters: [...new Set(items.flatMap((i) => teamOf(db, i.role_id).map((m) => m.id)))] });
  }
  recordStage(db, `approval-${Date.now().toString(36)}`, row, 7, res);
  return res;
}

// ---- runner --------------------------------------------------------------------------------------------------
const STAGES = [[1, stage1], [2, stage2], [3, stage3], [4, stage4], [5, stage5], [6, stage6]];

export function resetSource(db, rowId) {
  const approved = db.prepare("SELECT 1 FROM proposals WHERE source_row_id = ? AND state = 'approved' UNION SELECT 1 FROM screening_reviews WHERE source_row_id = ? AND state = 'approved'").get(rowId, rowId);
  if (approved) throw new Error('cannot force a rerun: this source already has an approved proposal or review');
  tx(db, () => {
    db.prepare('DELETE FROM assignments WHERE item_id IN (SELECT id FROM learning_items WHERE proposal_id IN (SELECT id FROM proposals WHERE source_row_id = ?) OR review_id IN (SELECT id FROM screening_reviews WHERE source_row_id = ?))').run(rowId, rowId);
    db.prepare('DELETE FROM learning_items WHERE proposal_id IN (SELECT id FROM proposals WHERE source_row_id = ?) OR review_id IN (SELECT id FROM screening_reviews WHERE source_row_id = ?)').run(rowId, rowId);
    for (const t of ['screening_reviews', 'changes', 'proposals', 'analyses', 'stage_runs']) db.prepare(`DELETE FROM ${t} WHERE source_row_id = ?`).run(rowId);
  });
}

async function callModel(db, model, row) {
  const { text } = truncateForModel(row.body, MAX_CONTEXT_CHARS);
  const roles = targetRoles(db, row);
  const brief = row.scope === 'role' ? compactBrief(currentVersion(db, row.role_id)) : { roles: Object.fromEntries(roles.map((r) => [r, compactBrief(currentVersion(db, r))])) };
  const input = { source: { id: row.source_id, channel: row.channel, date: row.date, author: row.author, role: row.role_ref, candidate: row.candidate, decision: row.decision }, brief, body: text };
  try { return { raw: await model.extract(input), model: model.name, input_chars: JSON.stringify(input).length }; }
  catch (e) { return { error: e.message, model: model.name }; }
}

// Runs the stages that are not yet complete for this source row. Passed/skipped stages are never redone (idempotent per hash+stage).
export async function runSource(db, rowId, { model, force = false } = {}) {
  let row = db.prepare('SELECT * FROM sources WHERE id = ?').get(rowId);
  if (!row) throw new Error(`unknown source row ${rowId}`);
  if (row.status === 'superseded') throw new Error(`${row.source_id} row ${rowId} is superseded by a newer version of the file`);
  if (force) resetSource(db, rowId);
  const runId = `run-${Date.now().toString(36)}`;
  const done = () => Object.fromEntries(stageRows(db, rowId).map((s) => [s.stage, s.status]));
  let failedAt = null;
  for (const [n, fn] of STAGES) {
    if (DONE.has(done()[n])) continue;
    const ctx = { db, row };
    if (n === 2) ctx.modelOut = await callModel(db, model, row);
    let res;
    db.exec('BEGIN');
    try { res = fn(ctx); if (res.status === 'failed') { db.exec('ROLLBACK'); db.exec('BEGIN'); } }
    catch (e) { db.exec('ROLLBACK'); db.exec('BEGIN'); res = fail({ errors: [`stage crashed: ${e.message}`] }); }
    recordStage(db, runId, row, n, res);
    db.exec('COMMIT');
    if (res.status === 'failed') { failedAt = n; break; }
  }
  if (!failedAt) updateStage7(db, rowId);
  return { source_id: row.source_id, failedAt, stages: stageRows(db, rowId).map((s) => ({ stage: s.stage, status: s.status })) };
}

export async function runAll(db, { model, force = false, only = null } = {}) {
  const rows = db.prepare("SELECT id, source_id FROM sources WHERE status <> 'superseded' ORDER BY date, ingest_order").all();
  const out = [];
  for (const r of rows) if (!only || r.source_id === only) out.push(await runSource(db, r.id, { model, force }));
  return out;
}
