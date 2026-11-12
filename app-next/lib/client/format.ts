// Browser-safe helpers (no Node imports): dates and the API client. The client sends JSON; errors follow the contract
// { error: { code, message, issues?, traceId } } and are turned into a readable Error that remembers the trace id.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (d?: string | null): string => (d ? `${d.slice(8, 10)} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : '');
export const AVATAR_COLORS = ['#7d9cc6', '#c9a24d', '#8a7fb8', '#5f9f8a', '#c27c6b', '#6c8296'];
export const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

export class ApiError extends Error {
  code: string;
  traceId?: string;
  constructor(message: string, code = 'error', traceId?: string) { super(message); this.name = 'ApiError'; this.code = code; this.traceId = traceId; }
}

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new ApiError('Could not reach the server. Check that it is running and try again.', 'network'); }
  let json: any = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const e = json?.error;
    // validation errors read best as the first field message
    const message = e?.issues?.[0]?.message ?? e?.message ?? res.statusText ?? 'Request failed';
    throw new ApiError(message, e?.code, e?.traceId ?? res.headers.get('x-trace-id') ?? undefined);
  }
  return json as T;
}

export const wait = (ms: number, reduced = false): Promise<void> => new Promise((res) => setTimeout(res, reduced ? 0 : ms));
export const prefersReducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
