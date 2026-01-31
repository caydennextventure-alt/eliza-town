import { defineConfig, devices } from '@playwright/test';

const vitePort = process.env.E2E_VITE_PORT ?? '4173';
const baseURL = `http://127.0.0.1:${vitePort}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `E2E_VITE_PORT=${vitePort} npm run dev:e2e`,
    url: `${baseURL}/ai-town/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
