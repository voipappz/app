import { test, expect, request as playwrightRequest } from '@playwright/test';

/**
 * MTN DID + IVR end-to-end test (API-only, no browser required).
 *
 * Flow:
 *   0. OTP login → JWT
 *   1. Find the MTN environment
 *   2. Use an existing announcement in that env (required for IVR)
 *   3. CREATE an IVR with one menu entry
 *   4. CREATE a DID whose bridge_type=ivr points at the new IVR
 *   5. READ both back to verify
 *   6. Cleanup: delete DID, then IVR
 */

const apiBaseUrl = process.env.VITE_API_BASE_URL!;
const email = process.env.TEST_EMAIL || '';
const password = process.env.TEST_PASSWORD || '';
const testOtp = process.env.VA_TEST_OTP || '';

async function loginAndGetToken(): Promise<{ ctx: any; token: string }> {
  if (!email || !password || !testOtp) {
    throw new Error('TEST_EMAIL, TEST_PASSWORD, and VA_TEST_OTP must be set');
  }
  const ctx = await playwrightRequest.newContext({ baseURL: apiBaseUrl });

  const loginResp = await ctx.post(
    `/auth/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
  );
  expect(loginResp.ok()).toBeTruthy();
  const { temp_token, otp_sent } = await loginResp.json();
  expect(otp_sent).toBeTruthy();
  expect(temp_token).toBeTruthy();

  const otpResp = await ctx.post(
    `/auth/otp/verify?temp_token=${encodeURIComponent(temp_token)}&code=${encodeURIComponent(testOtp)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
  );
  expect(otpResp.ok()).toBeTruthy();
  const { access } = await otpResp.json();
  expect(access).toBeTruthy();

  return { ctx, token: access };
}

test.describe('MTN: create DID + IVR', () => {
  test.setTimeout(process.env.CI ? 120000 : 60000);

  test('creates an IVR and a DID bridged to it in MTN env', async () => {
    const { ctx, token } = await loginAndGetToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const formHeaders = { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' };

    // ---------------------------------------------------------------------
    // 1. Pick an environment — prefer MTN if available, otherwise any env
    //    that has at least one announcement (IVR requires announcement_uuid).
    // ---------------------------------------------------------------------
    const envsResp = await ctx.get(`/api/applications?per_page=9999`, { headers });
    expect(envsResp.status()).toBe(200);
    const envsBody = await envsResp.json();
    const envs = Array.isArray(envsBody) ? envsBody : envsBody.data || [];
    expect(envs.length).toBeGreaterThan(0);

    const mtnEnv =
      envs.find((e: any) => /mtn/i.test(e.name || '')) ||
      envs.find((e: any) => /mtn/i.test(e.description || ''));

    let envUuid: string | null = null;
    let envName = '';
    let announcementUuid: string | null = null;
    let announcementName = '';

    const tryEnvs = mtnEnv ? [mtnEnv, ...envs.filter((e: any) => e.uuid !== mtnEnv.uuid)] : envs;
    for (const env of tryEnvs) {
      const annResp = await ctx.get(
        `/api/announcements?per_page=1&search[environment_uuid]=${env.uuid}`,
        { headers }
      );
      if (!annResp.ok()) continue;
      const annBody = await annResp.json();
      const anns = Array.isArray(annBody) ? annBody : annBody.data || [];
      if (anns.length > 0) {
        envUuid = env.uuid;
        envName = env.name;
        announcementUuid = anns[0].uuid;
        announcementName = anns[0].name;
        break;
      }
    }

    if (!envUuid || !announcementUuid) {
      console.log('No environment with at least one announcement found - cannot create IVR, skipping');
      test.skip();
      return;
    }

    if (mtnEnv && envUuid === mtnEnv.uuid) {
      console.log(`Using MTN environment: ${envName} (${envUuid})`);
    } else {
      console.log(`No MTN env (or no announcements there); using fallback env: ${envName} (${envUuid})`);
    }
    console.log(`Using announcement: ${announcementName} (${announcementUuid})`);

    // ---------------------------------------------------------------------
    // 3. CREATE IVR
    // ---------------------------------------------------------------------
    const ts = Date.now();
    const ivrName = `Test_MTN_IVR_${ts}`;

    const ivrCreate = new URLSearchParams();
    ivrCreate.append('name', ivrName);
    ivrCreate.append('environment_uuid', envUuid);
    ivrCreate.append('enabled', 'true');
    ivrCreate.append('timeout', '10');
    ivrCreate.append('invalid', '3');
    ivrCreate.append('announcement_uuid', announcementUuid);
    // Timeout / invalid fall back to the same announcement (a valid bridge type
    // that avoids needing a queue / number to exist).
    ivrCreate.append('timeout_bridge_type', 'announcement');
    ivrCreate.append('timeout_bridge_uuid', announcementUuid);
    ivrCreate.append('invalid_bridge_type', 'announcement');
    ivrCreate.append('invalid_bridge_uuid', announcementUuid);
    // One menu entry on key 1, also routing to the announcement
    ivrCreate.append('entries[1][name]', 'Menu 1');
    ivrCreate.append('entries[1][bridge_type]', 'announcement');
    ivrCreate.append('entries[1][bridge_uuid]', announcementUuid);

    const ivrCreateResp = await ctx.post(`/api/ivrs`, {
      headers: formHeaders,
      data: ivrCreate.toString()
    });

    console.log(`IVR CREATE status: ${ivrCreateResp.status()}`);
    if (!ivrCreateResp.ok()) {
      console.log('IVR CREATE body:', await ivrCreateResp.text());
    }
    expect(ivrCreateResp.ok()).toBeTruthy();

    const ivr = await ivrCreateResp.json();
    const ivrUuid = ivr.uuid;
    expect(ivrUuid).toBeTruthy();
    expect(ivr.name).toBe(ivrName);
    console.log(`Created IVR: ${ivrUuid}`);

    // ---------------------------------------------------------------------
    // 4. CREATE DID bridged to the new IVR
    // ---------------------------------------------------------------------
    const didNumber = `1555${ts.toString().slice(-7)}`;
    const didName = `Test_MTN_DID_${ts}`;

    const didCreate = new URLSearchParams();
    didCreate.append('name', didName);
    didCreate.append('number', didNumber);
    didCreate.append('environment_uuid', envUuid);
    didCreate.append('type', 'sip');
    didCreate.append('bridge_type', 'ivr');
    didCreate.append('bridge_uuid', ivrUuid);
    didCreate.append('enabled', 'true');

    const didCreateResp = await ctx.post(`/api/dids`, {
      headers: formHeaders,
      data: didCreate.toString()
    });

    console.log(`DID CREATE status: ${didCreateResp.status()}`);
    if (!didCreateResp.ok()) {
      console.log('DID CREATE body:', await didCreateResp.text());
    }
    expect(didCreateResp.ok()).toBeTruthy();

    const did = await didCreateResp.json();
    const didUuid = did.uuid;
    expect(didUuid).toBeTruthy();
    expect(did.bridge_uuid).toBe(ivrUuid);
    console.log(`Created DID: ${didUuid} (${didNumber}) -> IVR ${ivrUuid}`);

    // ---------------------------------------------------------------------
    // 5. READ both back to verify
    // ---------------------------------------------------------------------
    const didReadResp = await ctx.get(`/api/dids/${didUuid}`, { headers });
    expect(didReadResp.status()).toBe(200);
    const didRead = await didReadResp.json();
    expect(didRead.uuid).toBe(didUuid);
    expect(didRead.bridge_uuid).toBe(ivrUuid);
    console.log(`READ DID OK: bridge_type=${didRead.bridge_type}, bridge_uuid=${didRead.bridge_uuid}`);

    const ivrReadResp = await ctx.get(`/api/ivrs/${ivrUuid}`, { headers });
    expect(ivrReadResp.status()).toBe(200);
    const ivrRead = await ivrReadResp.json();
    expect(ivrRead.uuid).toBe(ivrUuid);
    expect(ivrRead.name).toBe(ivrName);
    console.log(`READ IVR OK: ${ivrRead.name}, entries=${Object.keys(ivrRead.entries || {}).length}`);

    // ---------------------------------------------------------------------
    // 6. Cleanup — DID first (it references the IVR), then IVR
    // ---------------------------------------------------------------------
    const didDelResp = await ctx.delete(`/api/dids/${didUuid}`, { headers });
    console.log(`DID DELETE status: ${didDelResp.status()}`);
    expect([200, 204]).toContain(didDelResp.status());

    const ivrDelResp = await ctx.delete(`/api/ivrs/${ivrUuid}`, { headers });
    console.log(`IVR DELETE status: ${ivrDelResp.status()}`);
    expect([200, 204]).toContain(ivrDelResp.status());

    await ctx.dispose();
    console.log('Cleanup complete');
  });
});
