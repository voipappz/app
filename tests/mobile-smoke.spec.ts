import { test as base, expect } from '@playwright/test';
import { loginWithAccount } from './helpers/browserAuth';

/**
 * Mobile smoke test — verifies the brand + Hebrew UI render on a
 * phone-sized viewport with no horizontal overflow (the core "mobile-friendly"
 * check), across Login, Dashboard, and the new Usage Reports page.
 *
 * Uses domcontentloaded + explicit element waits (a live WebSocket app never
 * reaches networkidle / full load). Screenshots land in test-results/.
 */

const test = base;
test.use({ viewport: { width: 390, height: 844 } }); // iPhone 12 portrait
test.describe.configure({ timeout: 240_000 }); // first Vite compile + web-font CDN can be slow

async function noHOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(2);
}

// Diagnostic full-page screenshot that tolerates a slow/blocked web-font CDN
// (Playwright's screenshot blocks on document.fonts.ready). The functional
// assertions run before this, so a font-wait timeout never fails the test.
async function shot(page, path) {
  try {
    await page.screenshot({ path, fullPage: true, timeout: 20_000 });
  } catch {
    await page.screenshot({ path }); // viewport-only fallback, no font wait blowup
  }
}

test('mobile · login page is branded and fits the viewport', async ({ page }) => {
  page.setDefaultNavigationTimeout(60_000);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({ timeout: 10_000 });
  await noHOverflow(page);
  await shot(page, 'test-results/mobile-login.png');
});

test('mobile · dashboard + usage reports render in Hebrew with no horizontal scroll', async ({ page, context }) => {
  page.setDefaultNavigationTimeout(60_000);
  await loginWithAccount(context);
  // loginWithAccount pins app-language to 'en'; force Hebrew so the screenshots
  // reflect the real default RTL experience. (Init scripts run in insertion order.)
  await context.addInitScript(() => localStorage.setItem('app-language', 'he'));

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('לוח בקרה').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
  await noHOverflow(page);
  await shot(page, 'test-results/mobile-dashboard.png');

  await page.goto('/reports', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('דוחות').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200); // pie chart settles
  await noHOverflow(page);
  await shot(page, 'test-results/mobile-reports.png');

  await page.goto('/calls', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('שיחות').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
  await noHOverflow(page);
  await shot(page, 'test-results/mobile-calls.png');
});
