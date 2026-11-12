# Visible conversation records

Each participating chat saves available human and assistant messages under its own ID, in order, with role labels. Capture peer prompts and responses in `_work/` and link them here. Preserve exact visible text unless a sensitive span is explicitly replaced by `[REDACTED: reason]`. Store concise rationales separately from transcripts.

Scope: development conversations. Product runtime traces will have a separate data policy after business discovery. There is no platform-wide hook or background capture. Do not invent messages, hidden reasoning, or unavailable history; note gaps. Future chats must load AGENTS.md and follow this protocol for logging to happen.

Bootstrap capture: `bootstrap/001-user.txt` is the exact attached request. `bootstrap/002-assistant.md` records visible progress messages and final response. Technical environment and platform control messages are excluded; they are not human business inputs. Peer evidence: `_work/2026-11-07-bootstrap/`.

## Full conversation logs (added 2026-11-12)

`full-<date>-<session>.md` files hold every user message and every visible assistant reply of the Claude Code chats, in order, exported from the local transcripts. Not included: tool calls and results, hidden reasoning, system reminders, sub-agent work and tool-generated compaction summaries (marked as notes). Secrets and personal emails would be replaced by `[REDACTED: ...]`; none were found. History shared by forked chats appears once, in the earliest file.

| Folder | Chat | Files |
|---|---|---|
| `client-context/` | recruitment context and company definitions | `full-2026-11-07-a1ae3f66.md` (plus the earlier hand-curated `001-026`) |
| `data-movement/` | data movement | `full-2026-11-07-356615f7.md`, `full-2026-11-08-04d5c22f.md` |
| `nextjs-migration/` | UI and the Next.js migration | `full-2026-11-07-d56aa974.md`, `full-2026-11-08-47225b86.md`, `full-2026-11-08-48351150.md`, `full-2026-11-12-f9b76896.md` (plus the earlier curated `001-004`) |
| `readme-outputs/` | README, presentation, final checks | `full-2026-11-09-916a99dd.md`, `full-2026-11-09-1a84fd09.md`, `full-2026-11-12-151b055e.md` (plus `001-004`) |

Gaps: the `bootstrap/` and `business-discovery/` chats were not Claude Code transcripts on this machine, so only their curated copies exist. Codex review prompts and replies are in `_work/` next to each review. The last file of `readme-outputs/` was exported before the final messages of that chat (the GitHub push, the standalone-file check and this export), so those are not in it.
