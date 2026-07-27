// PostgREST client — the OPTIONAL second data plane (the default one is the
// mothership via lib/clients/api.ts). Same-origin like everything else: BASE
// defaults to the relative /rest/v1, which rides the Vite proxy (dev) or the
// deno-api forwarder (prod, 503 when POSTGREST_URL is unset server-side).
// Auth is the same login JWT: PostgREST verifies it against its own shared
// secret (VA_PGRST_JWT_SECRET), so RLS can scope rows by the token's claims.
import { getToken, logout } from '../auth';
import { AUTH_EVENTS } from '../../context/AuthContext';

const BASE = ((import.meta.env.VITE_POSTGREST_URL || '/rest/v1') as string).replace(/\/$/, '');

export interface PgrstListResult<T> {
  rows: T[];
  total: number;   // exact count from Content-Range (rows.length fallback)
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handle401(pathAndQuery: string): never {
  logout();
  window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED, { detail: { reason: '401' } }));
  throw new Error(`${pathAndQuery} → 401`);
}

// Content-Range: "0-19/123" (or "*/0" for an empty set) → 123
function totalFromContentRange(header: string | null, fallback: number): number {
  const totalPart = header?.split('/')[1];
  const n = Number(totalPart);
  return totalPart !== undefined && totalPart !== '*' && Number.isFinite(n) ? n : fallback;
}

/**
 * GET a PostgREST list, e.g. pgrstList('/calls?select=*&limit=20&offset=0').
 * Requests an exact count and returns { rows, total }. Throws on non-2xx.
 */
export async function pgrstList<T = Record<string, unknown>>(pathAndQuery: string): Promise<PgrstListResult<T>> {
  const res = await fetch(`${BASE}${pathAndQuery}`, {
    headers: { ...authHeaders(), Prefer: 'count=exact' },
  });
  if (res.status === 401) handle401(pathAndQuery);
  if (!res.ok) throw new Error(`${pathAndQuery} → ${res.status}`);
  const rows = (await res.json()) as T[];
  const safeRows = Array.isArray(rows) ? rows : [];
  return { rows: safeRows, total: totalFromContentRange(res.headers.get('content-range'), safeRows.length) };
}

/** GET a single PostgREST object (vnd.pgrst.object). Throws on non-2xx. */
export async function pgrstGet<T = Record<string, unknown>>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${BASE}${pathAndQuery}`, {
    headers: { ...authHeaders(), Accept: 'application/vnd.pgrst.object+json' },
  });
  if (res.status === 401) handle401(pathAndQuery);
  if (!res.ok) throw new Error(`${pathAndQuery} → ${res.status}`);
  return (await res.json()) as T;
}
