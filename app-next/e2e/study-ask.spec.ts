// E3 + E4 (stub path): a study step is blocked when empty, recorded when valid; Ask validates and shows the stub label.
import { test, expect } from '@playwright/test';
import { startApp, type App } from './app.ts';

let app: App;
test.beforeAll(async () => { app = await startApp(); });
test.afterAll(async () => { await app.stop(); });

test('E3: an empty or short answer is blocked; a valid one counts as done and shows the stub label; the server enforces the same rule', async ({ page, request }) => {
  await page.goto(`${app.url}/role/nw-be/current`);
  const study = page.locator('article.item.todo', { has: page.locator('textarea') }).first();
  const itemId = await study.getAttribute('data-item');
  await study.getByRole('button', { name: 'Submit answer' }).click();
  await expect(study.getByText(/Not recorded yet/)).toBeVisible();
  await expect(study).toHaveClass(/todo/);
  const direct = await request.post(`${app.url}/api/items/${itemId}/complete`, { headers: { 'sec-fetch-site': 'same-origin' }, data: { response: 'x' } });
  expect((await direct.json()).passed).toBe(false);
  await study.locator('textarea').fill('I would ask for one concrete incident they led, then what changed afterwards.');
  await study.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.locator('#toast')).toContainText('Answer recorded');
  const done = page.locator(`article.item[data-item="${itemId}"]`);
  await expect(done).toHaveClass(/done/);
  await expect(done.getByText(/No live model/)).toBeVisible(); // the replay model is labelled as a stub
});

test('E4: Ask about this role: an empty question is blocked; the answer is labelled as a stub', async ({ page }) => {
  await page.goto(`${app.url}/role/nw-ai/current`);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'write a question first' })).toBeVisible();
  await page.getByLabel('Your question about this role').fill('What is LangGraph and what should I check?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.locator('.msg.assistant').first()).toContainText('Questions need the live model');
  await expect(page.getByText('Stub: no live model connected.')).toBeVisible();
});
