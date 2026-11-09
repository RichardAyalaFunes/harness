// SQLite access (node:sqlite, no native build) and schema migrations via PRAGMA user_version.
// One connection per database file, cached on globalThis so dev hot reload and the API reuse it.
// ":memory:" is never cached (tests want a fresh database each time).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT, dbPath } from '../paths.ts';

export { ROOT };
// Rows are deliberately loose (`any`): SQLite columns are parsed and validated at the edges (contracts, checks),
// not by a generic row type. Everything below the database sees this small interface.
export interface Stmt { get(...a: any[]): any; all(...a: any[]): any[]; run(...a: any[]): { changes: number | bigint; lastInsertRowid: number | bigint } }
export interface Db { exec(sql: string): void; prepare(sql: string): Stmt; close(): void }
export const DB_PATH = dbPath();

export const MIGRATIONS: string[] = [
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
  corrects INTEGER, base_version INTEGER NOT NULL DEFAULT 0, version_created INTEGER, decided_by TEXT, decided_at TEXT, reason TEXT, created_at TEXT NOT NULL);

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

type Cache = Map<string, DatabaseSync>;
const g = globalThis as typeof globalThis & { __radhiresDb?: Cache };
const cache = (): Cache => (g.__radhiresDb ??= new Map());

export function openDb(file: string = DB_PATH): Db {
  const memory = file === ':memory:';
  const abs = memory ? file : path.resolve(file);
  if (!memory) { const hit = cache().get(abs); if (hit) return hit as unknown as Db; fs.mkdirSync(path.dirname(abs), { recursive: true }); }
  const db = new DatabaseSync(abs);
  db.exec('PRAGMA busy_timeout = 5000');
  if (!memory) db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  if (!memory) cache().set(abs, db);
  return db as unknown as Db;
}

// The version is read after the write lock is taken, so two processes starting together migrate once.
export function migrate(db: Db): number {
  db.exec('BEGIN IMMEDIATE');
  try {
    let v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    while (v < MIGRATIONS.length) { db.exec(MIGRATIONS[v]!); v += 1; }
    db.exec(`PRAGMA user_version = ${v}`);
    db.exec('COMMIT');
    return v;
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function closeDb(file: string = DB_PATH): void {
  const abs = path.resolve(file);
  const hit = cache().get(abs);
  if (hit) { try { hit.close(); } catch { /* already closed */ } cache().delete(abs); }
}

export function closeAll(): void {
  for (const db of cache().values()) { try { db.close(); } catch { /* already closed */ } }
  cache().clear();
}

export function resetDbFiles(file: string = DB_PATH): void {
  closeDb(file);
  for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(file + suffix, { force: true });
}

// Run fn in a transaction; roll back on throw. Nesting is not supported (and not needed).
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const now = () => new Date().toISOString();
export const json = (x: unknown) => JSON.stringify(x ?? null);
export const unjson = (s: string | null | undefined): any => (s == null ? null : JSON.parse(s));
