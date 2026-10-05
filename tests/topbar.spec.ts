import { test, expect } from './auth-fixture';

/**
 * The top bar: the open screen's search field beside the application selector,
 * its popup (date range, filters, refresh / export / columns), and the
 * top-right tools, which are down to Help and the health dot.
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
    expect((await request.response())?.status()).toBe(200);
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

  test('the top-right tools are Help and the health dot only', async ({ authenticatedPage: page }) => {
    await page.goto('/calls', { waitUntil: 'domcontentloaded', timeout: 20000 });

    const tools = page.locator('.topbar-actions');
    await expect(tools.getByRole('button', { name: 'Help', exact: true })).toBeVisible({ timeout: 30000 });
    await expect(tools.getByRole('button', { name: 'Health', exact: true })).toBeVisible();
    for (const name of ['Settings', 'Wizard', 'Nodes', 'Providers', 'Events', 'Syslog', 'Monitoring']) {
      await expect(tools.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
  });
});
