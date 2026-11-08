import path from 'node:path';
import { ROOT } from '../db.js';
import { createReplayModel } from './replay.js';
import { createOpenAIModel } from './openai.js';

export function getModel(env = process.env, opts = {}) {
  const kind = env.HARNESS_MODEL || 'replay';
  if (kind === 'replay') return createReplayModel({ dir: opts.replayDir || path.join(ROOT, 'data', 'replay') });
  if (kind === 'openai') return createOpenAIModel();
  throw new Error(`unknown HARNESS_MODEL "${kind}" (use replay or openai)`);
}
