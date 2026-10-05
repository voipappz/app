import { test, expect } from './auth-fixture';

/**
 * Real-login smoke test.
 *
 * Unlike login.spec.ts (mocked API, UI flow only), this performs the actual
 * login (plus OTP only if the API asks) against VITE_API_BASE_URL via the shared auth fixture and
 * verifies the authenticated app shell loads. This is the "can we log in to
 * the app" canary for CI.
 */
test.describe('Login smoke (real backend)', () => {
  test('signs in and loads the app shell', async ({ authenticatedPage: page }) => {
    // The fixture already signed in and seeded the tokens.
    expect(page.authTokens?.access).toBeTruthy();

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    // We must NOT be bounced back to the login form.
    await expect(page.locator('[data-testid="login-form"]')).toHaveCount(0);

    // An authenticated API call works with the stored token.
    const apiBaseUrl = process.env.VITE_API_BASE_URL;
    const resp = await page.request.get(`${apiBaseUrl}/api/applications?page=1&per_page=1`, {
      headers: { Authorization: `Bearer ${page.authTokens.access}` },
    });
    expect(resp.status()).toBeGreaterThanOrEqual(200);
    expect(resp.status()).toBeLessThan(300);
  });
});
