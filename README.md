# RadHires harness assessment

Status: workspace foundation and discovery. The business problem and runnable product are not defined yet. Read the original [candidate brief](RadHires%20Harness%20Challenge%20%28Candidate%20Brief%29.md).

Open **readme.html** in a browser for the workspace map and discovery questions. Open `_work/2026-11-07-bootstrap/questions.html` to compare choices and export answers. All HTML is offline and self-contained.

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
Implemented: Git, file-based memory, worktree helper, peer CLI helper, and HTML decision form. HTML visual layout and browser download behavior remain unverified because browser policy blocked local-file previews. Pending: business discovery, product, product interface, model/API choice, runtime evals, final audit, and submission. The decision form is workspace tooling, not the everyday-user product UI required by the assessment.

Prompt logging and main checkpoints require participating agents to follow the contract; there is no global chat interceptor, automatic provider integration, or automatic merge service. HTML form answers remain local until exported and supplied to an agent. No remote is configured and nothing has been published. CLI subscriptions used for development do not establish API access for the eventual product.
