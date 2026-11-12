// Read models for the JSON API (and the CLI). Everything shown in the UI comes from SQLite through these functions.
import { unjson } from '../db/connection.ts';
import { currentVersion, listVersions, getVersion, briefFields, matrix, labelOf, groupOf } from './brief.ts';
import { itemsFor, teamStatus } from './learning.ts';
import { listCandidates, STAGES } from './candidates.ts';
import { stageRows } from './pipeline.ts';
import { mustHaves } from './checks.ts';
import type { Db } from '../db/connection.ts';

export const ME = 'ana';

export function positionsView(db: Db) {
  return db.prepare('SELECT r.*, c.name AS client_name FROM roles r JOIN clients c ON c.id = r.client_id ORDER BY c.name, r.title').all().map((r: any) => {
    const v = currentVersion(db, r.id);
    const team = teamStatus(db, r.id);
    const cands = listCandidates(db, r.id);
    return {
      id: r.id, title: r.title, client: { id: r.client_id, name: r.client_name }, lead: r.lead_id, version: v?.n ?? null,
      pending_proposals: db.prepare("SELECT COUNT(*) AS n FROM proposals WHERE role_id = ? AND state = 'proposed'").get(r.id).n,
      pending_reviews: db.prepare("SELECT COUNT(*) AS n FROM screening_reviews WHERE role_id = ? AND state = 'proposed'").get(r.id).n,
      team: { up_to_date: team.filter((t: any) => t.up_to_date).length, total: team.length },
      candidates: { total: cands.length, by_stage: STAGES.map((_, i) => cands.filter((c: any) => c.stage === i).length) },
    };
  });
}

const changeView = (c: any) => ({
  id: c.id, field: c.field, label: labelOf(c.field), group: groupOf(c.field), op: c.op, value: c.value, old: c.old_value, old_weight: c.old_weight,
  weight: c.weight, status: c.status, severity: c.severity, quote: c.quote, confirmed: c.confirmed == null ? null : !!c.confirmed,
  bias: c.bias_kind ? { kind: c.bias_kind, note: c.bias_note } : null, conflicts_with: c.conflicts_with, noop: !!c.noop,
});

function proposalsView(db: Db, roleId: any) {
  return db.prepare(`SELECT p.*, s.source_id, s.title, s.date, s.channel FROM proposals p JOIN sources s ON s.id = p.source_row_id WHERE p.role_id = ? ORDER BY s.date, p.id`).all(roleId).map((p: any) => {
    const stages = stageRows(db, p.source_row_id);
    return {
      id: p.id, state: p.state, kind: p.kind, corrects: p.corrects, severity: p.severity, source_id: p.source_id, title: p.title, date: p.date, channel: p.channel,
      version_created: p.version_created, decided_by: p.decided_by, decided_at: p.decided_at, reason: p.reason,
      ready: [1, 2, 3, 4, 5, 6].every((n) => ['passed', 'skipped'].includes(stages.find((s: any) => s.stage === n)?.status)),
      changes: db.prepare('SELECT * FROM changes WHERE proposal_id = ? AND noop = 0 ORDER BY id').all(p.id).map(changeView),
    };
  });
}

function reviewsView(db: Db, roleId: any) {
  return db.prepare('SELECT q.*, s.source_id, s.title, s.date FROM screening_reviews q JOIN sources s ON s.id = q.source_row_id WHERE q.role_id = ? ORDER BY s.date, q.id').all(roleId).map((q: any) => ({
    id: q.id, state: q.state, status: q.status, purpose: q.purpose, candidate: q.candidate, source_id: q.source_id, date: q.date,
    screening_source_id: q.screening_source_id, brief_version_at_screening: q.brief_version_at_screening,
    must_have_snapshot: unjson(q.must_have_snapshot_json), coverage: unjson(q.coverage_json), overweighted: unjson(q.overweighted_json),
    suggested: unjson(q.suggested_json), decision: unjson(q.decision_json), decided_by: q.decided_by, reason: q.reason,
    ready: [1, 2, 3, 4, 5, 6].every((n) => ['passed', 'skipped'].includes(stageRows(db, q.source_row_id).find((s: any) => s.stage === n)?.status)),
  }));
}

function timelineView(db: Db, role: any, proposals: any, reviews: any) {
  const rows = db.prepare(`SELECT * FROM sources WHERE status <> 'superseded' AND (role_id = ? OR (scope = 'company' AND client_id = ?)) AND channel <> 'screening-transcript'
    ORDER BY date, ingest_order`).all(role.id, role.client_id);
  const all = db.prepare(`SELECT * FROM sources WHERE status <> 'superseded' AND role_id = ? AND channel = 'screening-transcript' ORDER BY date, ingest_order`).all(role.id);
  return [...rows, ...all].sort((a, b) => a.date.localeCompare(b.date) || a.ingest_order - b.ingest_order).map((s) => {
    const a = db.prepare('SELECT * FROM analyses WHERE source_row_id = ?').get(s.id);
    const st = stageRows(db, s.id);
    const p = proposals.find((x: any) => x.source_id === s.source_id && x.state !== 'superseded');
    const rv = reviews.find((x: any) => x.source_id === s.source_id);
    const failed = st.find((x: any) => x.status === 'failed');
    let outcome: any;
    if (failed) outcome = { kind: 'failed', stage: failed.stage };
    else if (!a) outcome = { kind: 'not_processed' };
    else if (p) outcome = p.state === 'approved' ? { kind: 'version', version: p.version_created, proposal_id: p.id } : { kind: p.state, proposal_id: p.id };
    else outcome = { kind: 'no_version' };
    const parsed = a ? unjson(a.parsed) : null;
    return {
      source_id: s.source_id, date: s.date, channel: s.channel, author: s.author, title: s.title, scope: s.scope, summary: a?.summary ?? null, outcome,
      decision: parsed?.decision ?? null, review_id: rv?.id ?? null, review_state: rv?.state ?? null, stages_summary: st.map((x: any) => x.status),
    };
  });
}

export function roleView(db: Db, roleId: any, me = ME) {
  const role = db.prepare('SELECT r.*, c.name AS client_name FROM roles r JOIN clients c ON c.id = r.client_id WHERE r.id = ?').get(roleId);
  if (!role) return null;
  const cur = currentVersion(db, roleId);
  const proposals = proposalsView(db, roleId);
  const reviews = reviewsView(db, roleId);
  const approvedReviews = reviews.filter((r: any) => r.state === 'approved');
  const items = itemsFor(db, roleId, me);
  return {
    role: { id: role.id, title: role.title, client: { id: role.client_id, name: role.client_name }, lead: role.lead_id },
    me, stages: STAGES,
    brief: cur ? { version: cur.n, effective_date: cur.effective_date, source_id: cur.source_id, fields: briefFields(cur) } : null,
    versions: listVersions(db, roleId).map((v: any) => ({ ...v, fields: briefFields(getVersion(db, roleId, v.n)) })), matrix: matrix(db, roleId),
    timeline: timelineView(db, role, proposals, reviews), proposals, reviews, team: teamStatus(db, roleId),
    items, my_progress: { done: items.filter((i: any) => i.completion).length, total: items.length },
    verify: {
      musts: cur ? mustHaves(cur.fields).map((m) => ({ ...m, label: labelOf(m.criterion) })) : [],
      suggestions: approvedReviews.flatMap((r: any) => r.suggested.map((s: any) => ({ text: s.text, why: s.why, source_id: r.source_id, candidate: r.candidate }))),
    },
  };
}

export function stagesView(db: Db, sourceId = null) {
  const rows = sourceId
    ? db.prepare("SELECT sr.*, s.hash, s.status AS source_status FROM stage_runs sr JOIN sources s ON s.id = sr.source_row_id WHERE sr.source_id = ? AND s.status <> 'superseded' ORDER BY sr.stage").all(sourceId)
    : db.prepare("SELECT sr.*, s.hash, s.status AS source_status FROM stage_runs sr JOIN sources s ON s.id = sr.source_row_id WHERE s.status <> 'superseded' ORDER BY s.date, s.ingest_order, sr.stage").all();
  const out = rows.map((r: any) => ({ source_id: r.source_id, stage: r.stage, name: r.name, status: r.status, skip_reason: r.skip_reason, check: unjson(r.check_result), run_id: r.run_id, hash: r.hash.slice(0, 12), at: r.created_at, trace_id: r.trace_id ?? null }));
  // Stage 7 is recorded only once every proposal/review of the source is decided; until then show it as pending.
  const result: any[] = [];
  for (const id of new Set(out.map((r: any) => r.source_id))) {
    const mine = out.filter((r: any) => r.source_id === id);
    result.push(...mine);
    if (mine.length === 6 && mine.every((r: any) => r.status !== 'failed')) {
      result.push({ source_id: id, stage: 7, name: 'Publish to recruiters', status: 'pending', skip_reason: null, check: { note: 'waiting for approval of the open proposal or review' }, run_id: null, hash: mine[0].hash, at: null });
    }
  }
  return result;
}
