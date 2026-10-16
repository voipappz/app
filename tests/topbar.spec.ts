import { test, expect } from './auth-fixture';

/**
 * The top bar: the open screen's search field beside the application selector,
 * its popup (date range, filters, refresh / export / columns), and the
 * top-right tools, including Support (which replaced Help) and the health dot.
 */
test.describe('Top bar', () => {
  test.setTimeout(process.env.CI ? 90000 : 30000);

  test('the Calls search is in the top bar, opens its popup and searches with search[inline]', async ({ authenticatedPage: page }) => {
    await page.goto('/calls', { waitUntil: 'domcontentloaded', timeout: 20000 });

    const box = page.locator('#topbar-search-slot').getByPlaceholder('Search caller, callee, user, route or call ID');
    await expect(box).toBeVisible({ timeout: 30000 });

    await box.click();
    const popup = page.getByTestId('topbar-search-popup');
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Refresh' })).toBeVisible();

    const listRequest = page.waitForRequest((req) => {
      const u = new URL(req.url());
      return u.pathname.endsWith('/api/calls') && u.searchParams.has('page') && u.searchParams.get('search[inline]') === 'test';
    }, { timeout: 20000 });
    await box.fill('test');
    await box.press('Enter');

    const request = await listRequest;
    expect(new URL(request.url()).searchParams.has('search[name]')).toBe(false);
    const response = await request.response();
    // On a refusal, say who refused: the API answers JSON, a proxy plain text.
    // and what the account's token grants for Calls (only that entry: the log is public).
    const callsAcl = await page.evaluate(() => {
      const token = JSON.parse(localStorage.getItem('auth') || '{}').access || '';
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const data = claims.acl?.data || claims.acl || {};
      return { calls: data.calls ?? null, call: data.call ?? null };
    });
    const said = `${await response?.text()} acl=${JSON.stringify(callsAcl)} ${JSON.stringify(await response?.allHeaders())}`;
    expect(response?.status(), said).toBe(200);
    await expect(popup).toBeHidden();
  });

  test('the search field takes the whole bar between the selector and the tools', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto('/calls', { waitUntil: 'domcontentloaded', timeout: 20000 });

    const slot = page.locator('#topbar-search-slot');
    await expect(slot.getByPlaceholder('Search caller, callee, user, route or call ID')).toBeVisible({ timeout: 30000 });

    const bar = await page.locator('.topbar-container').boundingBox();
    const field = await slot.boundingBox();
    expect(field!.width).toBeGreaterThan(bar!.width * 0.6);
  });

  test('the top-right tools show Support instead of Help and the health dot', async ({ authenticatedPage: page }) => {
    await page.goto('/calls', { waitUntil: 'domcontentloaded', timeout: 20000 });

    const tools = page.locator('.topbar-actions');
    await expect(tools.getByRole('button', { name: 'Support', exact: true })).toBeVisible({ timeout: 30000 });
    await expect(tools.getByRole('button', { name: 'Help', exact: true })).toHaveCount(0);
    await expect(tools.getByRole('button', { name: 'Health', exact: true })).toBeVisible();
    for (const name of ['Settings', 'Wizard', 'Nodes', 'Providers', 'Events', 'Syslog', 'Monitoring']) {
      await expect(tools.getByRole('button', { name, exact: true })).toHaveCount(0);
    }

    await tools.getByRole('button', { name: 'Support', exact: true }).click();
    const supportMenu = page.getByRole('menu', { name: 'Support' });
    await expect(supportMenu).toBeVisible();
    for (const name of ['MCP', 'DevZone', 'Documentation', 'Tickets']) {
      await expect(supportMenu.getByRole('menuitem', { name, exact: true })).toBeVisible();
    }
    await supportMenu.getByRole('menuitem', { name: 'DevZone', exact: true }).click();
    const devZone = page.getByRole('dialog', { name: 'DevZone', exact: true });
    await expect(devZone).toBeVisible();
    await expect(supportMenu).toBeHidden();
    await expect(page).toHaveURL(/\/calls(?:\?|$)/);
    await devZone.getByRole('button', { name: 'Expand to fullscreen', exact: true }).click();
    await expect(devZone.getByRole('button', { name: 'Restore size', exact: true })).toBeVisible();
    await devZone.getByRole('button', { name: 'Close DevZone', exact: true }).click();
    await expect(devZone).toBeHidden();
  });
});
