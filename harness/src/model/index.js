import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../db.js';
import { createReplayModel } from './replay.js';
import { createOpenAIModel } from './openai.js';

// Load harness/.env (KEY=VALUE lines) without a dependency; real environment variables win.
// Called by the CLI and server entry points only, so tests stay on the replay model.
export function loadEnv(file = path.join(ROOT, '.env'), env = process.env) {
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined && m[2] !== '') env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

export function getModel(env = process.env, opts = {}) {
  const kind = env.HARNESS_MODEL || 'replay';
  if (kind === 'replay') return createReplayModel({ dir: opts.replayDir || path.join(ROOT, 'data', 'replay') });
  if (kind === 'openai') return createOpenAIModel(env);
  throw new Error(`unknown HARNESS_MODEL "${kind}" (use replay or openai)`);
}
