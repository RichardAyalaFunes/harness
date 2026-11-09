# Live baseline on the current (Node) app (NQ4)

Author Claude, 2026-11-08. Command: `HARNESS_DB=<temp> HARNESS_MODEL=openai [OPENAI_MODEL=…] pnpm harness rebuild` (13 sources, a temp database, the real prompts, the real checks). The API key is never printed or stored; the only stored model text is in the temp databases, which are not committed. The author's repository DB was not touched.

## Runs

| Run | Model | Prompt / harness state | Sources fully clean (stages 1–6) | Notes |
|---|---|---|---|---|
| 1 | gpt-4o-mini | contract written as `"weight?"`, `"decision?"` keys | 1 of 13 (stopped early) | The model copied the optional-key markers literally. **The zero-token dry run could not catch this**, because its fake model replays perfect files |
| 2 | gpt-4o-mini | contract rewritten with 2 worked examples (new `contract.md`) | 6 of 13 | Remaining errors: severity minimums, missing weights, off-whitelist field, quotes not verbatim |
| 3 | gpt-4o-mini | rules rewritten to match each code check | 3 of 13 | Variance between runs is large for this model |
| 4 | gpt-4o-mini | + one bounded repair attempt (errors sent back once) | 8 of 13 | The failures that remain are single-rule slips |
| 5 | **gpt-4o** | same as run 4 | **12 of 13** | Only nw-08 fails, at stage 6 (see below) |

## What the checks did
In every run the checks rejected the bad answers and nothing invalid was stored: no analysis row, proposal or brief version came from a failed stage. The failure messages are specific (for example "quote not found verbatim in the source"), which is what the repair attempt feeds back to the model.

## Run 5 against the replay reference (hand-written "ideal" output; the replay is not ground truth, it is the author's expectation)
- Fewer changes found than the reference in most sources (for example nw-02: 3 of 8). Missed items include the `restriction.top-university` proxy-bias flag in nw-02, which the reference flags and the live run did not extract at all. The age restriction in ks-04 *was* caught and flagged as bias (different slug, `restriction.age`).
- Different field slugs for the same idea (`req.go-expertise` instead of `req.go`), so later briefs diverge from the reference.
- nw-08 (client decision): the review's coverage names criteria that are not the must-haves of the brief version at the screening date, because the live briefs have different slugs. Stage 6 correctly refuses it. This is a **model-quality and slug-consistency limit**, not a code defect.

## Conclusions
1. The harness holds its line: weak model output is rejected, not applied. That is the behaviour being demonstrated.
2. Use a stronger model for real runs: `OPENAI_MODEL=gpt-4o` or newer. `gpt-4o-mini` is too unreliable for this contract.
3. Recall is lower than the hand-written reference, so live results must be presented as "what the model found", with recruiters still approving every proposal.
4. Code and prompt changes made because of this run (all on the current app, committed with tests): `prompts/contract.md` (worked examples, no `?` keys), rules in `extract.md` mapped to the checks, one bounded repair attempt (`model.repairs`, recorded in `stage_runs.check_result.repair`), prompt-lint tests (`test/prompts.test.js`), repair tests (`test/repair.test.js`). Tests: 103 → 110.
5. Follow-ups (not done): ask the model to reuse existing slugs listed in the brief more strongly, which should help nw-08; compare against a stronger model than gpt-4o if the owner wants.

Cost: 5 runs of 13 sources plus up to 13 repair calls each, on `gpt-4o-mini` and one run on `gpt-4o`. Not metered here.
