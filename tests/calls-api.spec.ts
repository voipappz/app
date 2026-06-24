import { test, expect } from '@playwright/test';

/**
 * Playwright API test — fetches calls from the Postgres event store via
 * PostgREST (api.calls / api.events), the read path the Calls/Reports screens
 * use. Proves the data layer end-to-end without the UI/auth gate.
 *
 * Auth: PostgREST gates every read behind an accounts JWT. The test logs in via
 * /rpc/login with events-account creds from env and reuses the token. Provide:
 *   POSTGREST_URL       PostgREST base (default loopback http://127.0.0.1:3001;
 *                       in CI/prod the Kong route https://<domain>/rest/v1)
 *   POSTGREST_EMAIL / POSTGREST_PASSWORD   an accounts login
 * The describe block skips if no creds are set.
 */
const BASE = (process.env.POSTGREST_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const EMAIL = process.env.POSTGREST_EMAIL || process.env.EVENTS_EMAIL || '';
const PASSWORD = process.env.POSTGREST_PASSWORD || process.env.EVENTS_PASSWORD || '';
const url = (p: string) => `${BASE}${p}`;

const CALL_FIELDS = [
  'id', 'from_number', 'to_number', 'direction', 'status',
  'started_at', 'duration_seconds', 'leg_count', 'event_count',
];
const STATUSES = ['completed', 'in_progress', 'ringing', 'queued', 'no_answer', 'busy', 'failed'];

test.describe('Calls API (PostgREST over the Postgres event store)', () => {
  test.skip(!EMAIL || !PASSWORD, 'set POSTGREST_EMAIL / POSTGREST_PASSWORD to run');

  let token = '';
  let auth: Record<string, string> = {};

  test.beforeAll(async ({ request }) => {
    const res = await request.post(url('/rpc/login'), { data: { email: EMAIL, password: PASSWORD } });
    expect(res.ok(), 'login should succeed').toBeTruthy();
    token = (await res.json()).token;
    expect(token, 'login returns a token').toBeTruthy();
    auth = { Authorization: `Bearer ${token}` };
  });

  test('GET /calls without a token is rejected (401)', async ({ request }) => {
    const res = await request.get(url('/calls?limit=1'));
    expect(res.status()).toBe(401);
  });

  test('GET /calls returns an array of calls with the expected shape', async ({ request }) => {
    const res = await request.get(url('/calls?order=started_at.desc&limit=50'), { headers: auth });
    expect(res.ok()).toBeTruthy();
    const calls = await res.json();
    expect(Array.isArray(calls)).toBeTruthy();
    if (calls.length > 0) {
      for (const f of CALL_FIELDS) expect(calls[0]).toHaveProperty(f);
      expect(STATUSES).toContain(calls[0].status);
    }
  });

  test('a call has a consistent /events timeline (EventCdr legs)', async ({ request }) => {
    const calls = await (await request.get(url('/calls?limit=50'), { headers: auth })).json();
    test.skip(calls.length === 0, 'no calls in the store yet');

    const id = calls[0].id;
    const events = await (await request.get(
      url(`/events?data->>va_call_uuid=eq.${encodeURIComponent(id)}&order=created_at`),
      { headers: auth },
    )).json();
    expect(Array.isArray(events)).toBeTruthy();
    // The call's leg_count is the number of EventCdr legs; the full timeline has
    // at least that many events (it may also carry transcription.* etc).
    const cdrLegs = events.filter((e: { event_type: string }) => e.event_type === 'EventCdr');
    expect(cdrLegs.length).toBe(calls[0].leg_count);
    for (const e of events) expect(e).toHaveProperty('event_type');
  });

  test('filter by status returns only that status', async ({ request }) => {
    const res = await request.get(url('/calls?status=eq.completed&limit=20'), { headers: auth });
    expect(res.ok()).toBeTruthy();
    const calls = await res.json();
    for (const c of calls) expect(c.status).toBe('completed');
  });

  test('unknown call id returns an empty array', async ({ request }) => {
    const res = await request.get(url('/calls?id=eq.this-id-does-not-exist'), { headers: auth });
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual([]);
  });
});
