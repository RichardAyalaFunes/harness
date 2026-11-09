// T-S: architecture boundaries. These fail early with a clear message (the Next build would also fail, but with a Turbopack panic).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../lib/paths.ts';

const files = (dir: string, exts: string[]): string[] => {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (exts.some((x) => p.endsWith(x))) out.push(p); } };
  if (fs.existsSync(dir)) walk(dir);
  return out;
};
const read = (f: string) => fs.readFileSync(f, 'utf8');
const imports = (src: string) => [...src.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)].map((m) => m[1]!);
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/');

const SERVER_ONLY = [/lib\/db\//, /lib\/domain\//, /lib\/model\//, /lib\/obs\//, /lib\/paths/, /lib\/api\//, /^node:/];

test('client code (components/ and files marked use client) never imports server-only modules', () => {
  const clientFiles = [...files(path.join(ROOT, 'components'), ['.ts', '.tsx']), ...files(path.join(ROOT, 'lib', 'client'), ['.ts']),
    ...files(path.join(ROOT, 'app'), ['.ts', '.tsx']).filter((f) => /^['"]use client['"]/.test(read(f)))];
  assert.ok(clientFiles.length > 8, 'found the client files');
  const bad: string[] = [];
  for (const f of clientFiles) for (const i of imports(read(f))) if (SERVER_ONLY.some((re) => re.test(i)) ) bad.push(`${rel(f)} imports ${i}`);
  // the contracts are shared on purpose (Zod only, no Node imports)
  for (const f of files(path.join(ROOT, 'lib', 'contracts'), ['.ts'])) for (const i of imports(read(f))) if (i.startsWith('node:') || /lib\/(db|domain|model|obs)/.test(i) || /\.\.\/(db|domain|model|obs)\//.test(i)) bad.push(`${rel(f)} imports ${i}`);
  assert.deepEqual(bad, [], 'server-only code reached the browser bundle');
});

test('lib/ never imports Next.js or React (the CLI and the tests share it)', () => {
  const bad: string[] = [];
  for (const f of files(path.join(ROOT, 'lib'), ['.ts', '.tsx'])) for (const i of imports(read(f))) if (/^(next|react)(\/|$)/.test(i)) bad.push(`${rel(f)} imports ${i}`);
  assert.deepEqual(bad, []);
});

test('no component renders HTML from strings (user and model text is always escaped by React)', () => {
  const bad = files(path.join(ROOT, 'components'), ['.tsx']).concat(files(path.join(ROOT, 'app'), ['.tsx'])).filter((f) => /dangerouslySetInnerHTML|innerHTML\s*=/.test(read(f)));
  assert.deepEqual(bad.map(rel), []);
});

test('imports inside lib/ and cli/ use relative paths with explicit .ts extensions (type stripping does not resolve aliases)', () => {
  const bad: string[] = [];
  for (const f of [...files(path.join(ROOT, 'lib'), ['.ts']), ...files(path.join(ROOT, 'cli'), ['.ts'])]) {
    for (const i of imports(read(f))) if (i.startsWith('.') && !i.endsWith('.ts')) bad.push(`${rel(f)} imports ${i}`);
    for (const i of imports(read(f))) if (i.startsWith('@/') || i.startsWith('~/')) bad.push(`${rel(f)} uses an alias: ${i}`);
  }
  assert.deepEqual(bad, []);
});

test('secrets: no .env file or key-shaped string is tracked in app-next', () => {
  const bad: string[] = [];
  for (const f of [...files(ROOT, ['.ts', '.tsx', '.json', '.md', '.mjs']).filter((x) => !x.includes('node_modules') && !x.includes(`${path.sep}.next${path.sep}`) && !x.includes('test-results'))]) {
    if (/sk-[A-Za-z0-9]{20,}/.test(read(f)) && !/test|e2e/.test(rel(f))) bad.push(rel(f));
  }
  assert.deepEqual(bad, []);
});
