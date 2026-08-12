import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userLogin, verifyOtp } from '../../lib/clients/mothership';
import { expectsLoginOtp } from '../../lib/clients/customerPortal';
import { useSipPhoneCtx } from '../../context/SipPhoneContext';
import { sipSettingsFromUser } from '../../lib/sip/sipSettings';
import i18n from '../../i18n/config';

// Map the API's auth failures to something actionable. voipappz-api answers 429
// for the per-IP attempt limit and 403 when the account is locked out; both carry
// a server message, but a bare "Login failed" hides which it was.
function describeError(err, fallbackKey) {
  if (err?.status === 429) return i18n.t('login.tooManyAttempts');
  if (err?.status === 403) return err?.message || i18n.t('login.accountLocked');
  return err?.message || i18n.t(fallbackKey);
}

// Two-step OTP login against the mothership. Step 1 submits credentials; the
// SERVER decides whether that's enough — it returns a session (OTP off for this
// environment, or a trusted device) or asks for a 6-digit emailed code, which
// step 2 verifies. We never request or suppress the challenge; we obey the
// response shape. See lib/clients/mothership for the full contract.
export const useLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });

  // OTP step state. `deadline` is an absolute ms timestamp, or null when the
  // server stated no lifetime — we never invent one. `secondsLeft` is display
  // only, recomputed from the deadline so a throttled background tab resumes at
  // the true remaining time instead of wherever it stopped counting.
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [deadline, setDeadline] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const { login, setLoading, setError, loading, error } = useAuth();
  const { connect: sipConnect } = useSipPhoneCtx();
  const navigate = useNavigate();

  // The tenant's pre-login hint. Read once: main.jsx caches the portal data
  // before first render and nothing rewrites it while this screen is mounted.
  const expectsOtp = useMemo(() => expectsLoginOtp(), []);

  const handleEmailChange = (e) => setEmail(e.target.value);
  const handlePasswordChange = (e) => setPassword(e.target.value);
  // Only digits, max 6.
  const handleOtpCodeChange = (e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // One interval per OTP window — the deadline is fixed, so nothing here needs
  // to re-run per tick.
  useEffect(() => {
    if (!otpStep || !deadline) return undefined;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [otpStep, deadline]);

  // Session established → update context, register the softphone, navigate.
  const finishLogin = async (session) => {
    login(session);
    // Branding/language already applied at boot from the public portal data
    // (main.jsx). Here we only honour the USER's own language preference, which
    // can differ from the customer default.
    const userLang = session?.user?.profile?.language;
    if (userLang) i18n.changeLanguage(userLang);
    // Load the WebRTC softphone from the mothership user object (extension +
    // environment), same as voipappz-app; the login password is passed as a
    // fallback SIP secret. Fire-and-forget: a SIP failure must not block
    // navigation, and connect() is a no-op if the softphone is unavailable.
    try { sipConnect(sipSettingsFromUser(session?.user, password)); } catch { /* phone optional */ }
    navigate('/dashboard');
  };

  // Apply whichever shape step 1 returned: a challenge, or a finished session.
  const applyStep = async (step) => {
    if (step.status !== 'otp') return finishLogin(step.session);
    setTempToken(step.tempToken);
    setOtpStep(true);
    setOtpCode('');
    setDeadline(step.expiresIn ? Date.now() + step.expiresIn * 1000 : null);
    setError(null);
  };

  // Step 1 — credentials → mothership.
  const handleSubmit = async (event) => {
    event.preventDefault();
    setTouched({ email: true, password: true });

    const identifier = email.trim();
    if (!identifier || !password) {
      setError(i18n.t('login.credentialsRequired'));
      return;
    }

    setLoading();
    try {
      await applyStep(await userLogin(identifier, password));
    } catch (err) {
      console.error('Login error:', err);
      setError(describeError(err, 'login.loginFailed'));
    }
  };

  // Resend — the API has no dedicated route, so re-run step 1: that mints a
  // fresh temp_token + code server-side.
  const handleResendOtp = async () => {
    const identifier = email.trim();
    if (!identifier || !password) return;
    setLoading();
    try {
      await applyStep(await userLogin(identifier, password));
    } catch (err) {
      console.error('OTP resend error:', err);
      setError(describeError(err, 'login.resendFailed'));
    }
  };

  // Step 2 — verify the 6-digit OTP → session.
  const handleOtpSubmit = async (event) => {
    event.preventDefault();

    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setLoading();
    try {
      const session = await verifyOtp(tempToken, otpCode, email.trim(), password);
      await finishLogin(session);
    } catch (err) {
      console.error('OTP error:', err);
      setError(describeError(err, 'login.otpInvalid'));
    }
  };

  const handleBackToCredentials = () => {
    setOtpStep(false);
    setOtpCode('');
    setTempToken('');
    setDeadline(null);
    setError(null);
  };

  return {
    email,
    password,
    touched,
    loading,
    error,
    expectsOtp,
    otpStep,
    otpCode,
    secondsLeft,
    hasExpiry: deadline !== null,
    // Only claim expiry when the server gave us a deadline to measure against.
    otpExpired: otpStep && deadline !== null && secondsLeft === 0,
    handleEmailChange,
    handlePasswordChange,
    handleOtpCodeChange,
    handleBlur,
    handleSubmit,
    handleOtpSubmit,
    handleResendOtp,
    handleBackToCredentials,
  };
};
