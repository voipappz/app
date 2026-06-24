// Auth session — accounts-table login via deno (POST /login → PostgREST api.login).
//
// The signed JWT (role `api_readonly` + account/customer/environment claims) is
// the single credential: stored in localStorage and sent as the bearer on every
// request to deno / PostgREST. This replaces Supabase Auth — one account login,
// one token, one source of truth.

// Where the browser posts credentials. Default '/auth/login' rides the Vite dev
// proxy / same-origin route to deno (the brain), which forwards to PostgREST
// /rpc/login. NB: NOT '/login' — that's the SPA's own page route.
const AUTH_URL = (import.meta.env.VITE_AUTH_URL ?? '/auth/login') as string;
const STORAGE_KEY = 'auth';

export interface AuthSession {
  access: string;             // the HS256 JWT
  email: string;
  account_uuid: string;
  customer_uuid?: string;
  environment_uuids?: string[];
  expires_at?: number;        // epoch seconds (JWT `exp`)
}

function decodeJwt(token: string): Record<string, any> {
  try {
    const p = token.split('.')[1] || '';
    const b64 = p.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
    return JSON.parse(atob(pad));
  } catch {
    return {};
  }
}

/** The persisted session, or null if absent / expired. */
export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AuthSession;
    if (!s?.access) return null;
    if (s.expires_at && s.expires_at * 1000 < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return getSession()?.access ?? null;
}

/** Log in with account credentials. Persists + returns the session, or throws. */
export async function login(email: string, password: string): Promise<AuthSession> {
  const r = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    let msg = 'Invalid email or password';
    try { msg = (await r.json()).error || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  const data = await r.json();
  if (!data?.token) throw new Error('Login response missing token');
  const claims = decodeJwt(data.token);
  const session: AuthSession = {
    access: data.token,
    email: data.email ?? claims.email ?? email,
    account_uuid: data.account_uuid ?? claims.account_uuid,
    customer_uuid: data.customer_uuid ?? claims.customer_uuid,
    environment_uuids: data.environment_uuids ?? claims.environment_uuids,
    expires_at: claims.exp,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function logout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Build the app/ACL user from a session. Accounts carry no app role in the token
// (the JWT `role` claim is the Postgres role `api_readonly`), so default to the
// wildcard `admin` template until per-account app-roles exist.
export function sessionUser(s: AuthSession | null) {
  if (!s) return null;
  const claims = decodeJwt(s.access);
  return {
    id: s.account_uuid,
    email: s.email,
    account_uuid: s.account_uuid,
    customer_uuid: s.customer_uuid,
    environment_uuids: s.environment_uuids,
    role: claims.app_role || 'admin',
  };
}
