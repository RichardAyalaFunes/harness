// Learning items (confirm / study / review), assignments, completion checks and team status.
// Completion is evidence, not a click on "assigned": ack = a row exists; study = written answer; review = accepted suggestions.
import { tx, now, json, unjson } from '../db/connection.ts';
import { labelOf } from './brief.ts';
import type { Db } from '../db/connection.ts';
import { NotFound, Invalid } from '../contracts/errors.ts';

export const MIN_STUDY_CHARS = 20;
export const MIN_REASON_CHARS = 10;
const ACK_OFFER = new Set(['offer.budget', 'offer.start', 'offer.location', 'offer.equity']);

// Rules from the plan revision. `changes` are effective (non-noop) change rows with old_value/old_weight.
// A role's first version is a baseline: nothing changed for recruiters, so it creates no items.
export function draftItems({ changes, study, baseline, sourceId }: any) {
  const items: any[] = [];
  const missingStudy: any[] = [];
  if (baseline) return { items, missingStudy };
  const studyFor = (field: any) => study.find((s: any) => s.field === field);
  const addStudy = (c: any, title: any) => {
    const s = studyFor(c.field);
    if (!s) return missingStudy.push(c.field);
    items.push({ kind: 'study', field: c.field, title, detail: { was: c.old_value, now: c.value, prompt: s.prompt, points: s.points, keys: s.keys, source_id: sourceId } });
  };
  for (const c of changes) {
    const base = { was: c.old_value, now: c.value, source_id: sourceId };
    if (ACK_OFFER.has(c.field)) {
      items.push({ kind: 'ack', field: c.field, title: `${labelOf(c.field)} is now ${c.value}`, detail: base });
    } else if (c.field.startsWith('restriction.')) {
      const noted = c.status === 'not_applied_bias' ? 'Client preference noted, not applied (possible bias): ' : c.status === 'applied' ? 'New client restriction: ' : 'Client restriction to clarify: ';
      items.push({ kind: 'ack', field: c.field, title: `${c.op === 'remove' ? 'Restriction withdrawn: ' : noted}${c.value ?? c.old_value}`, detail: { ...base, note: c.bias_note || null, bias_kind: c.bias_kind || null } });
    } else if (c.field === 'offer.level') {
      addStudy(c, `Level changed to ${c.value}`);
    } else if (c.field.startsWith('req.')) {
      const nowMust = c.op !== 'remove' && (c.weight ?? c.old_weight) === 'must';
      if (nowMust && c.old_weight !== 'must') addStudy(c, `New must-have: ${c.value}`);
      else if (c.old_weight === 'must' && !nowMust) {
        items.push({ kind: 'ack', field: c.field, title: c.op === 'remove' ? `No longer required: ${c.old_value ?? labelOf(c.field)}` : `No longer a must-have: ${c.old_value ?? labelOf(c.field)} is now ${c.weight === 'nice' ? 'nice to have' : c.weight}`, detail: { ...base, now: c.op === 'remove' ? 'removed' : c.weight } });
      }
    }
  }
  return { items, missingStudy };
}

export function saveDraftItems(db: Db, { roleId, proposalId = null, reviewId = null, sourceId, items }: any) {
  const ins = db.prepare(`INSERT INTO learning_items(role_id, proposal_id, review_id, kind, field, title, detail_json, source_id, published, created_at)
    VALUES (?,?,?,?,?,?,?,?,0,?)`);
  return items.map((i: any) => Number(ins.run(roleId, proposalId, reviewId, i.kind, i.field ?? null, i.title, json(i.detail), sourceId, now()).lastInsertRowid));
}

export const teamOf = (db: Db, roleId: any) =>
  db.prepare('SELECT r.id, r.name FROM role_recruiters rr JOIN recruiters r ON r.id = rr.recruiter_id WHERE rr.role_id = ? ORDER BY r.name').all(roleId);

// Called on approval of a version or review. Creates one assignment per team member.
export function publishItems(db: Db, { proposalId = null, reviewId = null, versionN = null }) {
  const col = proposalId != null ? 'proposal_id' : 'review_id';
  const ids = db.prepare(`SELECT id, role_id FROM learning_items WHERE ${col} = ?`).all(proposalId ?? reviewId);
  const ins = db.prepare('INSERT OR IGNORE INTO assignments(item_id, recruiter_id, created_at) VALUES (?,?,?)');
  for (const it of ids) {
    db.prepare('UPDATE learning_items SET published = 1, version_n = COALESCE(?, version_n) WHERE id = ?').run(versionN, it.id);
    for (const m of teamOf(db, it.role_id)) ins.run(it.id, m.id, now());
  }
  return ids.map((i: any) => i.id);
}

const hydrateItem = (r: any) => (r ? { ...r, detail: unjson(r.detail_json) } : null);
export const getItem = (db: Db, id: any) => hydrateItem(db.prepare('SELECT * FROM learning_items WHERE id = ?').get(id));
export const publishedItems = (db: Db, roleId: any) =>
  db.prepare('SELECT * FROM learning_items WHERE role_id = ? AND published = 1 ORDER BY id').all(roleId).map(hydrateItem);

export function checkCompletion(item: any, { response = '', accepted = [], none_needed = false }) {
  const text = String(response || '').trim();
  if (item.kind === 'ack') return { passed: true, rule: 'ack: a row exists once recorded' };
  if (item.kind === 'study') {
    const lc = text.toLowerCase();
    const points = item.detail.points.map((p: any, i: any) => ({ text: p, hit: (item.detail.keys[i] || []).some((k: any) => lc.includes(k.toLowerCase())) }));
    return {
      passed: text.length >= MIN_STUDY_CHARS, rule: `study: written answer of at least ${MIN_STUDY_CHARS} characters`,
      length: text.length, points, hits: points.filter((p: any) => p.hit).length,
      stub: true, note: 'Points are matched by keywords from the replay file (stub). This is not an AI judgement of your answer.',
    };
  }
  const n = (item.detail.suggested || []).length;
  const ok = Array.isArray(accepted) && accepted.every((i) => Number.isInteger(i) && i >= 0 && i < n);
  const accepts = ok && accepted.length >= 1;
  const none = none_needed === true && text.length >= MIN_REASON_CHARS;
  return {
    passed: accepts || none, rule: 'review: accept at least one suggestion, or say none is needed and give a reason',
    accepted: ok ? accepted : [], none_needed: none,
  };
}

// Idempotent: a second call returns the stored result. A failed check stores nothing.
export function completeItem(db: Db, itemId: any, recruiterId: any, input: any = {}) {
  const item = getItem(db, itemId);
  if (!item) throw new NotFound(`unknown item ${itemId}`);
  if (!item.published) throw new Invalid(`item ${itemId} is not published (its version or review is not approved)`);
  if (!teamOf(db, item.role_id).some((m: any) => m.id === recruiterId)) throw new Invalid(`${recruiterId} is not on the team for ${item.role_id}`);
  const have = db.prepare('SELECT * FROM completions WHERE recruiter_id = ? AND item_id = ?').get(recruiterId, itemId);
  if (have) return { passed: true, already: true, result: unjson(have.result_json) };
  const result = checkCompletion(item, input);
  
  if (!result.passed) return { passed: false, already: false, result };
  const ver = item.version_n ?? db.prepare('SELECT MAX(n) AS n FROM brief_versions WHERE role_id = ?').get(item.role_id).n;
  tx(db, () => db.prepare(`INSERT INTO completions(recruiter_id, role_id, version, item_id, kind, response, accepted_json, result_json, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(recruiterId, item.role_id, ver ?? null, itemId, item.kind, input.response ?? null, json(input.accepted ?? null), json(result), now()));
  return { passed: true, already: false, result };
}

export function itemsFor(db: Db, roleId: any, recruiterId: any) {
  return publishedItems(db, roleId).map((it: any) => {
    const c = db.prepare('SELECT * FROM completions WHERE recruiter_id = ? AND item_id = ?').get(recruiterId, it.id);
    return { id: it.id, kind: it.kind, field: it.field, version: it.version_n, title: it.title, detail: it.detail, source_id: it.source_id,
      completion: c ? { at: c.created_at, response: c.response, accepted: unjson(c.accepted_json), result: unjson(c.result_json) } : null };
  });
}

// Up to date = every published item of the role (all versions to date, approved reviews included) has a passing completion.
export function teamStatus(db: Db, roleId: any) {
  const items = publishedItems(db, roleId);
  return teamOf(db, roleId).map((m: any) => {
    const done = db.prepare('SELECT item_id FROM completions WHERE recruiter_id = ? AND role_id = ?').all(m.id, roleId).map((r: any) => r.item_id);
    const doneSet = new Set(done);
    const pending = items.filter((i: any) => !doneSet.has(i.id));
    const byKind = (k: any) => ({ done: items.filter((i: any) => i.kind === k && doneSet.has(i.id)).length, total: items.filter((i: any) => i.kind === k).length });
    return { id: m.id, name: m.name, total: items.length, done: items.length - pending.length, pending: pending.length, up_to_date: pending.length === 0,
      by_kind: { ack: byKind('ack'), study: byKind('study'), review: byKind('review') } };
  });
}

export function addRecruiter(db: Db, roleId: any, recruiterId: any) {
  tx(db, () => {
    db.prepare('INSERT OR IGNORE INTO role_recruiters(role_id, recruiter_id) VALUES (?,?)').run(roleId, recruiterId);
    for (const it of publishedItems(db, roleId)) db.prepare('INSERT OR IGNORE INTO assignments(item_id, recruiter_id, created_at) VALUES (?,?,?)').run(it.id, recruiterId, now());
  });
}
export function removeRecruiter(db: Db, roleId: any, recruiterId: any) {
  tx(db, () => {
    db.prepare('DELETE FROM role_recruiters WHERE role_id = ? AND recruiter_id = ?').run(roleId, recruiterId);
    db.prepare('DELETE FROM assignments WHERE recruiter_id = ? AND item_id IN (SELECT id FROM learning_items WHERE role_id = ?)').run(recruiterId, roleId);
  });
}
