# node:sqlite spike (2026-11-08)

Node v24.12.0: open, PRAGMA foreign_keys, prepared statements, 1000-row transaction, NOT NULL constraint error (ERR_SQLITE_ERROR) with ROLLBACK all worked. Only issue: an ExperimentalWarning on stderr; suppressed with `--disable-warning=ExperimentalWarning` in package scripts. Decision: use node:sqlite (no native build). Fallback better-sqlite3 not needed.
