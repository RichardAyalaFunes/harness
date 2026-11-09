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

## Pre-merge gate, pass 1 (`premerge.codex.md`): FAIL (5 material, 1 minor), all accepted and fixed

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | Redaction gaps: requests serialised before structured redaction (secret-named keys survived), metadata and names not redacted, error `message` and `issues` echoed request text | material | **Fixed.** Structured `redactDeep` runs before `JSON.stringify`; object key names are redacted too; trace names, span names, provider, model and prompt id go through `label()` (redact then cap); `toErrorResponse` redacts message and issue text; unknown field names are shown only if they look like plain identifiers. Tests 1a and 1b in `review-fixes.test.ts` (secret-named key, an env secret that is not `sk-` shaped, email in a key name, email in trace and span names) |
| 2 | Origin compared by host only (scheme ignored); Host-header trust undocumented | material | **Fixed.** Origin must equal the serving scheme plus the Host header (Next builds `req.url` from its own bind address, so the Host header is used; a first attempt using `req.url` alone refused the browser and was caught by the e2e and integration suites), or be listed in the new `TRUSTED_ORIGINS` variable (needed behind a TLS-terminating proxy). Test 2: scheme, port, `null`, malformed, missing Origin, cross-site, listed proxy origin. README documents the proxy setting and says the script header is a CSRF convention, not authentication |
| 3 | Tracing could override the application result: `getDb()` outside the try in `finish`, blanket `.catch`, throwing log sink | material | **Fixed.** `finish` acquires the connection inside the contained block and the call in `withTrace` is wrapped; the logger swallows sink errors; `defineRoute` always returns a response (a fallback 500 if none was produced). Tests 3a (flush cannot get a connection; application error survives; throwing sink) and 3b (route returns 200 and 500 with an unusable trace store) |
| 4 | Caps weaker than claimed: marker added past the cap, attribute limit per update and in characters, transient allocations | material | **Fixed.** `capText` is bounded in UTF-8 bytes including the marker; attributes are re-cleaned on the merged set in bytes; payload text is pre-cut to 4 x the field cap before redaction; the body reader keeps at most the 1 MB limit (the claim "never buffers more" is reworded in README: at most the limit, plus one transient copy). Test 4 (multibyte text, 50 repeated attribute updates, a 300k multibyte response) |
| 5 | `code in STATUS` accepts inherited names | material | **Fixed** with `Object.hasOwn`. Test 5 (`constructor`, `toString`, `__proto__`, `hasOwnProperty`, `valueOf` give 500) |
| 6 | Absent `Retry-After` became 0 s (no back-off); stored payloads were JSON-escaped fragments | minor | **Fixed.** An absent header is `NaN` so exponential back-off applies; the request is stored as valid JSON and the response as the provider text. Test 6 asserts sleeps `[500, 1000]` and a parseable request. Also from the "missing evidence" note: lease recovery now runs on every heartbeat tick, not once per process (test 7) |

Not verifiable by the reviewer from the supplied text and checked separately: the full test bodies, golden comparisons and UI wiring (see the suites in README), and domain transactions, which are unchanged from the first version.

## Pre-merge gate, pass 2 (`premerge2.codex.md`): FAIL (4 material, 1 minor), all accepted and fixed

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | The logger restored original keys after redaction (Error values under sensitive or secret-bearing keys leaked) | material | **Fixed.** Errors are turned into redacted text first, then one structured redaction pass covers all keys and values; nothing is restored. Test P2-1 |
| 2 | Telemetry could still change application behaviour: logger preprocessing outside its guard; BigInt/getter payloads; `safeError` throwing inside `withSpan`; unguarded `rec.end`; trace initialisation failure; failing clock | material | **Fixed.** The whole `log()` body is guarded; `recordLlmAttempt` is guarded and logs `trace.attempt_failed`; `withSpan` keeps the original exception (error text bookkeeping and `rec.end` are guarded) and runs the callback with a no-op span if span creation fails; `withTrace` runs the callback untraced if its set-up fails. Test P2-2 (BigInt, throwing getter, throwing message getter, failing clock, throwing attribute getter) |
| 3 | Response was cut before redaction, so a secret straddling the cut could leave an unmatched prefix | material | **Fixed.** `redactBounded` scans only the first N characters and, when it cut, drops the last 256 characters of the REDACTED text, so no straddling prefix remains regardless of shrinkage. Test P2-3 (secret straddling the boundary after text that shrinks when redacted) |
| 4 | Transient allocation bounds: whole-input `Buffer.from`, unbounded request traversal | material | **Fixed.** `capText` slices characters before allocating (work bounded by the cap, tested with a 10 MB string); `redactDeep` has a node budget (5,000), depth limit, array and key limits, and cuts long strings before scanning. The provider's own response is already in memory when we receive it and cannot be avoided; it is cut before redaction. Test P2-4 |
| 5 | Tiny caps, invalid JSON for a capped request, `original_bytes` semantics | minor | **Fixed.** A cap smaller than the marker keeps nothing; a capped request is stored as a valid JSON envelope (`{"truncated":true,"original_bytes":n,"head":"..."}`); `original_bytes` is the size of what was sent or received, before redaction and capping (documented in the code). Test P2-4 |
| Origin | Tests omitted Host; non-origin strings (path, credentials) accepted | (assessment) | **Fixed.** A bare origin is required (`new URL(o).origin === o`); tests build requests whose `req.url` and Host differ (the real Next behaviour), plus mismatched Host, path, credentials and the TRUSTED_ORIGINS proxy case. Test P2-5. A regression from pass 1 (using `req.url` alone refused real browsers) was caught by the e2e and integration suites |

## Pre-merge gate, pass 3 (`premerge3.codex.md`): FAIL (3 material, 1 minor), all accepted and fixed

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | The 256-character margin assumed a maximum secret length; key names were cut before redaction | material | **Fixed.** The margin is `max(512, longest configured secret + 64)` and the scanned window is always larger than the margin; patterns are shorter (email under 320 characters) or still match as a prefix (`sk-`, bearer tokens). A key longer than 200 characters is replaced whole by `(long key)` instead of being cut. Tests P3-1 (a 651-character configured secret crossing the cut at five depths; long key containing an email) |
| 2 | `span.set()` and `setTraceAttrs()` were not contained (throwing getter) | material | **Fixed.** Both guard the whole update and keep existing attributes; attribute values read through `boundedEntries` (at most 64 entries) and only scalars are stored. Test P3-2 (success value and original exception both preserved) |
| 3 | `Object.entries(...).slice()` read every property first; logger processed all fields; meta mode still serialised the whole request | material | **Fixed.** `boundedEntries` stops before reading beyond the limit (200 for payload objects, 50 for log fields, 64 for attributes), the node budget ends traversal, and the provider reports `requestBytes`/`responseBytes` so meta mode never serialises. Tests P3-3 (5,000-property object with getters: at most 200 read; a 6,000-node tree is truncated; logger reads at most 50 fields; a request whose `toJSON` throws is harmless in meta mode) |
| 4 | `original_bytes` of a full-mode request was the size of the redacted copy | minor | **Fixed**: the caller's `requestBytes` is used (the size as sent). Test P3-4 |

## Pre-merge gate, pass 4 (`premerge4.codex.md`): FAIL (1 material), accepted and fixed

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | `span.set()` and `setTraceAttrs()` spread the incoming object before `cleanAttrs`, reading every property eagerly | material | **Fixed.** Incoming attributes pass through `boundedEntries(…, 64)` before merging; the whole update stays inside the guard and keeps existing attributes on failure. Test P4-1 (a 5,000-property getter-counted object: at most 64 values read through each API; a failing update keeps the previous attributes and the next update still applies). The reviewer judged the other pass-3 items (#1 secret boundary, #2 containment, #4 sizes) resolved and established no new material regression |

## Pre-merge gate, pass 5 (`premerge5.codex.md`, scoped to the pass-4 finding): PASS

The reviewer found the finding resolved and no new material problem in the supplied lines; optional test tightening (assert exactly 64 reads; a throwing getter at entry 65) is noted and not required. Evidence limit stated by the reviewer: source review only, no execution results; the executions are recorded here: `tsc --noEmit` and the test project clean; 160 unit tests, 16 integration tests (production server, golden parity), 9 Playwright journeys and `harness check` 12/12 all passed on the final code.

**Pre-merge gate: PASS on pass 5.** The pre-merge review took five passes (FAIL, FAIL, FAIL, FAIL, PASS); each pass found real gaps (redaction of structured keys and metadata, origin scheme and Host, telemetry containment, byte caps and bounded work, boundary-safe redaction) and one regression in my own first fix (an origin check based on `req.url` refused real browsers) that the integration and e2e suites caught. The **final gate (whole assessment) is still pending** and is not claimed by this file.

## Final gate (`final.codex.md`): PASS WITH CHANGES (3 material, 3 minor), all addressed

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | README overstated trace coverage ("every API response carries x-trace-id", "every API request is a trace") | material | **Fixed (docs).** Scoped to the route wrapper; the Next-generated 405 is named as the exception; persistence is described as best effort; read-only CLI commands are said to be untraced |
| 2 | README privacy sentence read as if the database and source files hold no personal data | material | **Fixed (docs).** Scoped to logs, trace payloads and error bodies; pattern-based, not a guarantee; domain records and source documents are stated to be unredacted (synthetic here) |
| 3 | Demo assets (replay outputs, source documents) not proven to ship | material | **Verified.** `git ls-files app-next/data` lists 13 replay outputs, the seed and all 13 source documents. Clean-clone run recorded below |
| m1 | "gpt-4o or newer" implies tested compatibility | minor | Fixed: "gpt-4o is the model that was tested; other models have not been validated" |
| m2 | DESIGN dates ran to 9 Nov | minor | Fixed: "7 to 8 Nov 2026" |
| m3 | "a model does well" too strong | minor | Fixed: model-assisted extraction, checked and approved by a person |

Not changed, as the reviewer noted: extraction recall against independently annotated sources, plausible-but-wrong conclusions backed by real quotes, and adversarial instructions inside sources are evaluation gaps, not extra deliverables; they are in the limitations. Time spent and the first-person quote stay with the owner.

Clean-clone check (final gate item 3), run on a fresh `git clone` of main into a temp folder with no local files: `pnpm install` (20 s), `pnpm harness rebuild` (replay, no key needed), `pnpm harness check` (all 12 checks passed), `pnpm typecheck` (clean), `pnpm test` (160 of 160 passed). One stray file from my side was found and removed from git: `app-next/test-results/.last-run.json` (Playwright output; the folder is gitignored).

**Final gate: PASS WITH CHANGES, and the changes are applied.** The reviewer did not see the corrected files, so this is recorded as "findings addressed", not as a second PASS. Open for the owner: time spent, the first-person quote in the README, and the choice to submit.
