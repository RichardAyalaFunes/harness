// Candidate pipeline. Moving a candidate is deliberately never gated: it does not read learning items, completions,
// briefs or restrictions. "What to verify in screenings" is informational only (plan revision, item 3 and 12).
export const STAGES = ['Sourced', 'Screening', 'Client review', 'Interview', 'Offer'];

export function listCandidates(db, roleId) {
  return db.prepare('SELECT id, name, stage FROM candidates WHERE role_id = ? ORDER BY stage, id').all(roleId);
}

export function moveCandidate(db, candidateId, to) {
  const idx = typeof to === 'string' && Number.isNaN(Number(to)) ? STAGES.indexOf(to) : Number(to);
  if (!Number.isInteger(idx) || idx < 0 || idx >= STAGES.length) throw new Error(`unknown stage "${to}"`);
  const c = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId);
  if (!c) throw new Error(`unknown candidate ${candidateId}`);
  db.prepare('UPDATE candidates SET stage = ? WHERE id = ?').run(idx, candidateId);
  return { id: c.id, name: c.name, role_id: c.role_id, stage: idx, stage_name: STAGES[idx] };
}
