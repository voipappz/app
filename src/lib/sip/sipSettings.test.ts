import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defaultSipSettings, loadSipSettings, saveSipSettings, sipSettingsReady } from './sipSettings';

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
