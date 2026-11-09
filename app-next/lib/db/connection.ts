// One connection per database path, cached on globalThis so dev hot reload reuses it.
// Pragmas on open; migrations versioned with PRAGMA user_version, read AFTER the write lock is taken.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dbPath } from '../paths.ts';

const MIGRATIONS = [
  'CREATE TABLE pings(id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT NOT NULL, created_at TEXT NOT NULL)',
];

type Cache = Map<string, DatabaseSync>;
const g = globalThis as typeof globalThis & { __radhiresDb?: Cache };

export function openDb(file: string = dbPath()): DatabaseSync {
  const abs = file === ':memory:' ? file : path.resolve(file);
  const cache = (g.__radhiresDb ??= new Map());
  const hit = cache.get(abs);
  if (hit) return hit;
  if (abs !== ':memory:') fs.mkdirSync(path.dirname(abs), { recursive: true });
  const db = new DatabaseSync(abs);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON');
  db.exec('BEGIN IMMEDIATE');
  try {
    let v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    for (; v < MIGRATIONS.length; v++) db.exec(MIGRATIONS[v]!);
    db.exec(`PRAGMA user_version = ${v}`);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  cache.set(abs, db);
  return db;
}

export function closeAll(): void {
  for (const db of g.__radhiresDb?.values() ?? []) db.close();
  g.__radhiresDb = new Map();
}
