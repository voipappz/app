import { test, expect } from '@playwright/test';
import { loginWithAccount } from './helpers/browserAuth';

// Characterization tests for the Calls page — capture current OBSERVABLE
// behavior before the refactor (decompose Calls.jsx, extract useTranscript +
// CallDetailDrawer). These must stay green through every micro-step.
test.describe('Calls (characterization)', () => {
  test('list renders rows from a real source', async ({ page, context }) => {
    await loginWithAccount(context);
    await page.goto('/calls');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('calls-source')).toBeVisible({ timeout: 10000 });
    // Real data → at least one call row in the table.
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
  });

  test('clicking a call opens the detail drawer with a transcript section + timeline', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await loginWithAccount(context);
    await page.goto('/calls');
    await page.waitForLoadState('networkidle');

    // The table groups by time, so skip the single-cell group-header rows and
    // click an actual call row (multiple cells).
    await page.locator('table tbody tr:has(td:nth-child(4))').first().click();

    // Drawer slides in with the transcript section's Transcribe button.
    await expect(page.getByRole('button', { name: /transcribe|תמלל/i })).toBeVisible({ timeout: 10000 });
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });
});
