import { test, expect } from '@playwright/test';

/**
 * User Login (root `/`) OTP Flow Tests
 *
 * Mirrors login.spec.ts's approach (route interception — no real portal-user
 * account is confirmed to exist against cloud.voipappz.io, and the API
 * doesn't allow reading a real OTP email) for the new end-user surface:
 * `/auth/user_login` + `/auth/user/otp/verify`. Also checks the one sign-in
 * page toggles to the account login, and that /admin and /login land there.
 */
test.describe('User Login (root) OTP Flow', () => {
  test.setTimeout(60000);
  test.use({ navigationTimeout: 60000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('completedTours', JSON.stringify({ 'first-login': true }));
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="user-login-form"]', { timeout: 15000 });
  });

  test('should render the user login form on /', async ({ page }) => {
    await expect(page.locator('[data-testid="user-email-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-password-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-login-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-forgot-password-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-otp-form"]')).not.toBeVisible();
  });

  test('should show the OTP step after credentials are submitted', async ({ page }) => {
    await page.route('**/auth/user_login**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ otp_sent: true, temp_token: 'test-temp-token-abc123' })
      });
    });

    await page.fill('[data-testid="user-email-input"] input', 'portaluser@example.com');
    await page.fill('[data-testid="user-password-input"] input', 'TestPassword123');
    await page.click('[data-testid="user-login-button"]');

    await expect(page.locator('[data-testid="user-otp-form"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="user-otp-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-otp-submit-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-login-form"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="user-otp-submit-button"]')).toBeDisabled();
  });

  test('should surface a login error from the API', async ({ page }) => {
    await page.route('**/auth/user_login**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' })
      });
    });

    await page.fill('[data-testid="user-email-input"] input', 'portaluser@example.com');
    await page.fill('[data-testid="user-password-input"] input', 'wrong-password');
    await page.click('[data-testid="user-login-button"]');

    await expect(page.locator('[data-testid="user-error-message"]')).toBeVisible({ timeout: 5000 });
  });
});

// One sign-in page at `/`, toggled between the user and the account login.
// Each keeps its own form and endpoint; there is no /admin page.
test.describe('One sign-in page, user or account', () => {
  test('toggles between the user and the account login', async ({ page }) => {
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="user-login-form"]')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Account' }).click();
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="user-login-form"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'User' }).click();
    await expect(page.locator('[data-testid="user-login-form"]')).toBeVisible({ timeout: 15000 });
  });

  test('a failed user sign-in reports the error on the user form', async ({ page }) => {
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.route('**/auth/user_login**', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ id: 'unauthorized', message: 'Invalid email or password' }) }));
    await page.goto('/?as=user', { waitUntil: 'domcontentloaded' });
    await page.fill('[data-testid="user-email-input"] input', 'nir@voipappz.com');
    await page.fill('[data-testid="user-password-input"] input', 'wrong');
    await page.click('[data-testid="user-login-button"]');
    await expect(page.locator('[data-testid="user-error-message"]')).toBeVisible({ timeout: 15000 });
  });

  for (const old of ['/admin', '/login']) {
    test(`${old} lands on the sign-in with Account selected`, async ({ page }) => {
      await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.goto(old, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/\?as=account$/, { timeout: 15000 });
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible({ timeout: 15000 });
    });
  }
});
