import { z } from 'zod';

export const PingBody = z.object({ note: z.string().trim().min(3, 'write at least 3 characters').max(200, 'keep it under 200 characters') }).strict();
export type PingBody = z.infer<typeof PingBody>;

// Issue text for users: path plus a plain message. The received value is never included.
export function issuesToMessages(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.join('.') || '(body)', message: i.message }));
}
