# 0001 — Shared records, isolated implementation

Date: 2026-11-07. Status: adopted for reversible bootstrap; open choices remain proposals.
Source: prompts/bootstrap/001-user.txt; original assessment brief; referenced workspace AGENTS.md and _work/README.md (read-only); peer consultation summarized in bootstrap record.

The owner explicitly requires file memory, worktrees, shared information on main, HTML questions, prompt logs, and Claude/Codex review. Keep one canonical AGENTS.md and a Claude import. Use shared main records with serialized writes and isolated feature worktrees. Benefit: new chats can discover decisions without waiting for product merges. Cost: cooperative locking and the need to refresh feature snapshots. Alternative: records only on feature branches is simpler but does not satisfy immediate main persistence.

Use a single task record with lifecycle sections; split files as real evidence accumulates. Benefit: traceability without empty ceremony. Peer review is required at every substantive step per the owner, despite Claude's cheaper three-gate recommendation. Bounded leaf consultations prevent recursive review. HTML questions follow the requested workflow, even for decisions Claude suggested leaving in Markdown.

Do not choose a product stack or domain before the owner supplies scope. The research supports specifications, feedback loops, and scenario checks; it does not justify a large orchestration platform for this assessment.

Pending human preferences: review budget/cadence refinement, prompt retention/redaction, HTML answer workflow, design style, time budget, business scope. See questions.html. Until changed explicitly, implement the owner's stated requirements and label proposed defaults.
