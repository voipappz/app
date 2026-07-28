import { describe, it, expect, beforeEach } from 'vitest';
import { expectsLoginOtp } from './customerPortal';

// The login screen's "expect a code" hint. OTP is the default, so the contract
// is: show it unless the tenant explicitly opts out. The value is an hstore
// string, and the accepted on-values mirror Mediators::User::Login#truthy? so
// the hint can't disagree with the enforcement about the same stored value.
function seedPortal(data: Record<string, unknown>) {
  localStorage.setItem('customerData', JSON.stringify(data));
}

describe('expectsLoginOtp', () => {
  beforeEach(() => localStorage.clear());

  // The API supplies the default for an unset key, so in practice the value is
  // always a real string. These are the degraded paths where it isn't — the boot
  // fetch failed, or an older API is still deployed — and they must not silently
  // downgrade the tenant's posture.
  it.each([
    ['no portal data at all — boot fetch failed', undefined],
    ['key missing — an older API without the field', { name: 'mtn', language: 'en' }],
    ['empty value', { login_otp_enabled: '' }],
  ])('mirrors the API default when there is nothing to read: %s', (_label, data) => {
    if (data) seedPortal(data as Record<string, unknown>);
    expect(expectsLoginOtp()).toBe(true);
  });

  it('takes "true" from the tenant rather than assuming it', () => {
    // What the API now sends for a customer that has never set the key: the
    // default is decided there, we only decode it.
    seedPortal({ name: 'mtn', login_otp_enabled: 'true' });
    expect(expectsLoginOtp()).toBe(true);
  });

  it.each(['true', 'True', ' TRUE ', '1', 'yes', 'on'])('expects OTP for %s', (v) => {
    seedPortal({ login_otp_enabled: v });
    expect(expectsLoginOtp()).toBe(true);
  });

  it.each(['false', 'off', '0', 'no'])('stands down for %s', (v) => {
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
