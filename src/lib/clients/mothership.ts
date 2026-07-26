// Mothership auth client — OTP login against the VoIPAppz cloud API.
//
// Live-verified flow (see spec/endpoints/e2e_cloud_spec.rb in voipappz-api):
//   step 1  POST /auth/login        → { otp_sent, temp_token }   (or a session)
//   step 2  POST /auth/otp/verify   → { access, refresh, csrf, device_token }
// The account/user identity lives INSIDE the `access` JWT (uuid, email, name,
// acl.data, customer) — the response body carries no user object — so we decode
// it to build the app's Bearer session (lib/auth). This is a login-only swap:
// downstream reads keep using that same session, untouched.
//
// Params ride the query string (Sinatra: query + form). The trusted-device
// token is cached so future logins on this browser can skip OTP (30-day TTL).
import { AuthSession, saveSession } from '../auth';

// All endpoint knobs are env-driven so tenant forks / surfaces repoint without a
// code change. BASE defaults to RELATIVE (same origin): login rides the Vite
// proxy in dev and the deno-api mothership forwarder in prod, so no backend
// host is baked into the bundle. Set VITE_MOTHERSHIP_URL only to go direct.
const BASE = (((import.meta.env.VITE_MOTHERSHIP_URL as string) || '')).replace(/\/$/, '');
// USER surface (this app is user-facing, like voipappz-app). Verified live on
// MTN: /auth/user_login → { user, token } where user carries profile.language,
// acl.data, extension{username,password}, environment{domain,wss_server}.
// NB: /auth/login is the ACCOUNT surface (admin) — it 401s for real users.
const LOGIN_PATH = ((import.meta.env.VITE_MOTHERSHIP_LOGIN_PATH as string) || '/auth/user_login');
const OTP_PATH = ((import.meta.env.VITE_MOTHERSHIP_OTP_PATH as string) || '/auth/user/otp/verify');
const DEVICE_TOKEN_KEY = 'va_user_device_token';

// Offline USER OTP mock — models the voipappz-api USER surface (/auth/user_login
// → /auth/user/otp/verify), NOT the account `ci@voipappz.com` (that's the account
// surface). It mirrors the server's non-prod user-OTP test knob VA_TEST_OTP:
// CircleCI sets VA_TEST_OTP="123456" (config.yml) and user/verify_otp.rb accepts
// it as the code, so here ANY email goes through the 2-step OTP flow and the
// VA_TEST_OTP code verifies — exactly the user flow, offline.
//
// Enabled ONLY when VITE_MOCK_LOGIN=1 (dev/CI/Playwright); off in production so
// no client-side bypass ever ships. Read at call time so tests can toggle it.
const mockLoginEnabled = () => import.meta.env.VITE_MOCK_LOGIN === '1';
// The accepted code, matching the server's VA_TEST_OTP (overridable for parity).
const MOCK_OTP_CODE = (import.meta.env.VITE_MOCK_OTP_CODE ?? '123456') as string;

// Build a user-shaped session for the mocked user. Carries extension+environment
// so the post-login WebRTC registration path (sipSettingsFromUser) is exercised.
function mockUser(email: string) {
  return {
    uuid: 'mock-user-0000-0000-0000-000000000000',
    email,
    name: email.split('@')[0],
    profile: { language: 'en' },
    acl: { data: { calls: { main: 'read' }, dashboard: { main: 'read' }, report: { main: 'read' } } },
    extension: { username: '200', password: 'mock-sip-secret', caller_id_number: '200' },
    environment: { uuid: 'mock-env', domain: 'mock.voipappz.io', wss_server: 'switch.voipappz.io:8443' },
  };
}

export function getDeviceToken(): string {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY) || ''; } catch { return ''; }
}

function decodeJwt(token: string): Record<string, any> {
  try {
    const p = (token || '').split('.')[1] || '';
    const b64 = p.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    return JSON.parse(atob(pad));
  } catch {
    return {};
  }
}

async function post(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    method: 'POST',
    headers: { 'X-VA-Auth': 'user' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
  }
  return data;
}

// Fold a login/verify response into the app's AuthSession and persist it. The
// identity comes from the `access` JWT (uuid/email/name/acl/customer); a `user`
// object is used when present (mock / other surfaces).
function toSession(data: any, email: string): AuthSession {
  const token = data.token || data.access;
  const claims = decodeJwt(token);
  const user = data.user || {
    uuid: claims.uuid,
    email: claims.email,
    name: claims.name,
    acl: claims.acl,
    customer: claims.customer,
    environment: claims.environment,
  };
  if (data.device_token) {
    try { localStorage.setItem(DEVICE_TOKEN_KEY, data.device_token); } catch { /* ignore */ }
  }
  const session: AuthSession = {
    access: token,
    email: user.email || claims.email || email,
    name: user.name || claims.name,
    user_uuid: user.uuid || claims.uuid,
    environment_uuid: user.environment?.uuid || claims.environment?.uuid,
    expires_at: claims.exp,
    refresh: data.refresh,
    user,
  };
  saveSession(session);
  return session;
}

export interface LoginStep {
  status: 'otp' | 'ok';
  tempToken?: string;      // present when status === 'otp'
  session?: AuthSession;   // present when status === 'ok' (trusted device)
}

/**
 * Step 1 — submit credentials. Returns `{status:'otp', tempToken}` when the
 * server sends a code, or `{status:'ok', session}` for a trusted device.
 */
export async function userLogin(email: string, password: string): Promise<LoginStep> {
  // Offline USER OTP mock: any email goes through the 2-step flow (like the server
  // with VA_TEST_OTP). The code is checked in step 2 (verifyOtp).
  if (mockLoginEnabled() && email.trim()) {
    return { status: 'otp', tempToken: `mock:${email.trim().toLowerCase()}` };
  }
  const data = await post(LOGIN_PATH, {
    email,
    password,
    device_token: getDeviceToken(),
    otp: 'true',
  });
  if (data.token || data.access) return { status: 'ok', session: toSession(data, email) };
  if (data.temp_token) return { status: 'otp', tempToken: data.temp_token };
  throw new Error(data?.message || 'Unexpected login response');
}

/**
 * Step 2 — verify the 6-digit OTP and establish the session.
 */
export async function verifyOtp(
  tempToken: string,
  code: string,
  email: string,
  password: string,
): Promise<AuthSession> {
  // Offline USER OTP mock: accept the VA_TEST_OTP code, mint a user session.
  if (tempToken.startsWith('mock:')) {
    if (code !== MOCK_OTP_CODE) throw new Error('Invalid or expired code');
    const user = mockUser(tempToken.slice('mock:'.length));
    const session: AuthSession = {
      access: 'mock-access-token',
      email: user.email,
      name: user.name,
      user_uuid: user.uuid,
      environment_uuid: user.environment?.uuid,
      user,
    };
    saveSession(session);
    return session;
  }
  const data = await post(OTP_PATH, {
    temp_token: tempToken,
    code,
    email,
    password,
  });
  if (!(data.token || data.access)) throw new Error(data?.message || 'OTP verification failed');
  return toSession(data, email);
}
