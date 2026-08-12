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
  Alert,
  InputAdornment,
} from '@mui/material';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useLogin } from './Login';
import { useTranslation, Trans } from 'react-i18next';
import { brand } from '../../config';
import { fmtClock } from '../../lib/format';
import './Login.css';

const Login = () => {
  const { t } = useTranslation();
  const {
    email,
    password,
    touched,
    loading,
    error,
    expectsOtp,
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


  return (
    <Container component="main" maxWidth={false} className="login-container">
      <Paper
        elevation={0}
        className="login-paper"
      >
        {/* Mobile-only logo — dark wordmark on the white card */}
        <Box className="mobile-login-logo">
          <img src={brand.logo} alt={brand.name} style={{ height: 40 }} />
        </Box>

        <Typography variant="overline" className="login-eyebrow">
          {t('login.secureAccess')}
        </Typography>

        <Typography component="h1" variant="h4" className="login-title">
          {otpStep ? t('login.otpTitle') : t('login.title')}
        </Typography>

        {!otpStep && (
          <Typography variant="body2" className="login-subtitle">
            {t('login.identifierHint')}
          </Typography>
        )}

        {otpStep && (
          <Typography variant="body2" className="login-subtitle" data-testid="otp-subtitle">
            <Trans i18nKey="login.otpSentTo" values={{ identifier: email }} components={{ strong: <strong /> }} />
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

            {/* No deadline from the server ⇒ no clock, rather than a made-up
                one. Resend stays available either way. */}
            <Box className="otp-status mb-3">
              {hasExpiry && (
                <Typography variant="caption" data-testid="otp-countdown">
                  {otpExpired ? t('login.otpExpired') : t('login.otpExpiresIn', { time: fmtClock(secondsLeft) })}
                </Typography>
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

            <Button
              fullWidth
              type="submit"
              variant="contained"
              className="login-button"
              data-testid="otp-verify-button"
              disabled={loading || otpCode.length !== 6 || otpExpired}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
            >
              {loading ? t('login.verifying') : t('login.verify')}
            </Button>

            <Button
              type="button"
              variant="text"
              className="login-secondary-button"
              onClick={handleBackToCredentials}
              data-testid="otp-back"
            >
              {t('login.back')}
            </Button>
          </Box>
        ) : (
        <Box component="form" onSubmit={handleSubmit} className="login-form" data-testid="login-form">
          <FormControl fullWidth className="input-container email-container mb-3">
            <TextField
              fullWidth
              id="email"
              name="username"
              label={t('login.identifier')}
              value={email}
              onChange={handleEmailChange}
              onBlur={() => handleBlur('email')}
              variant="outlined"
              className="login-input email-input"
              data-testid="email-input"
              data-cy="email-input"
              autoComplete="username"
              inputProps={{ autoCapitalize: 'none', spellCheck: false }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <BadgeOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              required
              error={touched.email && email.trim() === ''}
            />
            {touched.email && email.trim() === '' && (
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
              autoComplete="current-password"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
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

          <Button
            fullWidth
            type="submit"
            variant="contained"
            className="login-button"
            data-testid="login-button"
            data-cy="login-button"
            disabled={loading || !email.trim() || !password}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {loading ? t('login.loggingIn') : t('login.loginButton')}
          </Button>
        </Box>
        )}
      </Paper>
    </Container>
  );
};

export default Login;
