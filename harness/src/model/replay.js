// Replay provider: returns hand-authored model output from data/replay/<source_id>.json.
// It proves orchestration and checks, not extraction quality. Returns raw text so malformed JSON reaches the checks.
import fs from 'node:fs';
import path from 'node:path';

export function createReplayModel({ dir }) {
  return {
    name: 'replay',
    async extract({ source }) {
      const file = path.join(dir, `${source.id}.json`);
      if (!fs.existsSync(file)) throw new Error(`no replay file for ${source.id} (${file})`);
      return fs.readFileSync(file, 'utf8');
    },
  };
}
