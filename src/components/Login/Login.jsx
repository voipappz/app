import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  FormControl,
  FormHelperText,
  CircularProgress,
  Alert,
  Chip,
  Link
} from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { useLogin } from './Login';
import './Login.css';

// `switcher`: the User / Account toggle (SignIn), shown on the credentials step.
const Login = ({ switcher = null }) => {
  const {
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
  } = useLogin();
  // The user sign-in is this host's `/`; shown as an address people recognise.
  const userSignInAddress = `${window.location.host}/`;

  const renderLoginForm = () => (
    <>
      {/* Clients use the user sign-in at `/` and never see this page, so it can
          say plainly that it is the admin one, and where users go instead. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1.5 }}>
        <Typography component="h3" className="form-title form-title--inline">
          Admin sign-in
        </Typography>
        <Chip label="Admin" color="primary" size="small" data-testid="admin-login-badge"
          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }} />
      </Box>
      <Typography variant="body2" className="forgot-description">
        For account administrators.
        <br />
        Users sign in at{' '}
        <Link component={RouterLink} to="/" data-testid="admin-login-user-link">{userSignInAddress}</Link>
      </Typography>

      {error && (
        <Alert severity="error" className="login-alert" data-testid="error-message">
          {error}
          <Box component="span" sx={{ display: 'block', mt: 0.5 }} data-testid="admin-login-wrong-door">
            Signing in as a user? Use{' '}
            <Link component={RouterLink} to="/" color="inherit" sx={{ fontWeight: 600 }}>{userSignInAddress}</Link>{' '}
            instead.
          </Box>
        </Alert>
      )}

      <Box component="form" id="admin-login-form" name="admin-login" action="/admin-login" method="post" onSubmit={handleSubmit} className="login-form" data-testid="login-form">
        <FormControl fullWidth className="form-group">
          <TextField
            size="medium"
            fullWidth
            id="email"
            name="email"
            label="Admin email"
            placeholder="admin@example.com"
            value={email}
            onChange={handleEmailChange}
            onBlur={() => handleBlur('email')}
            variant="outlined"
            className="form-control"
            data-testid="email-input"
            data-cy="email-input"
            required
            error={touched.email && email === ''}
            type="email"
            autoComplete="section-admin username"
          />
          {touched.email && email === '' && (
            <FormHelperText error className="help-block">Email is required.</FormHelperText>
          )}
        </FormControl>

        <FormControl fullWidth className="form-group">
          <TextField
            size="medium"
            fullWidth
            id="password"
            name="password"
            label="Admin password"
            placeholder="Your password"
            type="password"
            value={password}
            onChange={handlePasswordChange}
            onBlur={() => handleBlur('password')}
            variant="outlined"
            className="form-control"
            data-testid="password-input"
            data-cy="password-input"
            required
            error={touched.password && password === ''}
            autoComplete="section-admin current-password"
          />
          {touched.password && password === '' && (
            <FormHelperText error className="help-block">Password is required.</FormHelperText>
          )}
        </FormControl>

        <Box className="form-actions">
          <Button
            type="submit"
            variant="contained"
            className="login-button"
            data-testid="login-button"
            data-cy="login-button"
            disabled={loading || !email || !password}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>

          <Typography
            variant="body2"
            component="a"
            href="javascript:;"
            className="forgot-password"
            onClick={handleForgotPasswordClick}
            data-testid="forgot-password-link"
          >
            Forgot Password?
          </Typography>

        </Box>
      </Box>
    </>
  );

  const renderOtpForm = () => (
    <>
      <Typography component="h3" className="form-title">
        Verify Your Identity
      </Typography>

      <Typography component="p" className="forgot-description">
        A 6-digit code has been sent to <strong>{email}</strong>. Enter it below to continue.
      </Typography>

      {error && (
        <Alert severity="error" className="login-alert" data-testid="otp-error-message">
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleOtpSubmit} className="login-form" data-testid="otp-form">
        <FormControl fullWidth className="form-group">
          <TextField
            size="medium"
            fullWidth
            id="otp-code"
            name="otp-code"
            placeholder="6-digit code"
            value={otpCode}
            onChange={handleOtpCodeChange}
            variant="outlined"
            className="form-control"
            data-testid="otp-input"
            required
            autoFocus
            inputProps={{
              maxLength: 6,
              inputMode: 'numeric',
              pattern: '[0-9]*',
              style: { textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.25rem' }
            }}
            autoComplete="one-time-code"
          />
        </FormControl>

        <Box className="form-actions">
          <Button
            type="button"
            variant="outlined"
            className="back-button"
            onClick={handleBackToCredentials}
            data-testid="otp-back-button"
          >
            Back
          </Button>

          <Button
            type="submit"
            variant="contained"
            className="login-button"
            data-testid="otp-submit-button"
            disabled={loading || otpCode.length !== 6}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {loading ? 'Verifying...' : 'Verify'}
          </Button>
        </Box>
      </Box>
    </>
  );

  const renderForgotForm = () => {
    // Step 1: Enter email
    if (forgotStep === 1) {
      return (
        <>
          <Typography component="h3" className="form-title">
            Reset Password
          </Typography>

          <Typography component="p" className="forgot-description">
            Enter your e-mail address below to receive a reset code.
          </Typography>

          {error && (
            <Alert severity="error" className="login-alert" data-testid="forgot-error-message">
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleForgotEmailSubmit} className="login-form" data-testid="forgot-form">
            <FormControl fullWidth className="form-group">
              <TextField
                size="medium"
                fullWidth
                id="forgot-email"
                name="forgot-email"
                placeholder="Email"
                value={forgotEmail}
                onChange={handleForgotEmailChange}
                onBlur={() => handleBlur('forgotEmail')}
                variant="outlined"
                className="form-control"
                data-testid="forgot-email-input"
                required
                error={touched.forgotEmail && forgotEmail === ''}
                type="email"
                autoComplete="off"
              />
              {touched.forgotEmail && forgotEmail === '' && (
                <FormHelperText error className="help-block">Email is required.</FormHelperText>
              )}
            </FormControl>

            <Box className="form-actions">
              <Button
                type="button"
                variant="outlined"
                className="back-button"
                onClick={handleBackToLogin}
                data-testid="back-button"
              >
                Back
              </Button>

              <Button
                type="submit"
                variant="contained"
                className="forgot-submit-button"
                data-testid="forgot-submit-button"
                disabled={loading || !forgotEmail}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {loading ? 'Sending...' : 'Submit'}
              </Button>
            </Box>
          </Box>
        </>
      );
    }

    // Step 2: Enter OTP code (same styling as login OTP)
    if (forgotStep === 2) {
      return (
        <>
          <Typography component="h3" className="form-title">
            Verify Your Email
          </Typography>

          <Typography component="p" className="forgot-description">
            A 6-digit code has been sent to <strong>{forgotEmail}</strong>. Enter it below.
          </Typography>

          {error && (
            <Alert severity="error" className="login-alert" data-testid="forgot-otp-error">
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleForgotOtpSubmit} className="login-form" data-testid="forgot-otp-form">
            <FormControl fullWidth className="form-group">
              <TextField
                size="medium"
                fullWidth
                id="forgot-otp-code"
                name="forgot-otp-code"
                placeholder="6-digit code"
                value={forgotOtpCode}
                onChange={handleForgotOtpChange}
                variant="outlined"
                className="form-control"
                data-testid="forgot-otp-input"
                required
                autoFocus
                inputProps={{
                  maxLength: 6,
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  style: { textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.25rem' }
                }}
                autoComplete="one-time-code"
              />
            </FormControl>

            <Box className="form-actions">
              <Button
                type="button"
                variant="outlined"
                className="back-button"
                onClick={handleBackToLogin}
                data-testid="forgot-otp-back-button"
              >
                Back
              </Button>

              <Button
                type="submit"
                variant="contained"
                className="login-button"
                data-testid="forgot-otp-submit-button"
                disabled={loading || forgotOtpCode.length !== 6}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
            </Box>
          </Box>
        </>
      );
    }

    // Step 3: Set new password
    return (
      <>
        <Typography component="h3" className="form-title">
          Set New Password
        </Typography>

        <Typography component="p" className="forgot-description">
          Choose a new password (minimum 8 characters).
        </Typography>

        {error && (
          <Alert
            severity={forgotSent ? "success" : "error"}
            className="login-alert"
            data-testid="forgot-reset-error"
          >
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleForgotResetSubmit} className="login-form" data-testid="forgot-reset-form">
          <FormControl fullWidth className="form-group">
            <TextField
              size="medium"
              fullWidth
              id="new-password"
              name="new-password"
              placeholder="New Password"
              type="password"
              value={newPassword}
              onChange={handleNewPasswordChange}
              variant="outlined"
              className="form-control"
              data-testid="new-password-input"
              required
              autoFocus
              autoComplete="new-password"
            />
          </FormControl>

          <FormControl fullWidth className="form-group">
            <TextField
              size="medium"
              fullWidth
              id="confirm-password"
              name="confirm-password"
              placeholder="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              variant="outlined"
              className="form-control"
              data-testid="confirm-password-input"
              required
              error={confirmPassword !== '' && newPassword !== confirmPassword}
              autoComplete="new-password"
            />
            {confirmPassword !== '' && newPassword !== confirmPassword && (
              <FormHelperText error className="help-block">Passwords do not match.</FormHelperText>
            )}
          </FormControl>

          <Box className="form-actions">
            <Button
              type="button"
              variant="outlined"
              className="back-button"
              onClick={handleBackToLogin}
              data-testid="forgot-reset-back-button"
            >
              Back
            </Button>

            <Button
              type="submit"
              variant="contained"
              className="login-button"
              data-testid="forgot-reset-submit-button"
              disabled={loading || forgotSent || !newPassword || newPassword.length < 8 || newPassword !== confirmPassword}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </Button>
          </Box>
        </Box>
      </>
    );
  };

  return (
    <Box className="login-page">
      {/* Left: Hero panel */}
      <Box className="login-hero">
        <img
          src="/images/VA_logo_white.png"
          alt="VoipAppz Logo"
          className="hero-logo"
        />
        <p className="hero-tagline">VoIP Application Platform</p>

        {/* Decorative isometric blocks */}
        <div className="hero-blocks">
          <div className="block block--orange-lg" />
          <div className="block block--teal" />
          <div className="block block--white-sm" />
          <div className="block block--orange-sm" />
          <div className="block block--navy" />
          <div className="block block--white-lg" />
          <div className="block block--teal-sm" />
        </div>

        <span className="hero-footer">&copy; 2026 VoipAppz</span>
      </Box>

      {/* Right: Form panel */}
      <Box className="login-form-panel">
        <img
          src="/images/VA_logo_blue.png"
          alt="VoipAppz Logo"
          className="form-panel-logo"
        />
        <Paper elevation={0} className="login-paper">
          {!showForgetForm && !otpStep && switcher}
          {showForgetForm
            ? renderForgotForm()
            : otpStep
              ? renderOtpForm()
              : renderLoginForm()
          }
        </Paper>
      </Box>
    </Box>
  );
};

export default Login;
