import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useSoftphone } from '../../context/SoftphoneContext';
import { extensionsApi } from '../../services/api/extensionsApi';
import { apiService } from '../../services/apiService';
import { sipSettingsFromDevice, sipSettingsFromUser } from '../../lib/sip/sipSettings';

const listOf = (response) => (Array.isArray(response) ? response : response?.data || []);
const messageOf = (err, fallback) => err?.response?.data?.message || err?.response?.data?.error || fallback;

/**
 * Signing the phone in from an ACCOUNT session. A portal user's phone signs in
 * with their own login; an account has no extension of its own, so it picks
 * one of two ways:
 *
 *  - a device of the account: GET /api/devices/:uuid carries its SIP secret;
 *  - a user login: the portal's own /auth/user_login (+ OTP), whose response
 *    carries the user's extension. That token only feeds the phone and is
 *    revoked at once. It is never stored as a portal session: signing in on
 *    the portal's door ends the admin session (services/sessionIsolation.js).
 *
 * Either way the creds are registered with `persist: false` — held for this
 * page, never written to localStorage.
 */
export function usePhoneSignIn({ device } = {}) {
  const { t } = useTranslation('phone');
  const { connect } = useSoftphone();
  const [mode, setMode] = useState('device');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [devices, setDevices] = useState([]);
  const [query, setQuery] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [code, setCode] = useState('');

  const run = useCallback(async (work, fallback) => {
    setBusy(true);
    setError('');
    try { await work(); } catch (err) { setError(messageOf(err, fallback)); } finally { setBusy(false); }
  }, []);

  const signInAsDevice = useCallback((picked) => run(async () => {
    const full = await extensionsApi.getExtension(picked.uuid);
    await connect(sipSettingsFromDevice(full), { persist: false });
  }, t('signIn.error.deviceFailed')), [run, connect, t]);

  // Opened for a device (a Devices row, a user's extension): sign in as it,
  // once per device.
  const signedInFor = useRef(null);
  useEffect(() => {
    if (!device?.uuid || signedInFor.current === device.uuid) return;
    signedInFor.current = device.uuid;
    signInAsDevice(device);
  }, [device, signInAsDevice]);

  useEffect(() => {
    if (mode !== 'device' || device?.uuid) return undefined;
    let alive = true;
    extensionsApi.getExtensions({ per_page: 100 })
      .then((response) => { if (alive) setDevices(listOf(response)); })
      .catch(() => { if (alive) setError(t('signIn.error.devicesNotLoaded')); });
    return () => { alive = false; };
  }, [mode, device, t]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) => `${d.name || ''} ${d.username || ''}`.toLowerCase().includes(q));
  }, [devices, query]);

  const finishUserLogin = useCallback(async (data) => {
    const token = data?.token || data?.access;
    try {
      await connect(sipSettingsFromUser(data?.user, password), { persist: false });
    } finally {
      if (token) apiService.post('/auth/logout', new URLSearchParams({ token })).catch(() => {});
    }
  }, [connect, password]);

  const submitUserLogin = useCallback((event) => {
    event?.preventDefault();
    if (!email || !password) { setError(t('signIn.error.credentialsRequired')); return; }
    run(async () => {
      const { data } = await axios.post('/auth/user_login', { email, password }, { params: { email, password } });
      if (data?.otp_sent && data?.temp_token) setTempToken(data.temp_token);
      else await finishUserLogin(data);
    }, t('signIn.error.loginFailed'));
  }, [email, password, run, finishUserLogin, t]);

  const submitCode = useCallback((event) => {
    event?.preventDefault();
    if (code.length !== 6) { setError(t('signIn.error.codeLength')); return; }
    run(async () => {
      const { data } = await axios.post('/auth/user/otp/verify', null, { params: { temp_token: tempToken, code, email, password } });
      await finishUserLogin(data);
    }, t('signIn.error.codeInvalid'));
  }, [code, tempToken, email, password, run, finishUserLogin, t]);

  const changeMode = useCallback((next) => { setMode(next); setError(''); }, []);

  return {
    mode, setMode: changeMode, busy, error,
    devices: shown, query, setQuery, signInAsDevice, openedForDevice: Boolean(device?.uuid),
    email, setEmail, password, setPassword, otpStep: Boolean(tempToken), code, setCode,
    submitUserLogin, submitCode,
  };
}
