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
pnpm test                          # 76 tests (node --test)
pnpm harness check                 # 12 consistency checks over the database
pnpm harness stages nw-08          # how one source was processed, stage by stage
pnpm harness brief nw-be           # current approved brief
pnpm harness diff nw-be 1 4        # what changed between versions
pnpm harness team nw-be            # who on the team is up to date
```

### Keys and the model
By default the harness uses the **replay model**: recorded, hand-written model outputs in `harness/data/replay/`. It runs offline. To use a live model:

1. Copy `harness/.env.example` to `harness/.env`. `.env` is gitignored; never commit a key.
2. Set `HARNESS_MODEL=openai`, `OPENAI_API_KEY=...` and optionally `OPENAI_MODEL`.
3. Run `pnpm harness rebuild` again.

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
| Quote verification (verbatim, by offsets) | Real |
| Version proposals, lead approval or rejection, audit | Real |
| Bias flags (protected characteristic or proxy) | Real rule on top of the model's flag; never applied as a filter |
| Learning steps by change type (confirm / study / review), team completion | Real |
| Screening review against the brief *at screening time* | Real |
| Model extraction | **Replay by default** (hand-written outputs). It proves orchestration and checks, not extraction quality. OpenAI provider implemented; live run pending a key |
| Study answer feedback | Keyword stub showing which points were covered; no grade |
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
