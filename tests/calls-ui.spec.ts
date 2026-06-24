import { test, expect } from '@playwright/test';

/**
 * Calls page UI — auth gate. Unauthenticated access to /calls must redirect to
 * /login (ProtectedRoute). The authenticated render of the grouped/sortable
 * table is exercised once a real Supabase session exists; the calls DATA layer
 * is verified directly in tests/calls-api.spec.ts.
 */
test('GET /calls while unauthenticated redirects to /login', async ({ page }) => {
  await page.goto('/calls');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  expect(page.url()).toContain('/login');
});
