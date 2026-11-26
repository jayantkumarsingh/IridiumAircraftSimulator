import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:8128', channel: 'chrome' },
  webServer: {
    command: 'ng serve --port 8128',
    url: 'http://localhost:8128/',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
