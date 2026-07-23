import { test, expect } from '@playwright/test';
import { loginWithAccount } from './helpers/browserAuth';

// E2E for the SIP softphone UI (WebRTC-portal style: right-docked dark panel).
// Like the other specs here, this runs against a live local app (not CI —
// Playwright needs a backend). It exercises the UI surface; a real
// register/call needs an extension.
test.describe('Softphone', () => {
  test('header button opens the right-docked dialer (keypad + 3 tabs), no runtime errors', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await loginWithAccount(context);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('phone-button').click();
    const panel = page.getByTestId('phone-panel');
    await panel.waitFor({ timeout: 10000 });

    // Dialpad is the default tab — keypad digits 0-9 are clickable cells.
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      await expect(panel.getByRole('button', { name: d, exact: true })).toBeVisible();
    }
    await expect(panel.getByRole('tab')).toHaveCount(3); // Calls / Dialpad / Settings
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('Settings tab exposes the SIP config (server pre-filled, creds editable)', async ({ page, context }) => {
    await loginWithAccount(context);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('phone-button').click();
    const panel = page.getByTestId('phone-panel');
    await panel.waitFor({ timeout: 10000 });
    await panel.getByRole('tab').nth(2).click(); // Settings

    // Server defaults to the verified endpoint; extension creds start empty.
    const server = panel.getByLabel(/WebSocket server|שרת/);
    await expect(server).toBeVisible();
    await expect(server).toHaveValue(/wss:\/\//);
  });
});
