// `harness check`: consistency checks over the whole database. Each returns {name, ok, problems[]}.
import { unjson } from '../db/connection.ts';
import { checkReview, mustHaves, rank } from './checks.ts';
import { checkCompletion, getItem, teamOf } from './learning.ts';
import { getVersion } from './brief.ts';
import { stageRows } from './pipeline.ts';
import type { Db } from '../db/connection.ts';

const live = (db: Db) => db.prepare("SELECT * FROM sources WHERE status <> 'superseded' ORDER BY date, ingest_order").all();

const CHECKS = [
  ['every live source completed stages 1-6 (passed or skipped)', (db: Db) => {
    const p: any[] = [];
    for (const s of live(db)) {
      const st = Object.fromEntries(stageRows(db, s.id).map((r: any) => [r.stage, r.status]));
      for (let n = 1; n <= 6; n++) if (!['passed', 'skipped'].includes(st[n])) p.push(`${s.source_id}: stage ${n} is ${st[n] ?? 'missing'}`);
    }
    return p;
  }],
  ['skips are permitted and carry a reason (rule 13)', (db: Db) => {
    const p: any[] = [];
    for (const s of live(db)) for (const r of stageRows(db, s.id).filter((x: any) => x.status === 'skipped')) {
      const tag = `${s.source_id} stage ${r.stage}`;
      if (!r.skip_reason) p.push(`${tag}: skipped without a reason`);
      if ([1, 2, 3].includes(r.stage)) p.push(`${tag}: this stage may never be skipped`);
      if (r.stage === 4 && db.prepare("SELECT 1 FROM changes WHERE source_row_id = ? AND field LIKE 'restriction.%' AND noop = 0").get(s.id)) p.push(`${tag}: restriction changed but bias screen skipped`);
      if (r.stage === 5 && db.prepare('SELECT 1 FROM proposals WHERE source_row_id = ?').get(s.id)) p.push(`${tag}: a proposal exists but learning steps were skipped`);
      if (r.stage === 6 && s.channel === 'client-decision') p.push(`${tag}: client decision without screening review`);
    }
    return p;
  }],
  ['every change quote is verbatim at its stored offsets', (db: Db) => {
    const p: any[] = [];
    for (const c of db.prepare('SELECT c.*, s.body, s.source_id FROM changes c JOIN sources s ON s.id = c.source_row_id').all()) {
      if (c.body.slice(c.start, c.end) !== c.quote) p.push(`${c.source_id} ${c.field}: quote does not match body[${c.start}:${c.end}]`);
    }
    return p;
  }],
  ['bias rule: biased restrictions never applied, protected ones critical', (db: Db) => {
    const p: any[] = [];
    for (const c of db.prepare("SELECT c.*, s.source_id FROM changes c JOIN sources s ON s.id = c.source_row_id WHERE c.bias_kind IS NOT NULL").all()) {
      if (c.status !== 'not_applied_bias') p.push(`${c.source_id} ${c.field}: bias flagged but status is ${c.status}`);
      if (c.bias_kind === 'protected' && c.severity !== 'critical') p.push(`${c.source_id} ${c.field}: protected but severity ${c.severity}`);
    }
    for (const v of db.prepare('SELECT * FROM brief_versions').all()) {
      for (const [f, x] of Object.entries<any>(unjson(v.fields_json))) if (x.bias && x.status === 'applied') p.push(`${v.role_id} v${v.n} ${f}: biased restriction applied`);
    }
    return p;
  }],
  ['version rule: proposals need a material/critical change; approved ones map to a version', (db: Db) => {
    const p: any[] = [];
    for (const pr of db.prepare('SELECT * FROM proposals').all()) {
      if (pr.state === 'superseded_noop') {
        if (!db.prepare("SELECT 1 FROM approvals WHERE target_type = 'proposal' AND target_id = ? AND action = 'superseded_noop'").get(pr.id)) p.push(`proposal ${pr.id}: superseded_noop without an audit row`);
        continue;
      }
      const top = db.prepare('SELECT severity FROM changes WHERE proposal_id = ? AND noop = 0').all(pr.id).reduce((m: any, c: any) => (rank(c.severity) > rank(m) ? c.severity : m), 'none');
      if (rank(top) < rank('material')) p.push(`proposal ${pr.id}: highest severity ${top}`);
      if (pr.state === 'approved' && !getVersion(db, pr.role_id, pr.version_created)) p.push(`proposal ${pr.id}: approved but v${pr.version_created} is missing`);
      if (pr.state !== 'approved' && pr.version_created != null) p.push(`proposal ${pr.id}: ${pr.state} but has a version`);
    }
    for (const v of db.prepare('SELECT * FROM brief_versions').all()) {
      const pr = db.prepare('SELECT state FROM proposals WHERE id = ?').get(v.proposal_id);
      if (pr?.state !== 'approved') p.push(`${v.role_id} v${v.n}: version without an approved proposal`);
    }
    return p;
  }],
  ['versions are contiguous per role', (db: Db) => {
    const p: any[] = [];
    for (const r of db.prepare('SELECT id FROM roles').all()) {
      const ns = db.prepare('SELECT n FROM brief_versions WHERE role_id = ? ORDER BY n').all(r.id).map((x: any) => x.n);
      if (ns.some((n: any, i: any) => n !== i + 1)) p.push(`${r.id}: versions ${ns.join(',')}`);
    }
    return p;
  }],
  ['every brief field has provenance (source id and a verbatim quote)', (db: Db) => {
    const p: any[] = [];
    for (const v of db.prepare('SELECT * FROM brief_versions').all()) {
      for (const [f, x] of Object.entries<any>(unjson(v.fields_json))) {
        const src = db.prepare('SELECT body FROM sources WHERE source_id = ? ORDER BY ingest_order DESC').all(x.source_id);
        if (!x.source_id || !x.quote || !src.some((s: any) => s.body.includes(x.quote))) p.push(`${v.role_id} v${v.n} ${f}: no verifiable provenance`);
      }
    }
    return p;
  }],
  ['only approved proposals/reviews publish items; assignments cover the team', (db: Db) => {
    const p: any[] = [];
    for (const it of db.prepare('SELECT * FROM learning_items').all()) {
      const owner = it.proposal_id ? db.prepare('SELECT state FROM proposals WHERE id = ?').get(it.proposal_id) : db.prepare('SELECT state FROM screening_reviews WHERE id = ?').get(it.review_id);
      const n = db.prepare('SELECT COUNT(*) AS n FROM assignments WHERE item_id = ?').get(it.id).n;
      if (it.published && owner?.state !== 'approved') p.push(`item ${it.id}: published but owner is ${owner?.state}`);
      if (!it.published && n) p.push(`item ${it.id}: unpublished but has assignments`);
      if (it.published) for (const m of teamOf(db, it.role_id)) if (!db.prepare('SELECT 1 FROM assignments WHERE item_id = ? AND recruiter_id = ?').get(it.id, m.id)) p.push(`item ${it.id}: no assignment for ${m.id}`);
      if (it.kind === 'study' && !unjson(it.detail_json).prompt) p.push(`item ${it.id}: study item without prompt`);
    }
    return p;
  }],
  ['completions are evidence: published item, valid answer', (db: Db) => {
    const p: any[] = [];
    for (const c of db.prepare('SELECT * FROM completions').all()) {
      const it = getItem(db, c.item_id);
      if (!it?.published) { p.push(`completion ${c.id}: item not published`); continue; }
      const res = checkCompletion(it, { response: c.response, accepted: unjson(c.accepted_json) || [], none_needed: !!unjson(c.result_json).none_needed });
      if (!res.passed) p.push(`completion ${c.id} (${c.recruiter_id}, item ${c.item_id}): does not satisfy the ${it.kind} rule`);
    }
    return p;
  }],
  ['client decisions have a review checked against the historical brief', (db: Db) => {
    const p: any[] = [];
    for (const s of live(db).filter((x: any) => x.channel === 'client-decision')) {
      const q = db.prepare('SELECT * FROM screening_reviews WHERE source_row_id = ?').get(s.id);
      if (!q) { p.push(`${s.source_id}: no screening review`); continue; }
      if (q.status === 'insufficient_evidence') { if (q.screening_source_id) p.push(`${s.source_id}: insufficient_evidence but cites a screening`); continue; }
      const scr = db.prepare("SELECT * FROM sources WHERE source_id = ? AND status <> 'superseded'").get(q.screening_source_id);
      if (!scr) { p.push(`${s.source_id}: screening ${q.screening_source_id} not found`); continue; }
      if (scr.date > s.date) p.push(`${s.source_id}: screening is dated after the decision`);
      const snapshot = unjson(q.must_have_snapshot_json);
      const ver = getVersion(db, q.role_id, q.brief_version_at_screening);
      if (JSON.stringify(snapshot) !== JSON.stringify(mustHaves(ver?.fields))) p.push(`${s.source_id}: snapshot differs from brief v${q.brief_version_at_screening}`);
      const ids = new Set(snapshot.map((x: any) => x.criterion));
      const cov = unjson(q.coverage_json);
      const later = new Set(cov.filter((c: any) => !ids.has(c.criterion)).map((c: any) => c.criterion));
      p.push(...checkReview({ candidate: q.candidate, screening: scr.source_id, coverage: cov, overweighted: unjson(q.overweighted_json) },
        { decision: unjson(q.decision_json), screening: scr, snapshot, laterCriteria: later }).map((e) => `${s.source_id}: ${e}`));
    }
    return p;
  }],
  ['decided sources record stage 7 (publish) or are still waiting', (db: Db) => {
    const p: any[] = [];
    for (const s of live(db)) {
      const pending = db.prepare("SELECT 1 FROM proposals WHERE source_row_id = ? AND state = 'proposed' UNION SELECT 1 FROM screening_reviews WHERE source_row_id = ? AND state = 'proposed'").get(s.id, s.id);
      const has7 = stageRows(db, s.id).some((r: any) => r.stage === 7);
      if (!pending && !has7) p.push(`${s.source_id}: everything decided but stage 7 is not recorded`);
      if (pending && has7) p.push(`${s.source_id}: stage 7 recorded while a proposal is still open`);
    }
    return p;
  }],
  ['every approval and rejection has an audit row', (db: Db) => {
    const p: any[] = [];
    for (const [t, tbl] of [['proposal', 'proposals'], ['review', 'screening_reviews']]) {
      for (const r of db.prepare(`SELECT id, state FROM ${tbl} WHERE state IN ('approved','rejected')`).all()) {
        if (!db.prepare('SELECT 1 FROM approvals WHERE target_type = ? AND target_id = ? AND action = ?').get(t, r.id, r.state === 'approved' ? 'approve' : 'reject')) p.push(`${t} ${r.id}: ${r.state} without an approvals row`);
      }
    }
    return p;
  }],
];

export function runChecks(db: Db) {
  return (CHECKS as any[]).map(([name, fn]) => {
    let problems: any;
    try { problems = fn(db); } catch (e) { problems = [`check crashed: ${e.message}`]; }
    return { name, ok: problems.length === 0, problems };
  });
}
