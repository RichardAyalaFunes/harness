// E5 + E6: compare versions, open an older version, move a candidate; skeleton on slow loads; phone width without sideways scroll.
import { test, expect } from '@playwright/test';
import { startApp, type App } from './app.ts';

let app: App;
test.beforeAll(async () => { app = await startApp(); });
test.afterAll(async () => { await app.stop(); });

test('E5: the comparison table has one column per version; an older version can be opened and closed again', async ({ page }) => {
  await page.goto(`${app.url}/role/nw-be/changes`);
  await expect(page.getByRole('columnheader', { name: /Version 1/ })).toBeVisible();
  await expect(page.locator('tr.grprow').first()).toBeVisible();
  await page.getByRole('tab', { name: /Role brief/ }).click();
  const older = page.locator('button.verb').last(); // history is newest first: the last one is the oldest version
  await older.click();
  await expect(page.getByText('Older version.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to current' }).click();
  await expect(page.getByText('Older version.')).toBeHidden();
});

test('E5: moving a candidate is not blocked and updates the board', async ({ page }) => {
  await page.goto(`${app.url}/role/nw-be/pipeline`);
  const first = page.locator('.cand').first();
  const name = (await first.locator('b').first().innerText()).trim();
  const stageOf = async () => ((await (await fetch(`${app.url}/api/roles/nw-be/pipeline`)).json()) as any[]).find((c) => c.name === name).stage;
  const stage = await stageOf();
  await first.getByRole('button', { name: /Move .* to / }).click();
  await expect(page.locator('#toast')).toContainText('moved to');
  await expect.poll(stageOf).toBe(stage + 1);
});

test('E6: a slow page shows the loading skeleton', async ({ page }) => {
  await page.goto(app.url);
  await page.waitForLoadState('networkidle'); // the role pages are prefetched on arrival, which is what makes the skeleton instant
  await page.route('**/role/nw-be/**', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.getByRole('button', { name: /Open Senior Backend Engineer/ }).click();
  await expect(page.locator('.skel')).toHaveCount(1); // the loading skeleton is in the page while the data loads
  await expect(page.locator('.hero .title')).toHaveText('Senior Backend Engineer');
});

test('E6: at phone width no screen scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const p of ['/', '/role/nw-be/pipeline', '/role/nw-be/brief', '/role/nw-be/changes', '/role/nw-be/current']) {
    await page.goto(app.url + p);
    await page.waitForTimeout(600); // let the entrance animation finish
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${p} overflows by ${over}px`).toBeLessThanOrEqual(1);
  }
});
