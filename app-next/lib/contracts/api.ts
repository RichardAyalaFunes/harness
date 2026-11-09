// Request contracts for every API route. The same schemas are used by the route handlers and by the UI forms.
// Issue text is plain language and never contains the received value.
import { z } from 'zod';
import { AppError, type Issue } from './errors.ts';

export const MIN_REASON = 10;
export const MAX_REASON = 500;
export const MIN_ANSWER_HINT = 20; // the domain rule decides; the schema only bounds the size
export const MAX_ANSWER = 4000;
export const MAX_QUESTION = 500;
export const MAX_BODY_BYTES = 1_000_000;

const actor = z.string().trim().min(1, 'name is required').max(40, 'keep the name under 40 characters');
export const IdParam = z.string().regex(/^[1-9]\d{0,9}$/, 'must be a whole number above 0').transform(Number);
export const SlugParam = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'must be a short lowercase id');

export const ApproveBody = z.object({ by: actor.optional() }).strict();
export const RejectBody = z.object({
  by: actor.optional(),
  reason: z.string().trim().min(MIN_REASON, `write at least ${MIN_REASON} characters`).max(MAX_REASON, `keep it under ${MAX_REASON} characters`),
}).strict();
export const MoveBody = z.object({ to: z.number({ error: 'choose a stage' }).int('choose a stage').min(0, 'choose a stage').max(4, 'choose a stage') }).strict();
export const CompleteBody = z.object({
  recruiter: actor.optional(),
  response: z.string().max(MAX_ANSWER, `keep the answer under ${MAX_ANSWER} characters`).optional(),
  accepted: z.array(z.number().int().min(0).max(50)).max(50).optional(),
  none_needed: z.boolean().optional(),
}).strict();
// History is tolerant on purpose: entries with other roles are dropped by the domain (as before), not rejected.
export const AskBody = z.object({
  question: z.string().trim().min(3, 'write a question first').max(MAX_QUESTION, `keep the question under ${MAX_QUESTION} characters`),
  history: z.array(z.object({ role: z.string().max(20), content: z.string().max(5000) })).max(50).optional(),
}).strict();

export const DiffQuery = z.object({
  from: IdParam.optional(),
  to: IdParam.optional(),
}).strict();
export const StagesQuery = z.object({ source: z.string().regex(/^[a-z0-9-]{1,20}$/, 'must be a source id').optional() }).strict();
export const NoQuery = z.object({}).strict();

export type RejectBody = z.infer<typeof RejectBody>;
export type AskBody = z.infer<typeof AskBody>;
export type MoveBody = z.infer<typeof MoveBody>;
export type CompleteBody = z.infer<typeof CompleteBody>;

/** Zod issues -> user text. Same function for the API and the UI forms, so both show the same words. */
export function issuesToMessages(error: z.ZodError): Issue[] {
  return error.issues.map((i) => {
    const path = i.path.join('.') || '(body)';
    const message = i.code === 'unrecognized_keys' ? `unexpected field: ${i.keys.join(', ')}` : i.message;
    return { path, message };
  });
}

/** Parse or throw the 400 contract error. */
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown, what = 'request'): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issues = issuesToMessages(r.error);
    throw new AppError('validation', `${what} is not valid: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`, issues);
  }
  return r.data;
}

/** First message for one field, for inline form errors. */
export function fieldMessage(schema: z.ZodType, input: unknown): string | null {
  const r = schema.safeParse(input);
  return r.success ? null : issuesToMessages(r.error)[0]?.message ?? 'not valid';
}
