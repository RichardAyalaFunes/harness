# Task: submission outputs (readme.html, README, DESIGN, run notes)
ID readme-outputs / Claude / branch claude/readme-html-output-design-d0b182.
## Input
prompts/readme-outputs/001-user.md. Design what each submission output says; prototype readme.html. Assume Next.js+SQLite migration (app-next/) done.
## Questions
R1-R8 in outputs-map.html (time spent, quote, demo, readme role, Next.js framing, screenshots, live results depth, repo visibility). All unanswered.
## Plan
Four outputs, one job each: readme.html = pitch by the 5 evaluation dimensions; README = operator manual; DESIGN = 5 required headings; RUN-NOTES = proof it runs.
## Implementation
outputs-map.html (information map + question form, JSON export); readme-prototype.html (prototype v1, placeholders marked). Root readme.html/README/DESIGN unchanged.
## Validation
Prototype rendered in browser pane (screenshot ok). Keyboard/mobile/export not yet checked.
## Review result
Not done. Next: owner answers R1-R8; after cutover re-read commands/test counts, retake screenshots; rewrite README/DESIGN §3-5; promote prototype; final Codex gate.

## Round 2 (prompts/readme-outputs/002-user.md)
Answers (outputs-map-answers-v1.json, 2026-11-09): R3 both (run notes + video), R5 depth, R6 retake, R7 full, R8 public. R1 time spent: pending, owner gives it at the end. R2 quote: unanswered, placeholder kept.
R4 superseded by the owner's message: readme.html is a single-file, first-person storytelling presentation holding everything (summarised README + DESIGN content); README.md and DESIGN.md are still delivered separately (mandatory). Not a landing page.
outputs-map.html is an internal working checklist (agent + owner), never part of the submission.
Prototype v2: 6 chapters with reading map and times; animated scene (signal reaches one recruiter), decision turns, interactive pipeline run (good / paraphrasing model), animated live-run bars; reduced-motion respected. Names and quotes checked against harness/data (Ana, Luis, Marta, Jon; founder email 2026-11-03). Voice per owner's style guide; all first-person lines are drafts for owner edit.
Checked: renders, both pipeline runs and scene animation work via JS, no horizontal overflow at the pane width. Not checked: keyboard pass, desktop-width screenshot.
