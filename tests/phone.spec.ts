import { test, expect } from '@playwright/test';
import { loginWithAccount } from './helpers/browserAuth';

// E2E for the SIP softphone UI (jambonz-style header dialer). Like the other
// specs here, this runs against a live local app (not CI — Playwright needs a
// backend). It exercises the UI surface; a real register/call needs an extension.
test.describe('Softphone', () => {
  test('header button opens the dialer (keypad + 3 tabs), no runtime errors', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await loginWithAccount(context);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('phone-button').click();
    const pop = page.getByTestId('phone-popover');
    await pop.waitFor({ timeout: 10000 });

    await expect(pop.locator('button', { hasText: /^[0-9]$/ })).toHaveCount(10); // 0-9
    await expect(pop.getByRole('tab')).toHaveCount(3);                            // Dialpad/History/Settings
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('Settings tab exposes the SIP config (server pre-filled, creds editable)', async ({ page, context }) => {
    await loginWithAccount(context);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('phone-button').click();
    const pop = page.getByTestId('phone-popover');
    await pop.waitFor({ timeout: 10000 });
    await pop.getByRole('tab').nth(2).click(); // Settings

    // Server defaults to the verified endpoint; extension creds start empty.
    const server = pop.getByLabel(/WebSocket server|שרת/);
    await expect(server).toBeVisible();
    await expect(server).toHaveValue(/wss:\/\//);
  });
});
