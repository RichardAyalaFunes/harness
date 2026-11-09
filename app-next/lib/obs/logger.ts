// Structured logger: one JSON line per event on stdout (pretty in a terminal during development).
// Every line carries traceId / spanId when a trace is active. Redaction happens here, before anything is written.
import { currentCtx } from './context.ts';
import { boundedEntries, redactDeep, safeError } from './redact.ts';

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
    const prepared = Object.fromEntries(boundedEntries(fields, 50).map(([k, v]) => [k, v instanceof Error ? safeError(v) : v]));
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
