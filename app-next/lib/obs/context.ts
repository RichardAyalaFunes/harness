// Trace context carried through async calls with AsyncLocalStorage, so domain code never passes trace objects around.
import { AsyncLocalStorage } from 'node:async_hooks';

export interface SpanRef { id: string; traceId: string }
export interface Ctx { traceId: string; spanId: string | null; trace: unknown }

const store = new AsyncLocalStorage<Ctx>();

export const currentCtx = (): Ctx | undefined => store.getStore();
export const runWithCtx = <T>(ctx: Ctx, fn: () => T): T => store.run(ctx, fn);
export const currentTraceId = (): string | undefined => store.getStore()?.traceId;
