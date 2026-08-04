// useSipPhone — React port of the voipappz-app Angular softphone
// (core/providers/phone/webrtc-phone.ts). Faithfully carries over its production
// hardening: manual transport-reconnect with exponential backoff, re-register
// lifecycle, incoming-call x-va header handling + auto-answer + busy-reject, a
// sessions map, and DTMF with RTCDTMFSender fallback. FreeSWITCH terminates the
// WSS + DTLS-SRTP media; this is signaling + audio only.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Inviter, Invitation, Registerer, RegistererState, SessionState, TransportState,
  UserAgent, Web, type Session,
} from "sip.js";
import { loadSipConfig, type SipConfig } from "./config";

export type RegStatus = "idle" | "connecting" | "registered" | "unregistered" | "reconnecting" | "failed";
export interface CallInfo {
  id: string;
  direction: "inbound" | "outbound";
  remote: string;
  state: "ringing" | "connecting" | "active" | "ended";
  connectedAt?: number;
  failureReason?: string;
}
export type CallStateEvent =
  | { type: "start"; call: CallInfo }
  | { type: "ringing" | "connecting" | "established" | "terminated"; id: string; at?: number }
  | { type: "clear"; id: string };

// One canonical reducer owns the visible call lifecycle. SIP callbacks may
// arrive late or out of order; an event for an older UUID must never mutate the
// current call. This is the React equivalent of the portal's UUID-keyed
// activeCallsArray + serialized call-event handling.
export function reduceCallState(current: CallInfo | null, event: CallStateEvent): CallInfo | null {
  if (event.type === "start") return current && current.state !== "ended" ? current : event.call;
  if (!current || current.id !== event.id) return current;
  if (event.type === "ringing") return current.state === "connecting" ? { ...current, state: "ringing" } : current;
  if (event.type === "connecting") return current.state === "ringing" ? { ...current, state: "connecting" } : current;
  if (event.type === "established") return { ...current, state: "active", connectedAt: event.at ?? Date.now() };
  if (event.type === "terminated") return { ...current, state: "ended" };
  if (event.type === "clear") return current.state === "ended" ? null : current;
  return current;
}
export interface SipCredentials {
  username: string;
  password: string;
  domain?: string;
  displayName?: string;
}
export interface SipLogEntry {
  ts: number;
  level: string;     // debug | log | warn | error
  category: string;  // SIP.js logger category (e.g. sip.Transport)
  content: string;
}

const AUDIO_CONSTRAINTS = { audio: true, video: false };
const genId = () => `c-${Math.random().toString(36).slice(2)}-${performance.now().toString(36)}`;

// Remote audio → hidden <audio>. Matches webrtc-phone.ts setupRemoteAudio:
// collect receiver tracks into a MediaStream and play.
function setupRemoteAudio(session: Session, audioEl: HTMLAudioElement) {
  const pc = (session.sessionDescriptionHandler as any)?.peerConnection as RTCPeerConnection | undefined;
  if (!pc) return;
  const remote = new MediaStream();
  pc.getReceivers().forEach((r) => { if (r.track) remote.addTrack(r.track); });
  audioEl.srcObject = remote;
  audioEl.play().catch(() => { /* autoplay may defer until a user gesture */ });
}

export function useSipPhone(overrides: Partial<SipConfig> = {}) {
  const [status, setStatus] = useState<RegStatus>("idle");
  const [call, setCall] = useState<CallInfo | null>(null);
  const [muted, setMutedState] = useState(false);
  const [held, setHeldState] = useState(false);
  const [doNotDisturb, setDoNotDisturbState] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [networkAvailable, setNetworkAvailable] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);

  const uaRef = useRef<UserAgent | null>(null);
  const regRef = useRef<Registerer | null>(null);
  const sessionsRef = useRef<Map<string, Session>>(new Map());  // keyed by ctxid (uuid)
  const invitationRef = useRef<Invitation | null>(null);        // current ringing inbound
  const answeringRef = useRef(false);                           // guards double-click accept
  const hangupRequestedRef = useRef<Set<string>>(new Set());    // hangup while accept is settling
  const activeIdRef = useRef<string | null>(null);              // ctxSip.callActiveID
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dndRef = useRef(false);
  const networkAvailableRef = useRef(typeof navigator === "undefined" || navigator.onLine !== false);
  const uaGenerationRef = useRef(0);
  const holdChangingRef = useRef(false);

  // Reconnect state (mirrors webrtc-phone.ts lines 50–56).
  const credsRef = useRef<SipCredentials | null>(null);
  const cfgRef = useRef<SipConfig>(loadSipConfig(overrides));
  const manualDisconnect = useRef(false);
  const reconnectAttempts = useRef(0);
  const isReconnecting = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SIP.js log capture — SIP.js calls `logConnector` for every log line; we keep
  // the last N in a ring buffer and surface them in the phone's Logs tab. State
  // updates are throttled (≤4/s) so a chatty DEBUG stream during a call doesn't
  // thrash React.
  const [logs, setLogs] = useState<SipLogEntry[]>([]);
  const logsRef = useRef<SipLogEntry[]>([]);
  const logFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addLog = useCallback((level: string, category: string, content: unknown) => {
    logsRef.current = [...logsRef.current, { ts: Date.now(), level, category: String(category || ""), content: String(content) }].slice(-300);
    if (!logFlushTimer.current) {
      logFlushTimer.current = setTimeout(() => { logFlushTimer.current = null; setLogs(logsRef.current); }, 250);
    }
  }, []);
  const clearLogs = useCallback(() => { logsRef.current = []; setLogs([]); }, []);
  const reportError = useCallback((category: string, error: unknown, fallback: string) => {
    const message = error instanceof Error && error.message ? error.message : fallback;
    setLastError(message);
    addLog("error", category, message);
    return message;
  }, [addLog]);

  useEffect(() => {
    const el = document.createElement("audio");
    el.autoplay = true; el.style.display = "none";
    document.body.appendChild(el);
    audioRef.current = el;
    return () => { el.remove(); audioRef.current = null; };
  }, []);

  // Wire a session's lifecycle (in or out). Stores in the sessions map by ctxid,
  // attaches media on Established, cleans up on Terminated.
  const wireSession = useCallback((session: Session, info: CallInfo) => {
    (session as any).ctxid = info.id;
    sessionsRef.current.set(info.id, session);
    setCall((current) => reduceCallState(current, { type: "start", call: info }));
    session.stateChange.addListener((state: SessionState) => {
      if (state === SessionState.Established) {
        setLastError(null);
        activeIdRef.current = info.id;
        if (invitationRef.current && (invitationRef.current as any).ctxid === info.id) invitationRef.current = null;
        if (audioRef.current) setupRemoteAudio(session, audioRef.current);
        setCall((c) => reduceCallState(c, { type: "established", id: info.id }));
        if (hangupRequestedRef.current.delete(info.id)) void (session as any).bye().catch(() => {});
      } else if (state === SessionState.Terminated) {
        sessionsRef.current.delete(info.id);
        hangupRequestedRef.current.delete(info.id);
        if (activeIdRef.current === info.id) activeIdRef.current = null;
        if (invitationRef.current && (invitationRef.current as any).ctxid === info.id) invitationRef.current = null;
        setMutedState(false);
        setHeldState(false);
        setCall((c) => reduceCallState(c, { type: "terminated", id: info.id }));
        setTimeout(() => setCall((c) => reduceCallState(c, { type: "clear", id: info.id })), 1200);
      }
    });
  }, []);

  // Incoming INVITE — port of handleIncomingCall (lines 851–891).
  const handleIncomingCall = useCallback((invitation: Invitation) => {
    const callUuid = invitation.request.getHeader("x-va-call-uuid") || genId();
    const vaMeta = invitation.request.getHeader("x-va-meta") || "";
    const from = invitation.request.getHeader("from") || "";
    const m = from.match(/<sip:([^@>]+)/);
    const remote = m ? m[1] : (invitation.remoteIdentity?.uri?.user || "unknown");
    (invitation as any).ctxid = callUuid;

    // Busy / reject-all → 486-style reject (lines 869–877).
    if (dndRef.current || activeIdRef.current || sessionsRef.current.size > 0) {
      invitation.reject().catch(() => {});
      addLog("log", "sip.Invitation", dndRef.current ? "incoming call rejected: do not disturb" : "incoming call rejected: busy");
      return;
    }

    invitationRef.current = invitation;
    activeIdRef.current = callUuid;
    wireSession(invitation, { id: callUuid, direction: "inbound", remote, state: "ringing" });

    if (vaMeta === "auto_answer") {
      invitation.accept({ sessionDescriptionHandlerOptions: { constraints: AUDIO_CONSTRAINTS } })
        .then(() => setCall((c) => reduceCallState(c, { type: "connecting", id: callUuid })))
        .catch((error) => { reportError("sip.Invitation", error, "Auto-answer failed"); });
    }
  }, [wireSession, addLog, reportError]);

  // Reconnect (lines 807–849). Exponential backoff = delay * attempt, capped at max.
  const cancelReconnect = useCallback(() => {
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    isReconnecting.current = false;
    reconnectAttempts.current = 0;
  }, []);

  const buildUA = useCallback(async () => {
    const creds = credsRef.current;
    const cfg = cfgRef.current;
    if (!creds || manualDisconnect.current) return;
    if (!networkAvailableRef.current) {
      setStatus("unregistered");
      setLastError("Network offline");
      return;
    }
    const generation = ++uaGenerationRef.current;
    // WebRTC must be available (secure context + browser support). If it isn't,
    // fail cleanly to 'failed' rather than throwing — the softphone is optional
    // and must never break the rest of the app.
    // getUserMedia has to be checked SEPARATELY from RTCPeerConnection. Over
    // plain http on a LAN/public IP the browser still defines
    // RTCPeerConnection, but drops navigator.mediaDevices — so this guard
    // passed, REGISTER succeeded, the phone sat there saying "Available", and
    // then every call failed at mic acquisition. Both directions: accept() and
    // dial() each pass AUDIO_CONSTRAINTS. Refuse up front and say why, instead
    // of registering into a phone that cannot take a call.
    const micUnavailable = typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia;
    if (typeof RTCPeerConnection === "undefined" || typeof WebSocket === "undefined" || micUnavailable) {
      const insecure = typeof window !== "undefined" && window.isSecureContext === false;
      const why = insecure
        ? `insecure context (${window.location.origin}) — the microphone needs HTTPS or localhost`
        : "WebRTC unavailable or unsupported browser";
      addLog("error", "sip.WebRTC", `${why}; softphone disabled`);
      setLastError(insecure
        ? "Microphone blocked: open the app over HTTPS or on localhost"
        : "WebRTC is unavailable in this browser");
      setStatus("failed");
      return;
    }
    const domain = creds.domain || cfg.domain;
    const uri = UserAgent.makeURI(`sip:${creds.username}@${domain}`);
    if (!uri) { setLastError("Invalid SIP address"); setStatus("failed"); return; }

    // A reconnect replaces the previous UA. Generation checks below ensure
    // late events from the stopped transport cannot mutate the new one.
    const previousRegisterer = regRef.current;
    const previousUa = uaRef.current;
    regRef.current = null;
    uaRef.current = null;
    try { await previousRegisterer?.unregister(); } catch { /* already disconnected */ }
    try { await previousUa?.stop(); } catch { /* already disconnected */ }

    let ua: UserAgent;
    try {
      ua = new UserAgent({
        uri,
        transportOptions: { server: cfg.wssUrl },
        authorizationUsername: String(creds.username),
        authorizationPassword: creds.password,
        displayName: creds.displayName,
        // Capture SIP.js logs at debug into the phone's Logs tab. Built-in console
        // output stays at the configured level so dev tooling is unaffected.
        logLevel: "debug",
        logBuiltinEnabled: cfg.logLevel === "debug",
        logConnector: (level: string, category: string, _label: string | undefined, content: unknown) => addLog(level, category, content),
        sessionDescriptionHandlerFactoryOptions: { peerConnectionConfiguration: { iceServers: cfg.iceServers } },
        delegate: { onInvite: (invitation: Invitation) => handleIncomingCall(invitation) },
      });
    } catch (err) {
      reportError("sip.UserAgent", err, "Failed to create SIP user agent");
      setStatus("failed");
      return;
    }
    uaRef.current = ua;

    // Manual reconnect on unexpected transport drops (webrtc-phone.ts 723–755).
    ua.transport.stateChange.addListener((tstate: TransportState) => {
      if (generation !== uaGenerationRef.current) return;
      if (tstate === TransportState.Connected) {
        manualDisconnect.current = false;
        cancelReconnect();
      } else if (tstate === TransportState.Disconnected && !manualDisconnect.current) {
        attemptReconnect();
      }
    });

    try {
      await ua.start();
    } catch (error) {
      if (generation === uaGenerationRef.current) {
        reportError("sip.Transport", error, "Unable to connect to the SIP server");
        setStatus("failed");
      }
      return;
    }
    if (generation !== uaGenerationRef.current || manualDisconnect.current) { try { await ua.stop(); } catch { /* stale */ } return; }

    const registerer = new Registerer(ua, { expires: cfg.registerExpires });
    regRef.current = registerer;
    registerer.stateChange.addListener((s: RegistererState) => {
      if (generation !== uaGenerationRef.current) return;
      if (s === RegistererState.Registered) {
        setLastError(null);
        setStatus("registered");
        // Pre-prompt mic so the first call doesn't stall on permission.
        // NB: optional chaining yields undefined when mediaDevices is missing,
        // and `.then` on undefined throws a TypeError right here — inside a
        // listener, where it is invisible. Call it only when it exists.
        void navigator.mediaDevices?.getUserMedia?.({ audio: true })
          ?.then((st) => st.getTracks().forEach((t) => t.stop()))
          ?.catch((error) => { reportError("sip.Media", error, "Microphone permission or device unavailable"); });
      } else if (s === RegistererState.Unregistered) {
        setStatus("unregistered");
      }
    });
    try {
      await registerer.register();
    } catch (error) {
      if (generation === uaGenerationRef.current) {
        reportError("sip.Registerer", error, "SIP registration failed");
        setStatus("failed");
      }
    }
  }, [handleIncomingCall, cancelReconnect, addLog, reportError]);

  const attemptReconnect = useCallback(() => {
    const cfg = cfgRef.current;
    if (isReconnecting.current || !networkAvailableRef.current || manualDisconnect.current) return;
    if (cfg.reconnectMax <= 0 || reconnectAttempts.current >= cfg.reconnectMax) {
      setStatus("failed");
      return;
    }
    isReconnecting.current = true;
    reconnectAttempts.current += 1;
    setStatus("reconnecting");
    const delay = cfg.reconnectDelayMs * reconnectAttempts.current; // exponential backoff
    reconnectTimer.current = setTimeout(async () => {
      isReconnecting.current = false;
      if (credsRef.current) { try { await buildUA(); } catch { attemptReconnect(); } }
    }, delay);
  }, [buildUA]);

  const register = useCallback(async (creds: SipCredentials, cfgOverrides: Partial<SipConfig> = {}) => {
    credsRef.current = creds;
    cfgRef.current = loadSipConfig({ ...overrides, ...cfgOverrides });
    manualDisconnect.current = false;
    cancelReconnect();
    setLastError(null);
    setStatus("connecting");
    await buildUA();
  }, [overrides, buildUA, cancelReconnect]);

  const unregister = useCallback(async () => {
    manualDisconnect.current = true;      // suppress auto-reconnect (lines 133–150)
    uaGenerationRef.current++;
    cancelReconnect();
    try { await regRef.current?.unregister(); } catch { /* ignore */ }
    try { await uaRef.current?.stop(); } catch { /* ignore */ }
    regRef.current = null; uaRef.current = null;
    sessionsRef.current.clear();
    hangupRequestedRef.current.clear();
    answeringRef.current = false;
    activeIdRef.current = null; invitationRef.current = null;
    setCall(null);
    setMutedState(false);
    setHeldState(false);
    setLastError(null);
    setStatus("idle");
  }, [cancelReconnect]);

  const dial = useCallback(async (target: string, cfgOverrides: Partial<SipConfig> = {}) => {
    const ua = uaRef.current;
    if (!networkAvailableRef.current) throw new Error("network offline");
    if (!ua || status !== "registered") throw new Error("not registered");
    if (activeIdRef.current || sessionsRef.current.size > 0) throw new Error("call already in progress");
    const cfg = loadSipConfig({ ...overrides, ...cfgOverrides });
    const id = genId();
    const targetUri = UserAgent.makeURI(target.startsWith("sip:") ? target : `sip:${target}@${cfg.domain}`);
    if (!targetUri) throw new Error(`invalid dial target: ${target}`);
    const inviter = new Inviter(ua, targetUri, {
      sessionDescriptionHandlerOptions: { constraints: AUDIO_CONSTRAINTS },
      extraHeaders: [`X-Va-Call-Uuid: ${id}`, "X-Va-Call-Direction: outgoing"],
    });
    // Reserve the phone immediately. Waiting for Established allowed a second
    // outgoing call while the first INVITE was still ringing.
    activeIdRef.current = id;
    wireSession(inviter, { id, direction: "outbound", remote: target, state: "connecting" });
    try {
      await inviter.invite();
      setCall((c) => reduceCallState(c, { type: "ringing", id }));
    } catch (error) {
      sessionsRef.current.delete(id);
      if (activeIdRef.current === id) activeIdRef.current = null;
      setCall((c) => reduceCallState(c, { type: "terminated", id }));
      setTimeout(() => setCall((c) => reduceCallState(c, { type: "clear", id })), 1200);
      const reason = reportError("sip.Inviter", error, "Call could not be started");
      setCall((c) => c?.id === id ? { ...c, failureReason: reason } : c);
      throw error;
    }
  }, [overrides, wireSession, status, reportError]);

  const answer = useCallback(async () => {
    const inv = invitationRef.current;
    if (!inv || answeringRef.current) return;
    const id = (inv as any).ctxid as string;
    answeringRef.current = true;
    setCall((c) => reduceCallState(c, { type: "connecting", id }));
    try {
      await inv.accept({ sessionDescriptionHandlerOptions: { constraints: AUDIO_CONSTRAINTS } });
    } catch (error) {
      setCall((c) => reduceCallState(c, { type: "ringing", id }));
      reportError("sip.Invitation", error, "Call could not be answered");
      throw error;
    } finally {
      answeringRef.current = false;
    }
  }, [reportError]);

  const hangup = useCallback(async () => {
    const id = activeIdRef.current || call?.id;
    const session = id ? sessionsRef.current.get(id) : null;
    const inv = invitationRef.current;
    try {
      if (session && session.state === SessionState.Established) await (session as any).bye();
      else if (session instanceof Inviter && session.state !== SessionState.Terminated) await session.cancel();
      else if (inv && inv.state === SessionState.Initial) await inv.reject();
      else if (session && session.state !== SessionState.Terminated && id) hangupRequestedRef.current.add(id);
    } catch (error) { reportError("sip.Session", error, "Call could not be ended cleanly"); }
  }, [call, reportError]);

  // DTMF — sdh.sendDtmf, else RTCDTMFSender fallback (lines 103–122).
  const sendDtmf = useCallback((tone: string) => {
    const id = activeIdRef.current;
    const session = id ? sessionsRef.current.get(id) : null;
    const sdh = session?.sessionDescriptionHandler as any;
    if (!sdh) return;
    if (sdh.sendDtmf) { sdh.sendDtmf(tone); return; }
    const pc = sdh.peerConnection as RTCPeerConnection | undefined;
    const sender = pc?.getSenders().find((s) => s.track?.kind === "audio");
    sender?.dtmf?.insertDTMF(tone, 100, 70);
  }, []);

  const setMuted = useCallback((value: boolean) => {
    const id = activeIdRef.current;
    const pc = (id && sessionsRef.current.get(id)?.sessionDescriptionHandler as any)?.peerConnection as RTCPeerConnection | undefined;
    pc?.getSenders().forEach((s) => { if (s.track?.kind === "audio") s.track.enabled = !value; });
    setMutedState(value);
  }, []);

  const setHeld = useCallback(async (value: boolean) => {
    const id = activeIdRef.current;
    const session = id ? sessionsRef.current.get(id) : null;
    if (!session || session.state !== SessionState.Established || holdChangingRef.current) return;
    holdChangingRef.current = true;
    try {
      await session.invite({ sessionDescriptionHandlerModifiers: value ? [Web.holdModifier] : [] });
      setHeldState(value);
      setLastError(null);
    } catch (error) {
      reportError("sip.Session", error, value ? "Call could not be put on hold" : "Call could not be resumed");
      throw error;
    } finally {
      holdChangingRef.current = false;
    }
  }, [reportError]);

  const setDoNotDisturb = useCallback((value: boolean) => {
    dndRef.current = value;
    setDoNotDisturbState(value);
  }, []);

  // Browser network transitions are authoritative for reconnect scheduling.
  // Going offline cancels retry storms; coming online starts one clean rebuild.
  useEffect(() => {
    const offline = () => {
      networkAvailableRef.current = false;
      setNetworkAvailable(false);
      cancelReconnect();
      setLastError("Network offline");
      if (!manualDisconnect.current) setStatus("unregistered");
    };
    const online = () => {
      networkAvailableRef.current = true;
      setNetworkAvailable(true);
      setLastError(null);
      if (!manualDisconnect.current && credsRef.current) {
        setStatus("reconnecting");
        void buildUA();
      }
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [buildUA, cancelReconnect]);

  useEffect(() => () => { void unregister(); }, [unregister]);

  return {
    status, call, muted, held, doNotDisturb, networkAvailable, lastError,
    register, unregister, dial, answer, hangup, sendDtmf, setMuted,
    setHeld, setDoNotDisturb, logs, clearLogs,
  };
}
