import { test, expect } from './auth-fixture';
import { testList } from './crud-helpers';

/**
 * Customers Module — verifies we can add (and list) customers.
 *
 * NOTE on auth: customer creation is ROOT-only. The shared OTP fixture account
 * (the CI account) is org-scoped — it can LIST customers but gets 401 on
 * POST /api/customers. So the CREATE test authenticates as a root account via
 * HTTP Basic Auth, supplied through env vars to keep the password out of git:
 *
 *   VA_ROOT_EMAIL=nir+voipappz@voipappz.com
 *   VA_ROOT_PASSWORD=********
 *
 * If those aren't set the CREATE test is skipped (so CI stays green without
 * root creds), while LIST still runs on the normal fixture account.
 */
test.describe('Customers', () => {
  test.setTimeout(process.env.CI ? 90000 : 30000);

  const apiBaseUrl = process.env.VITE_API_BASE_URL!;
  const rootEmail = process.env.VA_ROOT_EMAIL;
  const rootPassword = process.env.VA_ROOT_PASSWORD;
  const basicAuth =
    rootEmail && rootPassword
      ? 'Basic ' + Buffer.from(`${rootEmail}:${rootPassword}`).toString('base64')
      : null;

  test('LIST returns 200', async ({ authenticatedPage: page }) => {
    const response = await testList(page, 'customers');
    expect(response.status()).toBe(200);
  });

  test('CREATE customer returns 2xx and we get it back', async ({ authenticatedPage: page }) => {
    test.skip(!basicAuth, 'Set VA_ROOT_EMAIL / VA_ROOT_PASSWORD to run the root-only CREATE test');

    const name = `PW Test Customer ${Date.now()}`;
    const form = new URLSearchParams({ name, enabled: 'true' }).toString();

    const response = await page.request.post(`${apiBaseUrl}/api/customers`, {
      headers: {
        Authorization: basicAuth!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: form,
    });

    // 200/201 = PASS
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);

    const body = await response.json();
    const uuid = body.uuid || body.id;
    expect(uuid).toBeTruthy();
    expect(body.name).toBe(name);
    console.log(`✅ Created customer ${uuid} (${name})`);

    // Cleanup so we don't leave test customers around.
    if (uuid) {
      const del = await page.request.delete(`${apiBaseUrl}/api/customers/${uuid}`, {
        headers: { Authorization: basicAuth! },
      });
      console.log(`cleanup delete -> ${del.status()}`);
    }
  });
});
