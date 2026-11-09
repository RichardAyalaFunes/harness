import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.HARNESS_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spike-')), 't.db');
const { recordPing, status } = await import('../../lib/domain/spike.ts');
const { closeAll } = await import('../../lib/db/connection.ts');

test('slice writes and reads sqlite, loads the prompt, validates input', () => {
  assert.equal(recordPing({ note: 'hello' }).count, 1);
  assert.throws(() => recordPing({ note: 'x' }), /at least 3/);
  assert.throws(() => recordPing({ note: 'hello', extra: 1 }));
  const s = status();
  assert.equal(s.pings, 1);
  assert.match(s.prompt_first_line ?? '', /Output contract/);
  closeAll();
});
