// All file locations are anchored at the project root, never at process.cwd().
// The root is the nearest parent folder (starting from this file) whose package.json is named "radhires-app".
// This also works inside the Next bundle, where import.meta.url points into .next/. HARNESS_ROOT overrides it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findRoot(): string {
  if (process.env.HARNESS_ROOT) return path.resolve(process.env.HARNESS_ROOT);
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg) && JSON.parse(fs.readFileSync(pkg, 'utf8')).name === 'radhires-app') return dir;
    dir = path.dirname(dir);
  }
  throw new Error('cannot find the project root (package.json named radhires-app); set HARNESS_ROOT');
}

export const ROOT = findRoot();
export const PROMPTS_DIR = path.join(ROOT, 'lib', 'model', 'prompts');
export const DATA_DIR = path.join(ROOT, 'data');
// The database file is chosen at run time and is not a build input: tell Turbopack not to trace it.
export const dbPath = (): string => path.resolve(/* turbopackIgnore: true */ process.env.HARNESS_DB || path.join(DATA_DIR, 'app.db'));
