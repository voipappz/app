// SIP softphone settings — what the Settings tab edits and persists locally.
// Endpoint defaults come from VITE_SIP_* (see ./config.js); with no env set,
// the endpoint is auto-populated from the logged-in user's environment
// (the device's phone token) and the softphone stays unconfigured until then.
import { loadSipConfig } from './config';

// SipSettings shape: { wssUrl, domain, username, password, displayName, autoConnect, deviceUuid, tokenExp }
// username/password/domain/wssUrl come from the device's phone token; only
// deviceUuid, autoConnect and the endpoint fields are ever stored.

const KEY = 'sip-settings';

// Endpoint settings from env (VITE_SIP_*): the WSS server, the domain and a
// display name, nothing else. A SIP username or password is NEVER read from
// the build environment: Vite inlines every VITE_* value into the public
// bundle, so a password there is published to anyone who loads the page. The
// phone gets its credentials from the signed-in user, a picked device, or the
// Settings form, and holds the password in memory only.
function envSipOverrides() {
  const o = {};
  const set = (k, v) => { if (v) o[k] = v; };
  set('displayName', import.meta.env.VITE_SIP_DISPLAY_NAME);
  set('wssUrl', import.meta.env.VITE_SIP_WSS_URL);
  set('domain', import.meta.env.VITE_SIP_DOMAIN);
  return o;
}

// The stored copy never carries the password. Older builds wrote it, so a
// load drops it and rewrites the entry without it.
function withoutPassword(s) {
  const { password: _password, ...rest } = s || {};
  return rest;
}

export function defaultSipSettings() {
  const cfg = loadSipConfig();
  return { wssUrl: cfg.wssUrl, domain: cfg.domain, username: '', password: '', displayName: '', autoConnect: false, deviceUuid: '', tokenExp: 0, ...envSipOverrides() };
}

export function loadSipSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored && Object.prototype.hasOwnProperty.call(stored, 'password')) {
        localStorage.setItem(KEY, JSON.stringify(withoutPassword(stored)));
      }
      return { ...defaultSipSettings(), ...withoutPassword(stored), password: '', ...envSipOverrides() };
    }
  } catch { /* corrupt/absent -> defaults */ }
  return defaultSipSettings();
}

export function saveSipSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(withoutPassword(s))); } catch { /* storage disabled */ }
}

export function clearSipSettings() {
  try { localStorage.removeItem(KEY); } catch { /* storage disabled */ }
}

// There is no credential derivation here any more: the phone registers
// only from a device's short-lived token (./phoneToken.js). The login
// password is never used as a SIP password.

/** Enough config present to attempt a registration. */
export function sipSettingsReady(s) {
  return Boolean(s.wssUrl && s.domain && s.username && s.password);
}
