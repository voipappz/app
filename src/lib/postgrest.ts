// PostgREST client — reads calls/events from the Postgres event store
// (api.calls / api.events). Auth is the account login JWT (role `api_readonly`),
// obtained once at login and stored in localStorage (see lib/auth.ts) — no more
// per-request token minting, no Supabase.
import { getToken, logout } from './auth';
import { AUTH_EVENTS } from '../context/AuthContext';

// Base path for the PostgREST API. Default '/rest/v1' rides the Vite dev proxy /
// Kong same-origin route, so the browser stays same-origin (no CORS, no host).
const REST = ((import.meta.env.VITE_REST_URL ?? '/rest/v1') as string).replace(/\/$/, '');

/** GET a PostgREST resource (path + query, e.g. `/calls?order=started_at.desc`). */
export async function pgGet<T = unknown>(pathAndQuery: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${REST}${pathAndQuery}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    // Token missing/expired/rejected → drop the session and signal a re-login.
    logout();
    window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED, { detail: { reason: '401' } }));
    throw new Error(`${pathAndQuery} → 401`);
  }
  if (!res.ok) throw new Error(`${pathAndQuery} → ${res.status}`);
  return res.json();
}

/** Raw event timeline for one call (all legs + any transcription.* events). */
export function callEvents(callId: string) {
  return pgGet<Array<Record<string, unknown>>>(
    `/events?data->>va_call_uuid=eq.${encodeURIComponent(callId)}&order=created_at`,
  );
}
