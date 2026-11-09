// Environment variables, parsed once with a clear error. The error text never contains a value.
import { z } from 'zod';

const EnvSchema = z.object({
  HARNESS_MODEL: z.enum(['replay', 'openai']).default('replay'),
  HARNESS_ASSIST: z.enum(['replay']).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o'),
  OPENAI_BASE_URL: z.url().optional(),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(120000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  TRACE_PAYLOADS: z.enum(['full', 'meta', 'off']).default('full'),
  TRACE_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(7),
}).refine((e) => e.HARNESS_MODEL !== 'openai' || !!e.OPENAI_API_KEY, { message: 'HARNESS_MODEL=openai needs OPENAI_API_KEY', path: ['OPENAI_API_KEY'] });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const pick = Object.fromEntries(Object.keys(EnvSchema.shape).map((k) => [k, source[k] === '' ? undefined : source[k]]));
  const r = EnvSchema.safeParse(pick);
  if (r.success) return r.data;
  // names and rules only, never the received values
  const lines = r.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`);
  throw new Error(`invalid environment: ${lines.join('; ')}`);
}
