# Build spec for the harness (handed to the implementation subagent)

Read first: `_work/2026-11-08-harness-build/plan.claude.md`, then `plan-revision.claude.md`; the revision wins where they differ. The UI reference is `_work/2026-11-07-client-context/proto-ats-a-hifi.html` (look and layout; the data comes from the API). The style contract is `designs.md`.

## Layout (all under `harness/`)
```
harness/
  package.json            name "radhires-harness", type module, engines node >=24.12, scripts below
  src/db.js               open harness.db (node:sqlite), schema migrations (PRAGMA user_version)
  src/sources.js          parse front-matter, normalise \r\n→\n, body hash (sha256), register/ingest (idempotent; changed hash ⇒ old row superseded, new row)
  src/model/index.js      choose provider by env HARNESS_MODEL=replay|openai (default replay)
  src/model/replay.js     reads data/replay/<source_id>.json (and fixtures for tests)
  src/model/openai.js     stub that throws "not configured" until step 6 (leave the interface ready)
  src/prompts/*.md        extract.md, study.md, review.md (the prompts the live model will use; replay ignores them)
  src/schema.js           hand-written validators (no deps) for the model output contracts
  src/checks.js           quote/offset check, field whitelist, severity enum, version rule, bias rule, learning-item rules
  src/pipeline.js         stages 1–7 with stage_runs records (run_id, source_id, stage, status passed|failed|skipped, check_result JSON, skip_reason)
  src/brief.js            current approved brief per role, version list, diff between versions
  src/learning.js         learning items, assignments, completions, team status
  src/server.js           node:http, JSON API + static files from web/
  src/cli.js              commands below
  web/index.html, web/app.js, web/style.css   port of prototype A, reading /api
  test/*.test.js          node --test
  test/fixtures/*.json    negative replay fixtures
  data/ (exists)          sources/, seed/seed.json, replay/
```
`harness.db` lives in `harness/` and is gitignored. Add `harness/harness.db*` to the root `.gitignore`.

## Scripts (package.json)
- `start`: `node --disable-warning=ExperimentalWarning src/server.js` (port 3000, env PORT)
- `harness`: `node --disable-warning=ExperimentalWarning src/cli.js`
- `test`: `node --disable-warning=ExperimentalWarning --test test/`
No runtime dependencies. If something is unavoidable, justify it in a comment. pnpm is the package manager (`pnpm install` must work, even with no dependencies).

## CLI
`rebuild` (drop db, migrate, seed, ingest all sources in date order, run the pipeline, apply seed approvals) · `ingest` · `run [source_id]` · `brief <role> [--version n]` · `diff <role> <v1> <v2>` · `team <role>` · `approve <proposal_id> --by <recruiter>` · `reject <proposal_id> --by <id> --reason ".."` · `stages [source_id]` (prints the stage_runs table) · `check` (runs consistency checks over the DB and exits non-zero on failure).

## Contracts (replay JSON = model output)
Extraction: `{source_id, summary, no_change, changes:[{field, op:set|add|remove, value, severity:none|minor|material|critical, quote, weight?:must|trainable|nice|proposed, status?:applied|not_applied_bias|pending, bias?:{kind:protected|proxy, note}, confirmed?:bool, start?, end?}], decision?:{candidate,outcome:rejected|advanced,reason}, study:[{field,prompt,points[],keys[][]}], review?:{candidate, screening, coverage:[{criterion,status:asked|briefly|not_asked|not_applicable_historical,quote?}], overweighted:[{topic,count,total,quote}], suggested:[{text,why}]}}`
- Field whitelist: `company.direction|company.team|req.<slug>|restriction.<slug>|expect.6m|expect.12m|expect.18m|offer.level|offer.budget|offer.start|offer.location|offer.equity`.
- Quotes in `changes` are checked against the source body. Quotes in `review.coverage` and `review.overweighted` are checked against the matched screening transcript body.
- Offsets: when missing, compute them if the quote occurs exactly once. Multiple occurrences fail as ambiguous. Zero occurrences fail.

## Rules to implement exactly (from the plan revision)
- **Versions:**
  - A source with any material or critical change creates one proposal (`brief_proposals`, state proposed). Minor or none changes are recorded but create no proposal.
  - Approval creates `brief_versions` row n+1 for the role, with field values merged and provenance per field (source_id, quote).
  - The first JD creates v1.
  - A `company`-scoped source (role "company") applies to all roles of that client.
- **Bias:** a restriction marked bias is stored with status `not_applied_bias`, never `applied`. A protected kind is severity critical. A lawful restriction can be `applied` and is shown in the brief only.
- **Learning items, created on approval of a version or a review:**
  - offer.budget / offer.start / offer.location / offer.equity / restriction.* changes → `ack` items.
  - A new must-have (add with weight must, or a weight change to must) → `study`, using the replay `study` entry for that field.
  - offer.level change → `study`.
  - A removed criterion or a weight lowered (must→trainable/nice) → an `ack` item ("no longer required"), no study. The user said removal needs no study, but the recruiter should still know.
  - An approved client-decision review → `review` item.
  - A study item with no replay study entry fails the stage-5 check, visibly.
- **Completion checks:** `ack` = row exists; `study` = response length ≥ 20; `review` = accepted with at least one accepted suggestion or "none needed" plus a reason. A recruiter is up to date on a role when every published item for the current version (and for approved reviews since) has a passing completion.
- **Client decisions:**
  - Match the screening by role and candidate, dated on or before the decision. Take the latest date, then the latest ingest order.
  - With no match, the review status is `insufficient_evidence`.
  - Use `brief_version_at_screening` with a must-have snapshot. A later must-have is `not_applicable_historical`.
  - Review approval is separate from brief approval.
- **No gate:** `POST /api/candidates/:id/move` never consults learning data.
- **Seed approvals:** `rebuild` approves all proposals and reviews from the seed data with actor `lead (seed)`, except one. **Leave Kestrel's ks-04 proposal in `proposed` state** so the UI demonstrates the approval step.
- **Seed completions** (to show the team view):
  - Northwind backend: Luis and Marta have completed every item of the current version. Jon has completed only the ack items. Ana (the demo user, "you") has completed none.
  - Kestrel: none.
- **Context budget:** the model input is the current approved brief as compact JSON plus one source body, truncated at 12 000 chars with the marker `[TRUNCATED]`. A quote past the truncation point fails.

## API (JSON)
- `GET /api/me` → {id:'ana'}
- `GET /api/positions` → roles with client, version, pending proposals, team up-to-date counts, candidate counts
- `GET /api/roles/:id` → brief (current), versions, timeline events (sources with summary and version created or "no new version"), proposals, team, learning items for the user with completion state, the "what to verify" list (from approved reviews' accepted suggestions plus the must-haves)
- `GET /api/roles/:id/diff?from=&to=` (or the full version matrix for the compare table)
- `GET /api/roles/:id/pipeline`; `POST /api/candidates/:id/move` {to}
- `POST /api/proposals/:id/approve|reject`; `POST /api/reviews/:id/approve|reject`
- `POST /api/items/:id/complete` {recruiter, response?, accepted?[]} → returns the check result (study: points hit by keyword; label it as the replay stub)
- `GET /api/stages?source=` for a visible "how this was processed" view

## UI (port of prototype A, same visual style)
- Positions dashboard; position page with tabs Pipeline / Role brief / Changes / Stay current.
- **Changes:** timeline from sources, version compare matrix, proposals awaiting approval (Approve/Reject buttons, bias flags visible), client decisions.
- **Stay current:** Confirm / Study / Review sections from the API. The audio button is disabled and its popup says audio is not part of this MVP. Team panel. "What to verify in screenings" is informational.
- **Pipeline:** "Next stage →" moves immediately.
- **"How this was processed"** (in Changes, per source): the stage_runs with pass/fail/skip and the check result. This is the rule-13 evidence. Keep it collapsed by default.
- Never insert user-typed text with innerHTML; use textContent.

## Tests (node --test), each as its own case
Cover the plan revision's list:
- approval gating (proposed version not current, no assignments, not counted)
- reject keeps audit
- edit = reject + manual-correction proposal
- completion per version; repeated clicks idempotent; team membership change
- removed must-have → no study item
- level-only change → study
- client decision with no transcript → insufficient_evidence
- multiple screenings → latest wins; same-date screenings → ingest order
- decision dated before transcripts → insufficient_evidence
- role mismatch → stage-1 failure
- historical brief: v1 screening, later v2 must-have → not_applicable_historical
- review approve/reject visibility
- source hash change → superseded + rerun
- rerun idempotent
- partial stage failure, then rerun
- quote repeated (ambiguous) / CRLF normalisation / beyond truncation / not in source
- negative fixtures: malformed JSON, unknown field, bad severity, non-verbatim quote, no-change, conflicting claim (conflicts_with flag)
- bias: age → not_applied_bias + critical; university → proxy not applied; Carrio no-poach → applied, not flagged; applied restriction never affects moves
- move succeeds with incomplete learning
- full rebuild of the real mock data passes `harness check`

## Done criteria for the subagent
`pnpm test` passes. `pnpm harness rebuild && pnpm harness check` passes. `pnpm start` serves the UI and all four tabs render real data from SQLite. Report the test count and any rule you could not implement.
