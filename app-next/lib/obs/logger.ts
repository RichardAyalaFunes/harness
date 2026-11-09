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
  if (ORDER[level]! < threshold()) return;
  const ctx = currentCtx();
  const clean = redactDeep(fields) as Record<string, unknown>;
  for (const [k, v] of Object.entries(fields)) if (v instanceof Error) clean[k] = safeError(v);
  const record = { level, time: new Date().toISOString(), msg: safeError(msg, 300), ...(ctx ? { traceId: ctx.traceId, spanId: ctx.spanId } : {}), ...clean };
  const pretty = process.env.NODE_ENV === 'development' && process.stdout.isTTY;
  sink(pretty ? `${record.time} ${level.toUpperCase().padEnd(5)} ${record.msg}${ctx ? ` [${ctx.traceId.slice(0, 8)}]` : ''} ${JSON.stringify(clean)}` : JSON.stringify(record));
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => log('debug', msg, f),
  info: (msg: string, f?: Record<string, unknown>) => log('info', msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => log('warn', msg, f),
  error: (msg: string, f?: Record<string, unknown>) => log('error', msg, f),
};
