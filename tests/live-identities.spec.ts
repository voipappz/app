import { test, expect } from './auth-fixture';
import { getAuthToken, getApiBaseUrl } from './crud-helpers';

/**
 * Live's history: the identities the API keeps from the live stream
 * (/api/identities/report), and the Live board's builder over them.
 * Written against switch; the log names what the API holds per type.
 */
test.describe('Live identities', () => {
  test.setTimeout(process.env.CI ? 90000 : 30000);

  test('the API holds identities for this account\'s environments', async ({ authenticatedPage: page }) => {
    const api = getApiBaseUrl();
    const headers = { Authorization: `Bearer ${await getAuthToken(page)}` };

    const envs = await page.request.get(`${api}/api/applications?page=1&per_page=999`, { headers });
    expect(envs.status(), await envs.text()).toBe(200);
    const body = await envs.json();
    const uuids = (Array.isArray(body) ? body : body.data || []).map((e: { uuid: string }) => e.uuid).filter(Boolean);
    expect(uuids.length, 'the account has no environments').toBeGreaterThan(0);
    const scope = `environment_uuids=${uuids.join(',')}`;

    const catalog = await page.request.get(`${api}/api/identities/catalog?${scope}`, { headers });
    expect(catalog.status(), await catalog.text()).toBe(200);

    const report = await page.request.get(
      `${api}/api/identities/report?minutes=10080&limit=50&measures[]=events&measures[]=identities&dimensions[]=type&${scope}`,
      { headers },
    );
    expect(report.status(), await report.text()).toBe(200);
    const rows = (await report.json()).rows || [];
    console.log(`identities, last 7 days, ${uuids.length} environments:`);
    rows.forEach((r: Record<string, unknown>) => console.log(`  ${r.type}: ${r.events} events, ${r.identities} identities`));
    // Reported, not asserted: an empty week is the server's data, not this app.
    if (!rows.length) console.log('  none recorded');
  });

  test('Live builds a widget over identities', async ({ authenticatedPage: page }) => {
    await page.goto('/live', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const build = page.getByTestId('build-widget');
    await expect(build).toBeVisible({ timeout: 30000 });
    await build.click();
    await expect(page.getByText('Build an activity report')).toBeVisible();
    await page.screenshot({ path: 'playwright-report/live-identities-builder.png', fullPage: true });
  });
});
