// SIP softphone settings — what the Settings tab edits and persists locally.
// Endpoint defaults come from VITE_SIP_* (see ./config.js); with no env set,
// the endpoint is auto-populated from the logged-in user's environment
// (sipSettingsFromUser) and the softphone stays unconfigured until then.
import { loadSipConfig } from './config';

// SipSettings shape: { wssUrl, domain, username, password, displayName, autoConnect }

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
  return { wssUrl: cfg.wssUrl, domain: cfg.domain, username: '', password: '', displayName: '', autoConnect: false, ...envSipOverrides() };
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

// Derive SIP registration creds from the logged-in account — NOT hardcoded.
// The AOR is sip:<username>@<domain> taken from the account email
// (`200@6174.nimbusip.com` -> username `200`, domain `6174.nimbusip.com`), and
// the SIP password is the same password the user just authenticated with (the
// only point at which the plaintext is available — login verifies a bcrypt hash,
// so it can't be recovered later). The WSS endpoint (the SBC/FreeSWITCH ws
// binding) is NOT part of the account — it stays from config/env, since one SBC
// fronts many account domains. autoConnect is enabled so the phone REGISTERs
// right after login.
export function sipSettingsFromAccount(email, password, base) {
  const cur = base ?? loadSipSettings();
  const at = String(email || '').indexOf('@');
  const username = at > 0 ? email.slice(0, at) : (email || cur.username);
  const domain = at > 0 ? email.slice(at + 1) : cur.domain;
  return {
    ...cur,
    username,
    domain,                                   // the account's domain
    password: password || cur.password,       // the account's login password
    displayName: cur.displayName || username,
    autoConnect: true
  };
}

// Derive SIP registration creds from the logged-in voipappz-api USER object —
// mirrors app's WebRTC phone, which registers from
// `user.extension.{username,password}` (the extension's own SIP secret) and
// `user.environment.{domain,wss_server}` (environment is at user level, not on
// the extension) — confirmed this exact shape comes back from voipappz-api's
// own Serializers::User#login. The extension secret is preferred over the
// login password, and the environment's wss_server over the config/env WSS.
// Anything the user object doesn't carry falls back to sipSettingsFromAccount
// (email/password), so this degrades gracefully when the login response is
// sparse.
export function sipSettingsFromUser(user, loginPassword, base) {
  const cur = base ?? loadSipSettings();
  const ext = user?.extension ?? {};
  const env = user?.environment ?? ext.environment ?? {};

  const username = ext.username || cur.username;
  const password = ext.password || ext.secret || loginPassword || cur.password;
  const domain = env.domain || cur.domain;
  const rawWss = env.wss_server || '';
  const wssUrl = rawWss
    ? (rawWss.startsWith('ws') ? rawWss : `wss://${rawWss}`)
    : cur.wssUrl;
  const displayName = user?.fullname || user?.name || ext.name || username || cur.displayName;

  // If the user object lacks the SIP essentials, fall back to the email/account
  // derivation so login-time registration still has something to try.
  if (!username || !domain) {
    return sipSettingsFromAccount(user?.email || '', loginPassword || password, cur);
  }

  return { ...cur, username, password, domain, wssUrl, displayName, autoConnect: true };
}

// Register AS a device an account picked: the device object from
// GET /api/devices/:uuid carries its own SIP secret and its environment's
// domain and wss server — the same fields a user's login response nests under
// `user.extension` and `user.environment`.
export function sipSettingsFromDevice(device, base) {
  return sipSettingsFromUser({ name: device?.name, extension: device, environment: device?.environment }, '', base);
}

/** Enough config present to attempt a registration. */
export function sipSettingsReady(s) {
  return Boolean(s.wssUrl && s.domain && s.username && s.password);
}
