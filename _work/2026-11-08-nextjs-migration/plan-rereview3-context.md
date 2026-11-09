You are re-reviewing a revised migration PLAN (plan gate, pass 4). Do not call any other model. Answer in under 300 words.

In pass 3 you returned PASS WITH CHANGES with 2 material findings: (1) a stale heartbeat does not prove the owner is dead, so you asked for lease plus fencing; (2) I2 contradicted the 404/405 coverage boundary. There was also 1 minor finding: (3) the total bound was underspecified. The dispositions and revision 4 follow.

Question: Are these resolved without new material problems? List the remaining issues by severity, then give a verdict: PASS, PASS WITH CHANGES, or FAIL. Plan-level only; implementation will be reviewed at pre-merge.

=== DISPOSITIONS ===
# Review dispositions (Claude)

## Plan gate, pass 1 (`plan-review.codex.md`): PASS WITH CHANGES

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | The spike is too narrow (real domain graph, no path aliases, assets after build, a different cwd, `server-only`) | material | **Addressed.** P1 now runs a real `lib/` slice from the CLI (another cwd), from route handlers and RSC in dev and prod, and under `node --test`. Added module rules: relative `.ts` imports, no aliases, no `next/*` in `lib/`, root-anchored `lib/paths.ts`, `outputFileTracingIncludes`. |
| 2 | RSC lifecycle and trace coverage are unspecified, plus ALS isolation | material | **Addressed.** Pages use force-dynamic and are read-only; writes go through handlers followed by `router.refresh()`; `withPage` traces page loaders; the trace-header promise is narrowed to instrumented routes and loaders; I8 tests for stale renders; O1 tests concurrent isolation. |
| 3 | A singleton plus WAL is not a concurrency strategy | material | **Addressed.** Connection ownership keyed by absolute path; busy_timeout, foreign_keys; `user_version` migrations under `BEGIN IMMEDIATE`; no model call inside a transaction (verified in the current `pipeline.js`: `callModel` runs before each stage's `BEGIN`); conditional UPDATEs for conflicts; 503 when busy; the I7 tests. |
| 4 | Privacy goes beyond the API key | material | **Addressed.** An attribute allowlist, `TRACE_PAYLOADS=full\|meta\|off`, redaction (keys, auth headers, secret env values, emails, phones) before truncation and persistence, O3 scanning the db, `-wal`, `-shm`, stdout and error bodies, and a note that pruning is logical only. The default `full` is put to the human as NQ5. |
| 5 | Trace consistency semantics | material | **Addressed.** FKs with cascade, indexes, a nullable `stage_runs.trace_id` without an FK ("pruned"), one row per attempt in `llm_calls` with the check stored on the span, buffered flushes after the domain commit, `interrupted` recovery, the total cap and the truncation flag, prune skipping `running` traces, and one `cli` trace per rebuild (O8). |
| 6 | Parity gates overvalue counts and snapshots | material | **Addressed.** The golden workflow capture in P0 (status, headers, body, DB state) happens before any change; the 103 tests may change imports only (diff-checked); `parity-exceptions.md` lists intended changes; the I2/I6 input and error cases; integration runs against a production `next start`; e2e is mandatory for cutover. |
| 7 | Cut ancillary work; NQ4 versus live ordering | minor | **Addressed.** Kept `node:test` (Vitest dropped); deferred cost estimates, db-tx spans and the polished tree; an explicit `issuesToMessages`; the P7 live smoke on the migrated app in addition to the NQ4 baseline. |

## Plan gate, pass 2 (`plan-rereview.codex.md`): PASS WITH CHANGES

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | Age-based recovery can mark another process's live trace as interrupted | material | **Addressed.** `owner_id` plus a 30 s heartbeat; a trace counts as interrupted only when its heartbeat is over 2 minutes old; recovery and prune share the rule; O6 covers the two-process overlap and a dead owner. |
| 2 | Tracing starts after validation, and best-effort persistence conflicts with O5 | material | **Addressed.** `withRoute` creates the trace id and ALS first, so rejections carry an id; persistence is declared best-effort for both the root insert and the flush, with a `trace.persist_failed` warning; O5 and I2 rewritten with failure injection at both points. |
| 3 | The privacy policy and the O3 scope do not match (domain data, diagnostic text) | material | **Addressed.** The policy is scoped to the observability stores, and domain records stay unchanged for parity; a rule for diagnostic text (redact, cap at 500 characters, stack traces only to stdout, validation issues without received values); O3 now asserts per store, includes an exception that echoes source text, and checks `off` mode. |
| 4 | The total cap is not total | minor | **Addressed.** At most 2,000 spans per trace, with `dropped_spans`; O9. |

## Plan gate, pass 3 (`plan-rereview2.codex.md`): PASS WITH CHANGES

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | A stale heartbeat does not prove the owner is dead | material | **Addressed** with lease expiry plus fencing, rather than a claim of liveness: the flush is a conditional UPDATE on owner_id and status running; a lost lease means the buffer is discarded and `trace.lease_lost` logged; failed renewals are logged and retried; prune deletes only finished traces. The O6 cases cover a paused owner, failed renewals and resumption. |
| 2 | I2 contradicts the coverage boundary for 404/405 | material | **Addressed.** An API catch-all gives an instrumented 404; I2 is split into I2a (instrumented, with trace id) and I2b (the framework 405, status only). |
| 3 | The total bound is underspecified | minor | **Addressed.** The payload budget is checked before buffering; attributes capped at 2 KB per span; at most 3 attempt rows; dropped spans are no-ops with no allocation and no kept span has a dropped parent; O9 extended. |

Re-review of revision 4: see `plan-rereview3.codex.md`.

=== PLAN REVISION 4 ===
# Next.js migration plan (revision 4, after three Codex plan-gate passes)

ID 2026-11-08-nextjs-migration · author Claude · planning on branch claude/vibrant-goldstine-051d8a; the implementation gets its own worktree and branch · canonical record: main `_work/2026-11-08-nextjs-migration/`.
Plan gate: Codex returned PASS WITH CHANGES (`plan-review.codex.md`). The findings from passes 1–3 were all accepted and folded in below; see `review-dispositions.claude.md`.

## Input
Human message: `prompts/nextjs-migration/001-user.md`. Intent: rebuild the working harness as one Next.js service (UI plus backend), no container, as lightweight as possible. The goal is to show engineering depth: testing scenarios, validation in both UI and backend, structured logging, and traceability of the AI workflow (inputs, outputs, logs) stored in SQLite. No trace reporting UI.

Earlier the assistant recommended staying on plain Node. The human decided to migrate, so this plan records the costs without re-arguing that decision.

## Objective link
- Primary objective (`knowledge/business.md`): a runnable harness that keeps recruiters current with client needs. The migration must not change that behaviour, only how it is built and how it can be inspected.
- Secondary objective it serves: inspectable evidence of engineering quality (types, contracts, tests, observability).
- Non-goal: new business features. Any behaviour change found during the port goes into `parity-exceptions.md` and is decided explicitly.

## Scope

### In
1. **One Next.js app** (App Router, TypeScript strict) serving the UI and `/api/*` route handlers. It runs with `pnpm dev`, or `pnpm build && pnpm start`. No Docker, and no external services except the optional OpenAI.
2. **Domain parity** with today:
   - the 7-stage pipeline with checks and skips;
   - briefs and versions, the diff and the version matrix;
   - proposals with approve and reject, including the bias rules;
   - screening reviews;
   - learning items, completions and study feedback;
   - Ask about this role;
   - candidates and moving them between stages;
   - the seed and the 13 mock sources;
   - the replay and OpenAI providers;
   - the CLI.
3. **Validation, one source of truth.** Zod schemas in `lib/contracts/` cover:
   - route-handler bodies, params and queries;
   - UI forms, which use the same schema;
   - model outputs (extraction, ask, feedback), with the existing semantic checks layered on top (verbatim quotes, field whitelist, bias status, version rule);
   - environment variables, parsed once with a clear error;
   - API responses, asserted in tests.

   An explicit `issuesToMessages()` maps Zod issues to user text, so the UI and API messages match by construction and are tested, not assumed. The backend also enforces a byte limit while it reads the body; UI checks never replace server checks.
4. **Uniform error contract** for instrumented API routes: `{ error: { code, message, issues?, traceId } }`.

   | Status | Used for |
   |---|---|
   | 400 | validation errors and malformed JSON |
   | 403 | a cross-origin mutation |
   | 404 | an unknown entity |
   | 405 | an unsupported method |
   | 409 | a domain state conflict |
   | 413 | a body that is too large |
   | 415 | the wrong content type |
   | 502 | a model failure |
   | 503 | the database is busy |
   | 500 | anything unexpected, with a generic message |

   No upstream bodies or secrets appear in errors (this is today's rule). The change from today's error shape is listed in `parity-exceptions.md`.
5. **Structured logging.** One JSON line per event on stdout, with level, time, msg, traceId, spanId and fields. `LOG_LEVEL` sets the level, output is pretty-printed in dev, and redaction is applied before anything is written.
6. **Traceability in SQLite.** The data model is shaped like OpenTelemetry, but nothing is exported (details in the Trace design below). There is a basic CLI view (`pnpm harness trace <id>|--last`) and a prune command. No UI.
7. **Tests** in layers, on the built-in `node:test` (see the Test plan below).
8. **UI parity.** The same screens, glass styling, motion system, tooltips, skeletons and reduced-motion behaviour, as React components. The existing CSS moves over as is.
9. Updated README, DESIGN.md (architecture, trace model, privacy policy, real/stub inventory) and readme.html.

### Out
- Auth and real users: the fixed recruiter `ME` stays.
- Deployment and containers.
- Postgres or an ORM.
- A trace UI or reporting.
- An OTel exporter.
- Streaming responses.
- i18n.
- New features.
- A CSS framework.
- Deferred until after parity: estimated cost per call, per-transaction db spans, and a polished trace-tree view.

## Approach

### Stack (exact versions pinned at install, all current stable)
- **Next.js** (App Router) + **React**, **TypeScript** strict, **Zod**: these are the only runtime dependencies.
- **SQLite** via the built-in `node:sqlite` (Node 24.12), so there is no native addon. `lib/db` starts with `import 'server-only'`, and routes and pages declare `runtime = 'nodejs'`.
- **Tests:** keep the built-in **`node:test`** (no Vitest). Node 24 type-stripping runs the `.ts` tests directly, so the 103 existing tests keep their runner and only change imports. **Playwright** handles the end-to-end tests. It is a dev dependency, optional for everyday runs and **mandatory for cutover**.
- **Logger:** an in-repo JSON logger of about 60 lines.
- **CLI:** plain `node` on the `.ts` files (built-in type stripping).
- **OpenAI:** still plain `fetch` with JSON mode, no SDK. Replay stays the default.

### Module rules (so the CLI, tests and Next share one domain graph)
- `lib/` (domain, contracts, model, db, obs) is plain ESM TypeScript using only erasable syntax (tsconfig sets `erasableSyntaxOnly`, `allowImportingTsExtensions`, `noEmit`, `verbatimModuleSyntax`).
- Imports are relative with explicit `.ts` extensions; no path aliases (type-stripping does not resolve them).
- `lib/` must not import from `next/*` or `react`. A lint rule (an ESLint import restriction, or failing that a grep test) enforces this.
- Asset paths (prompts, `data/` sources, replay outputs, the DB file) resolve from one `lib/paths.ts`, anchored at the project root (`HARNESS_ROOT`, default the app folder, found from `import.meta.url`). They never depend on `process.cwd()`. The Next config lists the prompt and data folders in `outputFileTracingIncludes`, so they exist after a build.

### Layout
```
app/                     pages (Server Components, read-only) + app/api/**/route.ts (thin handlers)
components/              client components (tabs, tooltip, details, chat, study card…)
lib/domain/              pipeline, brief, approvals, learning, ask, feedback, consistency, checks
lib/contracts/           zod: api, model outputs, env; issuesToMessages
lib/model/               replay, openai, index, prompts/*.md
lib/db/                  connection owner, migrations
lib/obs/                 logger, tracer (AsyncLocalStorage), withSpan, withRoute, withPage, redact
lib/paths.ts             root-anchored asset/DB paths
cli/harness.ts           rebuild, check, run, trace, trace prune
data/                    mock sources + replay outputs (moved as is)
test/{unit,contract,integration,e2e}
```

### Rendering and request lifecycle
- **Pages are dynamic.** They use `export const dynamic = 'force-dynamic'` and do no fetch caching, so the database is never read at build time and a mutation shows on the next render.
- **Server Components only read.** All writes go through route handlers called by client components, and after a successful write the client refreshes with `router.refresh()`.
- **`withRoute(schema, fn)`** wraps every API handler. It:
  - **first** creates the trace id and enters `AsyncLocalStorage.run`, before any other check, so that a rejected request (400, 403, 413, 415) still has a trace context, an `x-trace-id` header and a `traceId` in its error body;
  - checks the size limit and the content type;
  - parses the JSON and validates it with Zod;
  - checks the same origin on mutations (a missing `Origin` is allowed only on GET; for POST, the header must be present or `Sec-Fetch-Site: same-origin`);
  - maps errors to the error contract;
  - sets `x-trace-id`.
- **`withPage(name, fn)`** wraps page data loaders so that RSC reads produce a `page` trace too.
- **An unknown API path** reaches a catch-all `app/api/[...path]/route.ts`, which returns the contract's 404 with a trace.
- **Not covered.** A 405 for a method a route file does not export is generated by Next, as are page 404s and static assets. These carry no trace header. The promise is limited to **instrumented API routes, the API catch-all and page loaders**, and the docs say so.

### Database ownership and concurrency
- One module (`lib/db/connection.ts`) owns opening the connection. The DB path is resolved to an absolute, normalised path, and the connection is cached on `globalThis` under a key that includes that path. Dev hot reload reuses it, and tests pass their own temp paths.
- Pragmas set on open: `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`.
- Migrations are versioned by `PRAGMA user_version` and each one runs in a transaction (`BEGIN IMMEDIATE`) when the connection opens. The version is read **after** the lock is acquired. They are idempotent, so a second process waits on the busy timeout and then finds them already applied.
- Model calls never run inside a transaction. This is already true for the pipeline today (`callModel` runs before each stage's `BEGIN`) and for study feedback; a test keeps it true.
- Domain conflicts stay atomic. For example, approving uses a conditional `UPDATE … WHERE state='pending'`, and 0 changed rows gives a 409.
- If the database stays locked past the busy timeout, the request gets a 503 and the CLI exits non-zero with a clear message. A request never hangs.

### Trace design
**Tables**
- `traces`: id, name, kind (`http|page|cli`), status (`running|ok|error|interrupted`), started_at, ended_at, owner_id (a random id per process instance), heartbeat_at, attributes_json, truncated (bool), dropped_spans (count).
- `spans`: id, trace_id (FK → traces ON DELETE CASCADE), parent_id, kind (`http|page|pipeline|source|stage|llm|check`), name, start, end, status, attributes_json, error.
- `llm_calls`, **one row per HTTP attempt**:
  - span_id (FK → spans ON DELETE CASCADE) and attempt;
  - provider, model, prompt_id, prompt_sha;
  - request_json and response_raw, both after redaction and then truncation, with original_bytes and truncated flags;
  - status, http_status, latency_ms, and token usage when the provider reports it.

  The logical call is the parent `llm` span, which also stores the semantic check result (pass, or fail with its errors).
- Indexes: spans(trace_id), traces(started_at), llm_calls(span_id).
- `stage_runs.trace_id` is nullable with **no FK**, because a pruned trace leaves the audit row intact and the link then resolves to "pruned".

**Hierarchy.** `pnpm harness rebuild` produces **one** `cli` trace containing one `source` span per source, with `stage`, `llm` and `check` spans under each. An API request produces one `http` trace, and a page render one `page` trace.

**Writing traces**
- Spans are buffered in memory per trace and flushed when the root ends, in their own short transaction after any domain transaction has committed. The root row is inserted at the start with status `running`.
- **Persistence is best-effort, and stated as such.** If the initial root insert or the final flush fails, the response still succeeds and keeps its trace id. A `trace.persist_failed` warning with that trace id is logged. The docs say that a trace id can then be unresolvable.
- **Liveness is a lease with fencing.** No claim is made that an owner is dead.
  - While a root is open, its owner renews `heartbeat_at` every 30 s. This matters for long CLI runs. A failed renewal is logged and retried on the next tick.
  - A `running` root whose lease (2 minutes) has expired may be marked `interrupted` by startup recovery in any process.
  - **Fencing.** The owner's final flush is a conditional `UPDATE traces … WHERE id = ? AND owner_id = ? AND status = 'running'`, and its spans are written only if that updates 1 row. If the lease was lost (a paused process, a blocked event loop, failed renewals), the owner discards its buffer and logs `trace.lease_lost`. This matches the best-effort persistence policy above, and domain data is never affected.
  - `trace prune` deletes only finished traces (`ok`, `error`, `interrupted`) older than the retention period. It never deletes a `running` trace.

**Caps**
- **Payloads.** 64 KB per payload field and 2 MB per trace. The budget is checked **before** buffering, so it bounds memory as well as storage. Past it, further payloads are not buffered and `truncated` is set.
- **Attributes and diagnostics.** At most 2 KB of attributes per span; longer values are cut and marked. Error text is capped at 500 characters.
- **Attempts.** At most 3 attempt rows per logical call (the provider's 2 retries plus the first try).
- **Spans.** At most 2,000 per trace. Past the cap, `startSpan` returns a no-op span without allocating anything, its descendants are no-ops too, and each one increments `dropped_spans`. Kept spans never point to a dropped parent.
- Retention defaults to 7 days. `trace prune` never deletes a `running` trace.

### Privacy policy for traces and logs
- **Scope.** This policy covers the observability stores: `traces`, `spans`, `llm_calls`, the stdout logs and the API error bodies. Domain records (source bodies, study answers, briefs) are stored exactly as today, with no change, for parity. They are synthetic, and the policy for them is unchanged and documented as such.
- The demo data is synthetic, but the trace policy treats it as if it were real.
- **Allowlisted attributes only.** Span attributes come from a per-kind allowlist (ids, counts, statuses, field keys, sizes). Free text never goes into attributes or logs.
- **Payloads are a separate, controlled class.** `TRACE_PAYLOADS=full|meta|off` controls them. The default is `full` for this synthetic demo, because the human wants inputs and outputs traceable. `meta` keeps only sizes and hashes; `off` keeps neither. The default and the reason for it are in the README.
- **Redaction runs before truncation and persistence**, on payloads, attributes, errors and logs:
  - API-key patterns (`sk-…`), `Authorization`/`api-key` headers, and the env values of secret variables, which are removed by value;
  - email addresses and phone numbers.
- **Diagnostic text.** Error messages are redacted and capped at 500 characters before they are written to a span or a log line. Stack traces go only to stdout at error level, after redaction, and never to the DB. Validation issues carry the path, code and expected value, never the received value.
- Pruning deletes logically. The README states that it does not guarantee physical erasure, and that a `VACUUM` is needed to reclaim the space.

## Phases (artifact + acceptance check, rule 13)

| # | Phase | Artifact | Acceptance check |
|---|---|---|---|
| P0 | Baseline | Current branch merged to main (with approval), tag `pre-next`, and **golden capture**: a script drives the old server through scripted workflows and records the status, the relevant headers, the body and a DB state dump after each step | 103 tests green; the golden files are committed under `test/golden/`; the app runs |
| P1 | Spike (time-box 3 h) | `spike.claude.md` | On Windows, the real `lib/` graph slice (Zod contract, prompt-file load, `node:sqlite` write/read, one domain function) runs: (a) from the CLI, started from a **different working directory**; (b) from a route handler and a Server Component under both `next dev` and `next build && next start`; (c) under `node --test`. `server-only` blocks a client import at build; assets resolve after the build. **Fail → stop and decide** (fallbacks: `better-sqlite3`, or keep the Node server) |
| P2 | Contracts + domain port | `lib/contracts`, `lib/domain`, `lib/model`, `lib/db`, `lib/paths` | `tsc --noEmit` is clean. The 103 tests pass against the TS modules, **with assertions unchanged** (a diff check: only import lines may change; any other test edit is listed in `parity-exceptions.md`). The T-C tests pass |
| P3 | Observability | `lib/obs`, migrations, the CLI `trace` commands | T-O tests pass. A replay rebuild yields one `cli` trace with 13 `source` spans; `trace --last` prints it |
| P4 | API parity | `app/api/**/route.ts` for all 13 routes | T-I runs against a **production `next start`** on a temp port and temp DB: it replays the P0 golden workflows and compares status, headers, body and DB state; the only differences are the ones listed in the exceptions file. The new input-error cases pass |
| P5 | UI port | pages, components, the moved CSS | **All T-E journeys pass (mandatory).** A parity checklist is walked in the browser pane (desktop, 375 px, reduced motion), with screenshots saved in evidence |
| P6 | CLI + cutover | `cli/harness.ts`; old `src/server.js` and `web/` removed | `pnpm harness rebuild && pnpm harness check` 12/12; the full suite plus e2e are green; the privacy script finds no `.env` or key in git |
| P7 | Live smoke, docs, gates | README, DESIGN.md, readme.html; Codex pre-merge review | A **short live smoke on the migrated app** (one extraction, one Ask, one study feedback; about 3 calls) passes with `llm_calls` rows recorded. Pre-merge PASS is recorded, then the merge. The final review follows |

The full live run on the **current** app (NQ4) produces the baseline real-model results. The P7 smoke proves that the migrated provider path works. Neither replaces the other.

## Test plan (scenario IDs)

**T-U Unit.** The 103 existing tests with their assertions unchanged, plus new unit tests for redact, issuesToMessages, paths and caps.

**T-C Contracts and validation**
- C1: the five fixtures (bad-severity, non-verbatim, unknown-field, conflict, no-change) behave exactly as today.
- C2: the output schemas accept all 13 stored replay outputs, plus the stub ask and feedback replies.
- C3: field-level 400 errors with `issues[]` for each of these:
  - wrong type, missing field, extra key;
  - a string over its length limit;
  - an invalid id or query parameter (non-numeric `:id`, `from > to`, unknown role).

  `issuesToMessages` gives the same text the UI shows.
- C4: an invalid env (`HARNESS_MODEL=foo`, or `openai` without a key) gives a clear error that never contains the secret value.
- C5: prompt-injection text in a source or a question is treated as data: the checks still apply, and no field outside the whitelist is ever applied.

**T-I Integration (production `next start`, temp DB)**
- I1: golden workflow parity (statuses, headers, bodies, DB state), with the exceptions file as the only allowed difference.
- I2a, instrumented rejections. Each carries `x-trace-id` and a body `traceId`:
  - malformed JSON gives 400;
  - a body over the limit gives 413, whether streamed or sent with a false `Content-Length`;
  - the wrong content type gives 415;
  - an unknown API path gives 404 through the catch-all;
  - a cross-origin POST gives 403, and so does a POST with neither `Origin` nor `Sec-Fetch-Site`.
- I2b, framework responses: an unsupported method on an existing route gives 405, and the status alone is asserted; no trace id is expected.
- I3: domain conflicts give 409: approving a proposal that is already decided, completing an item twice, an invalid candidate move.
- I4: a model failure (faked 500, 429, timeout) gives 502 with a `traceId`. The stage row shows the failure, and there is no silent replay fallback.
- I5: when a study completion's feedback fails, the step still counts as done and the error is shown as advisory.
- I6: an unexpected exception gives 500 with a generic message and a `traceId`. The stack trace goes to the log only.
- I7: concurrency:
  - two simultaneous approvals of the same proposal give exactly one 200 and one 409;
  - a CLI `rebuild` while the server is running ends in a controlled outcome (it succeeds after waiting, or the server returns 503); nothing is corrupted;
  - the migrations run once even when two processes start at the same time.
- I8: after an approval through the API, the page shows the new brief version on the next render (no stale cache).

**T-O Observability**
- O1: one request gives one trace, and the span parents and times nest correctly. Concurrent requests (20 in parallel) never mix spans between traces, including across awaits and thrown errors.
- O2: the `llm_calls` rows for one logical call with 2 retries come out as 3 attempt rows under one `llm` span. The span carries the check result, for both pass and fail.
- O3: privacy. A faked live run uses a known fake key, a fake email and a phone number inside a source and in a question. A forced exception also has a message that echoes source text with the email.
  - The fake key appears nowhere: not in the DB file, the `-wal` or `-shm` files, the stdout or the error bodies. The key never reaches domain data.
  - The email and phone are absent from the `traces`, `spans` and `llm_calls` rows, the stdout and the error bodies. They remain in the domain `sources` row, as intended.
  - With `TRACE_PAYLOADS=meta`, only sizes and hashes are stored. With `off`, no payload columns are filled.
- O4: the caps work: a payload over 64 KB is truncated with its original_bytes recorded, and the 2 MB trace cap sets `truncated`.
- O5: every instrumented response has `x-trace-id`, including rejections; when persistence succeeded, the id matches the stored trace. A failure injected at the root insert, and another at the flush, each give a successful response that keeps its id, plus a `trace.persist_failed` warning.
- O6: the `stage_runs.trace_id` links resolve, and a pruned trace shows as "pruned". Liveness checks:
  - a live owner with a fresh lease survives a restart and a prune by a second process, and stays `running`;
  - an expired lease becomes `interrupted`;
  - a paused owner that resumes after recovery fails its fenced flush, writes nothing, and logs `trace.lease_lost`;
  - failed lease renewals are logged and retried;
  - prune never deletes a `running` trace.
- O9: the caps:
  - 2,500 nested spans keep 2,000, record `dropped_spans = 500`, and no kept span has a dropped parent;
  - an attribute over 2 KB is cut;
  - a call with 5 faked failures stores at most 3 attempt rows;
  - payloads past 2 MB are not buffered (asserted by the buffer size).
- O7: when a trace flush fails (injected), the request still succeeds, the domain data is committed, and a warning is logged.
- O8: the rebuild hierarchy is exactly one `cli` trace with 13 `source` spans.

**T-L Live-path dry run.** The existing test is kept: 13 sources through the OpenAI provider with a faked fetch. Each request stays under 60k characters, and the llm spans are now asserted too.

**T-E End-to-end (Playwright, seeded replay DB; mandatory for cutover)**
- E1: approve a proposal: the version goes up and the change is marked.
- E2: reject a biased restriction: the reason is required in the UI and by the server, and the restriction is never applied.
- E3: a study step: an empty answer is blocked in the UI and by the server; a valid answer counts as done; the feedback shows the stub label.
- E4: Ask about this role: an empty question is blocked; the stub answer is shown; a 502 shows the error state with the trace id.
- E5: compare versions, open an older version, move a candidate.
- E6: the skeleton, the error toast, and the 375 px layout without horizontal scroll.

**T-S Security/reliability audit:**
- secrets: O3 plus the privacy script;
- limits: I2;
- same origin: I2;
- no `dangerouslySetInnerHTML` with user or model text (grep test);
- trace and domain transactions kept separate: O7;
- locking: I7.

## Benefits, costs, risks
- **Benefits:**
  - typed, validated contracts on both sides;
  - any AI decision can be followed from the request through the stages, the prompt hash and each attempt to the checked output;
  - a recognisable stack;
  - parity proven against golden recordings, not asserted.
- **Costs:**
  - it is the largest block of work so far, an estimated 2–3 focused days (an assumption), with the UI port and the Windows production checks the biggest parts;
  - it goes from zero dependencies to Next, React, Zod and Playwright: "one command" becomes `pnpm install && pnpm dev`, and node_modules is about 300–400 MB;
  - the final review moves later.
- **Risks and mitigations:**

  | Risk | Mitigation |
  |---|---|
  | Bundling, or Windows paths | P1 spike with a decided fallback; root-anchored paths |
  | Stale renders | force-dynamic plus I8 |
  | Lock contention | busy timeout, 503, I7 |
  | Trace privacy | allowlist, redaction, O3 |
  | Visual drift | CSS moved as is, checklist and screenshots, E-tests |
  | Scope creep | the Out list and the exceptions file |
  | Losing a working deliverable | P0 tag |

## Questions for the human (recommended default first)
- **NQ1 Baseline.** Merge the current branch to main, tag `pre-next` and record the golden files first? *Recommend yes.*
- **NQ2 Where.** Build the Next app in a new `app-next/` folder beside `harness/`, then replace `harness/` at cutover, or rebuild in place? *Recommend side by side*, because the golden and e2e runs compare the old and new apps live.
- **NQ3 Playwright.** Add it as a dev dependency (it downloads a browser of about 150 MB) and make it mandatory for cutover? *Recommend yes.*
- **NQ4 Live baseline.** Run the full live OpenAI pass on the current app first (about 30 minutes; it records the real-model results), then migrate and do the short P7 smoke? *Recommend yes.*
- **NQ5 Trace payload default.** Should the default be `full` (store the redacted inputs and outputs, as you asked) or `meta`? *Recommend `full`* for this synthetic demo, with `meta` documented for real data.

## Peer review
- Pass 1: Codex, PASS WITH CHANGES (6 material, 1 minor), all accepted.
- Pass 2 (revision 2): Codex, PASS WITH CHANGES (3 material, 1 minor), all accepted in revision 3.
- Pass 3 (revision 3): Codex, PASS WITH CHANGES (2 material, 1 minor), all accepted in revision 4.
- Pass 4 (revision 4): see `plan-rereview3.codex.md`.
- Dispositions: `review-dispositions.claude.md`.
