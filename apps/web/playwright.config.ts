import { defineConfig, devices } from '@playwright/test';

// E2E contra los servidores locales (api :8787 + web :5173).
// Usa el Chrome del sistema (channel 'chrome') para no descargar browsers.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: 'msedge',
  },
  webServer: [
    {
      command: 'node --env-file=.env.local --import tsx src/index.ts',
      cwd: '../api',
      url: 'http://localhost:8787/salud',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npx vite --port 5173',
      cwd: '.',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});