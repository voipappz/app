import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { userLogin, verifyOtp, getDeviceToken } from './mothership';
import { getSession, getToken, logout } from '../auth';

// Drive the mothership client with a mocked fetch (no network). Asserts the
// two-step OTP flow, the trusted-device fast path, device-token persistence,
// and that success writes the app's Bearer session (lib/auth).
function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('mothership auth client', () => {
  beforeEach(() => {
    localStorage.clear();
    logout();
  });
  afterEach(() => vi.restoreAllMocks());

  it('step 1 returns otp when the server dispatches a code', async () => {
    global.fetch = mockFetch(200, { otp_sent: true, temp_token: 'tmp-123' });
    const step = await userLogin('user@x.com', 'pw');
    expect(step.status).toBe('otp');
    expect(step.tempToken).toBe('tmp-123');
    // No session persisted yet.
    expect(getSession()).toBeNull();
    // Credentials + device_token ride the query string.
    const url = (global.fetch as any).mock.calls[0][0] as string;
    // USER surface (this app is user-facing) — /auth/login is the admin surface.
    expect(url).toContain('/auth/user_login?');
    expect(url).toContain('email=user%40x.com');
    expect(url).toContain('otp=true');
  });

  it('step 1 logs in directly for a trusted device (token in response)', async () => {
    global.fetch = mockFetch(200, {
      token: 'opaque-token',
      device_token: 'dev-abc',
      user: { uuid: 'u-1', email: 'user@x.com', fullname: 'Test User', environment: { uuid: 'env-9' } },
    });
    const step = await userLogin('user@x.com', 'pw');
    expect(step.status).toBe('ok');
    const s = getSession();
    expect(s?.access).toBe('opaque-token');
    expect(s?.user_uuid).toBe('u-1');
    expect(s?.environment_uuid).toBe('env-9');
    expect(getToken()).toBe('opaque-token');
    expect(getDeviceToken()).toBe('dev-abc');
  });

  it('step 2 verifies the OTP and establishes the session', async () => {
    global.fetch = mockFetch(200, {
      token: 'verified-token',
      device_token: 'dev-xyz',
      user: { uuid: 'u-2', email: 'user@x.com' },
    });
    const session = await verifyOtp('tmp-123', '123456', 'user@x.com', 'pw');
    expect(session.access).toBe('verified-token');
    expect(getToken()).toBe('verified-token');
    expect(getDeviceToken()).toBe('dev-xyz');
    const url = (global.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/auth/user/otp/verify?');
    expect(url).toContain('temp_token=tmp-123');
    expect(url).toContain('code=123456');
  });

  it('builds the session from the access JWT when the body has no user object', async () => {
    // Live shape: /auth/otp/verify returns { access, refresh } and identity is
    // inside the JWT (uuid/email/name). Minimal HS256-shaped token, payload only.
    const payload = { uuid: 'acct-9', email: 'ci@voipappz.com', name: 'CI', exp: 4102444800 };
    const b64 = btoa(JSON.stringify(payload)).replace(/=+$/, '');
    global.fetch = mockFetch(200, { access: `h.${b64}.s`, refresh: 'r-tok', device_token: 'd-1' });
    const session = await verifyOtp('tmp', '123456', 'ci@voipappz.com', 'pw');
    expect(session.user_uuid).toBe('acct-9');
    expect(session.email).toBe('ci@voipappz.com');
    expect(session.name).toBe('CI');
    expect(session.refresh).toBe('r-tok');
    expect(getToken()).toBe(`h.${b64}.s`);
  });

  // Locks in the REAL /auth/user_login shape verified live against MTN:
  // { user: {..., profile.language, acl.data, extension{username,password},
  //   environment{domain,wss_server}}, token } — no OTP for this user.
  it('handles the live user_login shape: {user, token} with extension + environment', async () => {
    global.fetch = mockFetch(200, {
      token: 'mtn-token',
      user: {
        uuid: 'u-mtn', email: 'nir@voipappz.com', name: 'Nir',
        profile: { language: 'en' },
        acl: { data: {} },
        extension: { username: '200', password: 'ext-secret', caller_id_number: '200' },
        environment: { uuid: 'env-mtn', domain: 'mtn.example', wss_server: 'switch.example:8443' },
      },
    });
    const step = await userLogin('nir@voipappz.com', 'pw');
    expect(step.status).toBe('ok');
    const s = step.session!;
    expect(s.access).toBe('mtn-token');
    expect(s.user_uuid).toBe('u-mtn');
    expect(s.environment_uuid).toBe('env-mtn');
    // The user object is carried so WebRTC can register from it (sipSettingsFromUser).
    expect(s.user.extension.username).toBe('200');
    expect(s.user.environment.wss_server).toBe('switch.example:8443');
    expect(getToken()).toBe('mtn-token');
  });

  it('surfaces the server error message on failure', async () => {
    global.fetch = mockFetch(401, { message: 'Invalid credentials' });
    await expect(userLogin('user@x.com', 'bad')).rejects.toThrow('Invalid credentials');
  });

  it('rejects an unexpected 200 with neither token nor temp_token', async () => {
    global.fetch = mockFetch(200, { hello: 'world' });
    await expect(userLogin('user@x.com', 'pw')).rejects.toThrow();
  });
});

// Offline USER OTP mock (VITE_MOCK_LOGIN=1) — models the /auth/user_login →
// /auth/user/otp/verify flow with the server's VA_TEST_OTP code (123456). ANY
// email goes through the 2-step flow; it must NOT touch the network (fetch is
// stubbed to throw to prove that).
describe('mothership USER OTP mock (VITE_MOCK_LOGIN=1)', () => {
  beforeEach(() => {
    localStorage.clear();
    logout();
    vi.stubEnv('VITE_MOCK_LOGIN', '1');
    global.fetch = vi.fn(() => { throw new Error('network called — mock should be offline'); }) as any;
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('any user goes through OTP and verifies with 123456, no network', async () => {
    const step = await userLogin('agent@laurusafrica.com', 'anything');
    expect(step.status).toBe('otp');
    expect(step.tempToken).toBe('mock:agent@laurusafrica.com');
    expect(global.fetch).not.toHaveBeenCalled();

    const session = await verifyOtp(step.tempToken!, '123456', 'agent@laurusafrica.com', 'anything');
    expect(getToken()).toBe('mock-access-token');
    expect(session.email).toBe('agent@laurusafrica.com');
    // Session is USER-shaped — extension + environment drive the WebRTC path.
    expect(session.user?.extension?.username).toBe('200');
    expect(session.user?.environment?.wss_server).toBe('switch.voipappz.io:8443');
    expect(session.user?.profile?.language).toBe('en');
  });

  it('rejects a wrong OTP code', async () => {
    const step = await userLogin('agent@laurusafrica.com', 'pw');
    await expect(verifyOtp(step.tempToken!, '000000', 'agent@laurusafrica.com', 'pw')).rejects.toThrow();
  });

  it('is inert when the flag is off (falls through to the network)', async () => {
    vi.stubEnv('VITE_MOCK_LOGIN', '');
    await expect(userLogin('someone@else.com', 'pw')).rejects.toThrow('network called');
  });
});
