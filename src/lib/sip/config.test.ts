import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadSipConfig } from './config';

// Config is fully env-driven with NO tenant endpoint baked in — the WSS
// endpoint comes from env or the logged-in user's environment. These lock the
// empty defaults and the override precedence so a stray hardcode is caught.
describe('loadSipConfig', () => {
  // Hermetic: clear ambient VITE_SIP_* (dev .env may set wss/domain) so the
  // default + derivation cases test the logic, not the local environment.
  beforeEach(() => {
    vi.stubEnv('VITE_SIP_WSS_URL', '');
    vi.stubEnv('VITE_SIP_DOMAIN', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('has NO baked-in WSS endpoint — unset env means unconfigured', () => {
    expect(loadSipConfig().wssUrl).toBe('');
  });

  it('derives the SIP domain from the WSS host when not set', () => {
    expect(loadSipConfig({ wssUrl: 'wss://sw.example:8443' }).domain).toBe('sw.example');
  });

  it('honors VITE_SIP_WSS_URL from env', () => {
    vi.stubEnv('VITE_SIP_WSS_URL', 'wss://env.example:8443');
    expect(loadSipConfig().wssUrl).toBe('wss://env.example:8443');
  });

  it('default ICE is the vendor-neutral Google STUN, overridable via env', () => {
    expect(JSON.stringify(loadSipConfig().iceServers)).toContain('stun:stun.l.google.com:19302');
    vi.stubEnv('VITE_SIP_STUN', 'stun:tenant.example');
    expect(JSON.stringify(loadSipConfig().iceServers)).toContain('stun:tenant.example');
  });

  it('register interval + reconnect knobs match voipappz-app (300 / 5 / 3000)', () => {
    const c = loadSipConfig();
    expect(c.registerExpires).toBe(300);
    expect(c.reconnectMax).toBe(5);
    expect(c.reconnectDelayMs).toBe(3000);
  });

  it('explicit overrides win over env/defaults', () => {
    const c = loadSipConfig({ wssUrl: 'wss://x.test:9001', domain: 'd.test', reconnectMax: 2, reconnectDelayMs: 500 });
    expect(c.wssUrl).toBe('wss://x.test:9001');
    expect(c.domain).toBe('d.test');
    expect(c.reconnectMax).toBe(2);
    expect(c.reconnectDelayMs).toBe(500);
  });

  it('domain override is honored even with a custom wssUrl', () => {
    expect(loadSipConfig({ wssUrl: 'wss://sw.example:8443', domain: 'tenant.example' }).domain).toBe('tenant.example');
  });
});
