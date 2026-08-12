// SIP softphone settings — what the Settings tab edits and persists locally.
// Defaults come from VITE_SIP_* (see ./config.ts); with no env set, the
// endpoint is auto-populated from the logged-in user's environment
// (sipSettingsFromUser) and the softphone stays unconfigured until then.
import { loadSipConfig } from "./config";

export interface SipSettings {
  wssUrl: string;
  domain: string;
  username: string;
  password: string;
  displayName: string;
  /** Reconnect automatically when the app loads. */
  autoConnect: boolean;
}

const KEY = "sip-settings";

// Settings hardcoded via env (VITE_SIP_*) — only the keys actually set. A web
// softphone needs the SIP password client-side to register, so it lives in the
// bundle; fine for a demo/tenant build, rotate per deployment. Returns ONLY the
// provided keys so they can be layered as authoritative overrides.
function envSipOverrides() {
  const o = {};
  const set = (k, v) => { if (v) o[k] = v; };
  set('username', import.meta.env.VITE_SIP_USERNAME);
  set('password', import.meta.env.VITE_SIP_PASSWORD);
  set('displayName', import.meta.env.VITE_SIP_DISPLAY_NAME);
  set('wssUrl', import.meta.env.VITE_SIP_WSS_URL);
  set('domain', import.meta.env.VITE_SIP_DOMAIN);
  const ac = import.meta.env.VITE_SIP_AUTOCONNECT;
  if (ac === '1' || ac === 'true') o.autoConnect = true;
  return o;
}

export function defaultSipSettings(): SipSettings {
  const cfg = loadSipConfig();
  return { wssUrl: cfg.wssUrl, domain: cfg.domain, username: '', password: '', displayName: '', autoConnect: false, ...envSipOverrides() };
}

export function loadSipSettings(): SipSettings {
  try {
    const raw = localStorage.getItem(KEY);
    // Hardcoded VITE_SIP_* env creds are AUTHORITATIVE — applied last so they
    // override stale localStorage (e.g. an old account entered in the UI). A
    // tenant/demo build with baked creds then always registers the right account.
    if (raw) return { ...defaultSipSettings(), ...JSON.parse(raw), ...envSipOverrides() };
  } catch { /* corrupt/absent → defaults */ }
  return defaultSipSettings();
}

export function saveSipSettings(s: SipSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage disabled */ }
}

export function clearSipSettings(): void {
  try { localStorage.removeItem(KEY); } catch { /* storage disabled */ }
}

// Derive SIP registration creds from the logged-in account — NOT hardcoded.
// The AOR is sip:<username>@<domain> taken from the account email
// (`200@6174.nimbusip.com` → username `200`, domain `6174.nimbusip.com`), and
// the SIP password is the same password the user just authenticated with (the
// only point at which the plaintext is available — login verifies a bcrypt hash,
// so it can't be recovered later). The WSS endpoint (the SBC/FreeSWITCH ws
// binding) is NOT part of the account — it stays from config/env, since one SBC
// fronts many account domains. autoConnect is enabled so the phone REGISTERs
// right after login.
export function sipSettingsFromAccount(email: string, password: string, base?: SipSettings): SipSettings {
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
    autoConnect: true,
  };
}

// Derive SIP registration creds from the logged-in mothership USER object —
// mirrors voipappz-app's WebRTC phone, which registers from
// `user.extension.{username,password}` (the extension's own SIP secret) and
// `user.environment.{domain,wss_server}` (environment is at user level, not on
// the extension). The extension secret is preferred over the login password,
// and the environment's wss_server over the config/env WSS. Anything the user
// object doesn't carry falls back to `sipSettingsFromAccount` (email/password),
// so this degrades gracefully when the login response is sparse.
export function sipSettingsFromUser(user: any, loginPassword?: string, base?: SipSettings): SipSettings {
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

/** Enough config present to attempt a registration. */
export function sipSettingsReady(s: SipSettings): boolean {
  return Boolean(s.wssUrl && s.domain && s.username && s.password);
}
