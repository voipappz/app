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
import { loadSipSettings, saveSipSettings, clearSipSettings, defaultSipSettings } from '../lib/sip/sipSettings';
import { fetchPhoneToken, sipSettingsFromPhoneToken, refreshDelayMs, withRetry, isPermanentTokenError } from '../lib/sip/phoneToken';
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
    disconnect: noopAsync,
    signInDevice: noopAsync
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
//
// CREDENTIALS. The phone registers ONLY from the short-lived JWT the API
// issues for a device (GET /api/devices/:uuid/phone, lib/sip/phoneToken.js).
// What is remembered across a page reload is the device uuid, never the
// password: on reload the phone asks for a fresh token with it. A token is
// renewed REFRESH_BEFORE_S before it expires; a failed fetch is retried with
// backoff, and a refused one (401/403/404) stops and says why.
function SoftphoneLive({ settings, setSettings, children }) {
  const phone = useSipPhone();
  const admin = useAuth();
  const user = useUserAuth();
  // Either session counts as "signed in" for the softphone's purposes — it's a
  // shared screen (see App.jsx's DualProtectedRoute), reachable from both surfaces.
  const isAuthenticated = admin.isAuthenticated || user.isAuthenticated;
  const [tokenError, setTokenError] = useState('');

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const authedRef = useRef(isAuthenticated);
  authedRef.current = isAuthenticated;
  // Bumped by every sign-in and by sign-out: a fetch or refresh that belongs
  // to an older generation drops its result.
  const genRef = useRef(0);
  const refreshTimer = useRef(null);
  const inFlight = useRef(false);
  const failedFor = useRef(null);
  // Set by Disconnect: the phone went idle because someone asked it to, so
  // auto sign-in must not undo that. Cleared by the next sign-in.
  const heldOff = useRef(false);

  const stopRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
  }, []);

  const register = useCallback(async (s) => {
    await phone.register(
      { username: s.username, password: s.password, domain: s.domain, displayName: s.displayName || s.username },
      { wssUrl: s.wssUrl, domain: s.domain }
    );
  }, [phone]);

  const scheduleRefresh = useCallback((gen, deviceUuid, exp, persist) => {
    stopRefresh();
    const run = async () => {
      if (gen !== genRef.current || !authedRef.current) return;
      try {
        const token = await withRetry(() => fetchPhoneToken(deviceUuid), {
          shouldStop: () => gen !== genRef.current || !authedRef.current
        });
        if (gen !== genRef.current) return;
        const prev = settingsRef.current;
        const next = sipSettingsFromPhoneToken(token, prev);
        setSettings(next);
        if (persist) saveSipSettings(next);
        setTokenError('');
        // Same account on the same server: the registration carries on. A
        // rotated password or a moved server needs a new registration.
        const changed = ['username', 'password', 'domain', 'wssUrl'].some((k) => next[k] !== prev[k]);
        if (changed) await register(next);
        scheduleRefresh(gen, deviceUuid, next.tokenExp, persist);
      } catch (err) {
        if (gen !== genRef.current) return;
        setTokenError(err?.message || 'Could not renew the phone sign-in');
        // A refused renewal is final; anything else is tried again shortly.
        if (!isPermanentTokenError(err)) {
          refreshTimer.current = setTimeout(run, 30000);
        }
      }
    };
    refreshTimer.current = setTimeout(run, refreshDelayMs(exp));
  }, [register, setSettings, stopRefresh]);

  // Sign the phone in as a device. `persist: false` keeps even the device uuid
  // out of localStorage (an account signing in as someone else's device holds
  // it for this page only). `authorization` fetches the first token with a
  // different credential (a user's login the account just made); renewals use
  // the session's own.
  const signInDevice = useCallback(async (deviceUuid, { persist = true, authorization } = {}) => {
    const gen = ++genRef.current;
    stopRefresh();
    heldOff.current = false;
    inFlight.current = true;
    setTokenError('');
    try {
      const token = await withRetry(() => fetchPhoneToken(deviceUuid, { authorization }), {
        shouldStop: () => gen !== genRef.current
      });
      if (gen !== genRef.current) return;
      const next = sipSettingsFromPhoneToken(token, settingsRef.current);
      setSettings(next);
      if (persist) saveSipSettings(next); else clearSipSettings();
      failedFor.current = null;
      await register(next);
      scheduleRefresh(gen, next.deviceUuid || deviceUuid, next.tokenExp, persist);
    } catch (err) {
      if (gen === genRef.current) {
        failedFor.current = deviceUuid;
        setTokenError(err?.message || 'Could not sign the phone in');
      }
      throw err;
    } finally {
      if (gen === genRef.current) inFlight.current = false;
    }
  }, [register, scheduleRefresh, setSettings, stopRefresh]);

  // Reconnect as the device the phone already holds.
  const connect = useCallback(async () => {
    const uuid = settingsRef.current.deviceUuid;
    if (!uuid) { setTokenError('Pick a device to sign the phone in as'); return; }
    await signInDevice(uuid);
  }, [signInDevice]);

  const disconnect = useCallback(async () => {
    heldOff.current = true;
    genRef.current += 1;
    stopRefresh();
    await phone.unregister();
  }, [phone, stopRefresh]);

  // On logout (either surface): unregister the softphone and FORGET the
  // device, so the next signed-in user doesn't inherit it.
  const wasAuthed = useRef(isAuthenticated);
  useEffect(() => {
    if (wasAuthed.current && !isAuthenticated) {
      genRef.current += 1;
      stopRefresh();
      failedFor.current = null;
      heldOff.current = false;
      clearSipSettings();
      setSettings(defaultSipSettings());
      phone.unregister().catch(() => { /* ignore */ });
    }
    wasAuthed.current = isAuthenticated;
  }, [isAuthenticated, phone, setSettings, stopRefresh]);

  useEffect(() => () => stopRefresh(), [stopRefresh]);

  // Auto sign-in while idle. NEVER while logged out: registration is a
  // property of being signed in. Re-fires when the phone returns to idle
  // (StrictMode's double mount disposes the UA), but not for a device whose
  // sign-in just failed, so a refused token cannot storm the API.
  //   - a portal user signs in as their own extension;
  //   - otherwise the device remembered from before a page reload.
  const portalExtUuid = user.isAuthenticated ? user.user?.extension?.uuid : null;
  useEffect(() => {
    if (!isAuthenticated || phone.status !== 'idle' || inFlight.current || heldOff.current) return;
    const uuid = portalExtUuid || (settings.autoConnect ? settings.deviceUuid : null);
    if (!uuid || failedFor.current === uuid) return;
    signInDevice(uuid).catch(() => { /* surfaced via lastError */ });
  }, [isAuthenticated, portalExtUuid, settings.autoConnect, settings.deviceUuid, phone.status, signInDevice]);

  const updateSettings = useCallback((next) => { setSettings(next); saveSipSettings(next); }, [setSettings]);

  const value = {
    ...phone,                       // status, call, muted, dial, answer, hangup, sendDtmf, setMuted
    lastError: tokenError || phone.lastError,
    connected: phone.status === 'registered',
    settings, updateSettings, connect, disconnect, signInDevice
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
      <SoftphoneLive settings={settings} setSettings={setSettings}>
        {children}
      </SoftphoneLive>
    </SoftphoneErrorBoundary>
  );
}

export default SoftphoneProvider;
