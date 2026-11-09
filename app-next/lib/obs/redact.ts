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

/** Text within this distance of an input cut is dropped AFTER redaction. Must exceed the longest secret: configured secrets are measured, patterns are shorter (an email is under 320 characters; an unbounded token still matches as a prefix). */
export const BOUNDARY_MARGIN = 512;
const margin = (): number => Math.max(BOUNDARY_MARGIN, ...envSecrets().map((s) => s.length + 64));
/**
 * Redact a possibly huge text safely: only the first `limit` characters are scanned; because a secret that straddles the cut
 * would leave an unmatched prefix, the last BOUNDARY_MARGIN characters of the redacted result are dropped when a cut happened.
 */
export function redactBounded(text: string, limit: number): { text: string; cut: boolean } {
  if (text.length <= limit) return { text: redactText(text), cut: false };
  const red = redactText(text.slice(0, Math.max(limit, 2 * margin()))); // the scanned window is always larger than the margin
  return { text: red.slice(0, Math.max(0, red.length - margin())), cut: true };
}

const SENSITIVE_KEYS = /^(authorization|api[-_]?key|x-api-key|password|secret|token)$/i;

/** Deep copy with secret-named keys blanked and every string redacted. */
/** At most `n` own enumerable entries; values (and so getters) beyond the limit are never read. */
export function boundedEntries(obj: object, n: number): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const k in obj) {
    if (!Object.hasOwn(obj, k)) continue;
    if (out.length >= n) break;
    out.push([k, (obj as Record<string, unknown>)[k]]);
  }
  return out;
}

export function redactDeep(value: unknown, depth = 0, budget = { nodes: 5000 }): unknown {
  if (depth > 12 || budget.nodes-- <= 0) return '[truncated]'; // bounded traversal
  if (typeof value === 'string') return redactBounded(value, 262_144).text;
  if (typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.slice(0, 1000).map((v) => redactDeep(v, depth + 1, budget));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of boundedEntries(value, 200)) {
      // key names are redacted too; a very long key is replaced whole (cutting it before redaction could leave a secret prefix)
      out[k.length > 200 ? '(long key)' : redactText(k)] = SENSITIVE_KEYS.test(k) ? REDACTED : redactDeep(v, depth + 1, budget);
    }
    return out;
  }
  return value;
}

/** Error text for spans, logs and API bodies: redacted and short. */
export function safeError(e: unknown, max = 500): string {
  const msg = e instanceof Error ? e.message : String(e);
  return capText(redactText(msg), max).text;
}
