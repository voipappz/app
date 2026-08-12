// Security: signing out must take the softphone off the wire. A logged-out
// browser that stays REGISTERED keeps ringing for the previous user — the next
// person at that machine answers their calls.
//
// Two routes let that happen before the isAuthenticated guard in
// SipPhoneContext, and this file pins both shut:
//   1. defaultSipSettings() spreads envSipOverrides() LAST, so on a build with
//      VITE_SIP_* creds baked in the "cleared" settings still register.
//   2. unregister() ends with status 'idle' — the exact trigger auto-connect
//      waits for — so teardown re-armed the effect that undid it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const register = vi.fn().mockResolvedValue(undefined);
const unregister = vi.fn().mockResolvedValue(undefined);
let status = 'idle';

vi.mock('../lib/sip/useSipPhone', () => ({
  useSipPhone: () => ({
    status,
    call: null,
    register,
    unregister,
    dial: vi.fn(),
    answer: vi.fn(),
    hangup: vi.fn(),
    sendDtmf: vi.fn(),
    setMuted: vi.fn(),
  }),
}));

import { SipPhoneProvider } from './SipPhoneContext';
import { AuthProvider, useAuth } from './AuthContext';

// Credentials good enough to register with, plus the opt-in.
const READY_SETTINGS = {
  wssUrl: 'wss://sbc.example.com:8443',
  domain: 'tenant.example.com',
  username: '9019',
  password: 'sip-secret',
  displayName: '9019',
  autoConnect: true,
};

function Harness() {
  const { isAuthenticated, logout } = useAuth();
  return (
    <button data-testid="logout" onClick={() => logout('user')}>
      {String(isAuthenticated)}
    </button>
  );
}

const renderApp = () => render(
  <AuthProvider><SipPhoneProvider><Harness /></SipPhoneProvider></AuthProvider>,
);

describe('logout takes the softphone off the wire', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SIP_ENABLED', 'true');
    register.mockClear();
    unregister.mockClear();
    status = 'idle';
    localStorage.clear();
    // A live session, and a phone with usable credentials + auto-connect.
    localStorage.setItem('auth', JSON.stringify({
      access: 'tok-9019', email: 'akosua.bafu@mtn.com', user_uuid: 'u-9019',
    }));
    localStorage.setItem('sip-settings', JSON.stringify(READY_SETTINGS));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('registers while signed in', () => {
    renderApp();
    expect(screen.getByTestId('logout')).toHaveTextContent('true');
    expect(register).toHaveBeenCalled();
  });

  it('unregisters on logout and does NOT come back', async () => {
    renderApp();
    expect(register).toHaveBeenCalled();
    register.mockClear();

    await act(async () => { screen.getByTestId('logout').click(); });

    expect(screen.getByTestId('logout')).toHaveTextContent('false');
    expect(unregister).toHaveBeenCalled();
    // The bug: auto-connect re-fired on the 'idle' status that teardown itself
    // sets, and registered again with env-supplied creds.
    expect(register).not.toHaveBeenCalled();
  });

  it('stays off the wire even if credentials survive the clear', async () => {
    renderApp();
    await act(async () => { screen.getByTestId('logout').click(); });
    register.mockClear();

    // Reinstate ready creds (what envSipOverrides() effectively does) and put
    // the phone back to 'idle' — the exact conditions auto-connect looks for.
    await act(async () => {
      localStorage.setItem('sip-settings', JSON.stringify(READY_SETTINGS));
      status = 'idle';
    });

    expect(register).not.toHaveBeenCalled();
  });

  it('clears the signed-in user caches, keeping UI preferences', async () => {
    localStorage.setItem('customerData', JSON.stringify({ logo_title: 'mtn' }));
    localStorage.setItem('sip-phone-pinned', '1');
    localStorage.setItem('app-direction', 'rtl');
    localStorage.setItem('va_user_device_token', 'dev-abc');

    renderApp();
    await act(async () => { screen.getByTestId('logout').click(); });

    // Session-scoped: gone, so the next tenant inherits nothing.
    expect(localStorage.getItem('customerData')).toBeNull();
    expect(localStorage.getItem('sip-phone-pinned')).toBeNull();
    // Belongs to the person at the browser, not the session.
    expect(localStorage.getItem('app-direction')).toBe('rtl');
    // Signing out ends the session; it does not un-trust the device.
    expect(localStorage.getItem('va_user_device_token')).toBe('dev-abc');
  });
});
