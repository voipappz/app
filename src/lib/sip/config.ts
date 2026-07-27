// SIP softphone configuration — fully env-driven, NO tenant endpoint baked in.
// The WSS endpoint normally arrives from the logged-in user's environment
// (mothership `wss_server`); VITE_SIP_* is the env override for dev/demo
// builds. With neither, the softphone simply stays unconfigured (settings not
// "ready" → no registration attempt). Per-call overrides via useSipPhone().

export interface SipConfig {
  /** WSS signaling URL (FreeSWITCH ws-binding). */
  wssUrl: string;
  /** SIP domain for the AOR (sip:<user>@<domain>). Empty → derive from wssUrl host. */
  domain: string;
  /** ICE servers for the media (DTLS-SRTP) path. */
  iceServers: RTCIceServer[];
  /** REGISTER refresh interval (seconds). */
  registerExpires: number;
  /** sip.js log level. */
  logLevel: "debug" | "warn" | "error";
  /** Max auto-reconnect attempts after an unexpected transport drop (0 disables). */
  reconnectMax: number;
  /** Base reconnect delay (ms); backoff = delay * attempt (matches voipappz-app). */
  reconnectDelayMs: number;
}

// VITE_SIP_ICE, when set, is a JSON array of RTCIceServer objects and fully
// replaces the default list — so STUN/TURN (e.g. the stack's own coturn) is
// configured without a rebuild of this file.
function parseIce(): RTCIceServer[] {
  const raw = (import.meta.env.VITE_SIP_ICE as string | undefined)?.trim();
  if (raw) {
    try { return JSON.parse(raw) as RTCIceServer[]; }
    catch { console.warn("VITE_SIP_ICE is not valid JSON — using default ICE servers"); }
  }
  // Default STUN is the public vendor-neutral Google server; set VITE_SIP_STUN
  // (or VITE_SIP_ICE) to use the tenant's own STUN/TURN.
  const stun = (import.meta.env.VITE_SIP_STUN as string | undefined) || "stun:stun.l.google.com:19302";
  const servers: RTCIceServer[] = [{ urls: [stun] }];
  // Optional single TURN via discrete env vars (kept simple; use VITE_SIP_ICE for more).
  const turnUrls = (import.meta.env.VITE_SIP_TURN_URLS as string | undefined)?.trim();
  if (turnUrls) {
    servers.push({
      urls: turnUrls.split(",").map((u) => u.trim()).filter(Boolean),
      username: (import.meta.env.VITE_SIP_TURN_USERNAME as string | undefined) || undefined,
      credential: (import.meta.env.VITE_SIP_TURN_CREDENTIAL as string | undefined) || undefined,
    });
  }
  return servers;
}

function hostFromWss(wss: string): string {
  try { return new URL(wss).hostname; } catch { return ""; }
}

export function loadSipConfig(overrides: Partial<SipConfig> = {}): SipConfig {
  const wssUrl = overrides.wssUrl
    || (import.meta.env.VITE_SIP_WSS_URL as string | undefined)
    || "";
  const domain = overrides.domain
    || (import.meta.env.VITE_SIP_DOMAIN as string | undefined)
    || hostFromWss(wssUrl);
  return {
    wssUrl,
    domain,
    iceServers: overrides.iceServers || parseIce(),
    registerExpires: overrides.registerExpires
      ?? parseInt((import.meta.env.VITE_SIP_REGISTER_EXPIRES as string | undefined) || "300", 10),
    logLevel: overrides.logLevel
      || ((import.meta.env.VITE_SIP_LOG_LEVEL as SipConfig["logLevel"] | undefined) || "warn"),
    reconnectMax: overrides.reconnectMax
      ?? parseInt((import.meta.env.VITE_SIP_RECONNECT_MAX as string | undefined) || "5", 10),
    reconnectDelayMs: overrides.reconnectDelayMs
      ?? parseInt((import.meta.env.VITE_SIP_RECONNECT_DELAY_MS as string | undefined) || "3000", 10),
  };
}
