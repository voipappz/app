/**
 * Local end-to-end walkthrough (accounts login, no Supabase):
 *   login via the UI → dashboard → Calls page renders REAL call rows.
 *
 * Drives the running dev server (make dev → :4200) against the local mothership
 * (PostgREST/Kong + cable). Creds from ACCOUNT_EMAIL / ACCOUNT_PASSWORD; skips if
 * unset. Robust to Vite's first-hit compile (waitUntil:'commit' + explicit waits).
 */
import { test, expect } from '@playwright/test';

const EMAIL = process.env.ACCOUNT_EMAIL;
const PASSWORD = process.env.ACCOUNT_PASSWORD;

test.describe('Local walkthrough', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set ACCOUNT_EMAIL / ACCOUNT_PASSWORD in .env');
  test.slow(); // dev-server cold compile — triple the timeouts

  test('login → dashboard → Calls shows real call logs', async ({ page }) => {
    // 1) Login via the real form
    await page.goto('/login', { waitUntil: 'commit', timeout: 60_000 });
    await page.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 60_000 });
    await page.fill('input[name="email"]', EMAIL!);
    await page.fill('input[name="password"]', PASSWORD!);
    await page.click('[data-testid="login-button"]');

    // 2) Lands on the dashboard with a persisted account session
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('auth') || 'null'));
    expect(session?.email).toBe(EMAIL);

    // 3) Calls page renders real rows from PostgREST
    await page.goto('/calls', { waitUntil: 'commit', timeout: 60_000 });
    const source = page.getByTestId('calls-source');   // marks where the data came from
    await source.waitFor({ state: 'visible', timeout: 45_000 });

    // at least one data row in the calls table
    const rows = page.locator('table tbody tr');
    await expect.poll(() => rows.count(), { timeout: 45_000 }).toBeGreaterThan(0);

    // a real call row has phone-number-ish text (digits) somewhere in it
    const firstRowText = (await rows.first().innerText()).replace(/\s+/g, ' ');
    expect(firstRowText).toMatch(/\d{3,}/);

    // and the source is the live event store, not mock
    await expect(source).toHaveAttribute('data-source', /events|postgrest/i);
  });
});
