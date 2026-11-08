// Stage 1 inputs: parse source files (front-matter + body), hash, register idempotently.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tx, now } from './db.js';

export const normalise = (s) => s.replace(/\r\n?/g, '\n');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function parseSource(text) {
  const t = normalise(text).replace(/^﻿/, '');
  const m = t.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: t };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: t.slice(m[0].length) };
}

export function listSourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|txt)$/.test(e.name)) out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

// Register one parsed source. Returns {source_id, action: new|unchanged|superseded|invalid, row_id?}.
export function registerSource(db, meta, body, relPath = '') {
  if (!meta.id) return { source_id: null, action: 'invalid', error: `missing front-matter id in ${relPath}` };
  const hash = sha256(body);
  const live = db.prepare("SELECT * FROM sources WHERE source_id = ? AND status <> 'superseded'").get(meta.id);
  if (live && live.hash === hash) return { source_id: meta.id, action: 'unchanged', row_id: live.id };
  return tx(db, () => {
    if (live) {
      db.prepare("UPDATE sources SET status = 'superseded' WHERE id = ?").run(live.id);
      // Open proposals/reviews of the old text can no longer be approved; they stay for audit.
      db.prepare("UPDATE proposals SET state = 'superseded' WHERE source_row_id = ? AND state = 'proposed'").run(live.id);
      db.prepare("UPDATE screening_reviews SET state = 'superseded' WHERE source_row_id = ? AND state = 'proposed'").run(live.id);
    }
    const order = db.prepare('SELECT COALESCE(MAX(ingest_order), 0) + 1 AS n FROM sources').get().n;
    const isCompany = meta.role === 'company';
    const r = db.prepare(`INSERT INTO sources(source_id, client_id, role_ref, role_id, scope, channel, date, author, title,
      candidate, decision, path, hash, body, status, ingest_order, ingested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(meta.id, meta.client ?? null, meta.role ?? null, isCompany ? null : meta.role ?? null, isCompany ? 'company' : 'role',
        meta.channel ?? null, meta.date ?? null, meta.author ?? null, meta.title ?? null, meta.candidate ?? null,
        meta.decision ?? null, relPath, hash, body, 'active', order, now());
    return { source_id: meta.id, action: live ? 'superseded' : 'new', row_id: Number(r.lastInsertRowid) };
  });
}

export function ingestAll(db, dir) {
  const files = listSourceFiles(dir).map((f) => {
    const { meta, body } = parseSource(fs.readFileSync(f, 'utf8'));
    return { f, meta, body };
  });
  files.sort((a, b) => (a.meta.date || '').localeCompare(b.meta.date || '') || (a.meta.id || '').localeCompare(b.meta.id || ''));
  return files.map(({ f, meta, body }) => ({
    ...registerSource(db, meta, body, path.relative(dir, f).split(path.sep).join('/')),
    file: path.basename(f),
  }));
}

export const liveSources = (db) =>
  db.prepare("SELECT * FROM sources WHERE status <> 'superseded' ORDER BY date, ingest_order").all();
export const sourceById = (db, sourceId) =>
  db.prepare("SELECT * FROM sources WHERE source_id = ? AND status <> 'superseded'").get(sourceId);
