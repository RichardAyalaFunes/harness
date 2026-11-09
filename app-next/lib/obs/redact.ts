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

export function capText(text: string, max: number): { text: string; truncated: boolean; original_bytes: number } {
  const original_bytes = Buffer.byteLength(text);
  if (original_bytes <= max) return { text, truncated: false, original_bytes };
  return { text: `${Buffer.from(text).subarray(0, max).toString('utf8')}…[truncated]`, truncated: true, original_bytes };
}

const SENSITIVE_KEYS = /^(authorization|api[-_]?key|x-api-key|password|secret|token)$/i;

/** Deep copy with secret-named keys blanked and every string redacted. */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[deep]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEYS.test(k) ? REDACTED : redactDeep(v, depth + 1);
    return out;
  }
  return value;
}

/** Error text for spans, logs and API bodies: redacted and short. */
export function safeError(e: unknown, max = 500): string {
  const msg = e instanceof Error ? e.message : String(e);
  return capText(redactText(msg), max).text;
}
