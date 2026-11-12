# Parity exceptions (intended differences between the Node app and the Next.js app)

Anything not listed here must match the golden recordings in `app-next/test/golden/`. This file is the only place a difference can be approved. Status: **implemented and verified by test/integration/golden.test.ts**; the human can reject any row.

| # | Area | Node app today (golden) | Next.js app | Why |
|---|---|---|---|---|
| X1 | Error body | `{"error": "<text>"}` | `{"error": {code, message, issues?, traceId}}` | Uniform contract and trace correlation (plan scope 4) |
| X2 | Non-numeric id in path | 400 `unknown proposal NaN` | 400 validation error naming the `id` parameter | Validate at the edge |
| X3 | Reject reason | `reason: "no"` is accepted (200); a missing reason becomes "rejected in the UI" | A reason of at least 10 characters is required (400 otherwise); the UI sends one | The server must enforce what the UI enforces (plan E2). Found by the P0 capture: only the UI checked this |
| X4 | Candidate move with a bad target | 400 `unknown stage "undefined"` | 400 with `issues[]` for `to` | Same |
| X5 | POST with no `Origin` | Allowed | Refused unless `Sec-Fetch-Site: same-origin` is present | Stronger same-origin policy (review finding 6). Scripts and the golden driver must send that header |
| X6 | Unsupported method on an API route | 404 `no route DELETE …` | 405 from Next (no trace id, plan I2b) | Framework behaviour |
| X7 | Wrong content type / body too large | no content-type check; 413 over 1 MB | 415 for a non-JSON type; 413 over 1 MB, streamed | Plan I2a |
| X8 | Static files | `/` serves `web/index.html` with CSP headers | Next-rendered pages; CSP and `nosniff` kept via `next.config` headers | Framework change |

Rows are added during P2–P6 when a difference is found. Each addition needs a reason.

Added during the port (all covered by `test/integration/golden.test.ts` or the unit tests):

| # | Area | Node app (golden) | Next.js app | Why |
|---|---|---|---|---|
| X9 | Unknown entity (proposal, review, item, candidate, role) | 400 | 404 `not_found` | The status says what happened. Changed one assertion in `mock-data.test.ts` (400 to 404) |
| X10 | Acting on something already decided | 400 `is approved, not proposed` | 409 `conflict` | Same |
| X11 | `/api/stages` rows | no `trace_id` | one additive key `trace_id` (links an audit row to its trace) | Traceability |
| X12 | Completing an item twice | 200 with `already: true` | unchanged (200, idempotent). The plan said 409; the recorded behaviour is the better contract | Plan text corrected |
| X13 | A POST to a page | 405 | 200 (Next renders the page); pages are read-only and define no server actions, and the test checks the database is unchanged | Framework behaviour |
| X14 | Model failure on Ask | 400 with the message | 502 `model_failure`, generic text plus trace id | Plan I4 |
| X15 | Config default model | `gpt-4o-mini` | `gpt-4o` | Live baseline (the mini model passed 8 of 13 sources) |
| X16 | Test edits | n/a | `mock-data.test.ts` imports the in-process API shim; `learning.test.ts` reads `lib/domain/candidates.ts`; the fixtures moved to `test/unit/fixtures`; type annotations added | Mechanical; no assertion changed except X9 |
