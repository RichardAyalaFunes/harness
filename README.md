# Role Intelligence harness: keep every recruiter current on what the client actually needs

**What it is.** A small harness for a recruitment agency, built as **one Next.js service** (UI, API and AI workflow together). Client messages, meeting transcripts, news and client decisions about a role arrive over time. The harness:
- reads each one and extracts what changed in the role (with verbatim quotes);
- proposes a new brief version for the lead recruiter to approve;
- flags client restrictions that may be discriminatory;
- turns each approved change into a short learning step for every recruiter on the search;
- records every AI call (input, output, prompt version, tokens, checks) as a trace in SQLite.

**Who it's for.** Recruiters and account leads at an agency serving small companies (up to about 100 people). For them the job description is only the starting point: the criteria that decide a hire keep arriving later, in a kickoff call, a founder's email or a rejection.

The candidate brief is in [RadHires Harness Challenge (Candidate Brief).md](RadHires%20Harness%20Challenge%20%28Candidate%20Brief%29.md). The design document is [DESIGN.md](DESIGN.md), and [readme.html](readme.html) is the presentation.

## Run it

Requirements: **Node.js 24.12 or later** (it uses the built-in `node:sqlite`) and **pnpm** (`npm i -g pnpm`). No container, no database server.

```bash
cd app-next
pnpm install
pnpm harness rebuild  # builds the demo database from the mock data (replay model, no key needed)
pnpm dev              # http://localhost:3000   (or: pnpm build && pnpm start)
```

`pnpm harness rebuild` creates `app-next/data/app.db` from the mock data in `app-next/data/` and runs every source through the pipeline.

Commands you will use:

```bash
pnpm typecheck                     # TypeScript strict (app) and a looser project for the tests
pnpm test                          # 160 unit, contract, tracing, review-regression and boundary tests (node --test)
pnpm test:integration              # 16 tests: builds the app, then drives a production server against the recorded behaviour of the first version
pnpm test:e2e                      # 9 Playwright browser journeys (first run: npx playwright install chromium)
pnpm harness check                 # 12 consistency checks over the database
pnpm harness stages nw-08          # how one source was processed, stage by stage
pnpm harness brief nw-be           # current approved brief
pnpm harness diff nw-be 1 4        # what changed between versions
pnpm harness trace --last          # the trace of the last CLI run, as a tree
pnpm harness trace prune --older-than 7d
```

### Keys and the model
By default the harness uses the **replay model**: recorded, hand-written model outputs in `app-next/data/replay/`. It runs offline. To use a live model:

1. Create `app-next/.env` (it is gitignored; never commit a key) with `OPENAI_API_KEY=...`, `OPENAI_MODEL=gpt-4o` and, to run the pipeline live, `HARNESS_MODEL=openai`. See `app-next/.env.example`.
2. Run `pnpm harness rebuild` again.

`gpt-4o` is the model that was tested; other models have not been validated. In the live baseline `gpt-4o-mini` passed only 8 of 13 sources and `gpt-4o` 11 to 12 (results vary between runs; see `_work/2026-11-08-nextjs-migration/live-baseline.claude.md`).

With a key set, the recruiter-facing help ("Ask about this role" and coaching feedback on study answers) uses OpenAI right away, even while the pipeline stays on replay, so rebuilding the demo spends no tokens. Set `HARNESS_ASSIST=replay` to keep those offline. Prompts are in `app-next/lib/model/prompts/`.

The live model goes through the same JSON contract and the same checks, plus **one repair attempt**: if the checks reject the first answer, the exact errors are sent back once. If a call or check still fails, that stage shows as failed. The harness never falls back to the replay data silently.

## How it is built

| Layer | What | Where |
|---|---|---|
| UI | React components (Server Components read, client components act), the original glass design and motion | `app-next/app`, `app-next/components` |
| API | 13 JSON routes defined once in a route table, wrapped by one handler that validates, traces and maps errors | `app-next/lib/api/routes.ts`, `app-next/lib/obs/route.ts`, `app-next/app/api/**` |
| Contracts | Zod schemas for requests, environment and model output; the same schemas drive the UI form messages | `app-next/lib/contracts` |
| Domain | The 7-stage pipeline, checks, briefs, approvals, learning, ask and feedback | `app-next/lib/domain` |
| Model | Replay and OpenAI providers (plain `fetch`, JSON mode, retries), prompts | `app-next/lib/model` |
| Data | SQLite through `node:sqlite`, versioned migrations | `app-next/lib/db` |
| Observability | Logger, redaction, tracing | `app-next/lib/obs` |
| CLI | The same domain code from the terminal | `app-next/cli/harness.ts` |

### Validation
Every API request is parsed with a Zod schema (body, path, query) with a size limit while the body is read; a rejected request gets a 400, 413 or 415 with a `{ error: { code, message, issues, traceId } }` body. The UI uses the same schema for its inline messages, so the browser and the server say the same thing. The server never relies on the UI check. Model output goes through its own schema and the existing semantic checks (verbatim quotes, field whitelist, severity minimums, bias rules).

State-changing requests must come from the same origin: a browser sends `Origin`, which must equal the scheme plus the Host it asked for; a script must send `Sec-Fetch-Site: same-origin`. Behind a proxy that terminates TLS, list the public origin in `TRUSTED_ORIGINS`. This is a CSRF guard, not authentication.

### Logging and traces
- **Logs:** one JSON line per event on stdout (`LOG_LEVEL` sets the level) with the trace id, redacted before it is written.
- **Traces:** every API request handled by the shared route wrapper, every page load and every state-changing CLI command is traced to SQLite on a best-effort basis (`traces`, `spans`, `llm_calls`); read-only CLI commands such as `check` and `brief` are not traced. A pipeline run is a tree: command, source, stage, AI call. Each AI attempt stores the model, a hash of the system prompt (so a changed prompt is visible), the redacted request and response, token counts, latency and the result of the checks. Responses from the route wrapper (including its 400, 403, 404, 413, 415 and 500 answers) carry `x-trace-id`; the 405 that Next itself sends for an unsupported method on an existing route does not, and a trace that could not be written leaves an id that does not resolve. A stage record in the audit trail links to its trace.
- **Read them:** `pnpm harness trace --last` prints the tree. There is no reporting UI, on purpose.
- **Privacy (logs, trace payloads and error bodies only):** keys, auth headers, emails and phone numbers are removed by pattern before they are written there. This is pattern-based redaction, not a comprehensive privacy guarantee; free text never goes into span attributes; payload fields are capped at 64 KB and a trace at 2 MB. `TRACE_PAYLOADS=meta` keeps only sizes and hashes, `off` keeps nothing. **Domain records are not redacted:** the source documents under `app-next/data/sources/`, the stored source texts, briefs and recruiters' answers are kept exactly as they are (they are synthetic here; with real data they would need their own policy). Pruning deletes rows logically; it does not guarantee physical erasure until a `VACUUM`.
- **Best effort:** writing a trace never fails a request and never touches domain data. A crashed process leaves a trace marked `interrupted` after its lease expires.

### Why SQLite
Structured state lives in SQLite: sources, analyses, changes, proposals, brief versions, approvals, learning items, completions, stage runs and traces. It gives constraints, transactions and joins for the team views. `node:sqlite` is built into Node 24, so there is no native build step.

Raw source documents (transcripts, emails, Slack exports, news) stay as readable Markdown files under `app-next/data/sources/`. SQLite stores only their metadata, path and SHA-256 hash, so every brief change can be traced to the exact text it came from.

The database is a build product: it is gitignored and recreated by `rebuild`.

## What's real and what's stubbed

| Part | Status |
|---|---|
| Source ingest, hashing, supersede on change | Real |
| 7-stage pipeline with a recorded check per stage | Real. See `pnpm harness stages <source>` or "How this was processed" in the UI |
| Quote verification | Real. The quote must be verbatim in the model-visible text; ambiguous or missing quotes fail |
| Version proposals, lead approval or rejection, audit | Real |
| Bias flags (protected characteristic or proxy) | Real rule on top of the model's flag; a biased restriction is stored only as `not_applied_bias`. No code path filters candidates by any restriction |
| Learning steps by change type (confirm / study / review), team completion | Real |
| Screening review against the brief *at screening time* | Real |
| Model extraction | **Replay by default** (hand-written outputs). Proves orchestration and checks, not extraction quality. The OpenAI provider ran live on the 13 sources (see the baseline file), with the limits listed below |
| Study answer feedback | AI coaching (OpenAI) when a key is set; advice, not a grade. Keyword stub without a key |
| Ask about this role | Short answers grounded in the current brief and recent client messages (OpenAI); a labelled stub without a key |
| Request, AI-call and pipeline tracing | Real, stored in SQLite; no export, no reporting UI |
| Candidates and pipeline | Fake data; moving a card is never blocked |
| Integrations (email, Slack, tl;dv, ATS), RAG, audio answers, auth, deployment | Out of scope, on purpose. See DESIGN.md |

## Known limitations
- A live model finds fewer changes than the hand-written replay outputs, and uses different field names for the same idea, so later briefs can diverge from the reference. Every proposal still needs a human approval.
- The keyword feedback on study answers (no key) is a placeholder for model-based feedback.
- A single demo user (Ana); no login. State-changing calls rely on a same-origin check, not on identity.
- The source hash covers the body, not the front-matter.
- Desktop-first UI (it was checked at phone width for sideways scrolling only).
- `node:sqlite` is still marked experimental in Node 24 and prints a warning.
- The trace store is bounded and pruned by hand (`trace prune`); it is not a long-term audit log.

## Repository map
`app-next/` is the product (the first version, a plain Node server in `harness/`, is kept in git under the tag `pre-next`). `_work/` holds plans, prototypes, reviews and evidence. `knowledge/` holds business decisions and sources. `prompts/` holds the conversation log. `AGENTS.md` holds the agent rules used while building this.
