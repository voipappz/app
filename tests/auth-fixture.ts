import { test as base, expect } from '@playwright/test';

// Extended page type with auth tokens
type AuthenticatedPage = any & {
  authTokens: {
    access: string;
    refresh: string;
    csrf: string;
    accessExpiresAt: string;
    refreshExpiresAt: string;
    isRoot: boolean;
    accountCustomer: { uuid: string; name: string; profile?: any } | null;
  };
};

// Decode JWT in Node.js context
function decodeJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Error decoding JWT:', e);
    return null;
  }
}

// A worker runs several smoke specs in sequence. Re-authenticating (and
// requesting a new OTP) for every spec needlessly trips the cloud auth
// throttles, so keep one session for the lifetime of the worker.
let cachedAuth: { data: any; savedAt: number } | null = null;

// Shared authentication fixture — login, plus the OTP step with VA_TEST_OTP
// only when the API asks for one (OTP is off by default)
export const test = base.extend<{
  authenticatedPage: AuthenticatedPage;
}>({
  authenticatedPage: async ({ page }, use) => {
    const email = process.env.TEST_EMAIL;
    const password = process.env.TEST_PASSWORD;
    const apiBaseUrl = process.env.VITE_API_BASE_URL;
    const testOtp = process.env.VA_TEST_OTP;

    if (!email || !password || !apiBaseUrl) {
      throw new Error('Required environment variables missing: TEST_EMAIL, TEST_PASSWORD, VITE_API_BASE_URL');
    }

    const cachedToken = cachedAuth?.data?.access;
    const cachedExp = cachedToken ? decodeJwt(cachedToken)?.exp : null;
    const cacheFresh = Boolean(
      cachedToken &&
      Date.now() - (cachedAuth?.savedAt || 0) < 10 * 60 * 1000 &&
      (!cachedExp || cachedExp * 1000 > Date.now() + 60 * 1000)
    );
    let tokenData: any;
    let authResponseText = '';
    if (cacheFresh) {
      console.log('🔐 Reusing worker authentication session');
      tokenData = cachedAuth!.data;
    } else {
      console.log('🔐 Performing OTP authentication...');

    const loginTimeout = process.env.CI ? 15000 : 10000;

    // The cloud backend's ring-balancer intermittently returns transient 5xx
    // (503 "failure to get a peer from the ring-balancer"). Retry the auth POSTs
    // so a flaky upstream doesn't fail the whole suite at the login step.
    const postWithRetry = async (url: string, attempts = 3) => {
      let lastErr: unknown = null;
      for (let i = 0; i < attempts; i++) {
        // Exponential backoff, deliberately small. The budget is the binding
        // constraint, not the flap: the fixture makes TWO retried POSTs
        // (login, then OTP verify) inside ONE 90s test timeout, and the page
        // load plus assertions still have to fit afterwards. A 6s cap over 6
        // attempts spent ~44s on auth alone and tests died with "Test timeout
        // of 90000ms exceeded" — trading a flaky login for a slow one.
        // 4 backoffs capped at 4s ≈ 12s per call, ~25s worst case for both.
        if (i > 0) {
          const backoff = Math.min(500 * 2 ** (i - 1), 1500);
          await new Promise((r) => setTimeout(r, backoff));
        }
        try {
          const resp = await page.request.post(url, { timeout: loginTimeout });
          // Retry on ANY 5xx — the cloud upstream flaps with both 500 ("internal
          // server error") and 503 ("failure to get a peer from the ring-balancer").
          if (resp.ok() || resp.status() < 500) return resp;
          console.log(`Auth POST got ${resp.status()} (transient 5xx), attempt ${i + 1}/${attempts}…`);
          lastErr = null;
          if (i === attempts - 1) return resp;
        } catch (err) {
          // A timeout or ECONNREFUSED THROWS rather than returning a status, so
          // the status check above never saw it and the whole suite failed at
          // the login step whenever cloud flapped. Network-level failures are
          // exactly the transient case worth retrying.
          lastErr = err;
          console.log(`Auth POST threw (${(err as Error)?.message?.slice(0, 80)}), attempt ${i + 1}/${attempts}…`);
        }
      }
      throw lastErr ?? new Error('Auth POST failed after retries');
    };

    // Step 1: Login with email + password → get temp_token
    const loginResponse = await postWithRetry(
      `${apiBaseUrl}/auth/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
    );

    console.log(`Login API Status: ${loginResponse.status()}`);
    const loginText = await loginResponse.text();
    console.log(`Login API Response: ${loginText.substring(0, 200)}...`);

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = JSON.parse(loginText);

    if (loginData.access) {
      // OTP off: the login itself answers with the tokens.
      authResponseText = loginText;
      tokenData = loginData;
    } else {
    if (!loginData.otp_sent || !loginData.temp_token) {
      throw new Error('Login returned neither tokens nor OTP data. Response: ' + loginText.substring(0, 300));
    }
    if (!testOtp) {
      throw new Error('The API asked for an OTP: set VA_TEST_OTP to its bypass code');
    }

    // Step 2: Verify OTP with test code → get JWT tokens
    console.log('📨 OTP sent, verifying with test code...');
    const otpResponse = await postWithRetry(
      `${apiBaseUrl}/auth/otp/verify?temp_token=${encodeURIComponent(loginData.temp_token)}&code=${encodeURIComponent(testOtp)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
    );

    console.log(`OTP Verify Status: ${otpResponse.status()}`);
      const otpText = await otpResponse.text();
      authResponseText = otpText;
      console.log(`OTP Verify Response: ${otpText.substring(0, 200)}...`);

    expect(otpResponse.ok()).toBeTruthy();
      tokenData = JSON.parse(otpText);
    }
      cachedAuth = { data: tokenData, savedAt: Date.now() };
    }

    const accessToken = tokenData.access;
    const refreshToken = tokenData.refresh;
    const csrfToken = tokenData.csrf || '';

    if (!accessToken) {
      throw new Error('Login did not return an access token. Response: ' + authResponseText.substring(0, 300));
    }

    console.log('✅ Login succeeded');

    const decoded = decodeJwt(accessToken);
    const accountUuid = decoded?.account_uuid || decoded?.uuid || null;

    const accountCustomer = decoded?.customer ? {
      uuid: decoded.customer.uuid,
      name: decoded.customer.name,
      profile: decoded.customer.profile || {}
    } : null;

    const meta = decoded?.meta || {};
    const isRoot = meta.root === 'true' || meta.root === true;

    // Extract ACL permissions from JWT token (required for route protection)
    const acl = decoded?.acl || null;

    console.log('Extracted - accountUuid:', accountUuid);
    console.log('Extracted - isRoot:', isRoot);
    console.log('Extracted - acl:', acl ? Object.keys(acl).join(', ') : 'none');

    const accessExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null;
    const refreshDecoded = refreshToken ? decodeJwt(refreshToken) : null;
    const refreshExpiresAt = refreshDecoded?.exp ? new Date(refreshDecoded.exp * 1000).toISOString() : null;

    // Store auth tokens on page object
    const authTokens = {
      access: accessToken,
      refresh: refreshToken,
      csrf: csrfToken,
      accessExpiresAt: accessExpiresAt,
      refreshExpiresAt: refreshExpiresAt,
      isRoot: isRoot,
      accountCustomer: accountCustomer
    };
    (page as any).authTokens = authTokens;

    // Step 3: Setup localStorage
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.evaluate(({ tokens, accountCustomer, isRoot, accountUuid, accessExpiresAt, refreshExpiresAt, acl }) => {
      sessionStorage.clear();
      localStorage.setItem('access_token', tokens.access);
      localStorage.setItem('refresh_token', tokens.refresh);
      localStorage.setItem('csrf_token', tokens.csrf);
      if (accessExpiresAt) localStorage.setItem('access_expires_at', accessExpiresAt);
      if (refreshExpiresAt) localStorage.setItem('refresh_expires_at', refreshExpiresAt);
      localStorage.setItem('user_authenticated', 'true');

      const authObject = {
        access: tokens.access,
        refresh: tokens.refresh,
        csrf: tokens.csrf,
        accessExpiresAt: accessExpiresAt,
        refreshExpiresAt: refreshExpiresAt,
        user: { authenticated: true, email: '', uuid: accountUuid },
        accountUuid: accountUuid,
        customerUuid: accountCustomer?.uuid || null,
        accountCustomer: accountCustomer,
        isRoot: isRoot,
        acl: acl
      };
      localStorage.setItem('auth', JSON.stringify(authObject));
    }, { tokens: { access: accessToken, refresh: refreshToken, csrf: csrfToken }, accountCustomer, isRoot, accountUuid, accessExpiresAt, refreshExpiresAt, acl });

    console.log('✅ Authentication setup complete');

    const reloadTimeout = process.env.CI ? 60000 : 30000;
    await page.reload({ waitUntil: 'domcontentloaded', timeout: reloadTimeout });

    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      console.log('⚠️ Still on login page after reload, auth may not have been restored');
      await page.goto('/users', { waitUntil: 'domcontentloaded', timeout: reloadTimeout });
      await page.waitForTimeout(1000);
    }

    await use(page as AuthenticatedPage);
  }
});

export { expect };

export async function getAuthToken(page: any): Promise<string> {
  if (page.authTokens?.access) {
    return page.authTokens.access;
  }
  return await page.evaluate(() => {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}');
    return auth.access || localStorage.getItem('access_token') || '';
  });
}

export async function setAuthInLocalStorage(page: any): Promise<void> {
  if (!page.authTokens) {
    console.warn('No auth tokens available on page object');
    return;
  }
  await page.evaluate((tokens: any) => {
    localStorage.setItem('access_token', tokens.access);
    localStorage.setItem('refresh_token', tokens.refresh);
    localStorage.setItem('csrf_token', tokens.csrf || '');
    localStorage.setItem('user_authenticated', 'true');
    const authObject = {
      access: tokens.access,
      refresh: tokens.refresh,
      csrf: tokens.csrf || '',
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      user: { authenticated: true }
    };
    localStorage.setItem('auth', JSON.stringify(authObject));
  }, page.authTokens);
}

export const apiHelpers = {
  buildFilterString: (filters: any) => {
    const params = new URLSearchParams();
    if (filters.search) {
      Object.entries(filters.search).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(`search[${key}]`, String(value));
        }
      });
    }
    Object.entries(filters).forEach(([key, value]) => {
      if (key !== 'search' && value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    return params.toString();
  },

  getUsersFilters: () => ({
    search: { name: '', email: '', enabled: '', environment_uuid: '', acl_uuid: '', status_uuid: '' },
    page: 1, per_page: 10, order_by: 'created_at', order_kind: 'desc'
  }),

  getPaginationDefaults: () => ({
    itemsPerPage: 10, displayedPages: 100, sortField: 'created_at', sortDirection: 'desc'
  }),

  getApiEndpoints: (baseUrl: string) => ({
    users: {
      list: `${baseUrl}/api/users`, filter: `${baseUrl}/api/users`,
      one: `${baseUrl}/api/users/{id}`, new: `${baseUrl}/api/users`,
      update: `${baseUrl}/api/users/{id}`, delete: `${baseUrl}/api/users/{id}`,
      duplicate: `${baseUrl}/api/users`,
      schema: `${baseUrl}/api/schemas?action=default&type=user`
    },
    assets: {
      environments: `${baseUrl}/api/applications`, acls: `${baseUrl}/api/acls`,
      statuses: `${baseUrl}/api/statuses`, bridgeTypes: `${baseUrl}/api/assets/bridge_types`
    }
  }),

  getUserFieldValidation: () => ({
    required: ['name', 'email', 'environment_uuid'],
    optional: ['acl_uuid', 'status_uuid', 'enabled'],
    display: ['created_at', 'updated_at', 'name', 'email', 'environment.name', 'acl.name', 'status.name'],
    actions: ['edit', 'copy', 'logs', 'delete']
  }),

  getFilterValidation: () => ({
    textSearch: ['name', 'email'], dateRanges: ['created_at', 'updated_at'],
    dropdowns: ['enabled', 'environment_uuid', 'acl_uuid', 'status_uuid'],
    pagination: ['page', 'per_page', 'order_by', 'order_kind']
  })
};
