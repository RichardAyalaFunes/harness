# Visible conversation records

Each participating chat saves available human and assistant messages under its own ID, in order, with role labels. Capture peer prompts and responses in `_work/` and link them here. Preserve exact visible text unless a sensitive span is explicitly replaced by `[REDACTED: reason]`. Store concise rationales separately from transcripts.

Scope: development conversations. Product runtime traces will have a separate data policy after business discovery. There is no platform-wide hook or background capture. Do not invent messages, hidden reasoning, or unavailable history; note gaps. Future chats must load AGENTS.md and follow this protocol for logging to happen.

Bootstrap capture: `bootstrap/001-user.txt` is the exact attached request. `bootstrap/002-assistant.md` records visible progress messages and final response. Technical environment and platform control messages are excluded; they are not human business inputs. Peer evidence: `_work/2026-11-07-bootstrap/`.
