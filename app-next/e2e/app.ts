// Starts a production `next start` on a free port with a fresh replay database, for one spec file.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise<number>((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });

export interface App { url: string; dbFile: string; stop: () => Promise<void> }

export async function startApp(extraEnv: Record<string, string> = {}): Promise<App> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
  const dbFile = path.join(dir, 'e2e.db');
  const env = { ...process.env, HARNESS_DB: dbFile, HARNESS_MODEL: 'replay', HARNESS_ASSIST: 'replay', OPENAI_API_KEY: '', LOG_LEVEL: 'silent', NODE_ENV: 'production', NODE_NO_WARNINGS: '1', ...extraEnv };
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(APP, 'cli', 'harness.ts'), 'rebuild'], { cwd: APP, env: { ...env, HARNESS_ASSIST: 'replay' }, stdio: 'ignore' });
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [path.join(APP, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd: APP, env, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${url}/api/me`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { url, dbFile, stop: () => new Promise<void>((r) => { child.once('exit', () => { fs.rmSync(dir, { recursive: true, force: true }); r(); }); child.kill(); setTimeout(r, 3000); }) };
}
