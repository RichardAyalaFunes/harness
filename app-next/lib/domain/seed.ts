// Seed data (clients, recruiters, roles, candidates), seed approvals and seed completions, and the full rebuild.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, openDb, resetDbFiles, DB_PATH } from '../db/connection.ts';
import { ingestAll } from './sources.ts';
import { runSource } from './pipeline.ts';
import { approveProposal, approveReview } from './approvals.ts';
import { completeItem, publishedItems } from './learning.ts';
import type { Db } from '../db/connection.ts';

export const SEED_ACTOR = 'lead (seed)';
export const LEFT_PROPOSED = ['ks-04']; // demo: Kestrel's location/age email stays unapproved so the UI shows the approval step

export function loadSeed(db: Db, seed: any) {
  for (const c of seed.clients) db.prepare('INSERT INTO clients(id, name, size, stage) VALUES (?,?,?,?)').run(c.id, c.name, c.size ?? null, c.stage ?? null);
  for (const r of seed.recruiters) db.prepare('INSERT INTO recruiters(id, name) VALUES (?,?)').run(r.id, r.name);
  for (const r of seed.roles) {
    db.prepare('INSERT INTO roles(id, client_id, title, lead_id) VALUES (?,?,?,?)').run(r.id, r.client, r.title, r.lead ?? null);
    for (const m of r.recruiters) db.prepare('INSERT INTO role_recruiters(role_id, recruiter_id) VALUES (?,?)').run(r.id, m);
  }
  for (const c of seed.candidates) db.prepare('INSERT INTO candidates(role_id, name, stage) VALUES (?,?,?)').run(c.role, c.name, c.stage);
}

export function seedApprovals(db: Db, rowId: any, sourceId: any) {
  if (LEFT_PROPOSED.includes(sourceId)) return [];
  const out: any[] = [];
  for (const p of db.prepare("SELECT id FROM proposals WHERE source_row_id = ? AND state = 'proposed'").all(rowId)) out.push(approveProposal(db, p.id, SEED_ACTOR));
  for (const r of db.prepare("SELECT id FROM screening_reviews WHERE source_row_id = ? AND state = 'proposed'").all(rowId)) out.push(approveReview(db, r.id, SEED_ACTOR));
  return out;
}

// Northwind backend: Luis and Marta did everything, Jon only the confirm items, Ana (the demo user) nothing. Kestrel: nothing.
export function seedCompletions(db: Db) {
  const items = publishedItems(db, 'nw-be');
  const say = { response: 'Seeded demo answer: I would ask for one concrete example I can verify, and what changed afterwards.' };
  for (const it of items) {
    const input: any = it.kind === 'review' ? { accepted: (it.detail.suggested || []).map((_: any, i: any) => i) } : it.kind === 'study' ? say : {};
    if (it.kind === 'review' && !input.accepted.length) { input.none_needed = true; input.response = 'Seeded demo: nothing further needed here.'; }
    for (const who of ['luis', 'marta']) completeItem(db, it.id, who, input);
    if (it.kind === 'ack') completeItem(db, it.id, 'jon', {});
  }
}

export async function rebuild({ model, dataDir = path.join(ROOT, 'data'), file = DB_PATH, log = (_m: string) => {} }: any = {}) {
  resetDbFiles(file);
  const db = openDb(file);
  loadSeed(db, JSON.parse(fs.readFileSync(path.join(dataDir, 'seed', 'seed.json'), 'utf8')));
  const ing = ingestAll(db, path.join(dataDir, 'sources'));
  log(`ingested ${ing.length} sources`);
  // Sources are processed in date order; seed approvals follow each source so the next source sees the approved brief.
  const rows = db.prepare("SELECT id, source_id FROM sources WHERE status <> 'superseded' ORDER BY date, ingest_order").all();
  for (const r of rows) {
    const run = await runSource(db, r.id, { model });
    const ap = run.failedAt ? [] : seedApprovals(db, r.id, r.source_id);
    log(`${r.source_id}: ${run.stages.map((s: any) => s.status[0]).join('')}${run.failedAt ? ` FAILED at stage ${run.failedAt}` : ''}${ap.length ? ` approved ${ap.length}` : ''}`);
  }
  seedCompletions(db);
  return db;
}
