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
import { capText, redactDeep, safeError } from './redact.ts';

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
function cleanAttrs(kind: string, attrs: Attrs = {}): Attrs {
  const allowed = new Set(ALLOWED[kind] ?? []);
  const out: Attrs = {};
  let bytes = 0;
  for (const [k, v] of Object.entries(attrs)) {
    if (!allowed.has(k) || v === undefined) continue;
    const val = typeof v === 'string' ? capText(v, 200).text : v;
    bytes += k.length + String(val).length;
    if (bytes > LIMITS.attrBytes) break;
    out[k] = val;
  }
  return out;
}
const state = (): TraceState | undefined => currentCtx()?.trace as TraceState | undefined;
export const currentTraceId = (): string | undefined => currentCtx()?.traceId;
export const currentSpanId = (): string | null => currentCtx()?.spanId ?? null;

// ---- the API -----------------------------------------------------------------------------------------------------
export interface SpanHandle { id: string | null; set(attrs: Attrs): void; fail(message: string): void }
const NOOP: SpanHandle = { id: null, set() {}, fail() {} };

export async function withTrace<T>(init: { kind: TraceKind; name: string; attrs?: Attrs; id?: string }, fn: (traceId: string) => Promise<T> | T): Promise<T> {
  const t: TraceState = { id: init.id ?? randomBytes(8).toString('hex'), name: init.name, kind: init.kind, started: iso(), attrs: cleanAttrs(init.kind, init.attrs), spans: [], llm: [], payloadBytes: 0, truncated: false, dropped: 0, leaseLost: false, persisted: false, getDb: cfg.getDb };
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
    finish(t, status);
  }
}

/** Set attributes on the trace root (for example the final HTTP status). */
export function setTraceAttrs(attrs: Attrs): void {
  const t = state();
  if (t) t.attrs = { ...t.attrs, ...cleanAttrs(t.kind, attrs) };
}

export async function withSpan<T>(kind: SpanKind, name: string, attrs: Attrs | undefined, fn: (s: SpanHandle) => Promise<T> | T): Promise<T> {
  const ctx = currentCtx();
  const t = ctx?.trace as TraceState | undefined;
  if (!ctx || !t) return fn(NOOP);
  if (t.spans.length >= LIMITS.spans) { t.dropped += 1; return fn(NOOP); } // no allocation; children attach to the nearest kept ancestor
  const rec: SpanRec = { id: newId(), parent: ctx.spanId, kind, name: capText(name, 120).text, start: iso(), end: null, status: 'ok', attrs: cleanAttrs(kind, attrs), error: null, attempts: 0 };
  t.spans.push(rec);
  const handle: SpanHandle = {
    id: rec.id,
    set(a) { rec.attrs = { ...rec.attrs, ...cleanAttrs(kind, a) }; },
    fail(message) { rec.status = 'error'; rec.error = safeError(message); },
  };
  const next: Ctx = { traceId: ctx.traceId, spanId: rec.id, trace: t };
  try {
    return await runWithCtx(next, () => fn(handle));
  } catch (e) { if (rec.status !== 'error') { rec.status = 'error'; rec.error = safeError(e); } throw e; }
  finally { rec.end = iso(); }
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
  const t = state();
  const spanId = currentSpanId();
  if (!t || !spanId) return;
  const span = t.spans.find((s) => s.id === spanId);
  if (!span || span.attempts >= LIMITS.attempts) return;
  span.attempts += 1;
  const mode = process.env.TRACE_PAYLOADS || 'full';
  let request: string | null = null; let response: string | null = null; let original = 0; let truncated = 0;
  const store = (v: string): string | null => {
    const redacted = capText(JSON.stringify(redactDeep(v)).slice(1, -1), LIMITS.payloadField); // string body without quotes
    original += redacted.original_bytes;
    if (redacted.truncated) truncated = 1;
    if (t.payloadBytes + Buffer.byteLength(redacted.text) > LIMITS.payloadTrace) { t.truncated = true; truncated = 1; return null; } // checked before buffering
    t.payloadBytes += Buffer.byteLength(redacted.text);
    return redacted.text;
  };
  if (mode === 'full') {
    if (a.request !== undefined) request = store(JSON.stringify(a.request));
    if (a.response !== undefined) response = store(a.response);
  } else if (mode === 'meta') {
    original = Buffer.byteLength(JSON.stringify(a.request ?? '')) + Buffer.byteLength(a.response ?? '');
  }
  t.llm.push({ span: spanId, attempt: span.attempts, provider: a.provider, model: a.model ?? null, prompt_id: a.promptId ?? null, prompt_sha: a.promptSha ?? null, request, response, original_bytes: original, truncated, status: a.status, http_status: a.httpStatus ?? null, latency_ms: a.latencyMs ?? null, prompt_tokens: a.promptTokens ?? null, completion_tokens: a.completionTokens ?? null });
}

// ---- flush -------------------------------------------------------------------------------------------------------
function finish(t: TraceState, status: 'ok' | 'error'): void {
  if (!t.persisted || t.leaseLost) {
    if (t.leaseLost) logger.warn('trace.lease_lost', { traceId: t.id, where: 'flush', discarded_spans: t.spans.length });
    return;
  }
  const db = t.getDb();
  try {
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
