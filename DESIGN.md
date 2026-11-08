# Design: Role Intelligence harness

## 1. Problem thesis
**Who hurts.** Recruiters at an agency serving small companies (up to about 100 people). In these searches the job description is a first draft. The real criteria arrive afterwards:
- a CTO saying in the kickoff that "Go can be learned, incident ownership cannot";
- a CEO's email cutting the budget;
- a rejection that says "weak on system design".

These signals land in one recruiter's inbox or call. The rest of the team keeps screening against the old picture.

**What it costs.** Candidates screened on the wrong criteria, submissions the client rejects, and repeated clarification calls. One recruiter may know about a change while three others don't. We have no measured baseline; these are the failure modes the owner describes from practice, and we claim no measured savings.

**Why an AI harness fits.** Reading messy sources (transcripts, emails, news) and saying precisely what changed in a role is language work a model does well.

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
  - every quote must exist verbatim at stored offsets in the source;
  - a minimum severity per kind of change (a budget change cannot be "minor");
  - a new version only when a change is material;
  - restrictions on protected characteristics or proxies are never applied.
- **Human gate:** a proposed version is invisible to the team until the lead approves it. Approval publishes learning items to each recruiter; rejection keeps an audit row.
- **Up to date** is computed only from recorded completions that pass their own checks (an acknowledgement, a study answer of at least 20 characters, an accepted review). Being assigned a step counts for nothing.
- **Failure handling:** a failed model call or check stops that source at that stage, visibly, in the CLI and UI. Reruns are idempotent. A changed source file supersedes the old row and is reprocessed.
- **Quality evidence:**
  - 76 automated tests, covering the negative fixtures (malformed JSON, unknown fields, paraphrased quotes, bad severity), bias cases (age, university prestige, a lawful no-poach rule), historical-brief reviews, approval gating and the guarantee that moving candidates is never blocked;
  - `harness check` re-verifies the whole database;
  - a live-model run against the same checks (pending a key).

## 4. Tooling and tradeoffs
- **Node 24 with no dependencies.** `node:sqlite`, `node:http` and `node:test` make install trivial. A small server and vanilla JS UI are enough for a desktop prototype. A framework would add weight without changing what is demonstrated.
- **SQLite, not JSONL.** JSONL was first chosen for readable audits. Once positions, pipelines, teams and versions became relational, SQLite was the honest choice. Raw sources stay as files, so the evidence stays human-readable.
- **Replay model first, live model behind the same contract.** This let us build and test the workflow and checks deterministically before spending on API calls. The cost: the demo does not show extraction quality. The README says so.
- **OpenAI for the live run,** at the owner's choice. The provider is a small module, so swapping vendors is cheap.
- **Considered and left out:** RAG/embeddings (one brief plus one source fits the context window, and retrieval would add a failure mode without benefit at this scale), real integrations, candidate scoring, and model-graded quizzes (free-text explanation plus coverage hints suits learning better than a score).

## 5. Reflections
- **Process.** The work went through several prototype rounds with the owner. Its plan was reviewed by a second model (Codex), which failed it twice with useful findings:
  - recruiter completion had to be evidence-based;
  - lead approval had to gate publication;
  - screening reviews had to use the brief current at screening time.

  Each finding was fixed before building. Evidence is in `_work/2026-11-08-harness-build/`.
- **Time spent.** The owner will fill this in. Agent sessions ran across 7–8 Nov 2026.
- **Next steps:**
  1. Run the live model and compare it with the replay outputs on all 13 sources.
  2. Model-based feedback on study answers.
  3. A lead view across positions.
  4. Field primers (F2), which teach recruiters a domain when a new kind of role arrives.
  5. Real triggers (a mail or transcript connector).
- **Least sure about:**
  - how well a live model keeps quotes verbatim (the checks will reject paraphrases, which may make the live run strict);
  - whether the severity rules match how a real lead would judge changes;
  - whether "up to date" should expire when a recruiter is added mid-search.
