import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load local test env from .env (not on CI; CI exports shell env)
if (!process.env.CI) {
  dotenv.config();
  dotenv.config({ path: '.env.local', override: false });
}

/**
 * Lightweight Playwright config for the voipappz template.
 * - No video / screenshot capture (cheap reruns, small disk usage).
 * - Trace only when a test actively fails (still useful for debugging).
 * - baseURL points at the Vite dev server (`make dev` → :5173).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 2,
  timeout: 60_000,
  reporter: process.env.CI ? [['dot']] : [['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
