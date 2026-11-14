import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://localhost:5173/',
    env: { PORT: '5173' },
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
