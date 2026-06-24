// Authenticated API helper for deno API calls.
// Attaches the account login JWT (lib/auth.ts) as the bearer.
import { getToken } from './auth';

/**
 * Fetch wrapper that adds the account JWT to requests.
 * Use for any calls to /deno-api/* endpoints.
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...options, headers });
}
