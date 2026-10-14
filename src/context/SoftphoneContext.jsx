// SoftphoneProvider — app-wide softphone state, mounted ABOVE the router so the
// SIP registration and any active call survive page navigation and an incoming
// call rings on whatever screen the user is on. Wraps the useSipPhone hook and
// the persisted Settings; the Phone UI consumes this via useSoftphone().
//
// Ported from app's SipPhoneContext.jsx/SipPhoneProvider — renamed to avoid
// colliding with the PhoneContext this codebase used to have (an iframe embed
// of /tasks/webrtc, since removed: the admin console uses this phone too).
//
// RESILIENCE: the SIP/WebRTC layer (sip.js + RTCPeerConnection) must NEVER take
// the whole app down. The live phone runs inside SoftphoneLive, isolated behind
// a LOCAL error boundary (not this repo's shared ErrorBoundary — that renders a
// full-page "Oops!" screen, which is wrong here: the rest of the app must keep
// working). If it throws while loading (no WebRTC support, sip.js init error,
// etc.) the boundary swaps in a DEGRADED context (status 'unavailable', no-op
// actions) and still renders the children — so Dashboard/Calls/Reports keep
// working and only the softphone is disabled.
import { Component, createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSipPhone } from '../lib/sip/useSipPhone';
import { loadSipSettings, saveSipSettings, clearSipSettings, defaultSipSettings, sipSettingsReady, sipSettingsFromUser } from '../lib/sip/sipSettings';
import { useAuth } from './AuthContext';
import { useUserAuth } from './UserAuthContext';

const SoftphoneContext = createContext(null);

export const useSoftphone = () => {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) throw new Error('useSoftphone must be used within <SoftphoneProvider>');
  return ctx;
};

const noop = () => {};
const noopAsync = async () => {};

// Degraded context used when the SIP/WebRTC subsystem fails to load. Same shape
// as the live value so consumers (PhoneScreen) render without crashing — the
// softphone simply reports 'unavailable' and its actions are no-ops.
function degradedValue(settings, updateSettings) {
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
    lastError: 'WebRTC unavailable',
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
    disconnect: noopAsync
  };
}

// Minimal boundary local to the softphone — deliberately not this repo's
// shared <ErrorBoundary>, whose fallback replaces the ENTIRE page. This one
// only needs to swap in the degraded context above and keep rendering children.
class SoftphoneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.error('[softphone] failed to load; running without it:', error);
  }
  render() {
    return this.state.hasError ? this.props.fallback() : this.props.children;
  }
}

// The live softphone. Isolated so a throw here is caught by the boundary above
// instead of crashing the whole React tree.
function SoftphoneLive({ settings, setSettings, updateSettings, children }) {
  const phone = useSipPhone();
  const admin = useAuth();
  const user = useUserAuth();
  // Either session counts as "signed in" for the softphone's purposes — it's a
  // shared screen (see App.jsx's DualProtectedRoute), reachable from both surfaces.
  const isAuthenticated = admin.isAuthenticated || user.isAuthenticated;

  // `persist: false` registers without writing the creds to localStorage (and
  // drops any that were): an account signing the phone in as someone else's
  // device holds that device's SIP secret for this page only.
  const connect = useCallback(async (next, { persist = true } = {}) => {
    const s = next ?? settings;
    if (next) {
      setSettings(next);
      if (persist) saveSipSettings(next); else clearSipSettings();
    }
    if (!sipSettingsReady(s)) return;
    await phone.register(
      { username: s.username, password: s.password, domain: s.domain, displayName: s.displayName || s.username },
      { wssUrl: s.wssUrl, domain: s.domain }
    );
  }, [phone, settings, setSettings]);

  const disconnect = useCallback(async () => { await phone.unregister(); }, [phone]);

  // On logout (either surface): unregister the softphone and FORGET the
  // account's SIP creds, so the next signed-in user doesn't inherit them.
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
  // React's dev double-mount disposes the UA (status -> idle), and this re-fires
  // to rebuild it — unlike a one-shot guard, which would leave it disconnected.
  // On a real registration failure status is 'failed' (not 'idle'), so it won't
  // storm.
  //
  // NEVER while logged out. Without this guard a logged-out browser kept taking
  // calls, by two separate routes:
  //   1. builds once baked a SIP username and password into VITE_SIP_*, so the
  //      "cleared" settings were still registerable (no build can now: the
  //      env carries only the endpoint, see lib/sip/sipSettings.js).
  //   2. unregister() finishes with status 'idle' — the exact trigger below — so
  //      the teardown re-armed the very effect that undid it.
  // Registration is a property of being signed in; gate it on that, not on the
  // settings happening to be empty.
  useEffect(() => {
    if (!isAuthenticated) return;
    // A signed-in portal user owns an extension. Register the phone from the
    // same user/environment returned by login so the phone is assigned to the
    // person who opened the session, rather than asking them to sign in again.
    if (user.isAuthenticated && user.user?.extension && phone.status === 'idle') {
      const userSettings = sipSettingsFromUser(user.user, '', settings);
      if (sipSettingsReady(userSettings)) {
        connect(userSettings).catch(() => { /* surfaced via status */ });
        return;
      }
    }
    if (!settings.autoConnect || !sipSettingsReady(settings)) return;
    if (phone.status !== 'idle') return;
    connect(settings).catch(() => { /* surfaced via status */ });
  }, [isAuthenticated, settings, connect, phone.status]);

  const value = {
    ...phone,                       // status, call, muted, dial, answer, hangup, sendDtmf, setMuted
    connected: phone.status === 'registered',
    settings, updateSettings, connect, disconnect
  };
  return <SoftphoneContext.Provider value={value}>{children}</SoftphoneContext.Provider>;
}

export function SoftphoneProvider({ children }) {
  const [settings, setSettings] = useState(() => loadSipSettings());
  const updateSettings = useCallback((next) => { setSettings(next); saveSipSettings(next); }, []);

  const degraded = useMemo(() => degradedValue(settings, updateSettings), [settings, updateSettings]);

  return (
    <SoftphoneErrorBoundary fallback={() => (
      <SoftphoneContext.Provider value={degraded}>{children}</SoftphoneContext.Provider>
    )}>
      <SoftphoneLive settings={settings} setSettings={setSettings} updateSettings={updateSettings}>
        {children}
      </SoftphoneLive>
    </SoftphoneErrorBoundary>
  );
}

export default SoftphoneProvider;
