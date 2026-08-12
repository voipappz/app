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
  // The bell opens a panel, like the account — a glance at what is new should
  // not cost you the page you were on.
  await expect(page.getByTestId('rail-notifications')).toBeVisible();
  await page.getByTestId('rail-notifications').click();
  await expect(page.getByTestId('notifications-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  // The account block opens one popup holding everything about "me".
  await expect(page.getByTestId('rail-account')).toBeVisible();
  await page.getByTestId('rail-account').click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('account-menu')).toBeHidden();

  // The dashboard renders real local-projection content, not a bare waiting
  // message: a KPI row (default tiles OR user-defined widgets) + calls-per-hour
  // + recent calls.
  await expect(page.getByTestId('dashboard-kpis')).toBeVisible();
  await expect(page.getByText(/Calls per hour|שיחות לפי שעה/i).first()).toBeVisible();
  await expect(page.getByText(/Recent calls|שיחות אחרונות/i).first()).toBeVisible();

  // Dashboard access includes its local DuckDB builder. The mock user has
  // dashboard:read (not dashboard:write), matching the end-user ACL that used
  // to hide the builder completely.
  await expect(page.getByTestId('dashboard-builder-button')).toBeVisible();
  await page.getByTestId('dashboard-builder-button').click();
  await expect(page.getByTestId('dashboard-builder')).toBeVisible();
  await expect(page.getByTestId('create-dashboard')).toBeVisible();
  await expect(page.getByTestId('add-widget')).toBeVisible();

  // The restored Nimbus interaction starts with an explicit type chooser.
  // Keep every supported DuckDB-backed choice reachable from the builder.
  await page.getByTestId('add-widget').click();
  for (const type of ['counter', 'table', 'pie', 'line', 'bar', 'gauge', 'stat']) {
    await expect(page.getByTestId(`widget-type-${type}`)).toBeVisible();
  }
  await page.getByTestId('widget-type-counter').click();
  const widgetEditor = page.getByTestId('widget-editor');
  await expect(widgetEditor).toBeVisible();
  await widgetEditor.getByRole('button', { name: /Cancel|ביטול/i }).click();
  await expect(widgetEditor).toBeHidden();

  await page.getByTestId('builder-events-tab').click();
  await expect(page.getByTestId('dashboard-event-views')).toBeVisible();
  await expect(page.getByTestId('create-event-counter')).toBeVisible();
  await expect(page.getByTestId('create-event-table')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dashboard-builder')).toBeHidden();

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

  // Raw-event tooling is a real authenticated screen. Mock only the Deno
  // boundary and prove the row opens with the original writer payload intact.
  await page.route(/\/events\?/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      total: 1, limit: 25, offset: 0,
      events: [{
        event_id: 'browser-raw-1', call_id: 'browser-call-1', event_type: 'call.cdr', action: 'call.cdr',
        occurred_at: '2026-08-07 12:01:00', received_at: '2026-08-07 12:01:01',
        payload: { call_id: 'browser-call-1' },
        raw_payload: {
          call_uuid: 'browser-call-1',
          data: { hangup_cause: 'NORMAL_CLEARING' },
          metadata: { 'Event-Name': 'CHANNEL_HANGUP_COMPLETE' },
        },
      }],
    }),
  }));
  // Raw event inspection is a technical/development route, not end-user
  // navigation. Keep its route covered without putting it in the main rail.
  await page.goto('/event-explorer');
  await page.waitForURL('**/event-explorer');
  await expect(page.getByTestId('event-row-browser-raw-1')).toBeVisible();
  await page.getByTestId('event-row-browser-raw-1').click();
  await expect(page.getByTestId('raw-event-dialog')).toContainText('CHANNEL_HANGUP_COMPLETE');
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

// Sign-in is ALWAYS left-to-right, even though the app defaults to Hebrew/RTL.
test('login page is left-to-right', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toBeVisible();

  // The whole document flips, not just a wrapper — MUI portals its overlays to
  // document.body, so a scoped subtree would leave those RTL.
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  // Computed style, not just the attribute: DirectionProvider flips the CSS
  // itself via stylis-plugin-rtl, so a dir attribute alone would not prove the
  // stylesheet followed.
  await expect(page.getByTestId('login-layout')).toHaveCSS('direction', 'ltr');
  await expect(page.getByTestId('login-content')).toHaveCSS('direction', 'ltr');
  await expect(page.getByTestId('login-form')).toHaveCSS('direction', 'ltr');

  // The stored PREFERENCE is untouched — login overrides how it renders, it
  // does not silently rewrite the tenant's setting.
  expect(await page.evaluate(() => localStorage.getItem('app-direction'))).not.toBe('ltr');
});

// ...and the app returns to RTL once past login, so the override is scoped to
// the screen rather than leaking into the authenticated app.
test('app returns to RTL after login', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.getByTestId('email-input').locator('input').fill('ci@example.com');
  await page.getByTestId('password-input').locator('input').fill('anything');
  await page.getByTestId('login-button').click();
  await page.getByTestId('otp-input').locator('input').fill('123456');
  await page.getByTestId('otp-verify-button').click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

// One popup holds everything about the signed-in user: who they are, the
// language, how the backend is doing, and the way out.
test('the account popup carries details, language, status and logout', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email-input').locator('input').fill('ci@example.com');
  await page.getByTestId('password-input').locator('input').fill('anything');
  await page.getByTestId('login-button').click();
  await page.getByTestId('otp-input').locator('input').fill('123456');
  await page.getByTestId('otp-verify-button').click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  // The rail carries the avatar alone; identity and the build live in the
  // popup it opens, so the 72px rail is not asked to render an email legibly.
  await expect(page.getByTestId('app-version')).toHaveCount(0);

  await page.getByTestId('rail-account').click();
  const menu = page.getByTestId('account-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('account-email')).toHaveText('ci@example.com');
  await expect(page.getByTestId('account-language-select')).toBeVisible();
  await expect(page.getByTestId('account-status')).toBeVisible();
  await expect(page.getByTestId('account-logout')).toBeVisible();
  await expect(page.getByTestId('account-menu').getByTestId('menu-app-version')).toBeVisible();
});

// Language is the control; direction is a consequence. There is no RTL switch.
test('choosing a language sets the direction', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email-input').locator('input').fill('ci@example.com');
  await page.getByTestId('password-input').locator('input').fill('anything');
  await page.getByTestId('login-button').click();
  await page.getByTestId('otp-input').locator('input').fill('123456');
  await page.getByTestId('otp-verify-button').click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  // Hebrew ⇒ RTL, with no separate direction control involved.
  await page.getByTestId('rail-account').click();
  await page.getByTestId('account-language-select').click();
  await page.getByTestId('account-language-he').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');

  // English ⇒ LTR. The popup stays open across a change — you see it apply —
  // so there is no trigger to click again, only the select.
  await page.getByTestId('account-language-select').click();
  await page.getByTestId('account-language-en').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
