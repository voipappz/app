import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { expectsLoginOtp, loadCustomerPortalData } from './customerPortal';

// The login screen's "expect a code" hint. OTP is the default, so the contract
// is: show it unless the tenant explicitly opts out. The value is an hstore
// string, and the accepted on-values mirror Mediators::User::Login#truthy? so
// the hint can't disagree with the enforcement about the same stored value.
function seedPortal(data: Record<string, unknown>) {
  localStorage.setItem('customerData', JSON.stringify(data));
}

describe('expectsLoginOtp', () => {
  beforeEach(() => localStorage.clear());

  // The API sends the default itself, so a missing value only happens when the
  // payload is missing — boot fetch failed, or an older API. Must not downgrade.
  it.each([
    ['no portal data', undefined],
    ['older API without the field', { name: 'mtn', language: 'en' }],
    ['empty value', { login_otp_enabled: '' }],
  ])('falls back to the API default: %s', (_label, data) => {
    if (data) seedPortal(data as Record<string, unknown>);
    expect(expectsLoginOtp()).toBe(true);
  });

  // 'enabled' included: Validate::String::Boolean accepts it, so it can be stored.
  it.each(['true', 'True', ' TRUE ', '1', 'yes', 'on', 'enabled'])('expects OTP for %s', (v) => {
    seedPortal({ login_otp_enabled: v });
    expect(expectsLoginOtp()).toBe(true);
  });

  it.each(['false', 'off', '0', 'no', 'disabled'])('stands down for %s', (v) => {
    seedPortal({ login_otp_enabled: v });
    expect(expectsLoginOtp()).toBe(false);
  });

  it('stands down for a value the server would also reject', () => {
    // Login#truthy?('maybe') is false, so the server sends no code — the hint
    // must agree rather than promise an email that never arrives.
    seedPortal({ login_otp_enabled: 'maybe' });
    expect(expectsLoginOtp()).toBe(false);
  });

  it('survives corrupt cached data', () => {
    localStorage.setItem('customerData', '{not json');
    expect(expectsLoginOtp()).toBe(true);
  });
});

// Boot AWAITS this call, so it must never be able to hang the app. Branding is
// cosmetic; an unreachable mothership has to degrade to the env defaults, not
// hold the first render hostage. CI hit exactly that — the runner could not
// reach cloud.voipappz.io, the connect never settled, and nothing rendered.
describe('loadCustomerPortalData must not block boot', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('makes no request at all in offline mock mode', async () => {
    vi.stubEnv('VITE_MOCK_LOGIN', '1');
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    expect(await loadCustomerPortalData()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('budgets the request so a dead host cannot stall the first render', async () => {
    vi.stubEnv('VITE_MOCK_LOGIN', '');
    let signal: AbortSignal | undefined;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      signal = init?.signal;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ logo_title: 'mtn' }) } as Response);
    });

    await loadCustomerPortalData();
    // An unbounded fetch is the bug — a TCP connect that never answers is not
    // caught by a try/catch, it simply never settles.
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('falls back to null when the request aborts', async () => {
    vi.stubEnv('VITE_MOCK_LOGIN', '');
    global.fetch = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    expect(await loadCustomerPortalData()).toBeNull();
  });
});
