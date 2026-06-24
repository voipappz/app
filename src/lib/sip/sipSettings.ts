// SIP softphone settings — what the Settings tab edits and persists locally.
// Defaults come from VITE_SIP_* (see ./config.ts), so a fresh install already
// points at the verified switch.voipappz.io endpoint; the user only fills in
// their extension credentials. Later these can be auto-populated from the account.
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

/** Enough config present to attempt a registration. */
export function sipSettingsReady(s: SipSettings): boolean {
  return Boolean(s.wssUrl && s.domain && s.username && s.password);
}
