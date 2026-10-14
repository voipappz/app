import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveSipSettings, loadSipSettings, defaultSipSettings, sipSettingsReady } from './sipSettings';

describe('the SIP password is never stored or baked', () => {
  const KEY = 'sip-settings';
  beforeEach(() => { localStorage.clear(); vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('saves every field but the password', () => {
    saveSipSettings({ wssUrl: 'wss://sbc.example:8443', domain: 'd.example', username: '305', password: 'secret', displayName: 'Dana', autoConnect: true });
    const stored = JSON.parse(localStorage.getItem(KEY));
    expect(stored).not.toHaveProperty('password');
    expect(stored).toMatchObject({ username: '305', domain: 'd.example', autoConnect: true });
    expect(localStorage.getItem(KEY)).not.toContain('secret');
  });

  it('drops a password an older build stored, and rewrites the entry without it', () => {
    localStorage.setItem(KEY, JSON.stringify({ username: '305', domain: 'd.example', password: 'old-secret' }));
    const s = loadSipSettings();
    expect(s.password).toBe('');
    expect(s.username).toBe('305');
    expect(localStorage.getItem(KEY)).not.toContain('old-secret');
  });

  it('ignores a SIP username or password in the build environment', () => {
    vi.stubEnv('VITE_SIP_USERNAME', 'baked-user');
    vi.stubEnv('VITE_SIP_PASSWORD', 'baked-secret');
    vi.stubEnv('VITE_SIP_AUTOCONNECT', '1');
    const d = defaultSipSettings();
    expect(d.username).toBe('');
    expect(d.password).toBe('');
    expect(d.autoConnect).toBe(false);
    localStorage.setItem(KEY, JSON.stringify({ username: '305' }));
    expect(loadSipSettings()).toMatchObject({ username: '305', password: '', autoConnect: false });
  });

  it('is not registerable from storage alone', () => {
    saveSipSettings({ wssUrl: 'wss://sbc.example:8443', domain: 'd.example', username: '305', password: 'secret' });
    expect(sipSettingsReady(loadSipSettings())).toBe(false);
  });
});
