/**
 * Calls page (PostgREST read path):
 *   - Visits /calls with a real Supabase login (admin test user)
 *   - Asserts the page mounts and the source indicator resolves to `events`
 *     (rows pulled from PostgREST api.calls, not deno/DuckDB)
 *   - Asserts at least one call row is rendered
 *
 * Requires:
 *   - `make dev` running (Vite on :4200), with the /rest/v1 proxy → PostgREST
 *   - PostgREST up and the deno /events_token mint reachable (the admin token)
 */

import { test, expect } from '@playwright/test';
import { loginWithAccount } from './helpers/browserAuth';

test('Calls page renders rows pulled from PostgREST', async ({ page, context }) => {
  await loginWithAccount(context);
  await page.goto('/calls');
  await page.waitForLoadState('networkidle');

  // Page mounted — the source indicator is present (i18n-agnostic testid).
  const source = page.getByTestId('calls-source');
  await expect(source).toBeVisible({ timeout: 20_000 });

  // Source resolves to the live PostgREST read (not 'loading'/'mock').
  await expect(source).toHaveAttribute('data-source', 'events', { timeout: 15_000 });

  // Rows loaded from api.calls.
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0);
});
