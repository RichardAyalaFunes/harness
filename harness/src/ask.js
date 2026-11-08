// "Ask about this role": short, brief-grounded answers to a recruiter's questions.
// Context budget: the current approved brief only (biased, not-applied restrictions are left out), plus the last few turns.
// Checks on the model output: valid JSON, a non-empty answer within the length limit, and cited fields that exist in the brief.
import { currentVersion, compactBrief, labelOf } from './brief.js';

export const MAX_QUESTION = 500;
export const MAX_ANSWER = 1200;
const MAX_TURNS = 6;

export function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_TURNS).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
}

export function briefForAsk(v) {
  const c = compactBrief(v);
  for (const [k, f] of Object.entries(v?.fields || {})) if (f.status === 'not_applied_bias') delete c.fields[k];
  return c;
}

export function checkAnswer(raw, brief) {
  let j;
  try { j = JSON.parse(raw); } catch { return { ok: false, error: 'the model did not return valid JSON' }; }
  const answer = typeof j.answer === 'string' ? j.answer.trim() : '';
  if (!answer) return { ok: false, error: 'the model returned an empty answer' };
  if (answer.length > MAX_ANSWER) return { ok: false, error: 'the answer was too long to be useful' };
  const cited = Array.isArray(j.based_on) ? j.based_on.filter((x) => typeof x === 'string') : [];
  const known = cited.filter((k) => k in brief.fields);
  return { ok: true, answer, in_brief: j.in_brief !== false, based_on: known.map((k) => ({ field: k, label: labelOf(k) })), unknown_citations: cited.length - known.length, stub: j.stub === true };
}

export async function askRole(db, model, roleId, { question, history } = {}) {
  const q = String(question || '').trim();
  if (q.length < 3) throw new Error('write a question first');
  if (q.length > MAX_QUESTION) throw new Error(`keep the question under ${MAX_QUESTION} characters`);
  if (typeof model.ask !== 'function') throw new Error(`the ${model.name} model cannot answer questions`);
  const role = db.prepare('SELECT r.title, c.name AS client FROM roles r JOIN clients c ON c.id = r.client_id WHERE r.id = ?').get(roleId);
  if (!role) throw new Error(`unknown role ${roleId}`);
  const v = currentVersion(db, roleId);
  if (!v) throw new Error('this role has no approved brief yet');
  const brief = briefForAsk(v);
  const raw = await model.ask({ role: { title: role.title, client: role.client }, brief, question: q, history: cleanHistory(history) });
  const res = checkAnswer(raw, brief);
  if (!res.ok) throw new Error(`No answer: ${res.error}. Try again.`);
  return { ...res, model: model.name };
}
