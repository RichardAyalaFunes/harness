// Human approval gates. Only approved proposals become brief versions; only approved versions/reviews publish learning items.
// Rejected items are kept for audit. "Edit" = reject + a new proposal from a manual-correction source.
import { tx, now, json, unjson } from './db.js';
import { mergeChanges, currentVersion } from './brief.js';
import { publishItems, draftItems, saveDraftItems } from './learning.js';
import { rank } from './checks.js';
import { registerSource } from './sources.js';
import { runSource, stageRows, updateStage7, isNoop } from './pipeline.js';

const need = (v, what) => { if (!v || !String(v).trim()) throw new Error(`${what} is required`); return String(v).trim(); };

// Stages 1-6 must all be passed/skipped for the source before anything can be approved.
function assertReady(db, rowId) {
  const st = Object.fromEntries(stageRows(db, rowId).map((s) => [s.stage, s.status]));
  for (let n = 1; n <= 6; n++) {
    if (!['passed', 'skipped'].includes(st[n])) throw new Error(`cannot approve: stage ${n} is ${st[n] ?? 'not run'} for this source`);
  }
}

const audit = (db, type, id, action, actor, reason) =>
  db.prepare('INSERT INTO approvals(target_type, target_id, action, actor, reason, created_at) VALUES (?,?,?,?,?,?)').run(type, id, action, actor, reason ?? null, now());

export function approveProposal(db, id, by) {
  by = need(by, 'approver');
  const p = db.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
  if (!p) throw new Error(`unknown proposal ${id}`);
  if (p.state !== 'proposed') throw new Error(`proposal ${id} is ${p.state}, not proposed`);
  assertReady(db, p.source_row_id);
  const src = db.prepare('SELECT * FROM sources WHERE id = ?').get(p.source_row_id);
  const study = unjson(db.prepare('SELECT parsed FROM analyses WHERE source_row_id = ?').get(p.source_row_id).parsed).study;
  const res = tx(db, () => {
    const cur = currentVersion(db, p.role_id);
    const base = cur?.n ?? 0;
    // Rebase: the effective diff is always recomputed against the brief that is current NOW, not the one the proposal was drafted on.
    const rows = db.prepare('SELECT * FROM changes WHERE proposal_id = ? ORDER BY id').all(id);
    for (const c of rows) {
      const old = cur?.fields[c.field];
      db.prepare('UPDATE changes SET noop = ?, old_value = ?, old_weight = ? WHERE id = ?').run(+isNoop(c, old), old?.value ?? null, old?.weight ?? null, c.id);
    }
    const changes = db.prepare('SELECT * FROM changes WHERE proposal_id = ? AND noop = 0 ORDER BY id').all(id);
    const top = changes.reduce((m, c) => (rank(c.severity) > rank(m) ? c.severity : m), 'none');
    if (rank(top) < rank('material')) {
      db.prepare("UPDATE proposals SET state = 'superseded_noop', decided_by = ?, decided_at = ?, reason = ? WHERE id = ?")
        .run(by, now(), `brief moved from v${p.base_version} to v${base}; nothing material left`, id);
      audit(db, 'proposal', id, 'superseded_noop', by, `base v${p.base_version}, current v${base}`);
      return { version: null, state: 'superseded_noop', rebased: base !== p.base_version };
    }
    // Learning items come from the approval-time effective diff; "baseline" means no approved version exists now.
    const { items, missingStudy } = draftItems({ changes, study, baseline: !cur, sourceId: src.source_id });
    if (missingStudy.length) throw new Error(`cannot approve: no study entry for ${missingStudy.join(', ')}`);
    db.prepare('DELETE FROM learning_items WHERE proposal_id = ? AND published = 0').run(id);
    saveDraftItems(db, { roleId: p.role_id, proposalId: id, sourceId: src.source_id, items });
    const n = base + 1;
    const fields = mergeChanges(cur?.fields || {}, changes, { sourceId: src.source_id, n });
    db.prepare('INSERT INTO brief_versions(role_id, n, proposal_id, source_id, effective_date, fields_json, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(p.role_id, n, id, src.source_id, src.date, json(fields), now());
    db.prepare("UPDATE proposals SET state = 'approved', version_created = ?, decided_by = ?, decided_at = ? WHERE id = ?").run(n, by, now(), id);
    audit(db, 'proposal', id, 'approve', by, base !== p.base_version ? `rebased from v${p.base_version} to v${base}` : null);
    publishItems(db, { proposalId: id, versionN: n });
    return { version: n, state: 'approved', rebased: base !== p.base_version };
  });
  updateStage7(db, p.source_row_id);
  return { proposal_id: id, ...res };
}

export function rejectProposal(db, id, by, reason) {
  by = need(by, 'actor'); reason = need(reason, 'reason');
  const p = db.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
  if (!p) throw new Error(`unknown proposal ${id}`);
  if (p.state !== 'proposed') throw new Error(`proposal ${id} is ${p.state}, not proposed`);
  tx(db, () => {
    db.prepare("UPDATE proposals SET state = 'rejected', decided_by = ?, decided_at = ?, reason = ? WHERE id = ?").run(by, now(), reason, id);
    audit(db, 'proposal', id, 'reject', by, reason);
  });
  updateStage7(db, p.source_row_id);
  return { proposal_id: id, state: 'rejected' };
}

// overrides: { [field]: {value?, weight?, status?, severity?} }, drop: [field]
export async function editProposal(db, id, { by, reason, overrides = {}, drop = [] }) {
  by = need(by, 'actor'); reason = need(reason, 'reason');
  if (reason.length < 10) throw new Error('reason must be at least 10 characters');
  const p = db.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
  if (!p) throw new Error(`unknown proposal ${id}`);
  if (p.state !== 'proposed') throw new Error(`proposal ${id} is ${p.state}, not proposed`);
  const src = db.prepare('SELECT * FROM sources WHERE id = ?').get(p.source_row_id);
  const study = unjson(db.prepare('SELECT parsed FROM analyses WHERE source_row_id = ?').get(p.source_row_id).parsed).study;
  const body = `Manual correction of proposal ${id} (source ${src.source_id}) by ${by}.\nReason: ${reason}\n`;
  const start = body.indexOf(reason, body.indexOf('Reason: ') + 8);
  const sid = `mc-${id}`;
  const changes = db.prepare('SELECT * FROM changes WHERE proposal_id = ? AND noop = 0 ORDER BY id').all(id)
    .filter((c) => !drop.includes(c.field))
    .map((c) => {
      const o = overrides[c.field] || {};
      const out = { field: c.field, op: c.op, value: o.value ?? c.value, severity: o.severity ?? c.severity, quote: reason, start, end: start + reason.length,
        weight: o.weight ?? c.weight, status: o.status ?? c.status, bias: c.bias_kind ? { kind: c.bias_kind, note: c.bias_note } : undefined,
        confirmed: c.confirmed == null ? undefined : !!c.confirmed, conflicts_with: c.conflicts_with ?? undefined };
      for (const k of Object.keys(out)) if (out[k] == null) delete out[k];
      return out;
    });
  const output = { source_id: sid, summary: `Manual correction by ${by} of proposal ${id}`, no_change: changes.length === 0, changes, study };
  rejectProposal(db, id, by, `edited: ${reason}`);
  const reg = registerSource(db, { id: sid, client: src.client_id, role: p.role_id, channel: 'manual-correction', date: src.date, author: by, title: `Manual correction of proposal ${id}` }, body, `manual/${sid}`);
  const model = { name: 'manual-correction', extract: async () => JSON.stringify(output) };
  const run = await runSource(db, reg.row_id, { model });
  const np = db.prepare('SELECT id FROM proposals WHERE source_row_id = ? ORDER BY id DESC').get(reg.row_id);
  if (np) db.prepare('UPDATE proposals SET corrects = ? WHERE id = ?').run(id, np.id);
  return { rejected: id, new_proposal_id: np?.id ?? null, source_id: sid, run };
}

export function approveReview(db, id, by) {
  by = need(by, 'approver');
  const r = db.prepare('SELECT * FROM screening_reviews WHERE id = ?').get(id);
  if (!r) throw new Error(`unknown review ${id}`);
  if (r.state !== 'proposed') throw new Error(`review ${id} is ${r.state}, not proposed`);
  assertReady(db, r.source_row_id);
  tx(db, () => {
    db.prepare("UPDATE screening_reviews SET state = 'approved', decided_by = ?, decided_at = ? WHERE id = ?").run(by, now(), id);
    audit(db, 'review', id, 'approve', by);
    publishItems(db, { reviewId: id });
  });
  updateStage7(db, r.source_row_id);
  return { review_id: id, state: 'approved' };
}

export function rejectReview(db, id, by, reason) {
  by = need(by, 'actor'); reason = need(reason, 'reason');
  const r = db.prepare('SELECT * FROM screening_reviews WHERE id = ?').get(id);
  if (!r) throw new Error(`unknown review ${id}`);
  if (r.state !== 'proposed') throw new Error(`review ${id} is ${r.state}, not proposed`);
  tx(db, () => {
    db.prepare("UPDATE screening_reviews SET state = 'rejected', decided_by = ?, decided_at = ?, reason = ? WHERE id = ?").run(by, now(), reason, id);
    audit(db, 'review', id, 'reject', by, reason);
  });
  updateStage7(db, r.source_row_id);
  return { review_id: id, state: 'rejected' };
}
