# UI polish pass (branch `ui/polish`)

Input: the owner asked for a UI audit of every page with fixes, without changing the design or style, on a separate branch so `main` stays the fallback. Their example was the "was: …" line on the Confirm step.

Method: walked Positions and the four tabs of a role (Pipeline, Role brief, Changes, Stay current) in the built-in browser at 1440×900 and at 375×812. Fixed what was broken or noisy. Checked again in the browser, then ran the checks.

## Changes (where to look)

| # | Page | Problem found | Change | File |
|---|---|---|---|---|
| 1 | Stay current › Confirm | Tiny "was: …" text crammed above the button; it usually repeated the title | The old value is shown only when the title does not already say it, as a readable "BEFORE ~~old~~" line; the button gets its own spacing | `components/tabs/CurrentTab.tsx` (AckItem), `globals.css` `.before` |
| 2 | Stay current › Review | "Why none is needed" was an unstyled browser input that was always visible | Appears only after ticking "None of these is needed", styled like the other inputs, slides in | `CurrentTab.tsx` (ReviewItem), `globals.css` `input.field` |
| 3 | Stay current › Team | "0/3" floated between the name and the chip | Now "0 of 3" in its own aligned column (grid row) | `CurrentTab.tsx`, `globals.css` `.trow` |
| 4 | Brief and Stay current › What to verify | Long items dropped under their ✓ badge, so rows were misaligned | The text fills the row next to its badge | `globals.css` `.list li>div` |
| 5 | Role header | 4-column KPI grid with only 3 KPIs: an empty slot and labels wrapping ("Awaiting / approval") | 3 columns, labels on one line | `globals.css` `.kpis` |
| 6 | Pipeline | Empty columns were blank; every card repeated its column's stage name | "No candidates" placeholder; the repeated stage text is removed | `components/tabs/PipelineTab.tsx`, `.colempty` |
| 7 | Changes › What the client told us | Raw slugs under dates ("meeting-transcript", "jd") | Readable labels (Call notes, Job description, …); the date is in bold | `components/tabs/ChangesTab.tsx` `CHANNEL` |
| 8 | Changes › proposals | Lower-case severity chips ("material", "minor") next to an upper-case "NOT APPLIED" | Sentence case for both; "Review approved" likewise | `ChangesTab.tsx` |
| 9 | Changes and Ask | Inline validation messages (`.fielderr`) had no style | Red, bold text that rises in; invalid inputs get a red border | `globals.css` `.fielderr` |
| 10 | Phone width | KPI tile spilled out of the header; when the tabs wrapped onto two rows, the sliding highlight covered the wrong tab (an existing bug) | Two-column KPIs; the tabs stay on one row and scroll sideways, and the active tab is scrolled into view | `globals.css` (560 px block), `components/RoleScreen.tsx` |
| 11 | Not found | The "Back to positions" pill was underlined | No underline | `globals.css` `a.pill` |
| 12 | Checkboxes | No feedback on tick | Small pop when ticked (turned off under reduced motion by the existing rule) | `globals.css` `.chk input:checked` |

The design tokens, colours, fonts and layout system are unchanged. All additions are at the end of `globals.css` under "UI polish pass".

## Checks
- `pnpm typecheck`: clean.
- `pnpm test`: 160/160 pass.
- `pnpm test:e2e`: 9/9 pass, including the "no sideways scroll at phone width" check.
- Browser re-check after the fixes at 1440 and 375 wide: Pipeline, Changes timeline, and Stay current (Confirm, Review with "None" ticked, Team, Verify). `scrollWidth` equals the viewport width at 375.

## Not changed (noted for the owner)
- The review note shows an ISO date ("2026-11-05") that comes from server text in `lib/domain`, not from the UI. Left as is.
- No cross-vendor review was run for this pass. It is a UI-only change on a branch; the pre-merge gate applies if it is merged.
