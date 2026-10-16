import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/apiService', () => ({ apiService: { get: vi.fn() } }));
import { apiService } from '../../services/apiService';
import {
  fetchPhoneToken, sipSettingsFromPhoneToken, refreshDelayMs, withRetry, isPermanentTokenError,
  REFRESH_BEFORE_S, MIN_REFRESH_MS
} from './phoneToken';

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
export const makeToken = (claims) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;
const now = 1_800_000_000;
const claims = { sub: 'dev-1', username: '305', password: 'sip-secret', domain: 'd.example', wss_server: 'wss://sbc.example:8443', display_name: 'Dana', exp: now + 3600 };

describe('sipSettingsFromPhoneToken', () => {
  it('maps the token claims onto the settings the phone registers with', () => {
    const s = sipSettingsFromPhoneToken(makeToken(claims), { autoConnect: false, wssUrl: 'wss://fallback' }, now);
    expect(s).toEqual({
      deviceUuid: 'dev-1', username: '305', password: 'sip-secret', domain: 'd.example',
      wssUrl: 'wss://sbc.example:8443', displayName: 'Dana', autoConnect: true, tokenExp: now + 3600
    });
  });

  it('keeps the configured server when the token names none', () => {
    const s = sipSettingsFromPhoneToken(makeToken({ ...claims, wss_server: '' }), { wssUrl: 'wss://fallback' }, now);
    expect(s.wssUrl).toBe('wss://fallback');
  });

  it('refuses an expired token, a token without SIP claims, and garbage', () => {
    expect(() => sipSettingsFromPhoneToken(makeToken({ ...claims, exp: now - 1 }), {}, now)).toThrow(/expired/);
    expect(() => sipSettingsFromPhoneToken(makeToken({ ...claims, password: '' }), {}, now)).toThrow(/SIP claims/);
    expect(() => sipSettingsFromPhoneToken('not-a-jwt', {}, now)).toThrow(/could not be read/);
  });
});

describe('fetchPhoneToken', () => {
  beforeEach(() => apiService.get.mockReset());

  it('asks the devices endpoint for the device\'s phone token', async () => {
    apiService.get.mockResolvedValue({ token: 'tok', expires_in: 3600 });
    await expect(fetchPhoneToken('dev 1')).resolves.toBe('tok');
    expect(apiService.get).toHaveBeenCalledWith('/api/devices/dev%201/phone', {}, 'phone sign-in', false);
  });

  it('sends an explicit credential when one is given', async () => {
    apiService.get.mockResolvedValue({ token: 'tok' });
    await fetchPhoneToken('dev-1', { authorization: 'Bearer user-login' });
    expect(apiService.get.mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer user-login' } });
  });

  it('fails when the server returns no token', async () => {
    apiService.get.mockResolvedValue({});
    await expect(fetchPhoneToken('dev-1')).rejects.toThrow(/did not return/);
  });
});

describe('refreshDelayMs', () => {
  it('renews REFRESH_BEFORE_S before expiry, never sooner than MIN_REFRESH_MS', () => {
    expect(refreshDelayMs(now + 3600, now * 1000)).toBe((3600 - REFRESH_BEFORE_S) * 1000);
    expect(refreshDelayMs(now + 10, now * 1000)).toBe(MIN_REFRESH_MS);
  });
});

describe('withRetry', () => {
  const sleep = vi.fn(() => Promise.resolve());
  beforeEach(() => sleep.mockClear());

  it('retries a transient failure with doubling backoff, then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('Network Error')).mockRejectedValueOnce(new Error('timeout')).mockResolvedValue('ok');
    await expect(withRetry(fn, { sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it('gives up after the last attempt with the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Network Error'));
    await expect(withRetry(fn, { sleep, attempts: 3 })).rejects.toThrow('Network Error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a refusal', async () => {
    const refused = Object.assign(new Error('Not allowed'), { status: 403 });
    const fn = vi.fn().mockRejectedValue(refused);
    await expect(withRetry(fn, { sleep })).rejects.toBe(refused);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isPermanentTokenError(refused)).toBe(true);
    expect(isPermanentTokenError(new Error('Network Error'))).toBe(false);
  });
});
