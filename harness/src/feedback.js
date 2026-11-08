// AI coaching on a recruiter's study answer. Advisory only: completion is already decided by the evidence rule
// in learning.js (a written answer). This adds feedback to the stored completion; a failed call never undoes it.
// Checks on the model output: valid JSON, one boolean per point, a non-empty comment within the limit.
import { getItem } from './learning.js';
import { currentVersion, labelOf } from './brief.js';
import { briefForAsk } from './ask.js';
import { json, unjson } from './db.js';

export const MAX_COMMENT = 600;

export function checkFeedback(raw, nPoints) {
  let j;
  try { j = JSON.parse(raw); } catch { return { ok: false, error: 'the model did not return valid JSON' }; }
  if (j.stub === true) return { ok: true, stub: true };
  if (!Array.isArray(j.covered) || j.covered.length !== nPoints || !j.covered.every((x) => typeof x === 'boolean')) return { ok: false, error: `expected ${nPoints} covered flags` };
  const comment = typeof j.comment === 'string' ? j.comment.trim() : '';
  if (!comment || comment.length > MAX_COMMENT) return { ok: false, error: 'missing or too long comment' };
  const tryAsking = typeof j.try_asking === 'string' ? j.try_asking.trim().slice(0, 300) : '';
  return { ok: true, covered: j.covered, comment, try_asking: tryAsking };
}

export async function studyFeedback(db, model, itemId, recruiterId) {
  const item = getItem(db, itemId);
  if (!item || item.kind !== 'study' || typeof model.feedback !== 'function') return null;
  const row = db.prepare('SELECT * FROM completions WHERE recruiter_id = ? AND item_id = ?').get(recruiterId, itemId);
  if (!row) return null;
  const role = db.prepare('SELECT r.title, c.name AS client FROM roles r JOIN clients c ON c.id = r.client_id WHERE r.id = ?').get(item.role_id);
  const points = item.detail.points || [];
  let ai;
  try {
    const raw = await model.feedback({
      role, brief: briefForAsk(currentVersion(db, item.role_id)),
      change: { field: labelOf(item.field), was: item.detail.was ?? null, now: item.detail.now ?? null, question: item.detail.prompt },
      points, answer: String(row.response || '').slice(0, 4000),
    });
    const chk = checkFeedback(raw, points.length);
    ai = chk.ok ? { model: model.name, ...chk } : { model: model.name, error: chk.error };
  } catch (e) { ai = { model: model.name, error: e.message }; }
  const result = { ...unjson(row.result_json), ai };
  db.prepare('UPDATE completions SET result_json = ? WHERE id = ?').run(json(result), row.id);
  return ai;
}
