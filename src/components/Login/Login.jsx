import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Paper,
  FormControl,
  FormHelperText,
  CircularProgress,
  Alert
} from '@mui/material';
import { useLogin } from './Login';
import { useTranslation, Trans } from 'react-i18next';
import { brand } from '../../config';
import { expectsLoginOtp } from '../../lib/clients/customerPortal';
import './Login.css';

const Login = () => {
  const { t } = useTranslation();
  const {
    email,
    password,
    touched,
    loading,
    error,
    otpStep,
    otpCode,
    secondsLeft,
    hasExpiry,
    otpExpired,
    handleEmailChange,
    handlePasswordChange,
    handleOtpCodeChange,
    handleBlur,
    handleSubmit,
    handleOtpSubmit,
    handleResendOtp,
    handleBackToCredentials
  } = useLogin();

  // mm:ss left before the server drops the code.
  const countdown = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  // Tenant hint from the customer portal data. OTP IS THE DEFAULT — we expect a
  // code unless the tenant explicitly opts out. Advisory: the login response
  // still decides what actually happens.
  const expectsOtp = expectsLoginOtp();

  return (
    <Container component="main" maxWidth="sm" className="login-container">
      <Paper
        elevation={0}
        className="login-paper"
      >
        {/* Mobile-only logo — dark wordmark on the white card */}
        <Box className="mobile-login-logo">
          <img src={brand.logo} alt={brand.name} style={{ height: 40 }} />
        </Box>

        <Typography component="h1" variant="h5" className="login-title">
          {otpStep ? t('login.otpTitle') : t('login.title')}
        </Typography>

        {/* Name the destination — the code is emailed (Jobs::Mail::Send), so
            saying which address it went to is both accurate and self-service. */}
        {otpStep && (
          <Typography variant="body2" className="login-subtitle" data-testid="otp-subtitle">
            <Trans i18nKey="login.otpSentTo" values={{ email }} components={{ strong: <strong /> }} />
          </Typography>
        )}

        {error && (
          <Alert severity="error" className="mb-3" data-testid="error-message">
            {error}
          </Alert>
        )}

        {otpStep ? (
          <Box component="form" onSubmit={handleOtpSubmit} className="login-form" data-testid="otp-form">
            <FormControl fullWidth className="input-container otp-container mb-3">
              <TextField
                fullWidth
                id="otp"
                name="otp"
                label={t('login.otpCode')}
                value={otpCode}
                onChange={handleOtpCodeChange}
                variant="outlined"
                className="login-input otp-input"
                data-testid="otp-input"
                autoFocus
                // one-time-code lets iOS/Android/Chrome autofill the emailed code;
                // pattern keeps the numeric keypad on older mobile browsers.
                autoComplete="one-time-code"
                inputProps={{
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  maxLength: 6,
                  style: { letterSpacing: '0.4em', textAlign: 'center' },
                }}
                required
              />
            </FormControl>

            {/* The code dies server-side; the deadline comes from the server's
                `expires_in`. No deadline given ⇒ no clock, rather than a made-up
                one. Resend stays available either way. */}
            <Box className="otp-status mb-3">
              {hasExpiry ? (
                <Typography variant="caption" data-testid="otp-countdown">
                  {otpExpired ? t('login.otpExpired') : t('login.otpExpiresIn', { time: countdown })}
                </Typography>
              ) : (
                <span />
              )}
              <Typography
                variant="caption"
                className="forgot-password"
                onClick={loading ? undefined : handleResendOtp}
                data-testid="otp-resend"
                sx={{ cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}
              >
                {t('login.resendCode')}
              </Typography>
            </Box>

            <Box className="form-footer">
              <Typography
                variant="body2"
                className="forgot-password"
                onClick={handleBackToCredentials}
                data-testid="otp-back"
                sx={{ cursor: 'pointer' }}
              >
                {t('login.back')}
              </Typography>

              <Button
                type="submit"
                variant="contained"
                className="login-button"
                data-testid="otp-verify-button"
                disabled={loading || otpCode.length !== 6 || otpExpired}
                startIcon={loading ? <CircularProgress size={20} /> : null}
              >
                {loading ? t('login.verifying') : t('login.verify')}
              </Button>
            </Box>
          </Box>
        ) : (
        <Box component="form" onSubmit={handleSubmit} className="login-form" data-testid="login-form">
          <FormControl fullWidth className="input-container email-container mb-3">
            <TextField
              fullWidth
              id="email"
              name="email"
              label={t('login.email')}
              value={email}
              onChange={handleEmailChange}
              onBlur={() => handleBlur('email')}
              variant="outlined"
              className="login-input email-input"
              data-testid="email-input"
              data-cy="email-input"
              required
              error={touched.email && email === ''}
            />
            {touched.email && email === '' && (
              <FormHelperText error className="error-message email-error">{t('login.requiredField')}</FormHelperText>
            )}
          </FormControl>
          
          <FormControl fullWidth className="input-container password-container">
            <TextField
              fullWidth
              id="password"
              name="password"
              label={t('login.password')}
              type="password"
              value={password}
              onChange={handlePasswordChange}
              onBlur={() => handleBlur('password')}
              variant="outlined"
              className="login-input password-input"
              data-testid="password-input"
              data-cy="password-input"
              required
              error={touched.password && password === ''}
            />
            {touched.password && password === '' && (
              <FormHelperText error className="error-message password-error">{t('login.requiredField')}</FormHelperText>
            )}
          </FormControl>
          
          {/* Tenant-level heads-up so the OTP screen isn't a surprise. Purely
              informational — the server still decides whether a code is sent. */}
          {expectsOtp && (
            <Typography variant="caption" className="login-otp-hint" data-testid="otp-hint">
              {t('login.otpExpectedHint')}
            </Typography>
          )}

          <Box className="form-footer">
            <Typography
              variant="body2"
              className="forgot-password"
            >
              {t('login.forgotPassword')}
            </Typography>

            <Button
              type="submit"
              variant="contained"
              className="login-button"
              data-testid="login-button"
              data-cy="login-button"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              {loading ? t('login.loggingIn') : t('login.loginButton')}
            </Button>
          </Box>
        </Box>
        )}
      </Paper>
    </Container>
  );
};

export default Login;
