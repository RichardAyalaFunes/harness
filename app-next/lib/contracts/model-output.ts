// Typed shape of what the live model must return. The hand-written validator in extraction.ts (validateExtraction) and the
// semantic checks in lib/domain/checks.ts remain the gate that decides acceptance and produce the error texts the
// repair attempt sends back. These Zod schemas give the same shape a type and are tested against every stored replay output.
import { z } from 'zod';

export const Severity = z.enum(['none', 'minor', 'material', 'critical']);
export const Weight = z.enum(['must', 'trainable', 'nice', 'proposed']);

export const Change = z.object({
  field: z.string().min(1),
  op: z.enum(['set', 'add', 'remove']),
  value: z.string().min(1).optional(),
  severity: Severity,
  quote: z.string().min(1),
  start: z.number().int().optional(),
  end: z.number().int().optional(),
  weight: Weight.optional(),
  status: z.enum(['applied', 'not_applied_bias', 'pending']).optional(),
  bias: z.object({ kind: z.enum(['protected', 'proxy']), note: z.string().min(1) }).strict().optional(),
  confirmed: z.boolean().optional(),
  conflicts_with: z.string().optional(),
}).strict();

export const Study = z.object({
  field: z.string().min(1), prompt: z.string().min(1),
  points: z.array(z.string().min(1)).min(1), keys: z.array(z.array(z.string())).min(1),
}).strict();

export const Decision = z.object({ candidate: z.string().min(1), outcome: z.enum(['rejected', 'advanced']), reason: z.string().min(1) }).strict();

export const Review = z.object({
  candidate: z.string().min(1),
  screening: z.string().nullable(),
  coverage: z.array(z.object({
    criterion: z.string().min(1),
    status: z.enum(['asked', 'briefly', 'not_asked', 'not_applicable_historical']),
    quote: z.string().optional(),
  }).strict()),
  overweighted: z.array(z.object({ topic: z.string(), count: z.number().int().min(1), total: z.number().int().min(1), quote: z.string() }).strict()),
  suggested: z.array(z.object({ text: z.string().min(1), why: z.string().min(1) }).strict()),
}).strict();

export const ExtractionOutput = z.object({
  source_id: z.string().min(1),
  summary: z.string().min(1),
  no_change: z.boolean(),
  changes: z.array(Change),
  study: z.array(Study),
  decision: Decision.optional(),
  review: Review.optional(),
}).strict();
export type ExtractionOutput = z.infer<typeof ExtractionOutput>;

export const AskOutput = z.object({
  answer: z.string().min(1).max(1200),
  in_brief: z.boolean().optional(),
  based_on: z.array(z.string()).optional(),
  stub: z.boolean().optional(),
}).passthrough();
export type AskOutput = z.infer<typeof AskOutput>;

export const FeedbackOutput = z.union([
  z.object({ stub: z.literal(true) }).passthrough(),
  z.object({ covered: z.array(z.boolean()), comment: z.string().min(1).max(600), try_asking: z.string().max(300).optional() }).passthrough(),
]);
export type FeedbackOutput = z.infer<typeof FeedbackOutput>;
