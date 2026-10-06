import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loginErrorText } from './loginErrors';
import { useNavigate } from 'react-router';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { getAccountUuidFromToken, getAccountDataFromToken, getTokenExpiry } from '../../utils/jwt';
import { logLoginDebug } from '../../utils/loginDebug';

export const useLogin = () => {
  // Client-side messages in the active language; server messages pass through as sent.
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showForgetForm, setShowForgetForm] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1=email, 2=otp, 3=new password
  const [forgotTempToken, setForgotTempToken] = useState('');
  const [forgotResetToken, setForgotResetToken] = useState('');
  const [forgotOtpCode, setForgotOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState({
    email: false,
    password: false,
    forgotEmail: false
  });

  // OTP state
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [tempToken, setTempToken] = useState('');

  const { login, setLoading, setError, loading, error } = useAuth();
  const navigate = useNavigate();

  const handleEmailChange = (e) => setEmail(e.target.value);
  const handlePasswordChange = (e) => setPassword(e.target.value);
  const handleForgotEmailChange = (e) => setForgotEmail(e.target.value);
  const handleNewPasswordChange = (e) => setNewPassword(e.target.value);
  const handleConfirmPasswordChange = (e) => setConfirmPassword(e.target.value);
  const handleForgotOtpChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setForgotOtpCode(val);
  };
  const handleOtpCodeChange = (e) => {
    // Only allow digits, max 6
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtpCode(val);
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleForgotPasswordClick = () => {
    setShowForgetForm(true);
    setError(''); // Clear any existing errors
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
    setTouched(prev => ({ ...prev, forgotEmail: false }));
  };

  // Forgot password Step 1: Submit email → get temp_token + OTP sent
  const handleForgotEmailSubmit = async (e) => {
    e.preventDefault();
    setTouched(prev => ({ ...prev, forgotEmail: true }));

    if (!forgotEmail) {
      setError(t('error.emailRequired'));
      return;
    }

    setLoading();

    try {
      const response = await axios.post('/auth/forget_password', null, {
        params: { email: forgotEmail }
      });

      setForgotTempToken(response.data.temp_token || '');
      setForgotStep(2);
      setError('');
    } catch (error) {
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          t('error.sendCodeFailed');
      setError(errorMessage);
    }
  };

  // Forgot password Step 2: Verify OTP → get reset_token
  const handleForgotOtpSubmit = async (e) => {
    e.preventDefault();

    if (!forgotOtpCode || forgotOtpCode.length !== 6) {
      setError(t('error.enterCode'));
      return;
    }

    setLoading();

    try {
      const response = await axios.post('/auth/forget_password/verify', null, {
        params: {
          temp_token: forgotTempToken,
          code: forgotOtpCode
        }
      });

      setForgotResetToken(response.data.reset_token);
      setForgotStep(3);
      setError('');
    } catch (error) {
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          t('error.invalidCode');
      setError(errorMessage);
    }
  };

  // Forgot password Step 3: Set new password
  const handleForgotResetSubmit = async (e) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 8) {
      setError(t('error.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('error.passwordsDoNotMatch'));
      return;
    }

    setLoading();

    try {
      await axios.post('/auth/forget_password/reset', null, {
        params: {
          reset_token: forgotResetToken,
          new_password: newPassword
        }
      });

      setForgotSent(true);
      setError(t('error.passwordReset'));

      setTimeout(() => {
        handleBackToLogin();
      }, 3000);
    } catch (error) {
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          t('error.resetFailed');
      setError(errorMessage);
    }
  };

  // Step 1: Submit email + password → get temp_token
  const handleSubmit = async (event) => {
    event.preventDefault();

    // Mark all fields as touched on submit
    setTouched({ email: true, password: true });

    // Validate required fields
    if (!email || !password) {
      setError(t('error.emailAndPasswordRequired'));
      return;
    }

    setLoading();

    try {
      // Send device_token if we have one — server will skip OTP for trusted devices
      const deviceToken = localStorage.getItem('device_token') || '';
      const response = await axios.post(
        '/auth/login',
        {
          email: email,
          password: password
        },
        {
          params: {
            email: email,
            password: password,
            device_token: deviceToken
          }
        }
      );

      if (response.data.otp_sent && response.data.temp_token) {
        // OTP was sent — move to step 2
        setTempToken(response.data.temp_token);
        setOtpStep(true);
        setError('');
      } else {
        // Fallback: server returned JWT directly (no OTP required)
        completeLogin(response.data);
      }

    } catch (error) {
      setError(loginErrorText(t, error));
    }
  };

  // Step 2: Submit OTP code → get JWT
  const handleOtpSubmit = async (event) => {
    event.preventDefault();

    if (!otpCode || otpCode.length !== 6) {
      setError(t('error.enterCode'));
      return;
    }

    setLoading();

    try {
      // voipappz-api reads Sinatra params (query string + form body, not JSON)
      // Use query params to match the /auth/login pattern
      const response = await axios.post('/auth/otp/verify', null, {
        params: {
          temp_token: tempToken,
          code: otpCode,
          email: email,
          password: password
        }
      });

      completeLogin(response.data);

    } catch (error) {
      const errorMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          t('error.invalidCode');
      setError(errorMessage);
    }
  };

  // Shared: process JWT response and store auth
  const completeLogin = (data) => {
    const accessToken = data.access || data.token;
    const refreshToken = data.refresh;

    const accountUuid = getAccountUuidFromToken(accessToken, refreshToken);
    const accountData = getAccountDataFromToken(accessToken);
    const accessExpiry = getTokenExpiry(accessToken);
    const refreshExpiry = refreshToken ? getTokenExpiry(refreshToken) : null;

    const authData = {
      user: {
        email: email,
        firstName: data.first_name || data.user?.first_name || '',
        lastName: data.last_name || data.user?.last_name || '',
        fullName: data.fullname || data.user?.fullname || data.user?.name || '',
        uuid: accountUuid || data.uuid || data.account?.uuid || data.user?.uuid || data.user?.id || ''
      },
      csrf: data.csrf,
      access: accessToken,
      refresh: refreshToken,
      accessExpiresAt: data.access_expires_at || (accessExpiry ? accessExpiry.toISOString() : null),
      refreshExpiresAt: data.refresh_expires_at || (refreshExpiry ? refreshExpiry.toISOString() : null),
      accountUuid: accountUuid,
      customerUuid: accountData?.customer?.uuid || data.customer_uuid || data.customer?.uuid || null,
      accountCustomer: accountData?.customer || null,
      isRoot: accountData?.isRoot || false,
      acl: accountData?.acl || null
    };

    // DEBUG: what did we just log in as? See utils/loginDebug.js.
    logLoginDebug('account', { token: accessToken, response: data, authData, parsed: accountData });

    // Clear all cached data before login to ensure fresh session
    localStorage.removeItem('selectedCustomer');
    localStorage.removeItem('selectedEnvironments');
    localStorage.removeItem('customerData');
    sessionStorage.clear();

    // Store trusted device token for future OTP-free logins (30-day TTL on server)
    if (data.device_token) {
      localStorage.setItem('device_token', data.device_token);
    }

    // Write auth to localStorage synchronously BEFORE dispatching context update.
    // This prevents a race condition where Layout mounts and customerService's
    // getAuthHeaders() reads localStorage before the AuthContext useEffect persists it.
    localStorage.setItem('auth', JSON.stringify(authData));

    login(authData);

    // Redirect to the landing screen after successful login
    navigate('/calls');
  };

  const handleBackToCredentials = () => {
    setOtpStep(false);
    setOtpCode('');
    setTempToken('');
    setError('');
  };

  return {
    email,
    password,
    showForgetForm,
    forgotEmail,
    forgotSent,
    forgotStep,
    forgotOtpCode,
    newPassword,
    confirmPassword,
    touched,
    loading,
    error,
    otpStep,
    otpCode,
    handleEmailChange,
    handlePasswordChange,
    handleForgotEmailChange,
    handleForgotOtpChange,
    handleNewPasswordChange,
    handleConfirmPasswordChange,
    handleOtpCodeChange,
    handleBlur,
    handleSubmit,
    handleOtpSubmit,
    handleForgotPasswordClick,
    handleBackToLogin,
    handleBackToCredentials,
    handleForgotEmailSubmit,
    handleForgotOtpSubmit,
    handleForgotResetSubmit
  };
};
