# Implementation review dispositions

Source: implementation-review.claude.md. Codex, 2026-11-07.

1. Initial commit: performed after source and credential checks; worktree helper behavior tested in independent repos before the owner repo has its first commit.
2. Lock mismatch: fixed docs to require lock/edit/checkpoint from canonical main; owner includes unique chat ID and worktree. Tests reject wrong owners.
3. Peer isolation: empty temp cwd, recursion environment guard, disabled Claude hooks/settings/tools/MCP/skills; Codex read-only, ephemeral, ignore user config. Bare mode failed auth and was replaced with the tested credential-compatible configuration. Residual prompt-only limitations documented.
4. Failed commit: only helper-staged paths are unstaged, preserving working files; tested with forced signing failure.
5. Privacy: conservative common-credential gate before peer input/output and checkpoint; failed-call stderr withheld. Comprehensive PII scanning and automatic redaction remain manual responsibilities. No scanner can establish privacy by itself. Arbitrary explicitly selected input files remain supported; no false claim of repository-only restriction.
6. Incomplete lock: fails with recovery guidance; no automatic stealing. Cooperative locking and a crash between mkdir/owner write remain documented limitations.
7. Record boundaries: allowed record/artifact extensions only, plus manual review. HTML prototypes are intentionally allowed under _work; extension is not proof of safety.
8. Author naming: new supports --vendor codex|claude and creates record.<vendor>.md.
9. First peer capture gap: explicitly disclosed as a gap; full later reviews captured by helper. Not backfilled with fabricated verbatim text.
10. HTML: README and validation explicitly state browser checks remain unverified. Decision form is implemented, not claimed browser-tested.

Lower severity: decode replacement, output overwrite prevention, literal Git pathspecs, narrower checker PASS claim, no silent cleanup of partial worktree creation. Runtime CLI timeout descendant handling remains a limitation. No automatic global prompt logging or enforcement is claimed.
