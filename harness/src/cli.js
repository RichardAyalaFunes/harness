// Command line: pnpm harness <command>
import path from 'node:path';
import { openDb, DB_PATH, ROOT } from './db.js';
import { ingestAll } from './sources.js';
import { getModel } from './model/index.js';
import { runAll } from './pipeline.js';
import { rebuild } from './seed.js';
import { currentVersion, getVersion, diff, briefFields } from './brief.js';
import { teamStatus } from './learning.js';
import { approveProposal, rejectProposal, approveReview, rejectReview } from './approvals.js';
import { stagesView } from './views.js';
import { runChecks } from './consistency.js';

const [cmd, ...rest] = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) { const k = rest[i].slice(2); const nxt = rest[i + 1]; if (nxt === undefined || nxt.startsWith('--')) flags[k] = true; else { flags[k] = nxt; i++; } }
  else args.push(rest[i]);
}
const pad = (s, n) => String(s).padEnd(n).slice(0, Math.max(n, String(s).length));
const short = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function main() {
  switch (cmd) {
    case 'rebuild': {
      const db = await rebuild({ model: getModel(), log: (m) => console.log(m) });
      console.log(`rebuilt ${path.relative(process.cwd(), DB_PATH) || DB_PATH} (model: ${getModel().name})`);
      db.close();
      return 0;
    }
    case 'ingest': {
      const db = openDb();
      for (const r of ingestAll(db, path.join(ROOT, 'data', 'sources'))) console.log(`${pad(r.action, 11)} ${pad(r.source_id ?? '?', 6)} ${r.file}${r.error ? ` (${r.error})` : ''}`);
      return 0;
    }
    case 'run': {
      const db = openDb();
      const out = await runAll(db, { model: getModel(), force: !!flags.force, only: args[0] ?? null });
      for (const r of out) console.log(`${pad(r.source_id, 6)} ${r.stages.map((s) => `${s.stage}:${s.status}`).join(' ')}${r.failedAt ? `  FAILED at stage ${r.failedAt}` : ''}`);
      return out.some((r) => r.failedAt) ? 1 : 0;
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
      if (!flags.by) throw new Error('--by <recruiter> is required');
      if (cmd === 'approve') console.log(JSON.stringify(flags.review ? approveReview(db, id, flags.by) : approveProposal(db, id, flags.by)));
      else {
        if (!flags.reason || flags.reason === true) throw new Error('--reason "..." is required');
        console.log(JSON.stringify(flags.review ? rejectReview(db, id, flags.by, flags.reason) : rejectProposal(db, id, flags.by, flags.reason)));
      }
      return 0;
    }
    case 'stages': {
      const db = openDb();
      for (const r of stagesView(db, args[0] ?? null)) {
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
    default:
      console.log('usage: pnpm harness rebuild | ingest | run [source_id] [--force] | brief <role> [--version n] | diff <role> <v1> <v2> | team <role>\n' +
        '       | approve <id> --by <recruiter> [--review] | reject <id> --by <id> --reason ".." [--review] | stages [source_id] | check');
      return cmd ? 1 : 0;
  }
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(`error: ${e.message}`); process.exitCode = 1; });
