You are doing the PRE-MERGE re-review (pass 3). Do not call any other model. Answer in under 400 words.

Pass 1 gave FAIL (5 material); pass 2 gave FAIL (4 material, 1 minor). Both lists were fixed and are described in the dispositions below, with the changed files and regression tests. Please check ONLY whether the pass-2 findings are resolved and whether the fixes introduced new MATERIAL problems (data leaks into logs/traces/error bodies, telemetry changing application behaviour, unbounded work, origin bypass). Do not repeat style or already-accepted limitations: (a) the provider response body is already in memory when received, (b) domain records are stored unredacted by design (synthetic data; the redaction policy covers logs, traces and error bodies only), (c) the demo has no authentication. Give a verdict: PASS, PASS WITH CHANGES, or FAIL, and say what you could not verify.

=== DISPOSITIONS (both passes) ===
## Pre-merge gate, pass 1 (`premerge.codex.md`): FAIL (5 material, 1 minor), all accepted and fixed

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | Redaction gaps: requests serialised before structured redaction (secret-named keys survived), metadata and names not redacted, error `message` and `issues` echoed request text | material | **Fixed.** Structured `redactDeep` runs before `JSON.stringify`; object key names are redacted too; trace names, span names, provider, model and prompt id go through `label()` (redact then cap); `toErrorResponse` redacts message and issue text; unknown field names are shown only if they look like plain identifiers. Tests 1a and 1b in `review-fixes.test.ts` (secret-named key, an env secret that is not `sk-` shaped, email in a key name, email in trace and span names) |
| 2 | Origin compared by host only (scheme ignored); Host-header trust undocumented | material | **Fixed.** Origin must equal the serving scheme plus the Host header (Next builds `req.url` from its own bind address, so the Host header is used; a first attempt using `req.url` alone refused the browser and was caught by the e2e and integration suites), or be listed in the new `TRUSTED_ORIGINS` variable (needed behind a TLS-terminating proxy). Test 2: scheme, port, `null`, malformed, missing Origin, cross-site, listed proxy origin. README documents the proxy setting and says the script header is a CSRF convention, not authentication |
| 3 | Tracing could override the application result: `getDb()` outside the try in `finish`, blanket `.catch`, throwing log sink | material | **Fixed.** `finish` acquires the connection inside the contained block and the call in `withTrace` is wrapped; the logger swallows sink errors; `defineRoute` always returns a response (a fallback 500 if none was produced). Tests 3a (flush cannot get a connection; application error survives; throwing sink) and 3b (route returns 200 and 500 with an unusable trace store) |
| 4 | Caps weaker than claimed: marker added past the cap, attribute limit per update and in characters, transient allocations | material | **Fixed.** `capText` is bounded in UTF-8 bytes including the marker; attributes are re-cleaned on the merged set in bytes; payload text is pre-cut to 4 x the field cap before redaction; the body reader keeps at most the 1 MB limit (the claim "never buffers more" is reworded in README: at most the limit, plus one transient copy). Test 4 (multibyte text, 50 repeated attribute updates, a 300k multibyte response) |
| 5 | `code in STATUS` accepts inherited names | material | **Fixed** with `Object.hasOwn`. Test 5 (`constructor`, `toString`, `__proto__`, `hasOwnProperty`, `valueOf` give 500) |
| 6 | Absent `Retry-After` became 0 s (no back-off); stored payloads were JSON-escaped fragments | minor | **Fixed.** An absent header is `NaN` so exponential back-off applies; the request is stored as valid JSON and the response as the provider text. Test 6 asserts sleeps `[500, 1000]` and a parseable request. Also from the "missing evidence" note: lease recovery now runs on every heartbeat tick, not once per process (test 7) |

Not verifiable by the reviewer from the supplied text and checked separately: the full test bodies, golden comparisons and UI wiring (see the suites in README), and domain transactions, which are unchanged from the first version.

## Pre-merge gate, pass 2 (`premerge2.codex.md`): FAIL (4 material, 1 minor), all accepted and fixed

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | The logger restored original keys after redaction (Error values under sensitive or secret-bearing keys leaked) | material | **Fixed.** Errors are turned into redacted text first, then one structured redaction pass covers all keys and values; nothing is restored. Test P2-1 |
| 2 | Telemetry could still change application behaviour: logger preprocessing outside its guard; BigInt/getter payloads; `safeError` throwing inside `withSpan`; unguarded `rec.end`; trace initialisation failure; failing clock | material | **Fixed.** The whole `log()` body is guarded; `recordLlmAttempt` is guarded and logs `trace.attempt_failed`; `withSpan` keeps the original exception (error text bookkeeping and `rec.end` are guarded) and runs the callback with a no-op span if span creation fails; `withTrace` runs the callback untraced if its set-up fails. Test P2-2 (BigInt, throwing getter, throwing message getter, failing clock, throwing attribute getter) |
| 3 | Response was cut before redaction, so a secret straddling the cut could leave an unmatched prefix | material | **Fixed.** `redactBounded` scans only the first N characters and, when it cut, drops the last 256 characters of the REDACTED text, so no straddling prefix remains regardless of shrinkage. Test P2-3 (secret straddling the boundary after text that shrinks when redacted) |
| 4 | Transient allocation bounds: whole-input `Buffer.from`, unbounded request traversal | material | **Fixed.** `capText` slices characters before allocating (work bounded by the cap, tested with a 10 MB string); `redactDeep` has a node budget (5,000), depth limit, array and key limits, and cuts long strings before scanning. The provider's own response is already in memory when we receive it and cannot be avoided; it is cut before redaction. Test P2-4 |
| 5 | Tiny caps, invalid JSON for a capped request, `original_bytes` semantics | minor | **Fixed.** A cap smaller than the marker keeps nothing; a capped request is stored as a valid JSON envelope (`{"truncated":true,"original_bytes":n,"head":"..."}`); `original_bytes` is the size of what was sent or received, before redaction and capping (documented in the code). Test P2-4 |
| Origin | Tests omitted Host; non-origin strings (path, credentials) accepted | (assessment) | **Fixed.** A bare origin is required (`new URL(o).origin === o`); tests build requests whose `req.url` and Host differ (the real Next behaviour), plus mismatched Host, path, credentials and the TRUSTED_ORIGINS proxy case. Test P2-5. A regression from pass 1 (using `req.url` alone refused real browsers) was caught by the e2e and integration suites |


=== app-next/lib/obs/route.ts ===
// The wrapper every API route and page loader goes through.
// Order matters: the trace id and AsyncLocalStorage context come FIRST, so even a rejected request (400, 403, 413, 415)
// has a trace context, an x-trace-id header and a traceId in its error body. Only Web-standard types are used here
// (Request, Response), so this file has no dependency on Next.js.
import type { z } from 'zod';
import { AppError, STATUS, errorBody, type ErrorCode } from '../contracts/errors.ts';
import { randomBytes } from 'node:crypto';
import { MAX_BODY_BYTES, issuesToMessages } from '../contracts/api.ts';
import { logger } from './logger.ts';
import { redactText, safeError } from './redact.ts';
import { setTraceAttrs, withTrace } from './tracer.ts';

export const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } as const;

export interface RouteSpec<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType> {
  method: 'GET' | 'POST';
  pattern: string;               // for example /api/roles/:id/ask (also the trace name)
  params?: P;
  query?: Q;
  body?: B;
}
export interface RouteInput<P, Q, B> { params: P; query: Q; body: B; req: Request; traceId: string }

/** Same-origin policy for state-changing requests. A browser always sends Origin on a POST; scripts must send Sec-Fetch-Site. */
export function checkOrigin(req: Request, trusted: string[] = (process.env.TRUSTED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)): void {
  const origin = req.headers.get('origin');
  if (origin) {
    // Full origin (scheme + host + port) must equal: the scheme the app is served on + the Host the browser asked for,
    // or be listed in TRUSTED_ORIGINS (needed behind a proxy that terminates TLS: the app sees http, the browser sends https).
    // Next.js builds req.url from its own bind address, so the Host header (which the browser sets and a page cannot forge) is used for host and port.
    let same = false;
    try {
      const o = new URL(origin).origin;
      if (o !== origin) throw new Error('not a bare origin'); // refuses paths, credentials and odd spellings
      const url = new URL(req.url);
      same = o === `${url.protocol}//${req.headers.get('host') || url.host}` || trusted.includes(o);
    } catch { same = false; }
    if (!same) throw new AppError('forbidden', 'cross-origin request refused');
    return;
  }
  if (req.headers.get('sec-fetch-site') !== 'same-origin') throw new AppError('forbidden', 'cross-origin request refused (no Origin header)');
}

/** Reads at most MAX_BODY_BYTES; never buffers more than that. Empty body is {}. */
export async function readJsonBody(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new AppError('payload_too_large', 'body too large');
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel().catch(() => {}); throw new AppError('payload_too_large', 'body too large'); }
    chunks.push(value);
  }
  if (size === 0) return {};
  const type = (req.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('application/json')) throw new AppError('unsupported_media_type', 'send the body as application/json');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('validation', 'body is not valid JSON', [{ path: '(body)', message: 'body is not valid JSON' }]); }
}

function parse<T extends z.ZodType>(schema: T | undefined, input: unknown, what: string): z.infer<T> {
  if (!schema) return undefined as z.infer<T>;
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const issues = issuesToMessages(r.error);
  throw new AppError('validation', `${what} is not valid: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`, issues);
}

export function respond(status: number, body: unknown, traceId: string): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-trace-id': traceId, ...SECURITY_HEADERS } });
}

/** Maps any thrown value to the error contract. Unknown errors become a generic 500: the stack goes to the log only. */
export function toErrorResponse(e: unknown, traceId: string): Response {
  if (e instanceof AppError) {
    // user-facing text is redacted too: a request can carry a secret or an email inside a field name or value
    const issues = e.issues?.map((i) => ({ path: safeError(i.path, 80), message: safeError(i.message, 200) }));
    return respond(e.status, errorBody(e.code, safeError(e.message), traceId, issues), traceId);
  }
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && Object.hasOwn(STATUS, code) && code !== 'internal') return respond(STATUS[code as ErrorCode], errorBody(code as ErrorCode, safeError(e), traceId), traceId);
  if (e instanceof Error && /database is locked|SQLITE_BUSY/i.test(e.message)) return respond(503, errorBody('busy', 'the database is busy, try again', traceId), traceId);
  logger.error('unexpected error', { error: e instanceof Error ? { name: e.name, message: safeError(e), stack: safeError(e.stack ?? '', 4000) } : safeError(e) });
  return respond(500, errorBody('internal', 'Something went wrong. The details are in the log under this trace id.', traceId), traceId);
}

export function defineRoute<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType>(
  spec: RouteSpec<P, Q, B>,
  handler: (input: RouteInput<z.infer<P>, z.infer<Q>, z.infer<B>>) => Promise<unknown> | unknown,
) {
  const run = async (req: Request, ctx?: { params?: Promise<Record<string, string>> | Record<string, string> }): Promise<Response> => {
    let status = 500;
    let response: Response | undefined;
    let tid = randomBytes(8).toString('hex');
    const t0 = Date.now();
    try { await withTrace({ kind: 'http', name: `${spec.method} ${spec.pattern}`, attrs: { method: spec.method, route: spec.pattern } }, async (traceId) => {
      tid = traceId;
      try {
        if (spec.method !== 'GET') checkOrigin(req);
        const url = new URL(req.url);
        const params = parse(spec.params, (await ctx?.params) ?? {}, 'path');
        const query = parse(spec.query, Object.fromEntries(url.searchParams), 'query');
        const body = spec.method === 'GET' ? undefined : parse(spec.body, await readJsonBody(req), 'body');
        const result = await handler({ params, query, body: body as z.infer<B>, req, traceId });
        status = 200;
        response = respond(200, result, traceId);
      } catch (e) {
        response = toErrorResponse(e, traceId);
        status = response.status;
        if (status >= 500) throw e instanceof Error ? e : new Error(String(e)); // marks the trace as an error; the response is already built
      } finally { setTraceAttrs({ status }); logger.info('request', { method: spec.method, route: spec.pattern, status, ms: Date.now() - t0 }); }
    }); } catch { /* the error response is built inside; a tracing failure is contained and never replaces it */ }
    response ??= toErrorResponse(new Error('no response was produced'), tid);
    return response;
  };
  return run;
}

/** Page data loaders (Server Components) get a page trace too. They are read-only. */
export function loadPage<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  return withTrace({ kind: 'page', name, attrs: { route: name } }, async () => fn());
}

=== app-next/lib/obs/redact.ts ===
// Redaction and size caps for everything written to logs, traces and error bodies.
// Applied BEFORE truncation and persistence. Domain records (sources, answers, briefs) are not touched.
export const REDACTED = '[redacted]';

const PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g,                                   // API keys
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,           // auth headers
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,             // email addresses
  /(?<![\w.])\+?\d[\d ()-]{7,}\d(?![\w.])/g,                 // phone-like numbers (8+ digits with separators)
];
const SECRET_ENV = ['OPENAI_API_KEY'];

function envSecrets(): string[] {
  return SECRET_ENV.map((k) => process.env[k]).filter((v): v is string => !!v && v.length >= 6);
}

export function redactText(text: string, extra: string[] = []): string {
  let out = text;
  for (const secret of [...envSecrets(), ...extra]) if (secret) out = out.split(secret).join(REDACTED);
  for (const re of PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

const MARK = '…[truncated]';
const MARK_BYTES = Buffer.byteLength(MARK);
/** Cuts to at most `max` UTF-8 bytes INCLUDING the truncation marker (3 spare bytes cover a split multibyte character). */
export function capText(text: string, max: number): { text: string; truncated: boolean; original_bytes: number } {
  const original_bytes = Buffer.byteLength(text); // counts without allocating
  if (original_bytes <= max) return { text, truncated: false, original_bytes };
  if (max < MARK_BYTES + 4) return { text: '', truncated: true, original_bytes }; // a cap smaller than the marker keeps nothing
  const keep = max - MARK_BYTES - 3;
  // a character is at least one byte, so the first `keep` characters contain the first `keep` bytes: allocation stays bounded by the cap, not the input
  return { text: `${Buffer.from(text.slice(0, keep)).subarray(0, keep).toString('utf8')}${MARK}`, truncated: true, original_bytes };
}

/** Longest secret we expect to straddle a cut. Text within this distance of an input cut is dropped AFTER redaction. */
export const BOUNDARY_MARGIN = 256;
/**
 * Redact a possibly huge text safely: only the first `limit` characters are scanned; because a secret that straddles the cut
 * would leave an unmatched prefix, the last BOUNDARY_MARGIN characters of the redacted result are dropped when a cut happened.
 */
export function redactBounded(text: string, limit: number): { text: string; cut: boolean } {
  if (text.length <= limit) return { text: redactText(text), cut: false };
  const red = redactText(text.slice(0, limit));
  return { text: red.slice(0, Math.max(0, red.length - BOUNDARY_MARGIN)), cut: true };
}

const SENSITIVE_KEYS = /^(authorization|api[-_]?key|x-api-key|password|secret|token)$/i;

/** Deep copy with secret-named keys blanked and every string redacted. */
export function redactDeep(value: unknown, depth = 0, budget = { nodes: 5000 }): unknown {
  if (depth > 12 || budget.nodes-- <= 0) return '[truncated]'; // bounded traversal
  if (typeof value === 'string') return redactBounded(value, 262_144).text;
  if (typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.slice(0, 1000).map((v) => redactDeep(v, depth + 1, budget));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value).slice(0, 200)) out[redactText(k.slice(0, 200))] = SENSITIVE_KEYS.test(k) ? REDACTED : redactDeep(v, depth + 1, budget); // key names are redacted too
    return out;
  }
  return value;
}

/** Error text for spans, logs and API bodies: redacted and short. */
export function safeError(e: unknown, max = 500): string {
  const msg = e instanceof Error ? e.message : String(e);
  return capText(redactText(msg), max).text;
}

=== app-next/lib/obs/tracer.ts ===
// Tracing, shaped like OpenTelemetry but stored only in SQLite (traces, spans, llm_calls). Nothing is exported.
// - Context via AsyncLocalStorage: domain code calls withSpan(...) and never passes trace objects.
// - Spans are buffered in memory and written when the root ends, in a short transaction of their own,
//   after any domain transaction has committed. Persistence is best-effort: a failure logs trace.persist_failed
//   and never fails the request or touches domain data.
// - Liveness is a lease: the owner renews heartbeat_at; the final write is fenced on (owner_id, status = running).
// - Caps keep memory and storage bounded (payload bytes, span count, attribute size, attempts per call).
import { createHash, randomBytes } from 'node:crypto';
import { openDb, type Db } from '../db/connection.ts';
import { currentCtx, runWithCtx, type Ctx } from './context.ts';
import { logger } from './logger.ts';
import { capText, redactBounded, redactDeep, redactText, safeError } from './redact.ts';

export type TraceKind = 'http' | 'page' | 'cli';
export type SpanKind = 'http' | 'page' | 'pipeline' | 'source' | 'stage' | 'llm' | 'check';
export type Attrs = Record<string, string | number | boolean | null | undefined>;

export const LIMITS = { payloadField: 64 * 1024, payloadTrace: 2 * 1024 * 1024, spans: 2000, attrBytes: 2048, attempts: 6, heartbeatMs: 30_000, leaseMs: 120_000 };

// Free text never goes into attributes: each kind has an allowlist of keys (ids, counts, statuses, sizes).
const ALLOWED: Record<string, string[]> = {
  http: ['method', 'route', 'status', 'bytes'], page: ['route', 'status'], cli: ['command', 'sources', 'model'],
  pipeline: ['sources'], source: ['source_id', 'channel', 'failed_at'],
  stage: ['stage', 'name', 'status', 'skip', 'errors', 'changes', 'repair'],
  llm: ['model', 'provider', 'input_chars', 'attempts', 'check', 'errors', 'repaired', 'purpose'],
  check: ['name', 'ok', 'problems'],
};

export const OWNER_ID = randomBytes(6).toString('hex');
const newId = () => randomBytes(8).toString('hex');

interface SpanRec { id: string; parent: string | null; kind: string; name: string; start: string; end: string | null; status: string; attrs: Attrs; error: string | null; attempts: number }
interface LlmRec { span: string; attempt: number; provider: string; model: string | null; prompt_id: string | null; prompt_sha: string | null; request: string | null; response: string | null; original_bytes: number; truncated: number; status: string; http_status: number | null; latency_ms: number | null; prompt_tokens: number | null; completion_tokens: number | null }
export interface TraceState {
  id: string; name: string; kind: TraceKind; started: string; attrs: Attrs; spans: SpanRec[]; llm: LlmRec[];
  payloadBytes: number; truncated: boolean; dropped: number; leaseLost: boolean; persisted: boolean; getDb: () => Db;
}

let cfg = { getDb: (): Db => openDb(), now: (): number => Date.now() };
/** Tests inject a database and a clock. */
export function configureTracing(opts: { getDb?: () => Db; now?: () => number } = {}): void {
  cfg = { getDb: opts.getDb ?? (() => openDb()), now: opts.now ?? (() => Date.now()) };
}
const iso = (ms = cfg.now()): string => new Date(ms).toISOString();

// ---- heartbeat -------------------------------------------------------------------------------------------------
const open = new Set<TraceState>();
let timer: NodeJS.Timeout | null = null;
function renewAll(): void {
  // Recovery runs on every tick, not only at start-up, so a lease that expires later is still noticed.
  try { recoverStale(cfg.getDb()); } catch { /* best effort */ }
  for (const t of open) {
    if (!t.persisted || t.leaseLost) continue;
    try {
      const r = t.getDb().prepare("UPDATE traces SET heartbeat_at = ? WHERE id = ? AND owner_id = ? AND status = 'running'").run(iso(), t.id, OWNER_ID);
      if (Number(r.changes) === 0) { t.leaseLost = true; logger.warn('trace.lease_lost', { traceId: t.id, where: 'heartbeat' }); }
    } catch (e) { logger.warn('trace.heartbeat_failed', { traceId: t.id, error: e as Error }); }
  }
}
export const renewLeases = renewAll;
function ensureTimer(): void {
  if (timer || process.env.NODE_ENV === 'test') return;
  timer = setInterval(renewAll, LIMITS.heartbeatMs);
  timer.unref();
}

// ---- recovery and pruning ----------------------------------------------------------------------------------------
/** A running root whose lease expired becomes interrupted. Age alone never decides: the heartbeat does. */
export function recoverStale(db: Db, { nowMs = cfg.now(), leaseMs = LIMITS.leaseMs } = {}): number {
  const r = db.prepare("UPDATE traces SET status = 'interrupted', ended_at = ? WHERE status = 'running' AND heartbeat_at < ?").run(iso(nowMs), iso(nowMs - leaseMs));
  return Number(r.changes);
}
let recovered = false;

/** Deletes finished traces older than the retention period (spans and llm_calls cascade). Never touches running traces. */
export function pruneTraces(db: Db, { olderThanDays = 7, nowMs = cfg.now() } = {}): number {
  const cutoff = iso(nowMs - olderThanDays * 86_400_000);
  const r = db.prepare("DELETE FROM traces WHERE status IN ('ok','error','interrupted') AND started_at < ?").run(cutoff);
  return Number(r.changes);
}

// ---- helpers -----------------------------------------------------------------------------------------------------
/** Allowlisted keys only; string values redacted and cut; the whole set is capped in UTF-8 bytes. Called on the MERGED set at every update. */
function cleanAttrs(kind: string, attrs: Attrs = {}): Attrs {
  const allowed = new Set(ALLOWED[kind] ?? []);
  const out: Attrs = {};
  let bytes = 0;
  for (const [k, v] of Object.entries(attrs)) {
    if (!allowed.has(k) || v === undefined) continue;
    const val = typeof v === 'string' ? capText(redactText(v), 200).text : v;
    bytes += Buffer.byteLength(k) + Buffer.byteLength(String(val));
    if (bytes > LIMITS.attrBytes) break;
    out[k] = val;
  }
  return out;
}
const label = (s: string, max = 120): string => capText(redactText(s), max).text;
const state = (): TraceState | undefined => currentCtx()?.trace as TraceState | undefined;
export const currentTraceId = (): string | undefined => currentCtx()?.traceId;
export const currentSpanId = (): string | null => currentCtx()?.spanId ?? null;

// ---- the API -----------------------------------------------------------------------------------------------------
export interface SpanHandle { id: string | null; set(attrs: Attrs): void; fail(message: string): void }
const NOOP: SpanHandle = { id: null, set() {}, fail() {} };

export async function withTrace<T>(init: { kind: TraceKind; name: string; attrs?: Attrs; id?: string }, fn: (traceId: string) => Promise<T> | T): Promise<T> {
  let t: TraceState;
  try { t = newTraceState(init); } catch (e) { // telemetry set-up failed: run the application code untraced, and say so
    try { logger.warn('trace.persist_failed', { stage: 'init', error: e as Error }); } catch { /* contained */ }
    return fn(randomBytes(8).toString('hex'));
  }
  return runTrace(t, init, fn);
}

function newTraceState(init: { kind: TraceKind; name: string; attrs?: Attrs; id?: string }): TraceState {
  const t: TraceState = { id: init.id ?? randomBytes(8).toString('hex'), name: label(init.name), kind: init.kind, started: iso(), attrs: cleanAttrs(init.kind, init.attrs), spans: [], llm: [], payloadBytes: 0, truncated: false, dropped: 0, leaseLost: false, persisted: false, getDb: cfg.getDb };
  t.started = iso();
  return t;
}

async function runTrace<T>(t: TraceState, init: { kind: TraceKind; name: string }, fn: (traceId: string) => Promise<T> | T): Promise<T> {
  try {
    const db = t.getDb();
    if (!recovered) { recovered = true; try { recoverStale(db); } catch { /* best effort */ } }
    db.prepare("INSERT INTO traces(id, name, kind, status, started_at, owner_id, heartbeat_at, attributes_json) VALUES (?,?,?,?,?,?,?,?)")
      .run(t.id, t.name, t.kind, 'running', t.started, OWNER_ID, t.started, JSON.stringify(t.attrs));
    t.persisted = true;
  } catch (e) { logger.warn('trace.persist_failed', { traceId: t.id, stage: 'root-insert', error: e as Error }); }
  open.add(t);
  ensureTimer();
  let status: 'ok' | 'error' = 'ok';
  try {
    return await runWithCtx({ traceId: t.id, spanId: null, trace: t }, () => fn(t.id));
  } catch (e) { status = 'error'; throw e; }
  finally {
    open.delete(t);
    try { finish(t, status); } catch (e) { try { logger.warn('trace.persist_failed', { traceId: t.id, stage: 'finish', error: e as Error }); } catch { /* contained */ } }
  }
}

/** Set attributes on the trace root (for example the final HTTP status). */
export function setTraceAttrs(attrs: Attrs): void {
  const t = state();
  if (t) t.attrs = cleanAttrs(t.kind, { ...t.attrs, ...attrs });
}

export async function withSpan<T>(kind: SpanKind, name: string, attrs: Attrs | undefined, fn: (s: SpanHandle) => Promise<T> | T): Promise<T> {
  const ctx = currentCtx();
  const t = ctx?.trace as TraceState | undefined;
  if (!ctx || !t) return fn(NOOP);
  if (t.spans.length >= LIMITS.spans) { t.dropped += 1; return fn(NOOP); } // no allocation; children attach to the nearest kept ancestor
  let rec: SpanRec;
  try {
    rec = { id: newId(), parent: ctx.spanId, kind, name: label(name), start: iso(), end: null, status: 'ok', attrs: cleanAttrs(kind, attrs), error: null, attempts: 0 };
  } catch { return fn(NOOP); } // telemetry set-up failed (for example a failing clock): the application code still runs
  t.spans.push(rec);
  const handle: SpanHandle = {
    id: rec.id,
    set(a) { rec.attrs = cleanAttrs(kind, { ...rec.attrs, ...a }); },
    fail(message) { rec.status = 'error'; try { rec.error = safeError(message); } catch { rec.error = 'error'; } },
  };
  const next: Ctx = { traceId: ctx.traceId, spanId: rec.id, trace: t };
  try {
    return await runWithCtx(next, () => fn(handle));
  } catch (e) { // bookkeeping must never replace the application's own exception
    try { if (rec.status !== 'error') { rec.status = 'error'; rec.error = safeError(e); } } catch { rec.error = 'error'; }
    throw e;
  } finally { try { rec.end = iso(); } catch { rec.end = null; } }
}

// ---- llm attempts ------------------------------------------------------------------------------------------------
export const sha12 = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12);

export interface AttemptInput {
  attempt: number; provider: string; model?: string; promptId?: string; promptSha?: string;
  request?: unknown; response?: string; status: 'ok' | 'error'; httpStatus?: number; latencyMs?: number;
  promptTokens?: number; completionTokens?: number;
}
/** One row per HTTP attempt, attached to the current llm span. At most LIMITS.attempts rows per logical call. */
export function recordLlmAttempt(a: AttemptInput): void {
  try { recordAttempt(a); } catch (e) { try { logger.warn('trace.attempt_failed', { error: e as Error }); } catch { /* contained */ } }
}
function recordAttempt(a: AttemptInput): void {
  const t = state();
  const spanId = currentSpanId();
  if (!t || !spanId) return;
  const span = t.spans.find((s) => s.id === spanId);
  if (!span || span.attempts >= LIMITS.attempts) return;
  span.attempts += 1;
  const mode = process.env.TRACE_PAYLOADS || 'full';
  let request: string | null = null; let response: string | null = null; let original = 0; let truncated = 0;
  const room = (size: number): boolean => { if (t.payloadBytes + size > LIMITS.payloadTrace) { t.truncated = true; truncated = 1; return false; } t.payloadBytes += size; return true; }; // checked before buffering
  if (mode === 'full') {
    if (a.request !== undefined) {
      // structured redaction BEFORE serialisation (secret-named keys blanked, key names redacted, traversal bounded)
      const json = JSON.stringify(redactDeep(a.request));
      original += Buffer.byteLength(json);
      // a capped request is still valid JSON: an envelope with the first part of the text
      const c = capText(json, LIMITS.payloadField);
      const text = c.truncated ? JSON.stringify({ truncated: true, original_bytes: c.original_bytes, head: capText(json, Math.floor(LIMITS.payloadField / 2)).text }) : c.text;
      if (c.truncated) truncated = 1;
      request = room(Buffer.byteLength(text)) ? text : null;
    }
    if (a.response !== undefined) {
      original += Buffer.byteLength(a.response); // the size of what the provider sent
      const red = redactBounded(a.response, LIMITS.payloadField * 4); // boundary-safe: a secret straddling the cut cannot leave a prefix
      const c = capText(red.text, LIMITS.payloadField);
      if (c.truncated || red.cut) truncated = 1;
      response = room(Buffer.byteLength(c.text)) ? c.text : null;
    }
  } else if (mode === 'meta') {
    original = Buffer.byteLength(JSON.stringify(a.request ?? '')) + Buffer.byteLength(a.response ?? '');
  }
  t.llm.push({ span: spanId, attempt: span.attempts, provider: label(a.provider, 40), model: a.model ? label(a.model, 80) : null, prompt_id: a.promptId ? label(a.promptId, 80) : null, prompt_sha: a.promptSha ?? null, request, response, original_bytes: original, truncated, status: a.status, http_status: a.httpStatus ?? null, latency_ms: a.latencyMs ?? null, prompt_tokens: a.promptTokens ?? null, completion_tokens: a.completionTokens ?? null });
}

// ---- flush -------------------------------------------------------------------------------------------------------
function finish(t: TraceState, status: 'ok' | 'error'): void {
  if (!t.persisted || t.leaseLost) {
    if (t.leaseLost) logger.warn('trace.lease_lost', { traceId: t.id, where: 'flush', discarded_spans: t.spans.length });
    return;
  }
  try {
    const db = t.getDb(); // acquiring the connection can fail too: it is inside the contained block
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = db.prepare("UPDATE traces SET status = ?, ended_at = ?, attributes_json = ?, truncated = ?, dropped_spans = ? WHERE id = ? AND owner_id = ? AND status = 'running'")
        .run(status, iso(), JSON.stringify(t.attrs), t.truncated ? 1 : 0, t.dropped, t.id, OWNER_ID);
      if (Number(r.changes) === 0) { db.exec('ROLLBACK'); logger.warn('trace.lease_lost', { traceId: t.id, where: 'flush', discarded_spans: t.spans.length }); return; }
      const sp = db.prepare('INSERT INTO spans(id, trace_id, parent_id, kind, name, start, end, status, attributes_json, error) VALUES (?,?,?,?,?,?,?,?,?,?)');
      for (const s of t.spans) sp.run(s.id, t.id, s.parent, s.kind, s.name, s.start, s.end ?? iso(), s.status, JSON.stringify(s.attrs), s.error);
      const lc = db.prepare('INSERT INTO llm_calls(span_id, attempt, provider, model, prompt_id, prompt_sha, request_json, response_raw, original_bytes, truncated, status, http_status, latency_ms, prompt_tokens, completion_tokens) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const l of t.llm) lc.run(l.span, l.attempt, l.provider, l.model, l.prompt_id, l.prompt_sha, l.request, l.response, l.original_bytes, l.truncated, l.status, l.http_status, l.latency_ms, l.prompt_tokens, l.completion_tokens);
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch { /* not in a transaction */ } throw e; }
  } catch (e) { logger.warn('trace.persist_failed', { traceId: t.id, stage: 'flush', error: e as Error }); }
}

// ---- reading ---------------------------------------------------------------------------------------------------
export function getTrace(db: Db, id: string) {
  const trace = db.prepare('SELECT * FROM traces WHERE id = ?').get(id);
  if (!trace) return null;
  const spans = db.prepare('SELECT * FROM spans WHERE trace_id = ? ORDER BY start, rowid').all(id);
  const llm = db.prepare('SELECT l.* FROM llm_calls l JOIN spans s ON s.id = l.span_id WHERE s.trace_id = ? ORDER BY l.id').all(id);
  return { trace, spans, llm };
}
export const lastTraceId = (db: Db): string | null => db.prepare('SELECT id FROM traces ORDER BY started_at DESC, rowid DESC LIMIT 1').get()?.id ?? null;

/** Plain-text tree for `pnpm harness trace <id>`. */
export function renderTrace(db: Db, id: string): string {
  const d = getTrace(db, id);
  if (!d) return `no trace ${id} (it may have been pruned)`;
  const ms = (a: string, b: string | null) => (b ? `${Math.max(0, Date.parse(b) - Date.parse(a))}ms` : 'open');
  const a = (j: string) => { const o = JSON.parse(j || '{}'); const e = Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' '); return e ? `  ${e}` : ''; };
  const lines = [`${d.trace.kind} ${d.trace.name}  [${d.trace.status}]  ${ms(d.trace.started_at, d.trace.ended_at)}  id=${d.trace.id}${d.trace.truncated ? '  (payloads truncated)' : ''}${d.trace.dropped_spans ? `  (${d.trace.dropped_spans} spans dropped)` : ''}${a(d.trace.attributes_json)}`];
  const children = new Map<string | null, any[]>();
  for (const s of d.spans) { const k = s.parent_id ?? null; (children.get(k) ?? children.set(k, []).get(k)!).push(s); }
  const walk = (parent: string | null, depth: number) => {
    for (const s of children.get(parent) ?? []) {
      lines.push(`${'  '.repeat(depth)}- ${s.kind} ${s.name}  [${s.status}]  ${ms(s.start, s.end)}${a(s.attributes_json)}${s.error ? `  error: ${s.error}` : ''}`);
      for (const l of d.llm.filter((x: any) => x.span_id === s.id)) {
        lines.push(`${'  '.repeat(depth + 1)}~ attempt ${l.attempt} ${l.provider}/${l.model ?? '?'}  [${l.status}${l.http_status ? ` ${l.http_status}` : ''}]  ${l.latency_ms ?? '?'}ms  prompt=${l.prompt_id ?? '?'}@${l.prompt_sha ?? '?'}  tokens=${l.prompt_tokens ?? '?'}/${l.completion_tokens ?? '?'}  bytes=${l.original_bytes}${l.truncated ? ' (truncated)' : ''}`);
      }
      walk(s.id, depth + 1);
    }
  };
  walk(null, 1);
  return lines.join('\n');
}

=== app-next/lib/obs/logger.ts ===
// Structured logger: one JSON line per event on stdout (pretty in a terminal during development).
// Every line carries traceId / spanId when a trace is active. Redaction happens here, before anything is written.
import { currentCtx } from './context.ts';
import { redactDeep, safeError } from './redact.ts';

export type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

let sink: (line: string) => void = (line) => { process.stdout.write(`${line}\n`); };
/** Tests capture output here. Returns a function that restores the previous sink. */
export function setLogSink(fn: (line: string) => void): () => void {
  const prev = sink;
  sink = fn;
  return () => { sink = prev; };
}

const threshold = (): number => ORDER[process.env.LOG_LEVEL || 'info'] ?? ORDER.info!;

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  try { // logging must never break the caller: preprocessing is inside the guard too
    if (ORDER[level]! < threshold()) return;
    const ctx = currentCtx();
    // Errors become redacted text FIRST, then ONE structured redaction pass covers every key and value (nothing is restored afterwards)
    const prepared = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v instanceof Error ? safeError(v) : v]));
    const clean = redactDeep(prepared) as Record<string, unknown>;
    const record = { level, time: new Date().toISOString(), msg: safeError(msg, 300), ...(ctx ? { traceId: ctx.traceId, spanId: ctx.spanId } : {}), ...clean };
    const pretty = process.env.NODE_ENV === 'development' && process.stdout.isTTY;
    sink(pretty ? `${record.time} ${level.toUpperCase().padEnd(5)} ${record.msg}${ctx ? ` [${ctx.traceId.slice(0, 8)}]` : ''} ${JSON.stringify(clean)}` : JSON.stringify(record));
  } catch { /* contained */ }
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => log('debug', msg, f),
  info: (msg: string, f?: Record<string, unknown>) => log('info', msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => log('warn', msg, f),
  error: (msg: string, f?: Record<string, unknown>) => log('error', msg, f),
};

=== app-next/test/unit/review-fixes-2.test.ts ===
// Regression tests for pass 2 of the pre-merge review (Codex, 2026-11-08).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../lib/db/connection.ts';
import { capText, redactBounded } from '../../lib/obs/redact.ts';
import { checkOrigin } from '../../lib/obs/route.ts';
import { configureTracing, getTrace, recordLlmAttempt, withSpan, withTrace } from '../../lib/obs/tracer.ts';
import { logger, setLogSink } from '../../lib/obs/logger.ts';

const newDb = () => { const db = openDb(':memory:'); configureTracing({ getDb: () => db }); return db; };

test('P2-1. the logger redacts Error values and their keys in one pass: nothing is restored afterwards', () => {
  const lines: string[] = [];
  const restore = setLogSink((l) => lines.push(l));
  try {
    logger.warn('x', { password: new Error('hunter2'), 'jane@example.org': new Error('contact jane@example.org'), ok: new Error('sk-live-0123456789abcdef failed') });
  } finally { restore(); }
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0]!, /hunter2|jane@example|sk-live/);
  assert.match(lines[0]!, /"password":"\[redacted\]"/);
});

test('P2-2. containment: BigInt payloads, throwing getters, a failing clock and a throwing message never change the application result or exception', async () => {
  const db = newDb();
  const restore = setLogSink(() => {});
  try {
    const out = await withTrace({ kind: 'http', name: 'x' }, async () => {
      await withSpan('llm', 'x', {}, async () => {
        recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok', request: { big: 10n, nested: { n: 5n } } as any });
        const evil = { get boom(): string { throw new Error('getter exploded'); } };
        recordLlmAttempt({ attempt: 2, provider: 'p', status: 'ok', request: evil as any });
      });
      return 'application result';
    });
    assert.equal(out, 'application result');
    // the original exception is preserved even when its message cannot be converted
    const nasty: any = new Error('real');
    Object.defineProperty(nasty, 'message', { get() { throw new Error('message getter'); } });
    await assert.rejects(withTrace({ kind: 'http', name: 'y' }, () => withSpan('stage', 'z', {}, () => { throw nasty; })), (e: any) => e === nasty);
    // a failing clock
    let ticks = 0;
    configureTracing({ getDb: () => db, now: () => { ticks += 1; if (ticks > 2) throw new Error('clock failed'); return Date.now(); } });
    assert.equal(await withTrace({ kind: 'http', name: 'clock' }, async () => withSpan('stage', 's', {}, async () => 'still fine')), 'still fine');
    // trace set-up failure (an attribute getter) still runs the callback
    const badInit: any = { kind: 'http', name: 'n', attrs: { get method(): string { throw new Error('attr getter'); } } };
    assert.equal(await withTrace(badInit, async () => 'ran untraced'), 'ran untraced');
  } finally { restore(); configureTracing({ getDb: () => db }); }
});

test('P2-3. boundary-safe redaction: a secret straddling the cut leaves no prefix, even when earlier redactions shrink the text', () => {
  process.env.OPENAI_API_KEY = 'straddleSecret-0123456789abcdef';
  try {
    const limit = 10_000;
    const emails = 'jane.doe@example.org '.repeat(300); // shrinks a lot when redacted
    const padding = 'a'.repeat(limit - emails.length - 10); // the secret starts 10 characters before the cut
    const text = `${emails}${padding}${process.env.OPENAI_API_KEY}${'z'.repeat(5000)}`;
    const r = redactBounded(text, limit);
    assert.ok(r.cut);
    assert.doesNotMatch(r.text, /straddle|Secret-0123|0123456789abcdef/);
    assert.doesNotMatch(r.text, /jane\.doe@example/);
    assert.ok(r.text.length < limit);
    // without a cut nothing is dropped
    const small = redactBounded('hello jane.doe@example.org', limit);
    assert.deepEqual(small, { text: 'hello [redacted]', cut: false });
  } finally { process.env.OPENAI_API_KEY = ''; }
});

test('P2-4. work is bounded by the cap, not the input; tiny caps keep nothing; a capped request is valid JSON', async () => {
  assert.equal(capText('x'.repeat(100), 8).text, '');
  assert.equal(capText('abc', 8).text, 'abc');
  const huge = 'é'.repeat(5_000_000);
  const t0 = Date.now();
  const c = capText(huge, 4096);
  assert.ok(Buffer.byteLength(c.text) <= 4096 && c.truncated);
  assert.ok(Date.now() - t0 < 2000, 'capping a 10 MB string is fast (no whole-input buffer copy)');
  const db = newDb();
  const id = await withTrace({ kind: 'http', name: 'envelope' }, async (tid) => {
    await withSpan('llm', 'x', {}, async () => { recordLlmAttempt({ attempt: 1, provider: 'p', status: 'ok', request: { text: 'q'.repeat(200_000) }, response: 'r'.repeat(300_000) }); });
    return tid;
  });
  const l = getTrace(db, id)!.llm[0];
  const parsed = JSON.parse(l.request_json); // valid JSON even though it was capped
  assert.equal(parsed.truncated, true);
  assert.ok(l.original_bytes >= 500_000, 'original_bytes counts the provider text and the request before capping');
});

test('P2-5. origin: only a bare origin is accepted (no path or credentials); the Host header decides host and port', () => {
  const fake = (url: string, headers: Record<string, string>) => ({ url, headers: new Headers(headers) }) as unknown as Request;
  const pass = (r: Request, trusted: string[] = []) => { try { checkOrigin(r, trusted); return true; } catch { return false; } };
  // Next builds req.url from its bind address (localhost); the browser asked for 127.0.0.1:3000
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' })), true);
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: '127.0.0.1:3000', origin: 'http://localhost:3000' })), false, 'Origin must equal the Host that was asked for');
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: 'evil.example', origin: 'http://127.0.0.1:3000' })), false);
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000/path' })), false);
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: '127.0.0.1:3000', origin: 'http://user:pw@127.0.0.1:3000' })), false);
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: 'app.internal', origin: 'https://app.example.org' }), ['https://app.example.org']), true, 'proxy origin listed in TRUSTED_ORIGINS');
  assert.equal(pass(fake('http://localhost:3000/api/x', { host: 'app.internal', origin: 'https://app.example.org' })), false, 'not listed');
});
