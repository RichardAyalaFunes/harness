// E2: a biased restriction can be rejected; a reason is required in the UI and by the server; it is never applied.
import { test, expect } from '@playwright/test';
import { startApp, type App } from './app.ts';

let app: App;
test.beforeAll(async () => { app = await startApp(); });
test.afterAll(async () => { await app.stop(); });

test('E2: reject needs a reason (UI and server); the biased restriction is never applied', async ({ page, request }) => {
  await page.goto(`${app.url}/role/ks-fe/changes`);
  await expect(page.getByText('NOT APPLIED · possible bias (protected)')).toBeVisible();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'at least 10 characters' })).toBeVisible(); // blocked in the UI with the schema's message
  // the server enforces the same rule, whatever the UI does
  const direct = await request.post(`${app.url}/api/proposals/6/reject`, { headers: { 'sec-fetch-site': 'same-origin' }, data: { reason: 'no' } });
  expect(direct.status()).toBe(400);
  expect((await direct.json()).error.issues[0].message).toMatch(/at least 10 characters/);
  await page.getByLabel('Reason for rejecting').fill('The client contradicted this in the follow-up call.');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Rejected');
  await expect(page.getByText('Nothing to approve')).toBeVisible();
  const role: any = await (await fetch(`${app.url}/api/roles/ks-fe`)).json();
  expect(role.brief.fields.map((f: any) => f.field)).not.toContain('restriction.age-under-35');
  expect(role.proposals.find((p: any) => p.id === 6).state).toBe('rejected');
});
