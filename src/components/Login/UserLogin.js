import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import axios from 'axios';
import { useUserAuth } from '../../context/UserAuthContext';
import { useSoftphone } from '../../context/SoftphoneContext';
import { sipSettingsFromUser } from '../../lib/sip/sipSettings';
import { getTokenExpiry } from '../../utils/jwt';
import { logLoginDebug } from '../../utils/loginDebug';

// The end-user (customer-facing) login — mirrors useLogin (Login.js) but
// against the /auth/user_* surface. voipappz-api draws this line at the
// backend: /auth/login authenticates an admin account, /auth/user_login
// authenticates a portal user; the two token shapes are unrelated (see
// UserAuthContext), so this hook and its admin counterpart stay separate.
export const useUserLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });

  const [showForgetForm, setShowForgetForm] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1=email, 2=otp, 3=new password
  const [forgotTempToken, setForgotTempToken] = useState('');
  const [forgotResetToken, setForgotResetToken] = useState('');
  const [forgotOtpCode, setForgotOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // OTP state
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [tempToken, setTempToken] = useState('');

  const { login, setLoading, setError, loading, error } = useUserAuth();
  const { connect: sipConnect } = useSoftphone();
  const navigate = useNavigate();

  const handleEmailChange = (e) => setEmail(e.target.value);
  const handlePasswordChange = (e) => setPassword(e.target.value);
  const handleForgotEmailChange = (e) => setForgotEmail(e.target.value);
  const handleNewPasswordChange = (e) => setNewPassword(e.target.value);
  const handleConfirmPasswordChange = (e) => setConfirmPassword(e.target.value);
  const handleForgotOtpChange = (e) => setForgotOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
  const handleOtpCodeChange = (e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));

  const handleBlur = (field) => setTouched((prev) => ({ ...prev, [field]: true }));

  const handleForgotPasswordClick = () => {
    setShowForgetForm(true);
    setError('');
  };

  const handleBackToLogin = () => {
    setShowForgetForm(false);
    setForgotEmail('');
    setForgotSent(false);
    setForgotStep(1);
    setForgotTempToken('');
    setForgotResetToken('');
    setForgotOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setOtpStep(false);
    setOtpCode('');
    setTempToken('');
    setError('');
    setTouched((prev) => ({ ...prev, forgotEmail: false }));
  };

  // Forgot password Step 1: email -> temp_token + OTP sent
  const handleForgotEmailSubmit = async (e) => {
    e.preventDefault();
    setTouched((prev) => ({ ...prev, forgotEmail: true }));
    if (!forgotEmail) {
      setError('Email is required');
      return;
    }
    setLoading();
    try {
      const response = await axios.post('/auth/user/forget_password', null, { params: { email: forgotEmail } });
      setForgotTempToken(response.data.temp_token || '');
      setForgotStep(2);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to send reset code. Please try again.');
    }
  };

  // Forgot password Step 2: OTP -> reset_token
  const handleForgotOtpSubmit = async (e) => {
    e.preventDefault();
    if (!forgotOtpCode || forgotOtpCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    setLoading();
    try {
      const response = await axios.post('/auth/user/forget_password/verify', null, {
        params: { temp_token: forgotTempToken, code: forgotOtpCode }
      });
      setForgotResetToken(response.data.reset_token);
      setForgotStep(3);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Invalid or expired code. Please try again.');
    }
  };

  // Forgot password Step 3: set new password
  const handleForgotResetSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading();
    try {
      await axios.post('/auth/user/forget_password/reset', null, {
        params: { reset_token: forgotResetToken, new_password: newPassword }
      });
      setForgotSent(true);
      setError('Password reset successfully!');
      setTimeout(() => handleBackToLogin(), 3000);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to reset password. Please try again.');
    }
  };

  // Step 1: email + password -> temp_token (or a trusted-device session directly)
  const handleSubmit = async (event) => {
    event.preventDefault();
    setTouched({ email: true, password: true });

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setLoading();

    try {
      const deviceToken = localStorage.getItem('user_device_token') || '';
      const response = await axios.post('/auth/user_login', {
        email, password
      }, {
        params: { email, password, device_token: deviceToken }
      });

      if (response.data.otp_sent && response.data.temp_token) {
        setTempToken(response.data.temp_token);
        setOtpStep(true);
        setError('');
      } else {
        completeLogin(response.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Login failed. Please try again.');
    }
  };

  // Step 2: OTP -> { user, token }
  const handleOtpSubmit = async (event) => {
    event.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    setLoading();
    try {
      const response = await axios.post('/auth/user/otp/verify', null, {
        params: { temp_token: tempToken, code: otpCode, email, password }
      });
      completeLogin(response.data);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Invalid or expired code. Please try again.');
    }
  };

  // Shared: process the { user, token, device_token? } response and store the session.
  const completeLogin = (data) => {
    const token = data.token || data.access;
    const tokenExpiry = getTokenExpiry(token);

    const authData = {
      user: data.user || null,
      token,
      tokenExpiresAt: tokenExpiry ? tokenExpiry.toISOString() : null
    };

    // DEBUG: what did we just log in as? See utils/loginDebug.js.
    logLoginDebug('user', { token, response: data, authData });

    // Clear stale per-session caches before login, same as the admin flow.
    localStorage.removeItem('dashboard-definitions');
    sessionStorage.clear();

    if (data.device_token) {
      localStorage.setItem('user_device_token', data.device_token);
    }

    // Write synchronously before the context effect flushes — matches
    // AuthContext's login()/Login.js precaution against a same-tick race.
    localStorage.setItem('user_auth', JSON.stringify(authData));

    login(authData);
    // Fire-and-forget — the softphone is optional; a registration failure
    // here must never block landing on the dashboard.
    try { sipConnect(sipSettingsFromUser(authData.user, password)); } catch { /* phone optional */ }
    navigate('/');
  };

  // Sign-in by QR: /?login_token=<single-use JWT> from Users → Sign-in QR.
  // Take it out of the address bar first (it must not linger in history or be
  // shared), then trade it once for a session. The ref keeps StrictMode's
  // second effect run from spending the code twice.
  const [qrSigningIn, setQrSigningIn] = useState(() => new URL(window.location.href).searchParams.has('login_token'));
  const qrTried = useRef(false);
  useEffect(() => {
    if (qrTried.current) return;
    qrTried.current = true;
    const url = new URL(window.location.href);
    const loginToken = url.searchParams.get('login_token');
    if (!loginToken) return;
    url.searchParams.delete('login_token');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    setLoading();
    axios.post('/auth/user_qr_login', null, { params: { token: loginToken } })
      .then((response) => completeLogin(response.data))
      .catch((err) => {
        setError(err.response?.data?.message || err.response?.data?.error || 'This sign-in code did not work. Ask for a new one, or sign in with your email.');
      })
      .finally(() => setQrSigningIn(false));
  // Once, on the first render: the code in the URL is single-use.
  }, []);

  const handleBackToCredentials = () => {
    setOtpStep(false);
    setOtpCode('');
    setTempToken('');
    setError('');
  };

  return {
    email, password, showForgetForm, forgotEmail, forgotSent, forgotStep, forgotOtpCode,
    newPassword, confirmPassword, touched, loading, error, otpStep, otpCode, qrSigningIn,
    handleEmailChange, handlePasswordChange, handleForgotEmailChange, handleForgotOtpChange,
    handleNewPasswordChange, handleConfirmPasswordChange, handleOtpCodeChange, handleBlur,
    handleSubmit, handleOtpSubmit, handleForgotPasswordClick, handleBackToLogin,
    handleBackToCredentials, handleForgotEmailSubmit, handleForgotOtpSubmit, handleForgotResetSubmit
  };
};
