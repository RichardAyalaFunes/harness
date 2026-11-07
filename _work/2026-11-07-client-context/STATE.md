# Client context discovery

ID: 2026-11-07-client-context · chat: client-context · author: Claude · branch: claude/recruitment-company-context-dbf9b4 · canonical records: main checkout.

## Input
prompts/client-context/001-user.md. The human asked to resume the stalled discovery and added the following. A JD is insufficient: understand the company's current state, trajectory, team↔company expectations and 6/9/12/18-month outcomes from a kickoff. Clients are SMBs with at most 80–100 people. Every touchpoint is re-analysed for impact on budget, urgency and importance. Client restrictions must be captured. Email, calendar, transcripts, Slack/Teams, Notion and external intel (news, funding, reviews, social, hiring signals) are simulated in a folder. Filter relevance and never overfill context. A simulated ATS/CRM is required. Production would use a bucket plus a database with RAG embeddings; local JSONL or similar is fine here. The AI accesses data through CLI or Node tools, and setup should be a minimal pnpm install/start. The human asked for questions before starting.

Note: the previous worktree (work/business-discovery) was clean at the same commit as main (3c0dc7e). No unsaved in-progress work was found to recover.

## Questions
questions.html: C1–C20 answered 2026-11-07 (prompts/client-context/003-user.md). Validation raised V1–V3 (knowledge/business.md), which are unanswered. C1 (which objective leads), C2 (user/decision) and C3 (fictional client/role) unblock the plan.

## Plan
Pending answers. Proposed P′ (living client/role understanding with confirmed deltas) is not accepted. The plan-gate peer review will run on the plan derived from the answers.

## Implementation
Question artifact only. No product code.

## Validation/testing
Built-in browser: 20 fieldsets render; no page-level horizontal overflow at 375px (the mapping table scrolls inside its own container). Export click and keyboard pass not tested.

## Security/reliability audit
Synthetic and fictional data only is proposed (C8). Discriminatory-restriction handling is raised as C7. No secrets.

## Review result
Questions stage: passed (answers recorded and checked for consistency); V1–V3 open. UI style reference adopted in designs.md with contrast adaptations (orange 2.70:1, sienna 4.26:1, green 2.21:1 measured on #fdfbf9). Promoted to main by a fast-forward merge on the human's instruction (003-user.md).
