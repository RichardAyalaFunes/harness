# Golden recordings of the current (Node) server

Written by `node --disable-warning=ExperimentalWarning test/golden/capture.mjs` (phase P0 of the Next.js migration, tag `pre-next`).

- `steps.mjs`: the scripted workflows (plain data). The Next.js app is driven through the same steps later.
- `<scenario>.json`: per step, the request, the status, the relevant response headers (content-type, cache-control, nosniff, CSP), the body, and (for writes) a database state dump (row counts for every table, rows of the tables the API changes; long text columns are replaced by a hash and length).
- Every scenario starts from a fresh replay rebuild (no network, no key). Timestamps and run ids are normalised. The capture was repeated 4 times and the files were byte-identical.

Known limits: the dump covers the tables the API changes, not every table; the index page is recorded by headers only (it is replaced by React pages); the old error shape `{ "error": "<text>" }` is recorded as is, and its intended replacement is listed in `_work/2026-11-08-nextjs-migration/parity-exceptions.md`.
