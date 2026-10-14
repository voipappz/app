import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sipSettingsFromDevice, sipSettingsFromUser, saveSipSettings, loadSipSettings, defaultSipSettings, sipSettingsReady } from './sipSettings';

// A device as GET /api/devices/:uuid returns it (Serializers::Extension
// :default): its own SIP secret, and its environment's domain and wss server.
const device = {
  uuid: 'dev-1', name: 'Reception', username: '201', password: 's3cret',
  environment: { uuid: 'env-1', domain: '6174.nimbusip.com', wss_server: 'sbc.voipappz.io:7443' },
};

describe('sipSettingsFromDevice', () => {
  it('registers as the device, on its environment', () => {
    const s = sipSettingsFromDevice(device, { wssUrl: '', domain: '', username: '', password: '', displayName: '', autoConnect: false });
    expect(s).toMatchObject({
      username: '201', password: 's3cret', domain: '6174.nimbusip.com',
      wssUrl: 'wss://sbc.voipappz.io:7443', displayName: 'Reception', autoConnect: true,
    });
  });
});

describe('sipSettingsFromUser', () => {
  it('registers the extension belonging to the logged-in user environment', () => {
    const s = sipSettingsFromUser({
      fullname: 'Dana Example',
      extension: { username: '305', password: 'extension-secret' },
      environment: { domain: 'd.example', wss_server: 'sbc.example:7443' },
    }, '', { wssUrl: '', domain: '', username: '', password: '', displayName: '', autoConnect: false });

    expect(s).toMatchObject({
      username: '305', password: 'extension-secret', domain: 'd.example',
      wssUrl: 'wss://sbc.example:7443', displayName: 'Dana Example', autoConnect: true,
    });
  });
});

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
