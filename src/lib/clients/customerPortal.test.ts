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

  it.each([
    ['no portal data at all', undefined],
    ['key absent — the shape MTN serves today', { name: 'mtn', language: 'en' }],
    ['empty value — key present but unset', { login_otp_enabled: '' }],
  ])('assumes OTP when the tenant makes no claim: %s', (_label, data) => {
    if (data) seedPortal(data as Record<string, unknown>);
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
