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

// Offline mock mode hands out a token no real endpoint accepts, so EVERY
// authenticated read 401s. Treating that as "your session ended" logged the
// user straight back out the moment any page fetched — the app looked broken
// and the offline suite raced its own assertions. In mock mode a 401 means
// "no data here", nothing more.
const mockSession = () => import.meta.env.VITE_MOCK_LOGIN === '1';

function dropSession(pathAndQuery: string, status: 401 | 403) {
  if (mockSession()) return;
  logout();
  window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED, { detail: { reason: String(status) } }));
  void pathAndQuery;
}

function rejectAuthentication(res: Response, pathAndQuery: string): void {
  // Nimbus returns 403 when a syntactically valid token belongs to a different
  // tenant/user context. Keeping that token traps the local portal in a broken
  // signed-in screen, so both authentication failures return to local login.
  if (res.status === 401 || res.status === 403) {
    dropSession(pathAndQuery, res.status);
    throw new Error(`${pathAndQuery} → ${res.status}`);
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GET a list resource, returning rows + total (X-Total). Throws on non-2xx. */
export async function apiList<T = Record<string, unknown>>(pathAndQuery: string): Promise<ApiListResult<T>> {
  const res = await fetch(`${BASE}${pathAndQuery}`, { headers: authHeaders() });
  rejectAuthentication(res, pathAndQuery);
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

/**
 * Write to a resource (PATCH/POST/PUT/DELETE), with the same credential and the
 * same 401 handling as the reads. Components and services must not hand-roll
 * fetch for writes: that is how `Authorization` drifts and how a 401 stops
 * dropping the session.
 *
 * voipappz-api takes these params on the QUERY STRING (Sinatra reads `params`
 * from query and form alike), so there is deliberately no JSON body here —
 * callers put everything in the path.
 */
export async function apiSend<T = unknown>(method: string, pathAndQuery: string): Promise<T> {
  const res = await fetch(`${BASE}${pathAndQuery}`, { method, headers: authHeaders() });
  rejectAuthentication(res, pathAndQuery);
  if (!res.ok) throw new Error(`${pathAndQuery} → ${res.status}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

/** GET a single resource (object). Throws on non-2xx. */
export async function apiGet<T = unknown>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${BASE}${pathAndQuery}`, { headers: authHeaders() });
  rejectAuthentication(res, pathAndQuery);
  if (!res.ok) throw new Error(`${pathAndQuery} → ${res.status}`);
  return res.json();
}
