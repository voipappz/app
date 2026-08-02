// voipappz-api client — the app's data plane. Every request carries the
// /auth/user_login token as a standard `Authorization: Bearer <jwt>` against
// VITE_MOTHERSHIP_URL. This REPLACES PostgREST — the app talks only to
// voipappz-api. Verified live on MTN:
//   GET /api/calls?page&per_page&order_by&order_type → 200, array + X-Total header.
//
// On the scheme: the token IS a JWT ({user_uuid, exp}), so Bearer is the correct
// scheme — Basic is for base64(user:pass). voipappz-app sends `Basic <token>` +
// `X-VA-Auth: user`; verified live that the API accepts Bearer alone and that
// X-VA-Auth is not required, so we send neither.
import { getToken, logout } from '../auth';
import { AUTH_EVENTS } from '../../context/AuthContext';

// Default is RELATIVE (same origin): requests ride the Vite proxy in dev and
// the deno-api mothership forwarder in prod, so no backend host is baked into
// the bundle. Set VITE_MOTHERSHIP_URL only to bypass the app server and talk
// to a mothership directly (requires CORS on that host).
const BASE = ((import.meta.env.VITE_MOTHERSHIP_URL || '') as string).replace(/\/$/, '');

export interface ApiListResult<T> {
  rows: T[];
  total: number;   // from the X-Total header (falls back to rows.length)
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GET a list resource, returning rows + total (X-Total). Throws on non-2xx. */
export async function apiList<T = Record<string, unknown>>(pathAndQuery: string): Promise<ApiListResult<T>> {
  const res = await fetch(`${BASE}${pathAndQuery}`, { headers: authHeaders() });
  if (res.status === 401) {
    // A real expired/rejected token → drop the session and signal re-login.
    logout();
    window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED, { detail: { reason: '401' } }));
    throw new Error(`${pathAndQuery} → 401`);
  }
  if (!res.ok) throw new Error(`${pathAndQuery} → ${res.status}`);
  const rows = (await res.json()) as T[];
  const total = Number(res.headers.get('x-total')) || (Array.isArray(rows) ? rows.length : 0);
  return { rows: Array.isArray(rows) ? rows : [], total };
}

/**
 * Per-call event timeline. voipappz-api has no equivalent to PostgREST's raw
 * event feed yet (GET /api/calls/:uuid → 500), so this returns [] for now — the
 * detail drawer degrades to "no timeline" rather than pulling in PostgREST.
 * Keep this compatibility function until voipappz-api exposes a timeline.
 */
export async function callEvents() {
  return [];
}

/** GET a single resource (object). Throws on non-2xx. */
export async function apiGet<T = unknown>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${BASE}${pathAndQuery}`, { headers: authHeaders() });
  if (res.status === 401) {
    logout();
    window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED, { detail: { reason: '401' } }));
    throw new Error(`${pathAndQuery} → 401`);
  }
  if (!res.ok) throw new Error(`${pathAndQuery} → ${res.status}`);
  return res.json();
}

