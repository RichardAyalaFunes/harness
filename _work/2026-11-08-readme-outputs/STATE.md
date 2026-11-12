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

## Round 3 (prompts/readme-outputs/003-user.md)
Prototype v3: headline "Recruiters who know what they're screening for."; reading map marks chapters 1, 4, 5 as recommended (5 min); ch1 rewritten around "How do you know your recruiter understood the role?" with JD+kickoff → recruiter's question, and an animated side-by-side screening (list-reading vs conversation; left mirrors demo data, right labelled illustration), three benefits (time, conversation, compounding); ch3 uses real screenshots of the Node app (shots/, replay DB in scratchpad, port 3017) incl. crops for confirm/study/review with click-to-zoom; ch4 is a 5-step stepper over the real founder email (filed → quotes highlighted → checked → v4 diff → approval → team badges) plus a "makes it up" failure path; details moved to <dialog> pop-ups (decision log, Changes tab, 7 stages, live failures).
Checked in browser at 1280px: ch3 images load, ch4 good and bad paths render with correct state, no horizontal overflow. Not checked: mobile pass, keyboard through dialogs. Screenshots must be retaken if the Next.js UI differs.

## Round 4 (2026-11-11)
Chapter 1 only, per owner: centred layout, 72px between blocks, labelled sections (Day one / Same candidate, two first screenings / What you get), explicit VS comparison with bad/good markers, benefits as three cards, closing question at 19px in a labelled box. Checked at 1280px: fits the card, no overflow. Mobile not checked.

## Round 5 (2026-11-11)
Chapters 2-6 given the chapter 1 treatment: centred headers with one-line ledes, labelled blocks, ~64px between blocks, coloured top accents on status cards (Real / Limited / Least sure / Time), callout for the key claim, next-steps as three cards, column headers on the decision turns. Fixed a bug: chapter 5 bar fills were inline spans so width was ignored. Opening card keeps only the video link, so README/DESIGN/RUN-NOTES links are no longer on the page (to place, e.g. in chapter 6). Checked at 1280px, no overflow. Not checked: mobile, keyboard in dialogs.

## Round 6 (2026-11-11)
Owner facts (prompt, this chat): total effort about 9-11 hours (deciding, planning, building, testing, GitHub, video, this presentation); OpenAI usage for the app and testing under $0.25. Chapter 3: title "An app should explain itself", 4-frame crossfading reel of the real tabs (pipeline, brief, changes, current; 2.6s, clickable tab pills, off under reduced motion) and a "Why this interface" block from the owner's stance. Chapter 4: step pills are buttons that walk through each state forwards or backwards; Back left, makes-it-up centre, Next right; DESIGN.md line removed from the 7-stages dialog. Chapter 5: time and cost card filled. This chat's own Claude usage measured from the transcript (Opus 5.5 + Sonnet 5.5): about $9-12 at API list prices; other chats not counted, not on the page.
