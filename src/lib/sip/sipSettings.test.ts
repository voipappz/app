import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defaultSipSettings, loadSipSettings, saveSipSettings, sipSettingsReady, sipSettingsFromAccount, sipSettingsFromUser } from './sipSettings';

describe('sipSettings', () => {
  // Hermetic: clear any ambient VITE_SIP_* (the dev .env may hardcode creds) so
  // the "empty default" cases test the logic, not the local environment.
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_SIP_USERNAME', '');
    vi.stubEnv('VITE_SIP_PASSWORD', '');
    vi.stubEnv('VITE_SIP_DISPLAY_NAME', '');
    vi.stubEnv('VITE_SIP_AUTOCONNECT', '');
    vi.stubEnv('VITE_SIP_DOMAIN', '');
    vi.stubEnv('VITE_SIP_WSS_URL', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('defaults come from config with empty creds + autoConnect off', () => {
    const s = defaultSipSettings();
    expect(s.wssUrl).toContain('wss://');
    expect(s.domain).toBeTruthy();
    expect(s.username).toBe('');
    expect(s.password).toBe('');
    expect(s.autoConnect).toBe(false);
  });

  it('save → load round-trips through localStorage', () => {
    saveSipSettings({ ...defaultSipSettings(), username: '1001', password: 'pw', domain: 'd.test', autoConnect: true });
    const s = loadSipSettings();
    expect(s.username).toBe('1001');
    expect(s.domain).toBe('d.test');
    expect(s.autoConnect).toBe(true);
  });

  it('loadSipSettings falls back to defaults when storage is empty/corrupt', () => {
    expect(loadSipSettings().username).toBe('');
    localStorage.setItem('sip-settings', '{not json');
    expect(loadSipSettings().username).toBe(''); // corrupt → defaults, no throw
  });

  it('sipSettingsReady requires wss + domain + username + password', () => {
    expect(sipSettingsReady(defaultSipSettings())).toBe(false);
    expect(sipSettingsReady({ ...defaultSipSettings(), username: '1001' })).toBe(false);
    expect(sipSettingsReady({ ...defaultSipSettings(), username: '1001', password: 'pw' })).toBe(true);
  });

  it('env creds are authoritative over stale saved settings', () => {
    saveSipSettings({ ...defaultSipSettings(), username: 'OLD', password: 'old', domain: 'old.example', wssUrl: 'wss://old:1' });
    vi.stubEnv('VITE_SIP_USERNAME', '11125');
    vi.stubEnv('VITE_SIP_PASSWORD', 'pw');
    vi.stubEnv('VITE_SIP_DOMAIN', 'apoint.voipappz.io');
    vi.stubEnv('VITE_SIP_WSS_URL', 'wss://switch.voipappz.io:8443');
    const s = loadSipSettings();
    expect(s.username).toBe('11125');
    expect(s.domain).toBe('apoint.voipappz.io');
    expect(s.wssUrl).toBe('wss://switch.voipappz.io:8443');
  });

  it('derives SIP creds from the account email + login password (not hardcoded)', () => {
    const s = sipSettingsFromAccount('200@6174.nimbusip.com', 'BaRFdB4');
    expect(s.username).toBe('200');                 // local part of the email
    expect(s.domain).toBe('6174.nimbusip.com');     // the account's domain
    expect(s.password).toBe('BaRFdB4');             // the login password
    expect(s.displayName).toBe('200');
    expect(s.autoConnect).toBe(true);               // registers right after login
    expect(s.wssUrl).toBe(defaultSipSettings().wssUrl); // SBC endpoint stays from config
    expect(sipSettingsReady(s)).toBe(true);
  });

  it('falls back to whole email as username when there is no @', () => {
    const s = sipSettingsFromAccount('operator', 'pw');
    expect(s.username).toBe('operator');
    expect(s.domain).toBe(defaultSipSettings().domain); // unchanged
  });

  it('sipSettingsFromUser registers from the mothership user object (voipappz-app parity)', () => {
    const user = {
      email: 'agent@x.com',
      fullname: 'Agent Smith',
      extension: { username: '200', password: 'ext-secret' },
      environment: { domain: '6174.nimbusip.com', wss_server: 'switch.voipappz.io:8443' },
    };
    const s = sipSettingsFromUser(user, 'login-pw');
    expect(s.username).toBe('200');                       // extension username
    expect(s.password).toBe('ext-secret');                // extension SIP secret (not login pw)
    expect(s.domain).toBe('6174.nimbusip.com');           // environment domain
    expect(s.wssUrl).toBe('wss://switch.voipappz.io:8443'); // wss_server normalized
    expect(s.displayName).toBe('Agent Smith');
    expect(s.autoConnect).toBe(true);
    expect(sipSettingsReady(s)).toBe(true);
  });

  it('sipSettingsFromUser uses the login password when the extension has no secret', () => {
    const user = { extension: { username: '201' }, environment: { domain: 'd.test' } };
    const s = sipSettingsFromUser(user, 'login-pw');
    expect(s.username).toBe('201');
    expect(s.password).toBe('login-pw');
  });

  it('sipSettingsFromUser falls back to email/account derivation when the user lacks extension/env', () => {
    const s = sipSettingsFromUser({ email: '300@apoint.voipappz.io' }, 'pw');
    expect(s.username).toBe('300');
    expect(s.domain).toBe('apoint.voipappz.io');
    expect(s.password).toBe('pw');
  });

  it('reads hardcoded creds + autoConnect from VITE_SIP_* env', () => {
    vi.stubEnv('VITE_SIP_USERNAME', '11125');
    vi.stubEnv('VITE_SIP_PASSWORD', 'secret');
    vi.stubEnv('VITE_SIP_AUTOCONNECT', '1');
    const s = defaultSipSettings();
    expect(s.username).toBe('11125');
    expect(s.password).toBe('secret');
    expect(s.autoConnect).toBe(true);
    expect(sipSettingsReady(s)).toBe(true);
  });
});
