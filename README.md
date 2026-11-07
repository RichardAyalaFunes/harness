# RadHires harness assessment

Status: business discovery. The simulated recruitment-agency use case is **recruiter judgment calibration before a new client role**; the runnable product and exact role are not defined yet. Read the original [candidate brief](RadHires%20Harness%20Challenge%20%28Candidate%20Brief%29.md).

## Why I chose this problem — draft for owner confirmation
This first-person wording is agent-drafted from the owner’s confirmed intent and awaits their wording/acceptance for submission.

I considered the familiar recruitment workflow—sourcing, outreach, interviews and candidate scoring—and chose to examine the judgment behind it: does the recruiter understand what this particular client needs, and can they distinguish supporting evidence from an attractive profile? The proposed product uses role-specific scenarios to surface gaps before candidate assessment begins. The focus is deliberate; it is not a claim of market uniqueness or proven improvement in hiring outcomes. This rationale comes from the owner's business brief, preserved in prompts/business-discovery/001-user.md and 004-user.md.

## How the work evolves
Start from a primary objective, define secondary objectives and their done criteria, then build the smallest useful experiment. The living map in knowledge/business.md records dependencies and unanswered assumptions. Prototype feedback can change the map; there is no fixed product roadmap or Scrum paperwork. File memory, worktrees and AI review make the learning inspectable. Codex and Claude review the plan, pre-merge changes and final assessment; each intermediate step receives author checks. The human will review the fictional client's reference judgment. Actual time, effectiveness and implementation claims are added only when evidenced.

Open **readme.html** in a browser for the workspace map. Current business discussion and objective map: `_work/2026-11-07-business-discovery/discussion.html`. Earlier workspace choices: `_work/2026-11-07-bootstrap/questions.html`. All HTML is offline and self-contained.

## Start a session
Read `AGENTS.md`, `memory/STATE.md`, and `knowledge/INDEX.md`. Claude imports the same instructions through `CLAUDE.md`. Python 3.10+ and Git are required for the workspace helpers; installed, authenticated Claude and Codex CLIs are required for cross-vendor review. No Python packages are needed.

```powershell
python scripts/check.py
python scripts/workspace.py new my-feature
python scripts/consult.py claude --input _work/2026-11-07-bootstrap/review-request.md --output _work/2026-11-07-bootstrap/new-review.claude.md
```

`new` creates a sibling linked worktree and a canonical task record on main; it does not commit or merge automatically. See [workflow](docs/workflow.md) for checkpoints and review gates.

## Where things live
| Path | Purpose |
|---|---|
| `memory/` | Current state, next action, reusable lessons |
| `knowledge/` | Business context, human answers, decisions, sourced research |
| `_work/<id>/` | Chat/task state, questions, plans, implementation and audit evidence, HTML prototypes |
| `prompts/<chat-id>/` | Visible human/AI messages and explicit capture gaps |
| `docs/` | Operating protocol |
| `scripts/` | Standard-library Git/worktree, peer review, and structural checks |
| `designs.md` | Shared HTML design contract |
| `DESIGN.md` | Short assessment design document; domain sections pending |

## Real, pending, and limitations
Implemented: Git, file-based memory, worktree helper, peer CLI helper, and HTML decision form (built and structurally checked, not browser-verified). HTML visual layout and browser download behavior remain unverified because browser policy blocked local-file previews. Pending: business discovery, product, product interface, model/API choice, runtime evals, final audit, and submission. The decision form is workspace tooling, not the everyday-user product UI required by the assessment.

Prompt logging and main checkpoints require participating agents to follow the contract; there is no global chat interceptor, automatic provider integration, or automatic merge service. HTML form answers remain local until exported and supplied to an agent. No remote is configured and nothing has been published. CLI subscriptions used for development do not establish API access for the eventual product.
