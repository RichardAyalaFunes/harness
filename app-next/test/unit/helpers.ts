// Test helpers: an in-memory database, a temp replay folder and tiny builders for sources and model outputs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../lib/db/connection.ts';
import { loadSeed } from '../../lib/domain/seed.ts';
import { registerSource } from '../../lib/domain/sources.ts';
import { createReplayModel } from '../../lib/model/replay.ts';
import { runSource } from '../../lib/domain/pipeline.ts';
import { approveProposal } from '../../lib/domain/approvals.ts';

export const SEED = {
  clients: [{ id: 'acme', name: 'Acme', size: 10, stage: 'A' }, { id: 'other', name: 'Other', size: 5, stage: 'Seed' }],
  recruiters: [{ id: 'ana', name: 'Ana' }, { id: 'luis', name: 'Luis' }, { id: 'marta', name: 'Marta' }],
  roles: [
    { id: 'r1', client: 'acme', title: 'Backend', recruiters: ['ana', 'luis'], lead: 'ana' },
    { id: 'r2', client: 'acme', title: 'Data', recruiters: ['ana'], lead: 'ana' },
    { id: 'o1', client: 'other', title: 'Other role', recruiters: ['marta'], lead: 'marta' },
  ],
  candidates: [{ role: 'r1', name: 'C. One', stage: 0 }, { role: 'r1', name: 'C. Two', stage: 1 }],
};

// change(field, op, value, quote, severity, extra)
export const change = (field: any, op: any, value: any, quote: any, severity = 'material', extra = {}) => ({ field, op, value, severity, quote, ...extra });
export const out = (source_id: any, changes: any, extra: any = {}) => ({ source_id, summary: `summary of ${source_id}`, no_change: changes.length === 0, changes, study: [], ...extra });
export const studyEntry = (field: any) => ({ field, prompt: `How would you handle ${field}?`, points: ['one', 'two'], keys: [['alpha'], ['beta']] });

export function makeEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  fs.mkdirSync(path.join(dir, 'replay'));
  const db = openDb(':memory:');
  loadSeed(db, SEED);
  const model = createReplayModel({ dir: path.join(dir, 'replay') });
  const env = {
    db, dir, model,
    add(id: any, meta: any, body: any) { return registerSource(db, { id, client: 'acme', role: 'r1', channel: 'email', date: '2026-10-01', ...meta }, body, `${id}.md`); },
    replay(id: any, o: any) { fs.writeFileSync(path.join(dir, 'replay', `${id}.json`), typeof o === 'string' ? o : JSON.stringify(o)); },
    run(rowId: any, opts?: any) { return runSource(db, rowId, { model, ...opts }); },
    // add a source, write its model output and run the pipeline
    async feed(id: any, meta: any, body: any, output: any, opts?: any) {
      const r = env.add(id, meta, body);
      if (output !== undefined) env.replay(id, output);
      const res = await env.run(r.row_id, opts);
      return { row_id: r.row_id, res, proposal: db.prepare('SELECT * FROM proposals WHERE source_row_id = ? ORDER BY id DESC').get(r.row_id) };
    },
    stages(rowId: any) { return Object.fromEntries(db.prepare('SELECT stage, status FROM stage_runs WHERE source_row_id = ?').all(rowId).map((s) => [s.stage, s.status])); },
    cleanup() { fs.rmSync(dir, { recursive: true, force: true }); },
  };
  return env;
}

export const JD_BODY = 'Backend role.\nStrong Go.\nPostgreSQL under load.\nSalary 70k.\nSenior level.\n';
export const jdOut = (id = 'j1') => out(id, [
  change('req.go', 'add', 'Go', 'Strong Go.', 'material', { weight: 'must' }),
  change('req.postgres', 'add', 'PostgreSQL under load', 'PostgreSQL under load.', 'material', { weight: 'must' }),
  change('offer.budget', 'set', '70k', 'Salary 70k.'),
  change('offer.level', 'set', 'Senior', 'Senior level.'),
]);

// Creates and approves a v1 for r1 from a JD (dated 2026-10-01).
export async function baseline(env: any, roleMeta = {}) {
  const f = await env.feed('j1', { channel: 'jd', ...roleMeta }, JD_BODY, jdOut());
  approveProposal(env.db, f.proposal.id, 'lead');
  return f;
}
