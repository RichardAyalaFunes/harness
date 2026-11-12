// E1 + E2 + I8: approve a proposal; reject a biased restriction. The page shows the new state without a manual reload.
import { test, expect } from '@playwright/test';
import { startApp, type App } from './app.ts';

let app: App;
test.beforeAll(async () => { app = await startApp(); });
test.afterAll(async () => { await app.stop(); });
const roleJson = async (id: string) => (await fetch(`${app.url}/api/roles/${id}`)).json() as Promise<any>;

test('E1: the lead approves a proposal: the version goes up, the change is marked, and the page updates by itself', async ({ page }) => {
  const before = await roleJson('ks-fe');
  await page.goto(`${app.url}/role/ks-fe/changes`);
  await expect(page.locator('article.prop', { hasText: 'Awaiting approval' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Approved');
  await expect(page.getByText('Nothing to approve')).toBeVisible(); // router.refresh(): no manual reload (I8)
  const after = await roleJson('ks-fe');
  expect(after.brief.version).toBe(before.brief.version + 1);
  await page.getByRole('tab', { name: /Role brief/ }).click();
  await expect(page.locator('.rows .r.chg').first()).toBeVisible(); // the changed rows are highlighted
  expect(page.url()).toContain('/role/ks-fe/brief'); // the tab is in the address bar
});
