import { defineConfig } from '@playwright/test';

// Each spec file starts its own production server on a fresh replay database (see e2e/app.ts), so files cannot affect each other.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { headless: true, viewport: { width: 1280, height: 900 }, trace: 'off' },
});
