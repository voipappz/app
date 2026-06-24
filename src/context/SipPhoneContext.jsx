// SipPhoneProvider — app-wide softphone state, mounted ABOVE the router so the
// SIP registration and any active call survive page navigation and an incoming
// call rings on whatever screen the user is on. Wraps the useSipPhone hook and
// the persisted Settings; the Phone UI consumes this via useSipPhoneCtx().
import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useSipPhone } from '../lib/sip/useSipPhone';
import { loadSipSettings, saveSipSettings, sipSettingsReady } from '../lib/sip/sipSettings';

const SipPhoneContext = createContext(null);

export const useSipPhoneCtx = () => {
  const ctx = useContext(SipPhoneContext);
  if (!ctx) throw new Error('useSipPhoneCtx must be used within <SipPhoneProvider>');
  return ctx;
};

export function SipPhoneProvider({ children }) {
  const phone = useSipPhone();
  const [settings, setSettings] = useState(() => loadSipSettings());

  const connect = useCallback(async (next) => {
    const s = next ?? settings;
    if (next) { setSettings(next); saveSipSettings(next); }
    if (!sipSettingsReady(s)) return;
    await phone.register(
      { username: s.username, password: s.password, domain: s.domain, displayName: s.displayName || s.username },
      { wssUrl: s.wssUrl, domain: s.domain },
    );
  }, [phone, settings]);

  const disconnect = useCallback(async () => { await phone.unregister(); }, [phone]);

  const updateSettings = useCallback((next) => { setSettings(next); saveSipSettings(next); }, []);

  // Auto-connect when opted-in + creds present. Registers whenever the phone is
  // idle (not while connecting/registered/reconnecting). This is StrictMode-safe:
  // React's dev double-mount disposes the UA (status → idle), and this re-fires to
  // rebuild it — unlike a one-shot guard, which would leave it disconnected. On a
  // real registration failure status is 'failed' (not 'idle'), so it won't storm.
  useEffect(() => {
    if (!settings.autoConnect || !sipSettingsReady(settings)) return;
    if (phone.status !== 'idle') return;
    connect(settings).catch(() => { /* surfaced via status */ });
  }, [settings, connect, phone.status]);

  const value = {
    ...phone,                       // status, call, muted, dial, answer, hangup, sendDtmf, setMuted
    connected: phone.status === 'registered',
    settings, updateSettings, connect, disconnect,
  };
  return <SipPhoneContext.Provider value={value}>{children}</SipPhoneContext.Provider>;
}

export default SipPhoneProvider;
