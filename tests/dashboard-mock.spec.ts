/**
 * End-to-end test (real Supabase auth):
 *  - logs in against the live Supabase project as the admin test user
 *  - opens /dashboard, asserts LiveEvents widget connects to the WS
 *    and starts receiving MQTT events (Deno backend must be running on :4000
 *    with MOCK_PUBLISH=1)
 *  - opens /calls, asserts the mock-data fallback renders (30 rows, 4 stats)
 *
 * Requires: `make dev` running (Vite on :4200) + Deno bridge on :4000.
 */

import { test, expect } from '@playwright/test';
import { loginWithAccount } from './helpers/browserAuth';

test.describe('Dashboard + Calls (real Supabase auth)', () => {
  test('Dashboard LiveEvents connects to WS and receives MQTT events', async ({ page, context }) => {
    await loginWithAccount(context);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // "Live Events" widget should render
    await expect(page.getByText('Live Events', { exact: true })).toBeVisible({ timeout: 10_000 });

    // Status chip should reach "open" once the WS connects to :4000
    await expect(page.getByText('open', { exact: true })).toBeVisible({ timeout: 10_000 });

    // Wait for at least one MQTT-driven event row to appear (mock publisher emits every 2.5s)
    const eventChip = page.locator('div').filter({ hasText: /^calls\/|^registrations\// }).first();
    await expect(eventChip).toBeVisible({ timeout: 15_000 });
  });

  test('Calls page renders 30 mock rows + 4 stat cards', async ({ page, context }) => {
    await loginWithAccount(context);
    await page.goto('/calls');
    await page.waitForLoadState('networkidle');

    // Page title
    await expect(page.getByRole('heading', { name: 'Calls' })).toBeVisible({ timeout: 5_000 });

    // 4 stat-card labels
    for (const label of ['Total Calls', 'Avg Duration', 'Inbound / Outbound', 'Completed / Failed']) {
      await expect(page.getByText(label)).toBeVisible();
    }

    // mock-data.js seeds 30 rows
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(30);

    // Source chip should say "mock" (no calls table in Supabase yet, falls back)
    await expect(page.getByText(/source: (mock|loading)/)).toBeVisible();
  });
});
