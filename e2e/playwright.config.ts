import { defineConfig, devices } from '@playwright/test';

/**
 * Stylo's four journeys in a real browser, against a RUNNING server (npm start) with the dev
 * seed (npm run db:reset). Run from the repo root: `npm run e2e` (or E2E_BASE_URL=… for another
 * server). The journeys share data (an order placed by one is prepared by the next), so they
 * run one after the other, in file order.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4000',
    locale: 'ar',
    timezoneId: 'Africa/Tripoli',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'journeys', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
});
