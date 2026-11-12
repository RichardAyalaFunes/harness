// E4 (failure path): the live model fails -> the chat shows an error with the trace id; nothing from upstream leaks.
import { test, expect } from '@playwright/test';
import http from 'node:http';
import type net from 'node:net';
import { startApp, type App } from './app.ts';

let app: App; let fake: http.Server;
test.beforeAll(async () => {
  fake = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":{"message":"upstream secret detail"}}'); }); });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(fake.address() as net.AddressInfo).port}/v1/chat/completions`;
  app = await startApp({ HARNESS_ASSIST: '', OPENAI_API_KEY: 'sk-fake-0123456789abcdef', OPENAI_BASE_URL: url, OPENAI_MODEL: 'gpt-test' });
});
test.afterAll(async () => { await app.stop(); fake.close(); });

test('E4: a failing model shows an error state with the trace id and no upstream detail', async ({ page }) => {
  await page.goto(`${app.url}/role/nw-ai/current`);
  await page.getByLabel('Your question about this role').fill('What is LangGraph and what should I check?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const err = page.locator('.msg.assistant.err');
  await expect(err).toBeVisible({ timeout: 20_000 });
  await expect(err).toContainText('The model could not answer');
  await expect(err).toContainText(/trace [0-9a-f]{16}/);
  await expect(page.locator('body')).not.toContainText('upstream secret');
});
