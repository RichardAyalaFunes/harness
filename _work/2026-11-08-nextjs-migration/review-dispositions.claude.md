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

## Plan gate, pass 4 (`plan-rereview3.codex.md`): PASS

There were no remaining findings. Codex listed four verification scenarios, all added (to O6, and the catch-all methods to I2a). **The plan gate passed.** Implementation is still waiting on the human's answers to NQ1–NQ5, and the pre-merge and final gates come later.
