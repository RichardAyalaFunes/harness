# Shared state

Updated: 2026-11-07 · Claude (client-context chat). Stage: client-context answers recorded; plan next.

LATEST (2026-11-08): harness built and merged. harness/ = Node 24 + node:sqlite, 7 checked stages, CLI, web UI from prototype A, replay model by default, OpenAI provider wired (retries, generic errors). 94 tests pass; harness check 12/12. Plan gate PASS (3rd Codex pass), pre-merge PASS (2nd pass); see _work/2026-11-08-harness-build/review-dispositions.claude.md. README, DESIGN.md, readme.html written (owner to confirm the first-person quote and time spent). PENDING: owner puts OPENAI_API_KEY (+ OPENAI_MODEL) in harness/.env; then live run (HARNESS_MODEL=openai pnpm harness rebuild), record results vs replay, then final Codex review.

Earlier baton (Codex):

Confirmed human direction: fictional recruiting agency; evaluate recruiter understanding of client/role and evidence use; scenario calibration BEFORE a new client role; owner reviews fictional reference; Claude/Codex review at PLAN, PRE-MERGE, FINAL (decision 0002), author checks each step.

New standing practice: primary objective→secondary objectives→dependencies and observable done criteria. Detailed company/domain context is built progressively around the next useful experiment; no fixed roadmap/Scrum paperwork. Prototype, inspect, revise, then integrate validated behavior. Preserve provenance and draft assessment deliverables continuously.

Read knowledge/business.md for confirmed facts, draft primary objective, O1–O6, canonical A/B/C diagnosis categories and open runtime/respondent prerequisites. knowledge/recruiter-calibration.md holds alternatives/research. Current HTML: _work/2026-11-07-business-discovery/discussion.html. README explains the owner's intent (agent-drafted wording pending their confirmation); DESIGN.md maps each original brief requirement to evidence/still owed. Human sources: prompts/business-discovery/001-user.md, 003-user.md, 004-user.md.

Next: human refines thesis and supplies fictional client/role and report operator/action. Do not re-ask timing/reference ownership. No product stack/provider/role has been selected, no runnable business harness exists, and no recruiter/outcome validity or market-novelty claim is established. HTML structure/inline-script syntax checked; browser QA still pending. Plan/pre-merge critiques and findings are recorded in the current workstream; final assessment review remains pending implementation.

Git main is canonical. Existing worktree: D:/AI_SPACE/OWN/harness-challenge-business-discovery (work/business-discovery). Merge current main into that clean worktree before product work. No remote/publication. Logs and locks remain cooperative protocols, not global platform interception.

Status check (Codex, superseded by the client-context answers above: client/role, user and time budget are answered; the "first costly mistake" belonged to former P): client/role and report user/action are the next human inputs; first costly mistake and time budget remain open. Newly present .agents/, .claude/ and skills-lock.json are untracked and outside the previous validation; they were inspected for file inventory only and left unchanged.
