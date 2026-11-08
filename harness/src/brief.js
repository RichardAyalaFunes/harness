// The role brief: current approved version, version list, merge on approval, diffs and the compare matrix.
import { unjson } from './db.js';

const GROUPS = ['Context', 'Requirements', 'Restrictions', 'Expectations', 'Offer'];
const FIXED = {
  'company.direction': 'Direction', 'company.team': 'Team', 'expect.6m': 'At 6 months', 'expect.12m': 'At 12 months',
  'expect.18m': 'At 18 months', 'offer.level': 'Level', 'offer.budget': 'Budget', 'offer.start': 'Start',
  'offer.location': 'Location', 'offer.equity': 'Equity',
};
export const groupOf = (f) => (f.startsWith('company.') ? 'Context' : f.startsWith('req.') ? 'Requirements' : f.startsWith('restriction.') ? 'Restrictions' : f.startsWith('expect.') ? 'Expectations' : 'Offer');
export const labelOf = (f) => {
  if (FIXED[f]) return FIXED[f];
  const s = f.slice(f.indexOf('.') + 1).replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const fieldSort = (a, b) => GROUPS.indexOf(groupOf(a)) - GROUPS.indexOf(groupOf(b)) || a.localeCompare(b);

const hydrate = (r) => (r ? { ...r, fields: unjson(r.fields_json) } : null);

export const currentVersion = (db, roleId) =>
  hydrate(db.prepare('SELECT * FROM brief_versions WHERE role_id = ? ORDER BY n DESC LIMIT 1').get(roleId));
export const getVersion = (db, roleId, n) =>
  hydrate(db.prepare('SELECT * FROM brief_versions WHERE role_id = ? AND n = ?').get(roleId, n));
export const listVersions = (db, roleId) =>
  db.prepare('SELECT n, source_id, effective_date, created_at, proposal_id FROM brief_versions WHERE role_id = ? ORDER BY n').all(roleId);
// The brief a recruiter would have had on `date`: latest approved version whose source is dated on or before it.
export const versionAt = (db, roleId, date) =>
  hydrate(db.prepare('SELECT * FROM brief_versions WHERE role_id = ? AND effective_date <= ? ORDER BY n DESC LIMIT 1').get(roleId, date));

// Compact JSON given to the model (context budget: current brief + one source, never history).
export function compactBrief(v) {
  if (!v) return { version: null, fields: {} };
  const fields = {};
  for (const [k, f] of Object.entries(v.fields)) fields[k] = [f.value, f.weight ?? undefined, f.status ?? undefined].filter((x) => x !== undefined);
  return { version: v.n, fields };
}

// Merge a proposal's effective changes into the previous fields, keeping provenance per field.
export function mergeChanges(prev, changes, { sourceId, n }) {
  const fields = { ...prev };
  for (const c of changes) {
    if (c.op === 'remove') { delete fields[c.field]; continue; }
    const old = prev[c.field];
    // Invariant: a biased restriction can only ever be stored as not_applied_bias, whatever the proposal says.
    if (c.bias_kind && c.status === 'applied') throw new Error(`${c.field}: a biased restriction cannot be applied`);
    fields[c.field] = {
      value: c.value,
      weight: c.weight ?? old?.weight ?? null,
      status: c.bias_kind ? 'not_applied_bias' : c.status ?? (c.field.startsWith('restriction.') ? old?.status ?? 'pending' : null),
      bias: c.bias_kind ? { kind: c.bias_kind, note: c.bias_note } : null,
      confirmed: c.confirmed == null ? null : !!c.confirmed,
      severity: c.severity, source_id: sourceId, quote: c.quote, start: c.start, end: c.end,
      conflicts_with: c.conflicts_with ?? null, version: n,
    };
  }
  return fields;
}

const cell = (f) => (f ? { value: f.value, weight: f.weight, status: f.status, bias: f.bias, confirmed: f.confirmed, source_id: f.source_id } : null);
const same = (a, b) => (a == null && b == null) || (a && b && a.value === b.value && a.weight === b.weight && a.status === b.status);

export function diff(db, roleId, from, to) {
  const a = from ? getVersion(db, roleId, from) : null;
  const b = getVersion(db, roleId, to);
  if (!b) throw new Error(`role ${roleId} has no version ${to}`);
  if (from && !a) throw new Error(`role ${roleId} has no version ${from}`);
  const keys = [...new Set([...Object.keys(a?.fields || {}), ...Object.keys(b.fields)])].sort(fieldSort);
  return keys.map((field) => {
    const x = cell(a?.fields[field]);
    const y = cell(b.fields[field]);
    return { field, group: groupOf(field), label: labelOf(field), from: x, to: y, kind: same(x, y) ? 'same' : !x ? 'added' : !y ? 'removed' : 'changed' };
  });
}

// Version x field matrix for the compare table. A cell is "changed" when it differs from the previous version.
export function matrix(db, roleId) {
  const versions = db.prepare('SELECT * FROM brief_versions WHERE role_id = ? ORDER BY n').all(roleId).map(hydrate);
  const keys = [...new Set(versions.flatMap((v) => Object.keys(v.fields)))].sort(fieldSort);
  return {
    versions: versions.map((v) => ({ n: v.n, source_id: v.source_id, date: v.effective_date })),
    rows: keys.map((field) => ({
      field, group: groupOf(field), label: labelOf(field),
      cells: versions.map((v, i) => {
        const c = cell(v.fields[field]);
        return { ...(c || {}), empty: !c, changed: i > 0 && !same(c, cell(versions[i - 1].fields[field])) };
      }),
    })),
  };
}

// Flat list for the brief tab.
export function briefFields(v) {
  if (!v) return [];
  return Object.entries(v.fields).sort(([a], [b]) => fieldSort(a, b)).map(([field, f]) => ({
    field, group: groupOf(field), label: labelOf(field), ...f, changed_in_version: f.version,
  }));
}

// The only restrictions that count as applied. not_applied_bias and pending ones are shown in the brief but are never filters.
export const appliedRestrictions = (fields) => Object.entries(fields || {}).filter(([k, f]) => k.startsWith('restriction.') && f.status === 'applied' && !f.bias).map(([k]) => k);
