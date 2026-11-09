// Command line: pnpm harness <command>. Runs the same domain code as the web app. Every command is one "cli" trace.
import path from 'node:path';
import { openDb, closeAll, resetDbFiles, DB_PATH } from '../lib/db/connection.ts';
import { ROOT } from '../lib/paths.ts';
import { ingestAll } from '../lib/domain/sources.ts';
import { getModel, loadEnv } from '../lib/model/index.ts';
import { runAll } from '../lib/domain/pipeline.ts';
import { rebuild } from '../lib/domain/seed.ts';
import { currentVersion, getVersion, diff, briefFields } from '../lib/domain/brief.ts';
import { teamStatus } from '../lib/domain/learning.ts';
import { approveProposal, rejectProposal, approveReview, rejectReview } from '../lib/domain/approvals.ts';
import { stagesView } from '../lib/domain/views.ts';
import { runChecks } from '../lib/domain/consistency.ts';
import { lastTraceId, pruneTraces, renderTrace, withTrace } from '../lib/obs/tracer.ts';
import { parseEnv } from '../lib/contracts/env.ts';

loadEnv();

const [cmd, ...rest] = process.argv.slice(2);
const flags: Record<string, string | true> = {};
const args: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (a.startsWith('--')) { const k = a.slice(2); const nxt = rest[i + 1]; if (nxt === undefined || nxt.startsWith('--')) flags[k] = true; else { flags[k] = nxt; i++; } }
  else args.push(a);
}
const pad = (s: unknown, n: number) => String(s).padEnd(n).slice(0, Math.max(n, String(s).length));
const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fail = (m: string): never => { throw new Error(m); };

// read-only inspection commands are not traced (they would fill the trace store with noise)
const TRACED = new Set(['rebuild', 'ingest', 'run', 'approve', 'reject']);

async function main(): Promise<number> {
  parseEnv(); // a clear error for an invalid .env, never showing values
  switch (cmd) {
    case 'rebuild': {
      // recreate the file first, so the trace root lives in the new database; rebuild() then must not reset it again
      resetDbFiles(DB_PATH);
      openDb(DB_PATH);
      return withTrace({ kind: 'cli', name: 'cli.rebuild', attrs: { command: 'rebuild', model: getModel().name } }, async (traceId) => {
        await rebuild({ model: getModel(), reset: false, log: (m: string) => console.log(m) }); // the connection stays open until the trace is written
        console.log(`rebuilt ${path.relative(process.cwd(), DB_PATH) || DB_PATH} (model: ${getModel().name}, trace ${traceId})`);
        return 0;
      });
    }
    case 'ingest': {
      const db = openDb();
      return withTrace({ kind: 'cli', name: 'cli.ingest', attrs: { command: 'ingest' } }, async () => {
        for (const r of ingestAll(db, path.join(ROOT, 'data', 'sources'))) console.log(`${pad(r.action, 11)} ${pad(r.source_id ?? '?', 6)} ${r.file}${r.error ? ` (${r.error})` : ''}`);
        return 0;
      });
    }
    case 'run': {
      const db = openDb();
      return withTrace({ kind: 'cli', name: 'cli.run', attrs: { command: 'run', model: getModel().name } }, async () => {
        const out = await runAll(db, { model: getModel(), force: !!flags.force, only: args[0] ?? null });
        for (const r of out) console.log(`${pad(r.source_id, 6)} ${r.stages.map((s: any) => `${s.stage}:${s.status}`).join(' ')}${r.failedAt ? `  FAILED at stage ${r.failedAt}` : ''}`);
        return out.some((r: any) => r.failedAt) ? 1 : 0;
      });
    }
    case 'brief': {
      const db = openDb();
      const v = flags.version ? getVersion(db, args[0], Number(flags.version)) : currentVersion(db, args[0]);
      if (!v) { console.error(`no brief for ${args[0]}${flags.version ? ` v${flags.version}` : ''}`); return 1; }
      console.log(`${args[0]} brief v${v.n} (from ${v.source_id}, ${v.effective_date})`);
      for (const f of briefFields(v)) {
        const tags = [f.weight, f.status, f.bias ? `bias:${f.bias.kind}` : null, f.confirmed === false ? 'unconfirmed' : null].filter(Boolean).join(', ');
        console.log(`  ${pad(f.field, 30)} ${short(String(f.value), 60)}${tags ? `  [${tags}]` : ''}  <- ${f.source_id}`);
      }
      return 0;
    }
    case 'diff': {
      const db = openDb();
      for (const d of diff(db, args[0], Number(args[1]), Number(args[2]))) {
        if (d.kind === 'same') continue;
        console.log(`${pad(d.kind, 8)} ${pad(d.field, 30)} ${d.from ? short(`${d.from.value}${d.from.weight ? ` (${d.from.weight})` : ''}`, 40) : '-'}  ->  ${d.to ? short(`${d.to.value}${d.to.weight ? ` (${d.to.weight})` : ''}`, 40) : '-'}`);
      }
      return 0;
    }
    case 'team': {
      const db = openDb();
      for (const t of teamStatus(db, args[0])) console.log(`${pad(t.name, 14)} ${t.done}/${t.total} done  ${t.up_to_date ? 'up to date' : `${t.pending} pending`}  (confirm ${t.by_kind.ack.done}/${t.by_kind.ack.total}, study ${t.by_kind.study.done}/${t.by_kind.study.total}, review ${t.by_kind.review.done}/${t.by_kind.review.total})`);
      return 0;
    }
    case 'approve': case 'reject': {
      const db = openDb();
      const id = Number(args[0]);
      if (!flags.by || flags.by === true) fail('--by <recruiter> is required');
      const by = flags.by as string;
      return withTrace({ kind: 'cli', name: `cli.${cmd}`, attrs: { command: cmd } }, async () => {
        if (cmd === 'approve') console.log(JSON.stringify(flags.review ? approveReview(db, id, by) : approveProposal(db, id, by)));
        else {
          if (!flags.reason || flags.reason === true) fail('--reason "..." is required');
          const reason = flags.reason as string;
          console.log(JSON.stringify(flags.review ? rejectReview(db, id, by, reason) : rejectProposal(db, id, by, reason)));
        }
        return 0;
      });
    }
    case 'stages': {
      const db = openDb();
      for (const r of stagesView(db, (args[0] ?? null) as any)) {
        const detail = r.skip_reason ? `skip: ${r.skip_reason}` : r.check?.errors ? `ERRORS: ${r.check.errors.join('; ')}` : short(JSON.stringify(r.check), 110);
        console.log(`${pad(r.source_id, 6)} ${r.stage} ${pad(r.name, 22)} ${pad(r.status, 8)} ${detail}`);
      }
      return 0;
    }
    case 'check': {
      const db = openDb();
      const res = runChecks(db);
      for (const c of res) {
        console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
        for (const p of c.problems) console.log(`        - ${p}`);
      }
      const bad = res.filter((c) => !c.ok).length;
      console.log(bad ? `\n${bad} of ${res.length} checks FAILED` : `\nall ${res.length} checks passed`);
      return bad ? 1 : 0;
    }
    case 'trace': {
      const db = openDb();
      if (args[0] === 'prune') {
        const days = Number(String(flags['older-than'] ?? `${parseEnv().TRACE_RETENTION_DAYS}d`).replace(/d$/, ''));
        if (!Number.isFinite(days) || days < 0) fail('--older-than <days>d, for example 7d');
        console.log(`deleted ${pruneTraces(db, { olderThanDays: days })} finished traces older than ${days} days (running traces are never deleted; the space is reclaimed on VACUUM)`);
        return 0;
      }
      const id = flags.last || !args[0] ? lastTraceId(db) : args[0];
      if (!id) { console.error('no traces yet'); return 1; }
      console.log(renderTrace(db, id));
      return 0;
    }
    default:
      console.log('usage: pnpm harness rebuild | ingest | run [source_id] [--force] | brief <role> [--version n] | diff <role> <v1> <v2> | team <role>\n' +
        '       | approve <id> --by <recruiter> [--review] | reject <id> --by <id> --reason ".." [--review] | stages [source_id] | check\n' +
        '       | trace [<trace id> | --last] | trace prune [--older-than 7d]');
      return cmd ? 1 : 0;
  }
}
void TRACED;

main().then((code) => { closeAll(); process.exitCode = code; }, (e) => { console.error(`error: ${e.message}`); closeAll(); process.exitCode = 1; });
