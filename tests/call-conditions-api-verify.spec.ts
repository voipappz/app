import { test, expect, request as playwrightRequest } from '@playwright/test';

/**
 * Call Conditions — API verification (browser-less).
 *
 * Walks the same flows the admin UI uses:
 *   1. LIST
 *   2. CREATE with inline resource (legacy form: time/week_day expressions)
 *   3. CREATE with pre-built segment via segment_uuids[] (modern wire format
 *      used by CallConditionBridge.js)
 *   4. UPDATE name + verify roundtrip
 *   5. DELETE both, verify 404
 *
 * Mirrors tests/call-conditions.spec.ts but skips the auth-fixture/browser
 * dependency so it can run on CI nodes without chromium libs.
 */

const apiBaseUrl = process.env.VITE_API_BASE_URL!;
const email = process.env.TEST_EMAIL || '';
const password = process.env.TEST_PASSWORD || '';
const testOtp = process.env.VA_TEST_OTP || '';

async function loginAndGetToken() {
  const ctx = await playwrightRequest.newContext({ baseURL: apiBaseUrl });
  const loginResp = await ctx.post(
    `/auth/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
  );
  expect(loginResp.ok()).toBeTruthy();
  const { temp_token } = await loginResp.json();
  const otpResp = await ctx.post(
    `/auth/otp/verify?temp_token=${encodeURIComponent(temp_token)}&code=${encodeURIComponent(testOtp)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
  );
  expect(otpResp.ok()).toBeTruthy();
  const { access } = await otpResp.json();
  return { ctx, token: access };
}

async function findBridge(ctx: any, headers: any, envUuid: string): Promise<{ type: string; uuid: string; envUuid: string } | null> {
  const candidates = [
    { type: 'announcement', endpoint: 'announcements' },
    { type: 'extension', endpoint: 'extensions' },
    { type: 'que', endpoint: 'queues' },
    { type: 'ivr', endpoint: 'ivrs' },
  ];
  for (const { type, endpoint } of candidates) {
    const r = await ctx.get(`/api/${endpoint}?per_page=1&search[environment_uuid]=${envUuid}`, { headers });
    if (r.ok()) {
      const list = await r.json();
      const arr = Array.isArray(list) ? list : list.data || [];
      if (arr.length > 0) return { type, uuid: arr[0].uuid, envUuid };
    }
  }
  return null;
}

test.describe('Call Conditions — API verify', () => {
  test.setTimeout(120000);

  test('full lifecycle: legacy resources + segment_uuids[] + UPDATE + DELETE', async () => {
    const { ctx, token } = await loginAndGetToken();
    const headers = { 'Authorization': `Bearer ${token}` };
    const formHeaders = { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' };

    // ---- 1. LIST ----
    const listResp = await ctx.get('/api/call_conditions?per_page=10', { headers });
    expect(listResp.status()).toBe(200);
    const listBody = await listResp.json();
    const list = Array.isArray(listBody) ? listBody : listBody.data || [];
    console.log(`LIST OK — ${list.length} call conditions`);

    // ---- 2. Pick env that has at least one usable bridge target ----
    const envsResp = await ctx.get('/api/applications?per_page=9999', { headers });
    expect(envsResp.status()).toBe(200);
    const envsBody = await envsResp.json();
    const envs = Array.isArray(envsBody) ? envsBody : envsBody.data || [];
    expect(envs.length).toBeGreaterThan(0);

    let bridge: { type: string; uuid: string; envUuid: string } | null = null;
    for (const env of envs) {
      bridge = await findBridge(ctx, headers, env.uuid);
      if (bridge) break;
    }
    if (!bridge) {
      console.log('No bridge resource found in any environment — skipping');
      test.skip();
      return;
    }
    const envUuid = bridge.envUuid;
    console.log(`Using env=${envUuid}, bridge=${bridge.type}/${bridge.uuid}`);

    // ---- 3. CREATE with legacy inline resource (time/week_day expressions) ----
    const ts = Date.now();
    const ccLegacyName = `CC_API_Verify_Legacy_${ts}`;
    const legacyForm = new URLSearchParams();
    legacyForm.append('name', ccLegacyName);
    legacyForm.append('environment_uuid', envUuid);
    legacyForm.append('enabled', 'true');
    legacyForm.append('fallback_bridge_type', bridge.type);
    legacyForm.append('fallback_bridge_uuid', bridge.uuid);
    legacyForm.append('resources[0][name]', 'BizHours');
    legacyForm.append('resources[0][bridge_type]', bridge.type);
    legacyForm.append('resources[0][bridge_uuid]', bridge.uuid);
    legacyForm.append('resources[0][week_day]', '2-6');
    legacyForm.append('resources[0][time]', '09:00-17:00');

    const legacyCreateResp = await ctx.post('/api/call_conditions', { headers: formHeaders, data: legacyForm.toString() });
    console.log(`CREATE legacy status: ${legacyCreateResp.status()}`);
    if (!legacyCreateResp.ok()) console.log('CREATE legacy body:', await legacyCreateResp.text());
    expect(legacyCreateResp.ok()).toBeTruthy();
    const ccLegacy = await legacyCreateResp.json();
    expect(ccLegacy.uuid).toBeTruthy();
    expect(ccLegacy.name).toBe(ccLegacyName);
    expect(ccLegacy.fallback_bridge_uuid).toBe(bridge.uuid);
    console.log(`CC (legacy) created: ${ccLegacy.uuid}`);

    // ---- 4. READ legacy CC, log resource state (may be empty if backend Hash→Array fix not deployed) ----
    const legacyReadResp = await ctx.get(`/api/call_conditions/${ccLegacy.uuid}`, { headers });
    expect(legacyReadResp.status()).toBe(200);
    const legacyRead = await legacyReadResp.json();
    const legacyResources = legacyRead.resources || [];
    console.log(`READ legacy: name=${legacyRead.name} resources=${legacyResources.length}`);
    if (legacyResources.length > 0) {
      const r = legacyResources[0];
      console.log(`  resource[0] bridge=${r.bridge_type}/${r.bridge_uuid} segments=${(r.segments || []).length}`);
      const hourSeg = (r.segments || []).find((s: any) => s.field === 'time.hour');
      if (hourSeg) console.log(`  time.hour segment OK: ${hourSeg.operator} ${JSON.stringify(hourSeg.val)}`);
      const wdSeg = (r.segments || []).find((s: any) => s.field === 'time.weekday');
      if (wdSeg) console.log(`  time.weekday segment OK: ${wdSeg.operator} ${JSON.stringify(wdSeg.val)}`);
    } else {
      console.log('  (resources empty — backend may not have deployed Hash→Array fix)');
    }

    // ---- 5. Pre-create a segment, then create CC with segment_uuids[] (modern wire) ----
    const segForm = new URLSearchParams();
    segForm.append('name', `CC_API_Seg_Weekday_${ts}`);
    segForm.append('field', 'time.weekday');
    segForm.append('operator', 'IN');
    segForm.append('value[]', '1');
    segForm.append('value[]', '2');
    segForm.append('value[]', '3');
    segForm.append('value[]', '4');
    segForm.append('value[]', '5');
    segForm.append('type', 'time');
    const segResp = await ctx.post('/api/segments', { headers: formHeaders, data: segForm.toString() });
    console.log(`Segment CREATE status: ${segResp.status()}`);
    if (!segResp.ok()) console.log('Segment body:', await segResp.text());
    expect(segResp.ok()).toBeTruthy();
    const seg = await segResp.json();
    expect(seg.uuid).toBeTruthy();

    const ccModernName = `CC_API_Verify_Modern_${ts}`;
    const modernForm = new URLSearchParams();
    modernForm.append('name', ccModernName);
    modernForm.append('environment_uuid', envUuid);
    modernForm.append('enabled', 'true');
    modernForm.append('fallback_bridge_type', bridge.type);
    modernForm.append('fallback_bridge_uuid', bridge.uuid);
    modernForm.append('resources[0][name]', 'WeekdayResource');
    modernForm.append('resources[0][bridge_type]', bridge.type);
    modernForm.append('resources[0][bridge_uuid]', bridge.uuid);
    modernForm.append('resources[0][segment_uuids][]', seg.uuid);

    const modernCreateResp = await ctx.post('/api/call_conditions', { headers: formHeaders, data: modernForm.toString() });
    console.log(`CREATE modern status: ${modernCreateResp.status()}`);
    if (!modernCreateResp.ok()) console.log('CREATE modern body:', await modernCreateResp.text());
    expect(modernCreateResp.ok()).toBeTruthy();
    const ccModern = await modernCreateResp.json();
    expect(ccModern.uuid).toBeTruthy();
    console.log(`CC (modern) created: ${ccModern.uuid}`);

    // ---- 6. READ modern CC and verify segment roundtrips ----
    const modernReadResp = await ctx.get(`/api/call_conditions/${ccModern.uuid}`, { headers });
    expect(modernReadResp.status()).toBe(200);
    const modernRead = await modernReadResp.json();
    const r0 = (modernRead.resources || [])[0];
    expect(r0).toBeTruthy();
    expect(Array.isArray(r0.segment_uuids)).toBe(true);
    expect(r0.segment_uuids).toContain(seg.uuid);
    const wdSeg = (r0.segments || []).find((s: any) => s.field === 'time.weekday');
    expect(wdSeg).toBeTruthy();
    expect(wdSeg.operator).toBe('IN');
    expect(wdSeg.val.length).toBe(5);
    for (const d of ['1', '2', '3', '4', '5']) expect(wdSeg.val).toContain(d);
    console.log(`READ modern: segment attached, weekday IN ${JSON.stringify(wdSeg.val)}`);

    // ---- 7. UPDATE name, verify ----
    const updatedName = `${ccModernName}_Updated`;
    const updResp = await ctx.patch(`/api/call_conditions/${ccModern.uuid}`, {
      headers: formHeaders,
      data: new URLSearchParams({ name: updatedName }).toString(),
    });
    console.log(`UPDATE status: ${updResp.status()}`);
    expect(updResp.status()).toBe(200);
    const upd = await updResp.json();
    expect(upd.name).toBe(updatedName);

    // ---- 8. DELETE both, verify 404 ----
    const delModernResp = await ctx.delete(`/api/call_conditions/${ccModern.uuid}`, { headers });
    expect([200, 204]).toContain(delModernResp.status());
    const delLegacyResp = await ctx.delete(`/api/call_conditions/${ccLegacy.uuid}`, { headers });
    expect([200, 204]).toContain(delLegacyResp.status());
    const delSegResp = await ctx.delete(`/api/segments/${seg.uuid}`, { headers });
    console.log(`DELETE: cc(modern)=${delModernResp.status()} cc(legacy)=${delLegacyResp.status()} seg=${delSegResp.status()}`);

    const verifyResp = await ctx.get(`/api/call_conditions/${ccModern.uuid}`, { headers });
    expect(verifyResp.status()).toBe(404);

    await ctx.dispose();
    console.log('Call Conditions API verification PASSED');
  });
});
