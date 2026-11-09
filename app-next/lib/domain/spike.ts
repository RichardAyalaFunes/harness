// The spike slice: touches every moving part (zod contract, prompt file, sqlite, root-anchored paths).
import fs from 'node:fs';
import path from 'node:path';
import { PingBody } from '../contracts/spike.ts';
import { openDb } from '../db/connection.ts';
import { PROMPTS_DIR, ROOT } from '../paths.ts';

export function recordPing(input: unknown) {
  const { note } = PingBody.parse(input);
  const db = openDb();
  const info = db.prepare('INSERT INTO pings(note, created_at) VALUES (?, ?)').run(note, new Date().toISOString());
  const count = (db.prepare('SELECT COUNT(*) AS n FROM pings').get() as { n: number }).n;
  return { id: Number(info.lastInsertRowid), count };
}

export function status() {
  const db = openDb();
  const count = (db.prepare('SELECT COUNT(*) AS n FROM pings').get() as { n: number }).n;
  const prompt = fs.readFileSync(path.join(PROMPTS_DIR, 'contract.md'), 'utf8');
  return { root: ROOT, node: process.version, pings: count, prompt_chars: prompt.length, prompt_first_line: prompt.split(/\r?\n/)[0] };
}
