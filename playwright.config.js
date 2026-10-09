import { defineConfig, devices } from '@playwright/test';

/**
 * Two browser test suites:
 *   stories  the Ladle playground (real engine, memory storage, mocked routes);
 *   example  the example application (real server handler, memory repositories);
 *   demo     the static demo as built for GitHub Pages (served under /best-email-builder/).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'stories',
      testMatch: /\.stories\.spec\.js$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:61010' },
    },
    {
      name: 'example',
      testMatch: /\.example\.spec\.js$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:5174' },
    },
    {
      name: 'demo',
      testMatch: /\.demo\.spec\.js$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:5176' },
    },
  ],
  webServer: [
    { command: 'npm run dev', url: 'http://localhost:61010', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: 'npm run example', url: 'http://localhost:5174', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    {
      command: 'npm run demo:preview',
      url: 'http://localhost:5176/best-email-builder/',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
