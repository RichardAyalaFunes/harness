# Role Intelligence harness: keep every recruiter current on what the client actually needs

**What it is.** A small harness for a recruitment agency. Client messages, meeting transcripts, news and client decisions about a role arrive over time. The harness:
- reads each one and extracts what changed in the role (with verbatim quotes);
- proposes a new brief version for the lead recruiter to approve;
- flags client restrictions that may be discriminatory;
- turns each approved change into a short learning step for every recruiter on the search.

**Who it's for.** Recruiters and account leads at an agency serving small companies (up to about 100 people). For them the job description is the least reliable source: the real criteria arrive later, in a kickoff call, a founder's email or a rejection.

The candidate brief is in [RadHires Harness Challenge (Candidate Brief).md](RadHires%20Harness%20Challenge%20%28Candidate%20Brief%29.md). The design document is [DESIGN.md](DESIGN.md), and [readme.html](readme.html) is the presentation.

## Run it

Requirements: **Node.js 24.12 or later** (it uses the built-in `node:sqlite`) and **pnpm** (`npm i -g pnpm`; plain `npm` also works). There are no runtime dependencies to download.

```bash
cd harness
pnpm install
pnpm harness rebuild
pnpm start
```

Open http://localhost:3000. `rebuild` creates `harness/harness.db` from the mock data in `harness/data/` and runs every source through the pipeline.

Other commands:

```bash
pnpm test                          # 110 tests (node --test)
pnpm harness check                 # 12 consistency checks over the database
pnpm harness stages nw-08          # how one source was processed, stage by stage
pnpm harness brief nw-be           # current approved brief
pnpm harness diff nw-be 1 4        # what changed between versions
pnpm harness team nw-be            # who on the team is up to date
```

### Keys and the model
By default the harness uses the **replay model**: recorded, hand-written model outputs in `harness/data/replay/`. It runs offline. To use a live model:

1. Copy `harness/.env.example` to `harness/.env`. `.env` is gitignored; never commit a key.
2. Set `HARNESS_MODEL=openai`, `OPENAI_API_KEY=...` and `OPENAI_MODEL` (use `gpt-4o` or newer: `gpt-4o-mini` passed only 8 of 13 sources in the live baseline, `gpt-4o` 12 of 13).
3. Run `pnpm harness rebuild` again.

With a key set, the recruiter-facing help ("Ask about this role" and coaching feedback on study answers) uses OpenAI right away, even while the pipeline stays on replay, so rebuilding the demo spends no tokens. Set `HARNESS_ASSIST=replay` to keep those offline. Prompts are in `harness/src/prompts/`.

The live model goes through the same JSON contract and the same checks. If a call or check fails, that stage shows as failed. The harness never falls back to the replay data silently.

### Why SQLite
Structured state lives in SQLite: sources, analyses, changes, proposals, brief versions, approvals, learning items, completions and stage runs. It gives constraints, transactions and joins for the team views. `node:sqlite` is built into Node 24, so there is no native build step.

Raw source documents (transcripts, emails, Slack exports, news) stay as readable Markdown files under `harness/data/sources/`. SQLite stores only their metadata, path and SHA-256 hash, so every brief change can be traced to the exact text it came from.

The database is a build product: it is gitignored and recreated by `rebuild`. JSONL was the first choice for auditability; the owner switched to SQLite once the data became relational (positions, pipeline, teams).

## What's real and what's stubbed

| Part | Status |
|---|---|
| Source ingest, hashing, supersede on change | Real |
| 7-stage pipeline with a recorded check per stage | Real. See `pnpm harness stages <source>` or "How this was processed" in the UI |
| Quote verification | Real. The quote must be verbatim in the model-visible text; offsets are recomputed when the quote occurs exactly once; ambiguous or missing quotes fail |
| Version proposals, lead approval or rejection, audit | Real |
| Bias flags (protected characteristic or proxy) | Real rule on top of the model's flag; a biased restriction is stored in the brief only as `not_applied_bias` (the harness refuses to store it as applied). No code path filters candidates by any restriction; only lawful ones (such as a partner no-poach) are shown as `applied`, for display |
| Learning steps by change type (confirm / study / review), team completion | Real |
| Screening review against the brief *at screening time* | Real |
| Model extraction | **Replay by default** (hand-written outputs). It proves orchestration and checks, not extraction quality. OpenAI provider implemented; live run pending a key |
| Study answer feedback | AI coaching (OpenAI) when a key is set: which points the answer covers, one comment, one question to try; advice, not a grade. Keyword stub without a key |
| Ask about this role | Short answers grounded in the current brief and recent client messages (OpenAI); a labelled stub without a key |
| Candidates and pipeline | Fake data; moving a card is never blocked |
| Integrations (email, Slack, tl;dv, ATS), RAG, audio answers, auth | Out of scope, on purpose. See DESIGN.md |

## Known limitations
- The replay outputs were written by us, so the demo cannot show how well a model extracts changes. Only the live run can, and it has not been run yet.
- The keyword feedback on study answers is a placeholder for model-based feedback.
- A single demo user (Ana); no login.
- The source hash covers the body, not the front-matter.
- Desktop-first UI.

## Repository map
`harness/` is the product. `_work/` holds plans, prototypes, reviews and evidence. `knowledge/` holds business decisions and sources. `prompts/` holds the conversation log. `AGENTS.md` holds the agent rules used while building this.
