// useSipPhone — React port of the voipappz-app Angular softphone
// (core/providers/phone/webrtc-phone.ts). Faithfully carries over its production
// hardening: manual transport-reconnect with exponential backoff, re-register
// lifecycle, incoming-call x-va header handling + auto-answer + busy-reject, a
// sessions map, and DTMF with RTCDTMFSender fallback. FreeSWITCH terminates the
// WSS + DTLS-SRTP media; this is signaling + audio only.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Inviter, Invitation, Registerer, RegistererState, SessionState, TransportState,
  UserAgent, type Session,
} from "sip.js";
import { loadSipConfig, type SipConfig } from "./config";

export type RegStatus = "idle" | "connecting" | "registered" | "unregistered" | "reconnecting" | "failed";
export interface CallInfo {
  id: string;
  direction: "inbound" | "outbound";
  remote: string;
  state: "ringing" | "connecting" | "active" | "ended";
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

  const uaRef = useRef<UserAgent | null>(null);
  const regRef = useRef<Registerer | null>(null);
  const sessionsRef = useRef<Map<string, Session>>(new Map());  // keyed by ctxid (uuid)
  const invitationRef = useRef<Invitation | null>(null);        // current ringing inbound
  const activeIdRef = useRef<string | null>(null);              // ctxSip.callActiveID
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    setCall(info);
    session.stateChange.addListener((state: SessionState) => {
      if (state === SessionState.Established) {
        activeIdRef.current = info.id;
        if (audioRef.current) setupRemoteAudio(session, audioRef.current);
        setCall((c) => (c?.id === info.id ? { ...c, state: "active" } : c));
      } else if (state === SessionState.Terminated) {
        sessionsRef.current.delete(info.id);
        if (activeIdRef.current === info.id) activeIdRef.current = null;
        if (invitationRef.current && (invitationRef.current as any).ctxid === info.id) invitationRef.current = null;
        setMutedState(false);
        setCall((c) => (c?.id === info.id ? { ...c, state: "ended" } : c));
        setTimeout(() => setCall((c) => (c?.id === info.id && c.state === "ended" ? null : c)), 1200);
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
    if (activeIdRef.current) { invitation.reject().catch(() => {}); return; }

    invitationRef.current = invitation;
    activeIdRef.current = callUuid;
    wireSession(invitation, { id: callUuid, direction: "inbound", remote, state: "ringing" });

    if (vaMeta === "auto_answer") {
      invitation.accept({ sessionDescriptionHandlerOptions: { constraints: AUDIO_CONSTRAINTS } })
        .then(() => setCall((c) => (c?.id === callUuid ? { ...c, state: "connecting" } : c)))
        .catch(() => {});
    }
  }, [wireSession]);

  // Reconnect (lines 807–849). Exponential backoff = delay * attempt, capped at max.
  const cancelReconnect = useCallback(() => {
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    isReconnecting.current = false;
    reconnectAttempts.current = 0;
  }, []);

  const buildUA = useCallback(async () => {
    const creds = credsRef.current;
    const cfg = cfgRef.current;
    if (!creds) return;
    const domain = creds.domain || cfg.domain;
    const uri = UserAgent.makeURI(`sip:${creds.username}@${domain}`);
    if (!uri) { setStatus("failed"); return; }

    const ua = new UserAgent({
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
    uaRef.current = ua;

    // Manual reconnect on unexpected transport drops (webrtc-phone.ts 723–755).
    ua.transport.stateChange.addListener((tstate: TransportState) => {
      if (tstate === TransportState.Connected) {
        manualDisconnect.current = false;
        cancelReconnect();
      } else if (tstate === TransportState.Disconnected && !manualDisconnect.current) {
        attemptReconnect();
      }
    });

    await ua.start();

    const registerer = new Registerer(ua, { expires: cfg.registerExpires });
    regRef.current = registerer;
    registerer.stateChange.addListener((s: RegistererState) => {
      if (s === RegistererState.Registered) {
        setStatus("registered");
        // Pre-prompt mic so the first call doesn't stall on permission.
        navigator.mediaDevices?.getUserMedia?.({ audio: true }).then((st) => st.getTracks().forEach((t) => t.stop())).catch(() => {});
      } else if (s === RegistererState.Unregistered) {
        setStatus("unregistered");
      }
    });
    await registerer.register().catch(() => setStatus("failed"));
  }, [handleIncomingCall, cancelReconnect]);

  const attemptReconnect = useCallback(() => {
    const cfg = cfgRef.current;
    if (isReconnecting.current) return;
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
    setStatus("connecting");
    await buildUA();
  }, [overrides, buildUA, cancelReconnect]);

  const unregister = useCallback(async () => {
    manualDisconnect.current = true;      // suppress auto-reconnect (lines 133–150)
    cancelReconnect();
    try { await regRef.current?.unregister(); } catch { /* ignore */ }
    try { await uaRef.current?.stop(); } catch { /* ignore */ }
    regRef.current = null; uaRef.current = null;
    sessionsRef.current.clear();
    activeIdRef.current = null; invitationRef.current = null;
    setStatus("idle");
  }, [cancelReconnect]);

  const dial = useCallback(async (target: string, cfgOverrides: Partial<SipConfig> = {}) => {
    const ua = uaRef.current;
    if (!ua) throw new Error("not registered");
    const cfg = loadSipConfig({ ...overrides, ...cfgOverrides });
    const id = genId();
    const targetUri = UserAgent.makeURI(target.startsWith("sip:") ? target : `sip:${target}@${cfg.domain}`);
    if (!targetUri) throw new Error(`invalid dial target: ${target}`);
    const inviter = new Inviter(ua, targetUri, {
      sessionDescriptionHandlerOptions: { constraints: AUDIO_CONSTRAINTS },
      extraHeaders: [`X-Va-Call-Uuid: ${id}`, "X-Va-Call-Direction: outgoing"],
    });
    wireSession(inviter, { id, direction: "outbound", remote: target, state: "connecting" });
    await inviter.invite();
    setCall((c) => (c?.id === id ? { ...c, state: "ringing" } : c));
  }, [overrides, wireSession]);

  const answer = useCallback(async () => {
    const inv = invitationRef.current;
    if (!inv) return;
    await inv.accept({ sessionDescriptionHandlerOptions: { constraints: AUDIO_CONSTRAINTS } });
    setCall((c) => (c ? { ...c, state: "connecting" } : c));
  }, []);

  const hangup = useCallback(async () => {
    const id = activeIdRef.current || call?.id;
    const session = id ? sessionsRef.current.get(id) : null;
    const inv = invitationRef.current;
    try {
      if (session && session.state === SessionState.Established) await (session as any).bye();
      else if (session instanceof Inviter && session.state !== SessionState.Terminated) await session.cancel();
      else if (inv && inv.state === SessionState.Initial) await inv.reject();
    } catch { /* already terminating */ }
  }, [call]);

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

  useEffect(() => () => { void unregister(); }, [unregister]);

  return { status, call, muted, register, unregister, dial, answer, hangup, sendDtmf, setMuted, logs, clearLogs };
}
