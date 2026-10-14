// The phone's SIP credentials come from ONE short-lived JWT the API issues
// for a device: GET /api/devices/:uuid/phone -> { token, expires_in,
// expires_at }. The token is signed the way a login token is (HS256) and
// carries { sub, username, password, domain, wss_server, display_name, exp }.
//
// Nothing else in the app holds a SIP password: no build variable, no
// localStorage, no settings form. The device uuid is what survives a page
// reload; the phone asks for a fresh token with it, and again before `exp`.
import { jwtDecode } from 'jwt-decode';
import { apiService } from '../../services/apiService';

// Ask for the next token this long before the current one expires.
export const REFRESH_BEFORE_S = 60;
// Never schedule a refresh sooner than this, so a token that is already near
// its end (or a clock that is off) cannot spin the refresh loop.
export const MIN_REFRESH_MS = 5000;

export async function fetchPhoneToken(deviceUuid, { authorization } = {}) {
  if (!deviceUuid) throw new Error('No device to sign the phone in as');
  const options = authorization ? { headers: { Authorization: authorization } } : {};
  const body = await apiService.get(`/api/devices/${encodeURIComponent(deviceUuid)}/phone`, options, 'phone sign-in', false);
  const token = body?.token ?? body?.data?.token;
  if (!token) throw new Error('The server did not return a phone token');
  return token;
}

// Token -> the settings the phone registers with. Refuses a token without the
// SIP claims or one that has already expired.
export function sipSettingsFromPhoneToken(token, base = {}, nowS = Date.now() / 1000) {
  let c;
  try { c = jwtDecode(token); } catch { throw new Error('The phone token could not be read'); }
  if (!c?.username || !c?.password || !c?.domain) throw new Error('The phone token is missing its SIP claims');
  if (!c.exp || c.exp <= nowS) throw new Error('The phone token has expired');
  const username = String(c.username);
  return {
    ...base,
    deviceUuid: c.sub || base.deviceUuid,
    username,
    password: c.password,
    domain: c.domain,
    wssUrl: c.wss_server || base.wssUrl || '',
    displayName: c.display_name || username,
    autoConnect: true,
    tokenExp: c.exp
  };
}

// Milliseconds until the next token should be fetched.
export function refreshDelayMs(exp, nowMs = Date.now()) {
  return Math.max(MIN_REFRESH_MS, (exp - REFRESH_BEFORE_S) * 1000 - nowMs);
}

// A 401/403/404 will not change on retry: the device is gone or not ours.
export function isPermanentTokenError(err) {
  const status = err?.response?.status ?? err?.status;
  if ([401, 403, 404].includes(status)) return true;
  return /\b(401|403|404)\b|not allowed|forbidden|not found|unauthori[sz]ed/i.test(String(err?.message || ''));
}

// Retry with exponential backoff (1s, 2s, 4s, ... capped). Stops at once on
// a permanent error, or when shouldStop() says the caller no longer wants it.
export async function withRetry(fn, { attempts = 4, baseMs = 1000, maxMs = 30000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), shouldStop = () => false } = {}) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    if (shouldStop()) throw new Error('Phone sign-in cancelled');
    try {
      return await fn(i);
    } catch (err) {
      last = err;
      if (isPermanentTokenError(err) || i === attempts - 1) break;
      await sleep(Math.min(maxMs, baseMs * 2 ** i));
    }
  }
  throw last;
}
