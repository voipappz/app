import { test, expect } from './auth-fixture';

/**
 * The top bar and the Calls toolbar: the bar carries no per-screen search on
 * Calls any more (its filters sit in the counter row, refresh / export /
 * columns beside the period), and the top-right tools, including Support
 * (which replaced Help) and the health dot.
 */
test.describe('Top bar', () => {
  test.setTimeout(process.env.CI ? 90000 : 30000);

  test('Calls: the filters live in the counter row, and a search[inline] in the URL reaches the API', async ({ authenticatedPage: page }) => {
    // The Calls search left the top bar (the bar is for the global Ctrl+K
    // search): the counter row carries a Filters button with the panel in a
    // popover, and the text search arrives from the palette as search[inline].
    const listRequest = page.waitForRequest((req) => {
      const u = new URL(req.url());
      return u.pathname.endsWith('/api/calls') && u.searchParams.has('page') && u.searchParams.get('search[inline]') === 'test';
    }, { timeout: 30000 });
    await page.goto('/calls?search%5Binline%5D=test', { waitUntil: 'domcontentloaded', timeout: 20000 });

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

    const counters = page.getByTestId('calls-counters');
    await expect(counters).toBeVisible({ timeout: 30000 });
    await expect(counters.getByText('Search: test')).toBeVisible();
    await expect(page.locator('#topbar-search-slot').getByPlaceholder('Search caller, callee, user, route or call ID')).toHaveCount(0);

    const filters = counters.getByTestId('centralized-search-filters-button');
    await filters.click();
    const popover = page.getByTestId('centralized-search-popover');
    await expect(popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
  });

  test('Calls: refresh, export and columns sit in the toolbar beside the period', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto('/calls', { waitUntil: 'domcontentloaded', timeout: 20000 });

    const actions = page.getByTestId('calls-toolbar-actions');
    await expect(actions).toBeVisible({ timeout: 30000 });
    for (const name of ['Refresh', 'Export CSV', 'Columns']) {
      await expect(actions.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('group', { name: 'Period' }).getByRole('button', { name: '7d', exact: true })).toBeVisible();
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
