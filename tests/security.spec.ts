import { test, expect, Page, BrowserContext } from '@playwright/test';
import { loginWithAccount } from './helpers/browserAuth';

/**
 * Security Tests — Prove auth protection
 *
 * These tests validate:
 * 1. Protected routes redirect to /login without auth
 * 2. Authenticated users can access protected content
 */

// Establish a real accounts-table session in the browser context.
// Thin wrapper so existing call sites stay `setupAuth(page, context)`.
async function setupAuth(_page: Page, context: BrowserContext) {
  await loginWithAccount(context);
}

test.describe('Security — Protected Routes', () => {
  test('dashboard without auth redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    expect(page.url()).toContain('/login');
  });

  test('calls without auth redirects to login', async ({ page }) => {
    await page.goto('/calls');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    expect(page.url()).toContain('/login');
  });

  test('reports without auth redirects to login', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    expect(page.url()).toContain('/login');
  });

  test('authenticated user sees dashboard content', async ({ page, context }) => {
    await setupAuth(page, context);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    expect(page.url()).toContain('/dashboard');
    expect(page.url()).not.toContain('/login');
  });
});
