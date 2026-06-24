import { test, expect, Page, BrowserContext } from '@playwright/test';
import { loginWithAccount } from './helpers/browserAuth';

/**
 * Health Check Tests
 * Verify basic app functionality before running full E2E tests.
 * Auth is a real Supabase login (admin test user) — no mocks.
 */

// Establish a real Supabase session (admin test user) in the browser context.
// Thin wrapper so existing call sites stay `setupAuth(page, context)`.
async function setupAuth(_page: Page, context: BrowserContext) {
  await loginWithAccount(context);
}

test.describe('Health Check', () => {
  test('1. login page loads', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/login');
    console.log('✅ Login page loads');
  });

  test('2. dashboard loads with auth', async ({ page, context }) => {
    await setupAuth(page, context);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const url = page.url();
    console.log('Dashboard URL:', url);
    expect(url).toContain('/dashboard');
    expect(url).not.toContain('/login');
    console.log('✅ Dashboard loads with authenticated user (no redirect to login)');
  });

  test('3. 401 event triggers logout', async ({ page, context }) => {
    // Setup auth and verify we're logged in
    await setupAuth(page, context);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Verify we're on dashboard
    expect(page.url()).toContain('/dashboard');

    // Simulate 401 error from API (as if server returned unauthorized)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('auth:unauthorized', {
        detail: { reason: 'Token expired' }
      }));
    });

    // Wait for redirect to login
    await page.waitForTimeout(500);
    await page.waitForLoadState('networkidle');

    // Should be redirected to login
    expect(page.url()).toContain('/login');

    // Verify the real Supabase session is cleared from localStorage on logout.
    // signOut() is a real async network call now (no mock), so poll until gone.
    const ref = new URL(process.env.VITE_SUPABASE_URL!).hostname.split('.')[0];
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), `sb-${ref}-auth-token`), {
        timeout: 10_000,
      })
      .toBeNull();

    console.log('✅ 401 event triggers logout and redirect to login');
  });
});
