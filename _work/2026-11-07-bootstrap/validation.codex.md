# Validation evidence

2026-11-07 · Codex

- `python scripts/check.py`: passed required-file, Python AST, local HTML link, language/viewport and selected remote dependency checks. Not a comprehensive security or visual test.
- `python scripts/test_workspace.py`: five behavioral tests cover lock exclusion/owner checks, malformed/incomplete lock recovery guidance, path/product boundaries, preservation of staged work, failed-commit index rollback, worktree creation and canonical main discovery. Uses disposable temporary Git repositories with a synthetic test identity, not the owner repository.
- Live Claude initial plan consultation: exit 0. Initial response retained as a summary; exact raw initial peer exchange was not archived. This is a permanent capture gap in this first session. Later calls preserve full supplied prompts and replies.
- Live implementation review: returned findings, pending verdict. Findings and disposition: remediation.codex.md.
- Live Codex helper smoke: exit 0, OpenAI READY. This verifies the reverse CLI helper, not that a future Claude chat will automatically invoke it.
- Live isolated Claude helper smoke: bare mode failed authentication; recorded as failed, not passed. Retry with normal credentials, no settings sources, hooks disabled, tools disabled and empty MCP returned exit 0. No sign-in or credentials requested because existing normal CLI authentication works.
- Browser preview: attempted with supported browser UI tool; security policy blocked local file protocol. No workaround attempted. Visual layout, keyboard behavior, responsive rendering, and actual download UX remain unverified. Source review confirms no innerHTML, blank initial selections and versioned JSON export; this is not a browser pass.
- No runtime product or product eval exists; final assessment review is pending scope/implementation.
