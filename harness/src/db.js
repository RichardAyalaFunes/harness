// SQLite access (node:sqlite, no native build) and schema migrations via PRAGMA user_version.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = process.env.HARNESS_DB || path.join(ROOT, 'harness.db');

const MIGRATIONS = [
  `
CREATE TABLE clients(id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER, stage TEXT);
CREATE TABLE recruiters(id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE roles(id TEXT PRIMARY KEY, client_id TEXT NOT NULL, title TEXT NOT NULL, lead_id TEXT);
CREATE TABLE role_recruiters(role_id TEXT NOT NULL, recruiter_id TEXT NOT NULL, PRIMARY KEY(role_id, recruiter_id));
CREATE TABLE candidates(id INTEGER PRIMARY KEY AUTOINCREMENT, role_id TEXT NOT NULL, name TEXT NOT NULL, stage INTEGER NOT NULL DEFAULT 0);

-- one row per (source_id, body hash); a changed file supersedes the old row
CREATE TABLE sources(
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, client_id TEXT, role_ref TEXT, role_id TEXT,
  scope TEXT NOT NULL, channel TEXT, date TEXT, author TEXT, title TEXT, candidate TEXT, decision TEXT,
  path TEXT, hash TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  ingest_order INTEGER NOT NULL, ingested_at TEXT NOT NULL);
CREATE UNIQUE INDEX sources_live ON sources(source_id) WHERE status <> 'superseded';

CREATE TABLE stage_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, source_row_id INTEGER NOT NULL, source_id TEXT NOT NULL,
  stage INTEGER NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('passed','failed','skipped')),
  check_result TEXT NOT NULL, skip_reason TEXT, created_at TEXT NOT NULL, UNIQUE(source_row_id, stage));

CREATE TABLE analyses(
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_row_id INTEGER NOT NULL UNIQUE, model TEXT, raw TEXT,
  parsed TEXT NOT NULL, summary TEXT, no_change INTEGER NOT NULL, truncated INTEGER NOT NULL DEFAULT 0);

CREATE TABLE proposals(
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_row_id INTEGER NOT NULL, role_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'proposed', severity TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'source',
  corrects INTEGER, version_created INTEGER, decided_by TEXT, decided_at TEXT, reason TEXT, created_at TEXT NOT NULL);

CREATE TABLE changes(
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_row_id INTEGER NOT NULL, role_id TEXT NOT NULL, proposal_id INTEGER,
  field TEXT NOT NULL, op TEXT NOT NULL, value TEXT, old_value TEXT, old_weight TEXT, severity TEXT NOT NULL, quote TEXT NOT NULL,
  start INTEGER, "end" INTEGER, weight TEXT, status TEXT, bias_kind TEXT, bias_note TEXT, confirmed INTEGER,
  conflicts_with TEXT, noop INTEGER NOT NULL DEFAULT 0);

CREATE TABLE brief_versions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, role_id TEXT NOT NULL, n INTEGER NOT NULL, proposal_id INTEGER,
  source_id TEXT, effective_date TEXT, fields_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(role_id, n));

CREATE TABLE approvals(
  id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, action TEXT NOT NULL,
  actor TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL);

CREATE TABLE screening_reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_row_id INTEGER NOT NULL, role_id TEXT NOT NULL, candidate TEXT NOT NULL,
  screening_source_id TEXT, brief_version_at_screening INTEGER, must_have_snapshot_json TEXT NOT NULL,
  coverage_json TEXT NOT NULL, overweighted_json TEXT NOT NULL, suggested_json TEXT NOT NULL,
  status TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT 'retrospective', decision_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'proposed', decided_by TEXT, decided_at TEXT, reason TEXT);

CREATE TABLE learning_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT, role_id TEXT NOT NULL, proposal_id INTEGER, review_id INTEGER,
  version_n INTEGER, kind TEXT NOT NULL CHECK(kind IN ('ack','study','review')), field TEXT, title TEXT NOT NULL,
  detail_json TEXT NOT NULL, source_id TEXT, published INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE assignments(item_id INTEGER NOT NULL, recruiter_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(item_id, recruiter_id));
CREATE TABLE completions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, recruiter_id TEXT NOT NULL, role_id TEXT NOT NULL, version INTEGER,
  item_id INTEGER NOT NULL, kind TEXT NOT NULL, response TEXT, accepted_json TEXT, result_json TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE(recruiter_id, item_id));
`,
];

export function openDb(file = DB_PATH) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db) {
  let v = db.prepare('PRAGMA user_version').get().user_version;
  while (v < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      v += 1;
      db.exec(`PRAGMA user_version = ${v}`);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return v;
}

export function resetDbFiles(file = DB_PATH) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(file + suffix, { force: true });
}

// Run fn in a transaction; roll back on throw. Nesting is not supported (and not needed).
export function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const now = () => new Date().toISOString();
export const json = (x) => JSON.stringify(x ?? null);
export const unjson = (s) => (s == null ? null : JSON.parse(s));
