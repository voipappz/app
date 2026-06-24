import { test, expect } from '@playwright/test';

// Smoke test for a live deploy. Set PLAYWRIGHT_BASE_URL to the deployed origin.

test('login page renders', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/login$/, { timeout: 10_000 });
  await expect(page.locator('button:has-text("Login"), button:has-text("התחבר")')).toBeVisible({ timeout: 5_000 });
});

test('JS bundle loads and renders root', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10_000 });
});

test('title is VoipAppZ', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/VoipAppZ/i);
});
