import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// The phone: records registrations, starts idle.
// The phone: records registrations, starts idle, and leaves idle once it
// registers (as useSipPhone does), back to idle when unregistered.
const phone = {
  status: 'idle', lastError: '',
  register: vi.fn(async () => { phone.status = 'registered'; }),
  unregister: vi.fn(async () => { phone.status = 'idle'; })
};
vi.mock('../lib/sip/useSipPhone', () => ({ useSipPhone: () => phone }));
let adminAuthed = true;
let portalUser = { isAuthenticated: false, user: null };
vi.mock('./AuthContext', () => ({ useAuth: () => ({ isAuthenticated: adminAuthed }) }));
vi.mock('./UserAuthContext', () => ({ useUserAuth: () => portalUser }));
vi.mock('../services/apiService', () => ({ apiService: { get: vi.fn() } }));

import { apiService } from '../services/apiService';
import { SoftphoneProvider, useSoftphone } from './SoftphoneContext';

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const token = (claims) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
const nowS = () => Math.floor(Date.now() / 1000);
const claims = (over = {}) => ({ sub: 'dev-1', username: '305', password: 'pw-1', domain: 'd.example', wss_server: 'wss://sbc.example:8443', display_name: 'Dana', exp: nowS() + 3600, ...over });

let ctx;
function Probe() { ctx = useSoftphone(); return null; }
const mount = () => render(<SoftphoneProvider><Probe /></SoftphoneProvider>);
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  adminAuthed = true;
  portalUser = { isAuthenticated: false, user: null };
  phone.status = 'idle';
  phone.register.mockClear();
  phone.unregister.mockClear();
  apiService.get.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

describe('SoftphoneContext — the phone signs in from the device token', () => {
  it('registers with the token\'s credentials and stores the device, never the password', async () => {
    apiService.get.mockResolvedValue({ token: token(claims()) });
    mount();
    await act(async () => { await ctx.signInDevice('dev-1'); });

    expect(apiService.get).toHaveBeenCalledWith('/api/devices/dev-1/phone', {}, 'phone sign-in', false);
    expect(phone.register).toHaveBeenCalledWith(
      { username: '305', password: 'pw-1', domain: 'd.example', displayName: 'Dana' },
      { wssUrl: 'wss://sbc.example:8443', domain: 'd.example' }
    );
    const stored = localStorage.getItem('sip-settings');
    expect(JSON.parse(stored)).toMatchObject({ deviceUuid: 'dev-1', autoConnect: true });
    expect(stored).not.toContain('pw-1');
  });

  it('after a page reload, signs in again as the stored device with a fresh token', async () => {
    localStorage.setItem('sip-settings', JSON.stringify({ deviceUuid: 'dev-1', autoConnect: true, username: '305' }));
    apiService.get.mockResolvedValue({ token: token(claims({ password: 'pw-fresh' })) });
    mount();
    await flush();

    expect(apiService.get).toHaveBeenCalledTimes(1);
    expect(phone.register.mock.calls[0][0].password).toBe('pw-fresh');
  });

  it('does not sign in while logged out, even with a stored device', async () => {
    adminAuthed = false;
    localStorage.setItem('sip-settings', JSON.stringify({ deviceUuid: 'dev-1', autoConnect: true }));
    mount();
    await flush(10_000);
    expect(apiService.get).not.toHaveBeenCalled();
  });

  it('a portal user signs in as their own extension', async () => {
    adminAuthed = false;
    portalUser = { isAuthenticated: true, user: { extension: { uuid: 'ext-9' } } };
    apiService.get.mockResolvedValue({ token: token(claims({ sub: 'ext-9' })) });
    mount();
    await flush();
    expect(apiService.get.mock.calls[0][0]).toBe('/api/devices/ext-9/phone');
    expect(phone.register).toHaveBeenCalledTimes(1);
  });

  it('renews the token before it expires; same credentials keep the registration', async () => {
    apiService.get.mockResolvedValue({ token: token(claims({ exp: nowS() + 120 })) });
    mount();
    await act(async () => { await ctx.signInDevice('dev-1'); });
    expect(phone.register).toHaveBeenCalledTimes(1);

    apiService.get.mockResolvedValue({ token: token(claims({ exp: nowS() + 3600 })) });
    await flush(60_000); // 120s token renews 60s before expiry
    expect(apiService.get).toHaveBeenCalledTimes(2);
    expect(phone.register).toHaveBeenCalledTimes(1);
    expect(ctx.settings.tokenExp).toBeGreaterThan(nowS() + 3000);
  });

  it('a renewal with a rotated password registers again with it', async () => {
    apiService.get.mockResolvedValue({ token: token(claims({ exp: nowS() + 120 })) });
    mount();
    await act(async () => { await ctx.signInDevice('dev-1'); });

    apiService.get.mockResolvedValue({ token: token(claims({ password: 'pw-rotated' })) });
    await flush(60_000);
    expect(phone.register).toHaveBeenCalledTimes(2);
    expect(phone.register.mock.calls[1][0].password).toBe('pw-rotated');
  });

  it('retries a failed token fetch with backoff and then registers', async () => {
    apiService.get
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue({ token: token(claims()) });
    mount();
    let p;
    act(() => { p = ctx.signInDevice('dev-1'); });
    await flush(1000);
    await flush(2000);
    await act(async () => { await p; });
    expect(apiService.get).toHaveBeenCalledTimes(3);
    expect(phone.register).toHaveBeenCalledTimes(1);
  });

  it('a refused token is not retried, says why, and does not storm', async () => {
    localStorage.setItem('sip-settings', JSON.stringify({ deviceUuid: 'dev-1', autoConnect: true }));
    apiService.get.mockRejectedValue(Object.assign(new Error('Not allowed'), { status: 403 }));
    mount();
    await flush(60_000);
    expect(apiService.get).toHaveBeenCalledTimes(1);
    expect(phone.register).not.toHaveBeenCalled();
    expect(ctx.lastError).toBe('Not allowed');
  });

  it('Disconnect stays disconnected: auto sign-in does not undo it', async () => {
    apiService.get.mockResolvedValue({ token: token(claims()) });
    mount();
    await act(async () => { await ctx.signInDevice('dev-1'); });
    await act(async () => { await ctx.disconnect(); });
    await flush(60_000);
    expect(apiService.get).toHaveBeenCalledTimes(1);
    expect(phone.register).toHaveBeenCalledTimes(1);

    await act(async () => { await ctx.connect(); });
    expect(phone.register).toHaveBeenCalledTimes(2);
  });

  it('a failed renewal keeps retrying every 30s until it gets one', async () => {
    apiService.get.mockResolvedValue({ token: token(claims({ exp: nowS() + 120 })) });
    mount();
    await act(async () => { await ctx.signInDevice('dev-1'); });

    apiService.get.mockRejectedValue(new Error('Network Error'));
    await flush(60_000);          // renewal due: 4 attempts with 1s/2s/4s backoff
    await flush(7_000);
    const afterFirstRound = apiService.get.mock.calls.length;
    expect(afterFirstRound).toBe(1 + 4);
    expect(ctx.lastError).toBe('Network Error');

    apiService.get.mockResolvedValue({ token: token(claims()) });
    await flush(30_000);
    expect(apiService.get.mock.calls.length).toBe(afterFirstRound + 1);
    expect(ctx.lastError).toBe('');
  });
});
