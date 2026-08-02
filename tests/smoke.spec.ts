import { test, expect } from '@playwright/test';

/**
 * CI smoke — runs with NO backend using the offline mock login
 * (build with VITE_MOCK_LOGIN=1: any email → OTP 123456 → /dashboard).
 * Guards the real user entry path end-to-end: login form → OTP step →
 * routing → authenticated app shell renders.
 */
test('mock login reaches the dashboard', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
  await page.goto('/login');

  await page.getByTestId('email-input').locator('input').fill('ci@example.com');
  await page.getByTestId('password-input').locator('input').fill('anything');
  await page.getByTestId('login-button').click();

  // Mock flow always challenges for the OTP.
  await page.getByTestId('otp-input').locator('input').fill('123456');
  await page.getByTestId('otp-verify-button').click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page.getByTestId('login-form')).toHaveCount(0);

  // Desktop navigation is the icon rail ONLY — no second expandable panel
  // duplicating it. The hamburger is a mobile-drawer affordance and must be
  // hidden on desktop; the rail's bottom cluster carries bell + account.
  const rail = page.getByTestId('navigation-rail');
  await expect(rail).toBeVisible();
  await expect(rail.locator('[aria-current="page"]')).toContainText(/Dashboard/i);
  await expect(page.getByTestId('menu-button')).toBeHidden();
  await expect(page.getByTestId('rail-notifications')).toBeVisible();
  await page.getByTestId('rail-account').click();
  await expect(page.getByTestId('account-logout')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('account-logout')).toBeHidden();

  // The dashboard renders real local-projection content, not a bare waiting
  // message: a KPI row (default tiles OR user-defined widgets) + calls-per-hour
  // + recent calls.
  await expect(page.getByTestId('dashboard-kpis')).toBeVisible();
  await expect(page.getByText(/Calls per hour|שיחות לפי שעה/i).first()).toBeVisible();
  await expect(page.getByText(/Recent calls|שיחות אחרונות/i).first()).toBeVisible();

  // The softphone must remain usable/testable even with no real SIP account.
  // Signaling lifecycle is covered by unit tests; this guards the integrated UI.
  await page.getByTestId('phone-button').click();
  await expect(page.getByTestId('phone-panel')).toBeVisible();
  await expect(page.getByText(/Offline|Unavailable/i).first()).toBeVisible();
  await expect(page.getByTestId('phone-presence-select')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('phone-panel')).toBeHidden();

  // Core modules remain reachable after the navigation redesign.
  await rail.locator('a[href="/calls"]').click();
  await page.waitForURL('**/calls');
  const appErrors = () => pageErrors.filter((message) => !message.includes('WebSocket closed'));
  await expect.poll(appErrors, { message: 'Calls route must not throw in the browser' }).toEqual([]);
  // Page titles are the PageHeader h2 — level-scoped because the dashboard's
  // widget headings ("Calls per hour", "Recent calls") also match /Calls/ and
  // stay visible while the next route's chunk loads (React Router transition).
  await expect(page.getByTestId('main-content').getByRole('heading', { level: 2, name: /Calls|שיחות/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('calls-pagination')).toBeVisible();
  await rail.locator('a[href="/reports"]').click();
  await page.waitForURL('**/reports');
  await expect(page.getByTestId('main-content').getByRole('heading', { level: 2, name: /Reports|דוחות/i })).toBeVisible({ timeout: 15_000 });
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

// ProtectedRoute gate: unauthenticated deep links must land on /login.
test('unauthenticated /calls redirects to login', async ({ page }) => {
  await page.goto('/calls');
  await page.waitForURL('**/login', { timeout: 10_000 });
  await expect(page.getByTestId('login-form')).toBeVisible();
});
