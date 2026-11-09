// The wrapper every API route and page loader goes through.
// Order matters: the trace id and AsyncLocalStorage context come FIRST, so even a rejected request (400, 403, 413, 415)
// has a trace context, an x-trace-id header and a traceId in its error body. Only Web-standard types are used here
// (Request, Response), so this file has no dependency on Next.js.
import type { z } from 'zod';
import { AppError, STATUS, errorBody, type ErrorCode } from '../contracts/errors.ts';
import { MAX_BODY_BYTES, issuesToMessages } from '../contracts/api.ts';
import { logger } from './logger.ts';
import { safeError } from './redact.ts';
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
export function checkOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin) {
    let same = false;
    try { same = new URL(origin).host === host; } catch { same = false; }
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
  if (e instanceof AppError) return respond(e.status, errorBody(e.code, e.message, traceId, e.issues), traceId);
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code in STATUS && code !== 'internal') return respond(STATUS[code as ErrorCode], errorBody(code as ErrorCode, safeError(e), traceId), traceId);
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
    let response!: Response;
    await withTrace({ kind: 'http', name: `${spec.method} ${spec.pattern}`, attrs: { method: spec.method, route: spec.pattern } }, async (traceId) => {
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
      } finally { setTraceAttrs({ status }); }
    }).catch(() => { /* the error response is already built above */ });
    return response;
  };
  return run;
}

/** Page data loaders (Server Components) get a page trace too. They are read-only. */
export function loadPage<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  return withTrace({ kind: 'page', name, attrs: { route: name } }, async () => fn());
}
