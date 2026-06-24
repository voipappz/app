import { test, expect } from '@playwright/test';
import { loginWithAccount } from './helpers/browserAuth';

test.describe('System status page', () => {
  test('renders the deno /health dependency report natively', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await loginWithAccount(context);
    await page.goto('/status');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('system-status')).toBeVisible({ timeout: 10000 });
    // The deno /health checks render as rows (cable + events at minimum).
    await expect(page.getByTestId('status-cable')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('status-events')).toBeVisible();
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });
});
