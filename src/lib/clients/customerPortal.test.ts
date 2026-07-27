import { describe, it, expect, beforeEach } from 'vitest';
import { isLoginOtpEnabled, expectsLoginOtp, getCustomerData, clearCustomerData } from './customerPortal';

// The tenant OTP hint from customer_portal_data. It only ever sets expectations
// on the login screen — the step-1 response is what actually decides — so the
// contract that matters is: a real boolean when the server states one, and
// `undefined` (⇒ show nothing) for every other shape, including older APIs that
// don't send the key at all.
function seedPortal(data: Record<string, unknown>) {
  localStorage.setItem('customerData', JSON.stringify(data));
}

describe('customer portal OTP hint', () => {
  beforeEach(() => localStorage.clear());

  it('reports true when the tenant states two-step verification', () => {
    seedPortal({ name: 'mtn', login_otp_enabled: true });
    expect(isLoginOtpEnabled()).toBe(true);
  });

  it('reports false when the tenant explicitly opts out', () => {
    seedPortal({ name: 'mtn', login_otp_enabled: false });
    expect(isLoginOtpEnabled()).toBe(false);
  });

  it('makes no claim when the key is absent (older API / no opinion)', () => {
    // The shape MTN serves today — six branding fields, no OTP key.
    seedPortal({ name: 'mtn', language: 'en', logo_title: 'mtn' });
    expect(isLoginOtpEnabled()).toBeUndefined();
  });

  it('makes no claim when the server sends null (unknown origin host)', () => {
    // :logo_organization fallback — we don't know whose portal this is.
    seedPortal({ name: 'voipappz', login_otp_enabled: null });
    expect(isLoginOtpEnabled()).toBeUndefined();
  });

  it('makes no claim with no portal data at all', () => {
    expect(isLoginOtpEnabled()).toBeUndefined();
  });

  // The API passes the profile value through RAW and profile is an hstore, so
  // the realistic wire shape is a STRING. Reading these as booleans is the whole
  // job — mirroring Mediators::User::Login#truthy? exactly.
  it.each(['true', 'True', ' TRUE ', '1', 'yes', 'on'])('reads %s as enabled', (v) => {
    seedPortal({ login_otp_enabled: v });
    expect(isLoginOtpEnabled()).toBe(true);
  });

  it.each(['false', 'False', '0', 'no', 'off', 'maybe'])('reads %s as disabled', (v) => {
    seedPortal({ login_otp_enabled: v });
    expect(isLoginOtpEnabled()).toBe(false);
  });

  it('treats an empty hstore value as no claim, not as disabled', () => {
    seedPortal({ login_otp_enabled: '' });
    expect(isLoginOtpEnabled()).toBeUndefined();
  });

  it('survives corrupt cached data', () => {
    localStorage.setItem('customerData', '{not json');
    expect(getCustomerData()).toBeNull();
    expect(isLoginOtpEnabled()).toBeUndefined();
  });

  it('clears with the rest of the portal data', () => {
    seedPortal({ login_otp_enabled: true });
    clearCustomerData();
    expect(isLoginOtpEnabled()).toBeUndefined();
  });
});

// OTP IS THE DEFAULT on the client: expect a code unless the tenant explicitly
// opts out. `isLoginOtpEnabled` stays the honest reader of what the server said;
// `expectsLoginOtp` is where the assumption is applied, so the two must not be
// conflated — that separation is the point of having both.
describe('expectsLoginOtp — OTP as the client default', () => {
  beforeEach(() => localStorage.clear());

  it('expects OTP when the tenant says nothing', () => {
    seedPortal({ name: 'mtn', language: 'en' });
    expect(isLoginOtpEnabled()).toBeUndefined();   // server made no claim
    expect(expectsLoginOtp()).toBe(true);          // ...we assume on anyway
  });

  it('expects OTP with no portal data at all', () => {
    expect(expectsLoginOtp()).toBe(true);
  });

  it('expects OTP when the server sends null', () => {
    seedPortal({ login_otp_enabled: null });
    expect(expectsLoginOtp()).toBe(true);
  });

  it('expects OTP when the tenant states true', () => {
    seedPortal({ login_otp_enabled: true });
    expect(expectsLoginOtp()).toBe(true);
  });

  // The ONLY way to turn the expectation off is an explicit false.
  it('stands down only on an explicit false', () => {
    seedPortal({ login_otp_enabled: false });
    expect(expectsLoginOtp()).toBe(false);
  });

  it('stands down for the string "false" the profile actually stores', () => {
    // The opt-out a tenant really writes is the hstore string, not a JSON boolean.
    seedPortal({ login_otp_enabled: 'false' });
    expect(expectsLoginOtp()).toBe(false);
  });

  it('still expects OTP for an empty profile value', () => {
    seedPortal({ login_otp_enabled: '' });
    expect(expectsLoginOtp()).toBe(true);
  });
});
