// Auth session — users-table login via deno (POST /login → PostgREST api.login).
//
// The signed JWT (role `api_readonly` + user/environment claims) is the single
// credential: stored in localStorage and sent as the bearer on every request to
// deno / PostgREST. This replaces Supabase Auth — one user login, one token, one
// source of truth. A user belongs to one environment (users.environment_uuid),
// and that `environment_uuid` claim scopes the calls list to that environment.

// Where the browser posts credentials. Default '/auth/login' rides the Vite dev
// proxy / same-origin route to deno (the brain), which forwards to PostgREST
// /rpc/login. NB: NOT '/login' — that's the SPA's own page route.
const AUTH_URL = (import.meta.env.VITE_AUTH_URL ?? '/auth/login') as string;
const STORAGE_KEY = 'auth';

export interface AuthSession {
  access: string;             // the bearer token (HS256 JWT, or opaque mothership token)
  email: string;
  user_uuid: string;
  environment_uuid?: string;  // the user's environment (scopes the calls list)
  expires_at?: number;        // epoch seconds (JWT `exp`); absent → no client-side expiry
  name?: string;              // display name (mothership user.fullname)
  refresh?: string;           // mothership refresh token (for future token refresh)
  user?: any;                 // full mothership user object (environment/extension/profile/acl)
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

/** Persist a session (built by a login client, e.g. lib/clients/mothership). */
export function saveSession(session: AuthSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
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
    user_uuid: data.user_uuid ?? claims.user_uuid,
    environment_uuid: data.environment_uuid ?? claims.environment_uuid,
    expires_at: claims.exp,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function logout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Build the app/ACL user from a session. Prefers the mothership `user` object
// (carried on the session) and falls back to JWT claims for the legacy accounts
// login. Users carry no app role yet, so default to the wildcard `admin`
// template until per-user app-roles exist.
export function sessionUser(s: AuthSession | null) {
  if (!s) return null;
  const claims = decodeJwt(s.access);
  const u = s.user || {};
  return {
    id: s.user_uuid || u.uuid || u.id,
    email: s.email || u.email,
    name: s.name || u.fullname || u.name,
    user_uuid: s.user_uuid || u.uuid,
    environment_uuid: s.environment_uuid || u.environment?.uuid,
    role: u.app_role || claims.app_role || 'admin',
    raw: u,
  };
}
