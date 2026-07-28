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
