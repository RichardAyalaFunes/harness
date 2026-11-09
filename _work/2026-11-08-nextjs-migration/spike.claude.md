# P1 spike result (Claude, 2026-11-08)

**Result: PASS.** Windows 11, Node 24.12.0, pnpm 11.3.0. Time used: well inside the 3 h box. Code: `app-next/` (a throw-away slice: one table, one route, one page, one CLI command, one prompt file).

Versions pinned: Next 16.4.5 (Turbopack), React 19.3.1, Zod 4.6.7, TypeScript 5.9.3 (7.0.2 exists and was not tried), @types/node 24. `node_modules` is 381 MB.

## Plan P1 acceptance checks and what ran

| Check (plan P1) | Result | Evidence |
|---|---|---|
| Real `lib/` slice (Zod contract, prompt-file load, `node:sqlite` write/read, one domain function) runs from the **CLI started in a different folder** | PASS | `cd %TEMP% && node …/app-next/cli/harness.ts ping "…"` then `status`: root resolved to `app-next`, prompt read (3,065 chars), row written and counted |
| …from a route handler and a Server Component under `next build && next start` | PASS | POST valid gave `{"id":1,"count":1}`; invalid body gave 400 with field issues (`note: write at least 3 characters`, `Unrecognized key: "extra"`); the page rendered the live count; `X-Content-Type-Options: nosniff` header present |
| …under `next dev`, including hot reload | PASS | The count continued across a file edit that triggered a recompile (no duplicate connection, no "database is locked"); 0 error lines in the dev log |
| …under `node --test` | PASS | The `.ts` test ran with Node's type stripping (1/1) |
| `tsc --noEmit` clean with `erasableSyntaxOnly`, `allowImportingTsExtensions` | PASS | |
| Prompt and data assets resolve after the build | PASS | `next start` read `lib/model/prompts/contract.md` (root found by walking up from `import.meta.url` inside `.next/`) |
| Pages show fresh data after a write | PASS | Page count followed API and CLI writes (`force-dynamic`) |
| CLI and server on the same database | PASS | A CLI write was visible to the running server; 10 parallel POSTs plus 5 parallel CLI writes all landed (3 → 18), no lock errors (WAL + `busy_timeout`) |
| `server-only` blocks a client import of the database | **Changed** (see below) | |

## Findings that change the plan

1. **Do not use the `server-only` package in shared `lib/`.** Node cannot load it (`ERR_MODULE_NOT_FOUND` from the CLI). The guard is already provided by the build: a client component importing `lib/db` makes `next build` fail ("external modules … `node:fs`" Turbopack error, exit 1). That error message is poor, so a small test (`test/unit/boundaries.test.ts`) will fail first with a clear message: no file under `components/` or with `'use client'` may import `lib/db`, `lib/domain`, `lib/model`, `lib/obs`, `lib/paths` (only `lib/contracts` and `lib/client`). Plan text "lib/db starts with `import 'server-only'`" is replaced by this.
2. **Project root is found by walking up from `import.meta.url` to the `package.json` named `radhires-app`** (`HARNESS_ROOT` overrides). It works from the CLI, `next dev` and `next start`. `process.cwd()` is not used.
3. **Turbopack warned that dynamic file access traces the whole project** (only matters for standalone deploys). Fixed with `/* turbopackIgnore: true */` on the run-time database path. The build is clean.
4. `next build` rewrote `tsconfig.json` (`jsx: react-jsx`, `allowJs`, `.next/dev/types`); that is accepted as Next's own setup.
5. `node:sqlite` prints an experimental warning from the Next processes. Harmless; the CLI hides it with `--disable-warning=ExperimentalWarning`. Optional later: set that flag through `NODE_OPTIONS` for dev and start.
6. Port 3000 is used by the old app; the spike used 3101 and 3102.

## Not covered by the spike (stays in later phases)
`AsyncLocalStorage` behaviour in route handlers and Server Components (P3, test O1), the Origin policy, body-size streaming limits (P4), Playwright (P5), the real schema and domain code (P2). The `app-next` folder is committed as the base of the real app; the spike files (`lib/domain/spike.ts`, `lib/contracts/spike.ts`, `app/api/spike`, `cli` ping, `spike.test.ts`) are replaced in P2.
