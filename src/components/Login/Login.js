import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userLogin, verifyOtp } from '../../lib/clients/mothership';
import { useSipPhoneCtx } from '../../context/SipPhoneContext';
import { sipSettingsFromUser } from '../../lib/sip/sipSettings';
import i18n from '../../i18n/config';

// Two-step OTP login against the mothership (cloud.voipappz.io). Step 1 submits
// credentials; the server either returns a session (trusted device) or asks for
// a 6-digit code, which step 2 verifies. Mirrors voipappz-app's flow; token +
// user are persisted as the app's Bearer session (lib/clients/mothership).
export const useLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });

  // OTP step state
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [tempToken, setTempToken] = useState('');

  const { login, setLoading, setError, loading, error } = useAuth();
  const { connect: sipConnect } = useSipPhoneCtx();
  const navigate = useNavigate();

  const handleEmailChange = (e) => setEmail(e.target.value);
  const handlePasswordChange = (e) => setPassword(e.target.value);
  // Only digits, max 6.
  const handleOtpCodeChange = (e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

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

  // Step 1 — credentials → mothership. Either logs in (trusted device) or
  // advances to the OTP step.
  const handleSubmit = async (event) => {
    event.preventDefault();
    setTouched({ email: true, password: true });

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setLoading();

    try {
      const step = await userLogin(email, password);
      if (step.status === 'otp') {
        setTempToken(step.tempToken);
        setOtpStep(true);
        setError(null);
      } else {
        await finishLogin(step.session);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err?.message || 'Login failed. Please try again.');
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
      const session = await verifyOtp(tempToken, otpCode, email, password);
      await finishLogin(session);
    } catch (err) {
      console.error('OTP error:', err);
      setError(err?.message || 'Invalid or expired code. Please try again.');
    }
  };

  const handleBackToCredentials = () => {
    setOtpStep(false);
    setOtpCode('');
    setTempToken('');
    setError(null);
  };

  return {
    email,
    password,
    touched,
    loading,
    error,
    otpStep,
    otpCode,
    handleEmailChange,
    handlePasswordChange,
    handleOtpCodeChange,
    handleBlur,
    handleSubmit,
    handleOtpSubmit,
    handleBackToCredentials,
  };
};
