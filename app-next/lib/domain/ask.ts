// "Ask about this role": short, brief-grounded answers to a recruiter's questions.
// Context budget: the current approved brief only (biased, not-applied restrictions are left out), plus the last few turns.
// Checks on the model output: valid JSON, a non-empty answer within the length limit, and cited fields that exist in the brief.
import { currentVersion, compactBrief, labelOf } from './brief.ts';
import type { Db } from '../db/connection.ts';
import { NotFound, Invalid, ModelFailure } from '../contracts/errors.ts';

export const MAX_QUESTION = 500;
export const MAX_ANSWER = 1200;
const MAX_TURNS = 6;

export function cleanHistory(history: any) {
  if (!Array.isArray(history)) return [];
  return history.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_TURNS).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
}

export function briefForAsk(v: any) {
  const c = compactBrief(v);
  for (const [k, f] of Object.entries<any>(v?.fields || {})) if (f.status === 'not_applied_bias') delete (c.fields as any)[k];
  return c;
}

export function checkAnswer(raw: any, brief: any) {
  let j: any;
  try { j = JSON.parse(raw); } catch { return { ok: false, error: 'the model did not return valid JSON' }; }
  const answer = typeof j.answer === 'string' ? j.answer.trim() : '';
  if (!answer) return { ok: false, error: 'the model returned an empty answer' };
  if (answer.length > MAX_ANSWER) return { ok: false, error: 'the answer was too long to be useful' };
  const cited = Array.isArray(j.based_on) ? j.based_on.filter((x: any) => typeof x === 'string') : [];
  const known = cited.filter((k: any) => k in brief.fields);
  return { ok: true, answer, in_brief: j.in_brief !== false, based_on: known.map((k: any) => ({ field: k, label: labelOf(k) })), unknown_citations: cited.length - known.length, stub: j.stub === true };
}

export async function askRole(db: Db, model: any, roleId: any, { question, history }: any = {}) {
  const q = String(question || '').trim();
  if (q.length < 3) throw new Invalid('write a question first');
  if (q.length > MAX_QUESTION) throw new Invalid(`keep the question under ${MAX_QUESTION} characters`);
  if (typeof model.ask !== 'function') throw new Invalid(`the ${model.name} model cannot answer questions`);
  const role = db.prepare('SELECT r.title, c.name AS client FROM roles r JOIN clients c ON c.id = r.client_id WHERE r.id = ?').get(roleId);
  if (!role) throw new NotFound(`unknown role ${roleId}`);
  const v = currentVersion(db, roleId);
  if (!v) throw new Invalid('this role has no approved brief yet');
  const brief = briefForAsk(v);
  const recent = db.prepare(`SELECT s.date, s.channel, s.title, a.summary FROM sources s LEFT JOIN analyses a ON a.source_row_id = s.id
    WHERE s.status <> 'superseded' AND (s.role_id = ? OR (s.scope = 'company' AND s.client_id = (SELECT client_id FROM roles WHERE id = ?)))
    ORDER BY s.date DESC LIMIT 5`).all(roleId, roleId);
  const raw = await model.ask({ role: { title: role.title, client: role.client }, brief, recent, question: q, history: cleanHistory(history) });
  const res = checkAnswer(raw, brief);
  if (!res.ok) throw new ModelFailure(`No answer: ${res.error}. Try again.`);
  return { ...res, model: model.name };
}
