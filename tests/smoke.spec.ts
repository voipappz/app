import { test, expect } from '@playwright/test';

/**
 * CI smoke — runs with NO backend using the offline mock login
 * (build with VITE_MOCK_LOGIN=1: any email → OTP 123456 → /dashboard).
 * Guards the real user entry path end-to-end: login form → OTP step →
 * routing → authenticated app shell renders.
 */
test('mock login reaches the dashboard', async ({ page }) => {
  await page.goto('/login');

  await page.getByTestId('email-input').locator('input').fill('ci@example.com');
  await page.getByTestId('password-input').locator('input').fill('anything');
  await page.getByTestId('login-button').click();

  // Mock flow always challenges for the OTP.
  await page.getByTestId('otp-input').locator('input').fill('123456');
  await page.getByTestId('otp-verify-button').click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page.getByTestId('login-form')).toHaveCount(0);
});

/**
 * The OTP step's affordances, all driven by what voipappz-api actually enforces:
 * the code is EMAILED (so name the address), it dies after OTP_TTL (so show the
 * clock), and there is no resend route (so the button re-runs step 1).
 */
test('OTP step shows the destination, a countdown, resend, and autofill', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email-input').locator('input').fill('ci@example.com');
  await page.getByTestId('password-input').locator('input').fill('anything');
  await page.getByTestId('login-button').click();

  await expect(page.getByTestId('otp-form')).toBeVisible();

  // The address the code went to is named, not implied.
  await expect(page.getByTestId('otp-subtitle')).toContainText('ci@example.com');

  // Counting down from the server's 5-minute TTL.
  await expect(page.getByTestId('otp-countdown')).toContainText(/[45]:\d\d/);

  // Mobile OTP autofill + numeric keypad.
  const input = page.getByTestId('otp-input').locator('input');
  await expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(input).toHaveAttribute('inputmode', 'numeric');

  // Resend re-runs step 1 and returns a fresh challenge, not an error.
  await page.getByTestId('otp-resend').click();
  await expect(page.getByTestId('otp-form')).toBeVisible();
  await expect(page.getByTestId('error-message')).toHaveCount(0);
  await expect(input).toHaveValue('');
});

/**
 * The pre-login hint from customer_portal_data. Stubbed at the network, not in
 * localStorage: boot refetches the portal data and overwrites the cache
 * (main.jsx), so a seeded value never survives to first render.
 *
 * It must appear only on an explicit `true` — a tenant that says nothing about
 * OTP gets no claim made on its behalf.
 */
async function stubPortalData(page, body) {
  await page.route('**/tasks/customer_portal_data', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test('tenant OTP hint shows when the portal data states it', async ({ page }) => {
  await stubPortalData(page, { name: 'mtn', language: 'en', login_otp_enabled: 'true' });
  await page.goto('/login');
  await expect(page.getByTestId('otp-hint')).toBeVisible();
});

// OTP is the client default: silence means expect a code.
test('tenant OTP hint shows when the portal data omits the key', async ({ page }) => {
  // The shape MTN serves today — branding fields only, no OTP key.
  await stubPortalData(page, { name: 'mtn', language: 'en', logo_title: 'mtn' });
  await page.goto('/login');
  await expect(page.getByTestId('otp-hint')).toBeVisible();
});

// ...and only an explicit opt-out takes it away.
test('tenant OTP hint hidden only when the tenant opts out', async ({ page }) => {
  await stubPortalData(page, { name: 'mtn', language: 'en', login_otp_enabled: 'false' });
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toBeVisible();
  await expect(page.getByTestId('otp-hint')).toHaveCount(0);
});

/**
 * Tenant expects OTP but the server issues a session without one — MTN today.
 * The app challenges anyway rather than logging in on one factor. Requires mock
 * login OFF, so both endpoints are stubbed to reproduce the real shapes.
 */
test('challenges even when the server did not, and says why it cannot proceed', async ({ page }) => {
  await stubPortalData(page, { name: 'mtn', language: 'en' });          // no otp key ⇒ default on

  let serverWasCalled = false;
  await page.route('**/auth/user_login*', (route) => {
    serverWasCalled = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      // A finished session, no temp_token — what an ungated server returns.
      body: JSON.stringify({ token: 'server-issued-token', user: { uuid: 'u-1', email: 'x@mtn.com.gh' } }),
    });
  });

  await page.goto('/login');
  await page.getByTestId('email-input').locator('input').fill('x@mtn.com.gh');
  await page.getByTestId('password-input').locator('input').fill('pw');
  await page.getByTestId('login-button').click();

  // Challenged, not logged in.
  await expect(page.getByTestId('otp-form')).toBeVisible();

  // VITE_MOCK_LOGIN=1 (how CI builds) short-circuits userLogin before any fetch,
  // so the stub never applies and the mock always challenges — this scenario
  // cannot exist there. Skip rather than assert against the mock's behaviour.
  test.skip(!serverWasCalled, 'built with VITE_MOCK_LOGIN=1 — no server call to stub');
  await expect(page).not.toHaveURL(/dashboard/);
  // The half-issued session must not survive — otherwise the user holds a live
  // token while looking at a code prompt.
  expect(await page.evaluate(() => localStorage.getItem('auth'))).toBeNull();

  // Submitting says the code was never issued, not that it was wrong.
  await page.getByTestId('otp-input').locator('input').fill('123456');
  await page.getByTestId('otp-verify-button').click();
  await expect(page.getByTestId('error-message')).toContainText(/did not issue a code/i);
});

// ProtectedRoute gate: unauthenticated deep links must land on /login.
test('unauthenticated /calls redirects to login', async ({ page }) => {
  await page.goto('/calls');
  await page.waitForURL('**/login', { timeout: 10_000 });
  await expect(page.getByTestId('login-form')).toBeVisible();
});
