# Workspace protocol

## Start and capture
Use the human's first domain message as the brief. Create `_work/<date>-<slug>/STATE.md` plus `record.<vendor>.md` from `_work/TEMPLATE.md`. Distinct chats get distinct IDs and may link to the same feature. Save visible messages in `prompts/<chat-id>/`; use numbered role-labelled Markdown files or a transcript with explicit message boundaries. Preserve exact visible content except labelled sensitive redactions. Save assistant final responses before sending. If prior messages are inaccessible, record the gap; do not fabricate them.

The reusable knowledge index points to canonical facts and human answers. Do not copy whole transcripts into memory. Classify each assertion as sourced fact, human decision, recommendation, assumption, or open question. Every decision names the business benefit, alternatives/costs, and evidence that would invalidate it.

## Git and shared information on main
`main` is both the integration branch and canonical shared record. Its physical checkout is discovered with `git worktree list --porcelain`, not a hard-coded machine path. Product changes live in sibling worktrees. Shared `memory/`, `knowledge/`, `_work/`, and `prompts/` records are written directly to the main checkout, not separate divergent feature copies.

1. Acquire the shared records lock with `python scripts/workspace.py lock --owner <unique-chat-id>` from the canonical main checkout. It uses atomic directory creation in Git's common directory. Read main's current state after acquiring it. Hold it while editing canonical shared files, and release in a finally/cleanup step using `unlock --owner <same-id>`. The lock is cooperative; do not bypass or delete a colleague's lock. Crashed/stale locks need owner verification, not automatic expiry.
2. Write your uniquely named evidence files and update shared state. Check the exact diff for private data and accidental edits.
3. From main run `python scripts/workspace.py checkpoint --owner <same-id> --message "Record <step>" --paths memory/STATE.md _work/<id>/record.codex.md ...`. Explicit paths only. The helper refuses product paths, traversal, a nonempty pre-existing index, and non-main execution. The lock must be owned by this worktree and chat ID. It commits only the named record files. If identity is missing, ask the owner to configure their own identity; never invent one.
4. Release the lock, then return to your feature worktree. Read shared records from main; local feature copies are snapshots. To refresh tracked copies, commit your feature changes first, then merge main. Never reset or overwrite uncommitted work.

This fulfills persistence on main at step boundaries, not after every keystroke. Canonical records must never contain implementation files disguised as logs. Main can advance independently of feature branches. If tooling prevents writes to the canonical checkout, record the pending promotion and resolve access; do not claim it happened.

```powershell
python scripts/workspace.py new feature-slug
# Prints branch, worktree, and canonical record location.
# Work in the printed worktree; shared records stay on main.
```

`new` requires main and a clean working tree; it writes a main task record that must then be checkpointed. It preserves worktrees for later work. At completion: peer review feature diff and scenarios; resolve findings; checkpoint evidence on main; commit feature code; merge current main into the feature and revalidate if needed; integrate with a normal merge from a clean main checkout. Do not cherry-pick shared records back over newer main state. No automatic push or destructive cleanup.

## Review lifecycle and definition of done
Track each stage as pending / active / passed / failed / blocked / not-applicable (with reason): input, questions, plan, implementation, validation, security/reliability audit, review result. Each pass needs an evidence reference. No placeholder is a pass. Research tasks can have implementation = a document and tests = source/consistency checks.

The author checks each step, then asks the other vendor to challenge substantive decisions and results. Ask about business fit, missing scenarios, incorrect assumptions, failure/retry behavior, privacy, and evidence. One bounded peer call per related step group is sufficient; material fixes get another review. A reviewer receives supplied context and does not recursively invoke the author. Distinguish addressed, rejected-with-rationale, and unresolved findings. Model agreement is evidence, not proof.

Final assessment review walks the original brief, thesis, real end-to-end workflow, everyday-user UI including failure states, eval cases, README run instructions, real/stubbed inventory, design doc, secrets check, actual time spent, and limitations. Every step must receive AI review. Until there is a product and this gate passes, the assessment is incomplete. Human business answers stay pending until provided; no additional approval gates are imposed for routine authorized work.

## Peer consultation
Claude authentication: `claude auth status`. If it fails, ask the owner to run `claude auth login --claudeai`; never request credentials. Standard direct invocation: `claude -p "<bounded prompt>" --output-format text --no-session-persistence`.

`scripts/consult.py` supplies explicit context via stdin, disables Claude tools, and uses Codex's read-only ephemeral mode. It records the supplied prompt and response together in a new evidence file; errors/timeouts are failures, never reviews. The file may contain sensitive context, so inspect/redact before committing. Inputs must contain only necessary context; do not send source from the reference workspace or unrelated private files to a provider.

Use `--input <review-request.md> --output <new-file>`. The reviewing vendor does not need access to original chat history. The caller must include the business case, decision/diff, constraints, open questions, and evidence; then record its disposition. No API credentials, models, or stack are selected for the future product by this development helper.

## Enforcement limits
The lock is cooperative, and record extensions cannot prove a file is not implementation. Credential patterns catch common keys, not all secrets or personal data; manual privacy review is still required. Peer calls run in an empty temporary directory with a recursion marker. Claude uses no settings sources, disabled hooks, no tools, no MCP and no skills (bare mode was tested but could not access the existing login); Codex ignores user config and uses read-only mode, but no-tools behavior is a prompt constraint, not an OS guarantee. The recursion marker prevents re-entering this helper, not arbitrary model calls outside it. A timeout is a failed call; inherited external CLI processes may need inspection.
