/**
 * Real accounts-table auth flow (deno /auth/login → PostgREST /rpc/login):
 *  - invalid login shows an error and stays on /login
 *  - valid login redirects to /dashboard and persists the account session
 *  - the authenticated session can read real call logs from PostgREST
 *
 * Requires the dev server (Vite :4200) + the local data plane (deno, PostgREST,
 * Postgres). Credentials come from ACCOUNT_EMAIL / ACCOUNT_PASSWORD (.env);
 * the suite skips if they're unset.
 */
import { test, expect } from '@playwright/test';

const EMAIL = process.env.ACCOUNT_EMAIL;
const PASSWORD = process.env.ACCOUNT_PASSWORD;

test.describe('Auth — accounts table (no Supabase)', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set ACCOUNT_EMAIL / ACCOUNT_PASSWORD in .env');

  test.beforeEach(async ({ page }) => {
    // 'commit' + an explicit waitFor avoids racing Vite's first-hit compile.
    await page.goto('/login', { waitUntil: 'commit', timeout: 60_000 });
    await page.getByTestId('email-input').locator('input').waitFor({ state: 'visible', timeout: 60_000 });
  });

  test('invalid login shows error and stays on /login', async ({ page }) => {
    await page.getByTestId('email-input').locator('input').fill(EMAIL!);
    await page.getByTestId('password-input').locator('input').fill('this-is-definitely-wrong');
    await page.getByTestId('login-button').click();

    await expect(page.getByTestId('error-message')).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('/login');
  });

  test('valid login → /dashboard + persisted account session', async ({ page }) => {
    await page.getByTestId('email-input').locator('input').fill(EMAIL!);
    await page.getByTestId('password-input').locator('input').fill(PASSWORD!);
    await page.getByTestId('login-button').click();

    await page.waitForURL(/\/dashboard/, { timeout: 25_000 });
    expect(page.url()).toContain('/dashboard');

    // The accounts JWT is persisted under localStorage.auth (see lib/auth.ts).
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('auth') || 'null'));
    expect(session?.access?.length).toBeGreaterThan(100);
    expect(session?.email).toBe(EMAIL);
  });

  test('authenticated session reads real call logs from PostgREST', async ({ page }) => {
    await page.getByTestId('email-input').locator('input').fill(EMAIL!);
    await page.getByTestId('password-input').locator('input').fill(PASSWORD!);
    await page.getByTestId('login-button').click();
    await page.waitForURL(/\/dashboard/, { timeout: 25_000 });

    // Use the persisted token to hit the read API the app uses (same-origin).
    const result = await page.evaluate(async () => {
      const token = JSON.parse(localStorage.getItem('auth') || '{}').access;
      const r = await fetch('/rest/v1/calls?order=started_at.desc&limit=5', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: r.status, rows: r.ok ? await r.json() : [] };
    });
    expect(result.status).toBe(200);
    expect(Array.isArray(result.rows)).toBe(true);
    // Each row looks like a call log.
    if (result.rows.length) {
      expect(result.rows[0]).toHaveProperty('status');
      expect(result.rows[0]).toHaveProperty('from_number');
    }
  });
});
