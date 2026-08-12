// SipPhoneProvider — app-wide softphone state, mounted ABOVE the router so the
// SIP registration and any active call survive page navigation and an incoming
// call rings on whatever screen the user is on. Wraps the useSipPhone hook and
// the persisted Settings; the Phone UI consumes this via useSipPhoneCtx().
//
// RESILIENCE: the SIP/WebRTC layer (sip.js + RTCPeerConnection) must NEVER take
// the whole app down. The live phone runs inside SipPhoneLive, isolated behind an
// ErrorBoundary. If it throws while loading (no WebRTC support, sip.js init error,
// etc.) the boundary swaps in a DEGRADED context (status 'unavailable', no-op
// actions) and still renders the children — so Dashboard/Calls/Reports keep
// working and only the softphone is disabled.
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSipPhone } from '../lib/sip/useSipPhone';
import {
  loadSipSettings, saveSipSettings, clearSipSettings, defaultSipSettings,
  sipPhoneEnabled, sipSettingsReady,
} from '../lib/sip/sipSettings';
import { useAuth } from './AuthContext';
import ErrorBoundary from '../components/common/ErrorBoundary';

const SipPhoneContext = createContext(null);

export const useSipPhoneCtx = () => {
  const ctx = useContext(SipPhoneContext);
  if (!ctx) throw new Error('useSipPhoneCtx must be used within <SipPhoneProvider>');
  return ctx;
};

const noop = () => {};
const noopAsync = async () => {};

// Degraded context used when the SIP/WebRTC subsystem fails to load. Same shape
// as the live value so consumers (PhoneWidget) render without crashing — the
// softphone simply reports 'unavailable' and its actions are no-ops.
function degradedValue(settings, updateSettings, reason = 'WebRTC unavailable') {
  return {
    status: 'unavailable',
    unavailable: true,
    connected: false,
    call: null,
    muted: false,
    held: false,
    doNotDisturb: false,
    transfer: null,
    consult: null,
    networkAvailable: typeof navigator === 'undefined' || navigator.onLine !== false,
    lastError: reason,
    logs: [],
    settings,
    updateSettings,
    dial: noopAsync,
    answer: noopAsync,
    hangup: noopAsync,
    sendDtmf: noop,
    setMuted: noop,
    setHeld: noopAsync,
    setDoNotDisturb: noop,
    transferBlind: noopAsync,
    startAttendedTransfer: noopAsync,
    completeAttendedTransfer: noopAsync,
    cancelAttendedTransfer: noopAsync,
    clearLogs: noop,
    connect: noopAsync,
    disconnect: noopAsync,
  };
}

// The live softphone. Isolated so a throw here is caught by the boundary above
// instead of crashing the whole React tree.
function SipPhoneLive({ settings, setSettings, updateSettings, children }) {
  const phone = useSipPhone();
  const { isAuthenticated } = useAuth();

  const connect = useCallback(async (next) => {
    const s = next ?? settings;
    if (next) { setSettings(next); saveSipSettings(next); }
    if (!sipSettingsReady(s)) return;
    await phone.register(
      { username: s.username, password: s.password, domain: s.domain, displayName: s.displayName || s.username },
      { wssUrl: s.wssUrl, domain: s.domain },
    );
  }, [phone, settings, setSettings]);

  const disconnect = useCallback(async () => { await phone.unregister(); }, [phone]);

  // On logout: unregister the softphone and FORGET the account's SIP creds, so
  // the next user doesn't inherit them. (Login re-derives + re-registers from the
  // freshly entered credentials — see Login.js.)
  const wasAuthed = useRef(isAuthenticated);
  useEffect(() => {
    if (wasAuthed.current && !isAuthenticated) {
      clearSipSettings();
      setSettings(defaultSipSettings());
      phone.unregister().catch(() => { /* ignore */ });
    }
    wasAuthed.current = isAuthenticated;
  }, [isAuthenticated, phone, setSettings]);

  // Auto-connect when opted-in + creds present. Registers whenever the phone is
  // idle (not while connecting/registered/reconnecting). This is StrictMode-safe:
  // React's dev double-mount disposes the UA (status → idle), and this re-fires to
  // rebuild it — unlike a one-shot guard, which would leave it disconnected. On a
  // real registration failure status is 'failed' (not 'idle'), so it won't storm.
  //
  // NEVER while logged out. Without this guard a logged-out browser kept taking
  // calls, by two separate routes:
  //   1. defaultSipSettings() spreads envSipOverrides() LAST, so on a build with
  //      VITE_SIP_* creds baked in the "cleared" settings are still registerable.
  //   2. unregister() finishes with status 'idle' — the exact trigger below — so
  //      the teardown re-armed the very effect that undid it.
  // Registration is a property of being signed in; gate it on that, not on the
  // settings happening to be empty.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!settings.autoConnect || !sipSettingsReady(settings)) return;
    if (phone.status !== 'idle') return;
    connect(settings).catch(() => { /* surfaced via status */ });
  }, [isAuthenticated, settings, connect, phone.status]);

  const value = {
    ...phone,                       // status, call, muted, dial, answer, hangup, sendDtmf, setMuted
    connected: phone.status === 'registered',
    settings, updateSettings, connect, disconnect,
  };
  return <SipPhoneContext.Provider value={value}>{children}</SipPhoneContext.Provider>;
}

export function SipPhoneProvider({ children }) {
  const [settings, setSettings] = useState(() => loadSipSettings());
  const updateSettings = useCallback((next) => { setSettings(next); saveSipSettings(next); }, []);
  const enabled = sipPhoneEnabled();

  const degraded = useMemo(() => degradedValue(settings, updateSettings), [settings, updateSettings]);
  const disabled = useMemo(
    () => degradedValue(settings, updateSettings, 'Softphone disabled'),
    [settings, updateSettings],
  );

  // Some tenants expose only the mothership API + ActionCable event stream and
  // have no browser SIP/WebRTC endpoint. Do not mount the SIP hook at all in
  // that mode: no WebSocket attempt, registration, or reconnect timer can run.
  if (!enabled) {
    return <SipPhoneContext.Provider value={disabled}>{children}</SipPhoneContext.Provider>;
  }

  return (
    <ErrorBoundary
      label="sip"
      onError={(err) => console.error('[sip] softphone failed to load; running without it:', err)}
      fallback={() => (
        <SipPhoneContext.Provider value={degraded}>{children}</SipPhoneContext.Provider>
      )}
    >
      <SipPhoneLive settings={settings} setSettings={setSettings} updateSettings={updateSettings}>
        {children}
      </SipPhoneLive>
    </ErrorBoundary>
  );
}

export default SipPhoneProvider;
