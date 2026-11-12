# Design: Role Intelligence harness

## 1. Problem thesis
**Who hurts.** Recruiters at an agency serving small companies (up to about 100 people). In these searches the job description is a first draft. The real criteria arrive afterwards:
- a CTO saying in the kickoff that "Go can be learned, incident ownership cannot";
- a CEO's email cutting the budget;
- a rejection that says "weak on system design".

These signals land in one recruiter's inbox or call. The rest of the team keeps screening against the old picture.

**What it costs.** Candidates screened on the wrong criteria, submissions the client rejects, and repeated clarification calls. One recruiter may know about a change while three others don't. We have no measured baseline; these are the failure modes the owner describes from practice, and we claim no measured savings.

**Why an AI harness fits.** Reading messy sources (transcripts, emails, news) and saying precisely what changed in a role is language work suited to model-assisted extraction, as long as every output is checked and a person approves it.

**Where it doesn't fit.** Deciding whether a change is real, whether a restriction is lawful, or whether a recruiter is ready is for people and rules. So the model only proposes. Rules check every proposal, and a lead approves before anything reaches the team.

**Out of scope, on purpose.** Scoring or matching candidates, generating screening scripts, and integrations. The owner has built RAG pipelines and app integrations before. Integrations depend on each agency's tools, and they would hide the part worth showing: the reasoning chain from client signal to recruiter judgment.

## 2. The end user and the interface
The user is a recruiter working inside an ATS. The UI is a mock ATS (positions, then a position page) with four tabs:
- **Pipeline:** the familiar candidate board, with fake candidates. "Next stage" is never blocked. The owner rejected a pre-submit checklist because it slows recruiters down.
- **Role brief:** the current approved brief as tables: context, requirements by weight, restrictions, expectations at 6/12/18 months, offer. Each row shows what changed in the latest version.
- **Changes:** a timeline of sources, a version comparison table, proposals awaiting approval (with bias flags), and "How this was processed" for each source.
- **Stay current:** the steps this recruiter owes for approved changes, plus a team panel.

Stay current treats changes differently by kind, following the owner's direction:
- **Confirm:** budget, start, location and restrictions are a tick ("I have read and understood this"). There is nothing to study.
- **Study:** a new must-have or a level change gets one free-text question ("how would you tell someone led an incident rather than joined it?"). Free text, because recruiters explain better than they pick options. The audio button is visible but disabled, and says audio is outside this MVP.
- **Review:** after a client decision, the recruiter's screening transcript is compared with the brief that was current at screening time. The recruiter accepts which checks the team should verify next time.

The team panel shows "2 of 4 up to date", so a lead can enforce quality across the team, not only for one person.

**Why this interface.** Recruiters live in their ATS. A separate tool would be ignored, so the harness's output appears where they already work, as the next thing to do. The visual style (light, calm cards) and the tables-over-prose choice came from several prototype rounds with the owner; earlier versions read as "selling" rather than "understanding".

## 3. Architecture and the harness
```
sources/*.md ──► 1 register (hash, metadata) ──► 2 extract (model → JSON) ──► 3 propose version
                                                                             │
           7 publish to team ◄── 5 learning items ◄── 4 bias screen ◄────────┘
                    ▲                   ▲
             lead approval        6 screening review (client decisions only)
```
- **Model input is small on purpose:** the current approved brief as compact JSON, plus one source (truncated at 12,000 characters). A client decision also gets its matched screening transcript. The model never sees the whole history, so the context doesn't fill with stale material.
- **Every stage has a check, defined before it runs, and its result is stored in `stage_runs`.** A stage is complete only when its check passes; a skip records the rule that allows it. Examples:
  - a schema check, with fields limited to a whitelist;
  - every quote must be verbatim in the text the model saw (only that text counts). Offsets are recomputed when the quote is unique; an ambiguous or missing quote fails;
  - a minimum severity per kind of change (a budget change cannot be "minor");
  - a new version only when a change is material;
  - restrictions on protected characteristics or proxies appear in the brief only as `not_applied_bias`, never as `applied`, and nothing filters candidates by restrictions;
  - a proposal is rebased at approval: its diff and learning items are recomputed against the brief current at that moment, and a proposal left with nothing material is marked `superseded_noop`.
- **Human gate:** a proposed version is invisible to the team until the lead approves it. Approval publishes learning items to each recruiter; rejection keeps an audit row.
- **Up to date** is computed only from recorded completions that pass their own checks (an acknowledgement, a study answer of at least 20 characters, an accepted review). Being assigned a step counts for nothing.
- **Failure handling:** a failed model call or check stops that source at that stage, visibly, in the CLI and UI. Reruns are idempotent. A changed source file supersedes the old row and is reprocessed.
- **Quality evidence:**
  - 185 automated tests (160 unit, contract, tracing, review-regression and boundary tests; 16 integration tests against a production server; 9 browser journeys), covering the negative fixtures (malformed JSON, unknown fields, paraphrased quotes, bad severity), bias cases (age, university prestige, a lawful no-poach rule), historical-brief reviews, approval gating and the guarantee that moving candidates is never blocked;
  - `harness check` re-verifies the whole database;
  - a live-model run against the same checks (see section 5 and `_work/2026-11-08-nextjs-migration/live-baseline.claude.md`).

## 4. Tooling and tradeoffs
- **One Next.js service (App Router, TypeScript strict, Zod).** The first version was a plain Node server with a vanilla JS UI, and the assistant recommended keeping it. The owner chose to migrate anyway, to show a fuller engineering project: one deployable service with UI and API, typed contracts, tests at every level, logging and traceability. The cost is real: the project went from no dependencies to Next, React, Zod and Playwright (about 380 MB installed), and a build step. The old version stays in git under the tag `pre-next` as the fallback and as the reference the new one was tested against.
- **How the migration was kept honest.** Before any rewrite, the old server was driven through scripted workflows and its status codes, headers, bodies and database state were recorded (9 scenarios). The new app is driven through the same scripts against a production `next start` and compared; every intended difference is listed with its reason in `_work/2026-11-08-nextjs-migration/parity-exceptions.md`. The original 110 tests were ported with their assertions unchanged except where listed.
- **One route table.** The 13 API routes are defined once (`lib/api/routes.ts`); the Next route files re-export entries, and the in-process test shim dispatches through the same table. A single wrapper does, in this order: create the trace, check origin, enforce the size limit, parse JSON, validate with Zod, call the handler, map errors to the error contract.
- **Contracts at the edges.** Zod schemas for requests, environment and model output. The UI uses the same schemas for inline messages. The model-output gate keeps the hand-written validator and semantic checks (their error texts feed the repair attempt) and adds Zod types that are tested against every stored output.
- **Shared domain code.** `lib/` is plain TypeScript with explicit `.ts` imports and no Next or React imports, so the CLI (Node's type stripping), the tests and the app run the same code. A boundary test keeps browser code from importing the database.
- **SQLite, not JSONL.** Once positions, pipelines, teams and versions became relational, SQLite was the honest choice. Raw sources stay as files, so the evidence stays human-readable. WAL mode, a busy timeout and migrations versioned by `PRAGMA user_version` read after the write lock is taken let the server and the CLI share one file.
- **Observability without a platform.** Spans are buffered per trace and written once, after domain work has committed, in a transaction of their own; a failure there is logged and never fails the request. Liveness is a lease with fencing, so a paused process cannot overwrite a trace another process marked interrupted. Payloads are redacted before they are capped and stored. Caps bound memory as well as storage (payload bytes, 2,000 spans, attributes, attempts).
- **Replay model first, live model behind the same contract.** This let us build and test the workflow and checks deterministically before spending on API calls. The first live run then found a bug no replay test could (see 5), which is the argument for running it early.
- **OpenAI for the live run,** at the owner's choice, through plain `fetch` with retries and no SDK. The provider is a small module, so swapping vendors is cheap.
- **Considered and left out:** RAG/embeddings, real integrations, candidate scoring, model-graded quizzes, an ORM, a trace UI, an OpenTelemetry exporter, auth, containers.

## 5. Reflections
- **Process.** The work went through several prototype rounds with the owner. Plans and diffs were reviewed by a second model (Codex) at the plan, pre-merge and final gates. The first harness plan failed twice with useful findings (recruiter completion had to be evidence-based; lead approval had to gate publication; screening reviews had to use the brief current at screening time). The migration plan needed four passes: the early findings were about trace liveness, privacy scope and parity gates that only counted tests. Each finding was fixed before building. Evidence is in `_work/2026-11-08-harness-build/` and `_work/2026-11-08-nextjs-migration/`.
- **What the live run taught.** Running OpenAI over the 13 sources found things no replay test could:
  - the model copied optional-key markers such as `"weight?"` literally from the output contract, so the contract is now a worked example, and a test lints the prompt;
  - small models break small rules (verbatim quotes, minimum severities, missing weights), so one repair attempt sends the exact check errors back once; `gpt-4o-mini` then passed 8 of 13 sources and `gpt-4o` 11 to 12 (it varies run to run);
  - the checks held: weak output was rejected, never applied;
  - a live model finds fewer changes than the hand-written outputs and names fields differently, so later briefs diverge and one review stage still fails on slug mismatch. This is a model-quality limit, and it is why every proposal still needs a person.
- **Time spent.** The owner will fill this in. Agent sessions ran across 7 to 8 Nov 2026.
- **Next steps:**
  1. Stronger slug consistency (reuse the existing field names listed in the brief) and a comparison with a newer model.
  2. A lead view across positions.
  3. Field primers (F2), which teach recruiters a domain when a new kind of role arrives.
  4. Real triggers (a mail or transcript connector).
  5. Login, so approval is tied to identity and not only to a same-origin check.
- **Least sure about:**
  - whether the severity rules match how a real lead would judge changes;
  - whether "up to date" should expire when a recruiter is added mid-search;
  - whether regex-based redaction of phone numbers (long digit runs) is too aggressive for numeric ids in traces;
  - `node:sqlite` is experimental in Node 24; the fallback would be `better-sqlite3`.
