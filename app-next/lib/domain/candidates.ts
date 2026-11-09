// Candidate pipeline. Moving a candidate is deliberately never gated: it does not read learning items, completions,
// briefs or restrictions. "What to verify in screenings" is informational only (plan revision, item 3 and 12).
// No imports on purpose (a test pins it). Errors carry a `code`; the API maps codes to statuses (lib/contracts/errors.ts).
const fail = (code: string, message: string) => Object.assign(new Error(message), { code });
export const STAGES = ['Sourced', 'Screening', 'Client review', 'Interview', 'Offer'];

export function listCandidates(db: any, roleId: any) {
  return db.prepare('SELECT id, name, stage FROM candidates WHERE role_id = ? ORDER BY stage, id').all(roleId);
}

export function moveCandidate(db: any, candidateId: any, to: any) {
  const idx = typeof to === 'string' && Number.isNaN(Number(to)) ? STAGES.indexOf(to) : Number(to);
  if (!Number.isInteger(idx) || idx < 0 || idx >= STAGES.length) throw fail('invalid', `unknown stage "${to}"`);
  const c = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId);
  if (!c) throw fail('not_found', `unknown candidate ${candidateId}`);
  db.prepare('UPDATE candidates SET stage = ? WHERE id = ?').run(idx, candidateId);
  return { id: c.id, name: c.name, role_id: c.role_id, stage: idx, stage_name: STAGES[idx] };
}
