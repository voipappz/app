import { test, expect, type Page } from '@playwright/test';

/**
 * Conversations screen (/conversations): the menus, and one real call cycle.
 *
 * Signs in through the user sign-in page with TEST_USER_EMAIL / TEST_USER_PASSWORD
 * (VA_TEST_OTP when the API asks for a code). Runs only in CI's e2e job.
 * The conversations API may not be deployed on every API: a 404 on
 * GET /api/conversations is tolerated and annotated, not failed.
 */
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const otp = process.env.VA_TEST_OTP;
const callTarget = process.env.E2E_CALL_TARGET;

const fresh = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('completedTours', JSON.stringify({ 'first-login': true }));
  });
};

async function signInAsUser(page: Page) {
  await fresh(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="user-login-form"]')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-testid="user-email-input"] input').fill(email!);
  await page.locator('[data-testid="user-password-input"] input').fill(password!);
  await page.locator('[data-testid="user-login-button"]').click();

  const code = page.locator('[data-testid="user-otp-input"]');
  const screen = page.locator('[data-testid="conversations-screen"]');
  await expect(code.or(screen)).toBeVisible({ timeout: 30000 });
  if (await code.isVisible()) {
    if (!otp) throw new Error('The API asked for a code and VA_TEST_OTP is not set');
    await page.getByLabel('Digit 1').click();
    await page.keyboard.type(otp);
    await page.locator('[data-testid="user-otp-submit-button"]').click();
  }
  await expect(page).toHaveURL(/\/conversations/, { timeout: 30000 });
  await expect(screen).toBeVisible({ timeout: 30000 });
}

const conversationsUrl = (url: string) => /\/api\/conversations(\?|$)/.test(url);

test.describe('Conversations: screen and menus', () => {
  test.skip(!email || !password, 'Set TEST_USER_EMAIL and TEST_USER_PASSWORD (a portal user with the call ACL) to run these.');
  test.setTimeout(120000);

  test('lands on the screen with three panes and no admin navbar', async ({ page }) => {
    await signInAsUser(page);
    await expect(page.locator('[data-testid="authenticated-layout"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="layout-container"] [data-testid="main-content"]')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Live' })).toBeVisible();      // list
    await expect(page.getByRole('main')).toBeVisible();                       // thread
    await expect(page.locator('[data-testid="phone-screen"]')).toBeVisible(); // phone
  });

  test('the menu button hides and shows the list; tabs switch; search takes digits', async ({ page }) => {
    await signInAsUser(page);
    const live = page.getByRole('tab', { name: 'Live' });
    const toggle = () => page.getByRole('button', { name: 'Show or hide sessions' }).first();

    await toggle().click();
    await expect(live).toHaveCount(0);
    await toggle().click();
    await expect(live).toBeVisible();

    const allResponse = page.waitForResponse((r) => conversationsUrl(r.url()) && r.url().includes('tab=all'), { timeout: 30000 });
    await page.getByRole('tab', { name: 'All' }).click();
    const status = (await allResponse).status();
    if (status === 404) {
      test.info().annotations.push({ type: 'skipped', description: 'GET /api/conversations is 404 here: asserting the empty state only.' });
      await expect(page.getByRole('alert').filter({ hasText: 'Could not load conversations.' })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Missed' }).click();
    await expect(page.getByRole('tab', { name: 'Missed' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Live' }).click();
    await expect(live).toHaveAttribute('aria-selected', 'true');

    const search = page.getByLabel('Search by number');
    await search.fill('052 555-0144');
    await expect(search).toHaveValue('052 555-0144');
  });

  test('the sort menu sends order_kind=asc and offers direction and outcome', async ({ page }) => {
    await signInAsUser(page);
    await page.getByRole('tab', { name: 'All' }).click();
    const menu = () => page.getByRole('button', { name: 'Sort and filter' });

    await menu().click();
    const asc = page.waitForRequest((r) => conversationsUrl(r.url()) && r.url().includes('order_kind=asc'), { timeout: 20000 });
    await page.getByRole('menuitem', { name: 'Oldest first' }).click();
    await asc;

    await menu().click();
    for (const name of ['Newest first', 'Longest duration', 'Shortest duration', 'Incoming', 'Outgoing', 'Answered', 'Missed', 'Bot']) {
      await expect(page.getByRole('menuitem', { name })).toBeVisible();
    }
    const incoming = page.waitForRequest((r) => conversationsUrl(r.url()) && r.url().includes('direction=incoming'), { timeout: 20000 });
    await page.getByRole('menuitem', { name: 'Incoming' }).click();
    await incoming;
  });

  test('the sign-in page links administrators to /admin and switches to Hebrew', async ({ page }) => {
    await fresh(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="user-login-form"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-testid="sign-in-as"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'עברית' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.getByRole('link', { name: 'Sign in to the admin console' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Conversations: call cycle', () => {
  test.skip(!email || !password || !callTarget, 'Set TEST_USER_EMAIL, TEST_USER_PASSWORD and E2E_CALL_TARGET (a number that answers) to run the call cycle.');
  test.setTimeout(240000);
  test.use({
    permissions: ['microphone'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  });

  test('dials, controls the call, hangs up and finds it in the list', async ({ page }) => {
    const target = callTarget!;
    const digits = target.replace(/\D/g, '');
    await signInAsUser(page);

    const phone = page.locator('[data-testid="phone-screen"]');
    await expect(phone).toContainText('Ready', { timeout: 90000 }); // registered

    await page.getByLabel('Enter number').fill(target);
    await page.getByRole('button', { name: 'Call', exact: true }).click();

    await expect(phone.getByText('Call duration')).toBeVisible({ timeout: 60000 });
    await expect(phone).toContainText(digits.slice(-6));
    for (const name of ['Mute', 'Hold', 'Transfer', 'Keypad', 'Hang up']) {
      await expect(phone.getByRole('button', { name })).toBeVisible();
    }

    await phone.getByRole('button', { name: 'Hold', exact: true }).click();
    await phone.getByRole('button', { name: 'Resume' }).click();
    await expect(phone.getByRole('button', { name: 'Hold', exact: true })).toBeVisible({ timeout: 15000 });
    await phone.getByRole('button', { name: 'Mute', exact: true }).click();
    await phone.getByRole('button', { name: 'Unmute' }).click();
    await phone.getByRole('button', { name: 'Keypad' }).click();
    await phone.getByRole('button', { name: '1', exact: true }).click();

    await phone.getByRole('button', { name: 'Hang up' }).click();
    await expect(phone.getByText('Call duration')).toHaveCount(0, { timeout: 30000 });

    // The call lands in the history list (from GET /api/conversations).
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('user_auth') || '{}').token);
    const base = process.env.VITE_API_BASE_URL;
    const deadline = Date.now() + 90000;
    let found = false;
    let missing = false;
    while (Date.now() < deadline && !found) {
      const res = await page.request.get(`${base}/api/conversations?tab=all&per_page=20&q=${digits.slice(-7)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status() === 404) { missing = true; break; }
      if (res.ok()) {
        const body = await res.json();
        const rows = Array.isArray(body) ? body : body.data || [];
        found = rows.some((r: any) => String(r.remote_number || '').replace(/\D/g, '').endsWith(digits.slice(-7)));
      }
      if (!found) await page.waitForTimeout(5000);
    }
    if (missing) {
      test.info().annotations.push({ type: 'skipped', description: 'GET /api/conversations is 404 here: the history step is skipped.' });
    } else {
      expect(found, 'the finished call appears in /api/conversations').toBe(true);
    }
  });
});
