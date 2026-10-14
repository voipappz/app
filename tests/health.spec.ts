import { test, expect } from './auth-fixture';

/**
 * Health API Tests
 * API: /health
 * Tests: Health check, Verbose health check
 */

test.describe('Health API', () => {
  test.setTimeout(process.env.CI ? 90000 : 30000);

  test('Basic health check returns 200', async ({ authenticatedPage: page }) => {
    const apiBaseUrl = process.env.VITE_API_BASE_URL || '';

    const response = await page.request.get(`${apiBaseUrl}/health`);

    console.log(`Health: ${response.status()}`);
    expect(response.status()).toBe(200);

    const text = await response.text();
    console.log(`Health response: ${text}`);
    // Accept both "healthy" plain text and JSON responses
    expect(text.length).toBeGreaterThan(0);
  });

  // The API's own health is /api/health at a mothership's Kong; /health there
  // is GATUS (its endpoint statuses array). These used /health?verbose and
  // /health/detailed and accepted whatever came back — Gatus's array, and a
  // 404 — which is how the admin read Gatus as the API for weeks.
  test('Verbose health is the API, not Gatus', async ({ authenticatedPage: page }) => {
    const apiBaseUrl = process.env.VITE_API_BASE_URL || '';

    const response = await page.request.get(`${apiBaseUrl}/api/health?verbose`);
    console.log(`Verbose Health: ${response.status()}`);
    expect([200, 503]).toContain(response.status());

    const data = await response.json();
    expect(Array.isArray(data)).toBe(false);
    expect(data.checks).toBeTruthy();
    console.log(`✅ ${Object.keys(data.checks).length} checks: ${Object.keys(data.checks).join(', ')}`);
  });

  test('Detailed health endpoint exists (200, or 401 without a token)', async ({ authenticatedPage: page }) => {
    const apiBaseUrl = process.env.VITE_API_BASE_URL || '';

    const response = await page.request.get(`${apiBaseUrl}/api/health/detailed`);
    console.log(`Detailed Health: ${response.status()}`);
    expect([200, 401]).toContain(response.status());
    // JSON either way: the panel parses it, and "Cannot GET" was the bug.
    await response.json();
  });

  test('LB health endpoint returns 200', async ({ authenticatedPage: page }) => {
    const apiBaseUrl = process.env.VITE_API_BASE_URL || '';

    const response = await page.request.get(`${apiBaseUrl}/health/lb`);

    console.log(`LB Health: ${response.status()}`);
    expect(response.status()).toBe(200);

    const text = await response.text();
    console.log(`LB Health response: ${text}`);
  });
});

test.describe('Health Indicator in UI', () => {
  test.setTimeout(process.env.CI ? 90000 : 30000);

  test('Main menu loads with icon buttons', async ({ authenticatedPage: page }) => {
    await page.goto('/live', { waitUntil: 'networkidle', timeout: 20000 });

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Check for icon buttons in the menu (health is one of them)
    const iconButtons = page.locator('button');
    const iconButtonCount = await iconButtons.count();
    console.log(`Found ${iconButtonCount} buttons in main menu`);

    // We expect at least some buttons (search, notifications, profile, health)
    expect(iconButtonCount).toBeGreaterThan(0);
    console.log('✅ Main menu buttons found');
  });
});
