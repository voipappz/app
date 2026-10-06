import { useEffect, useState } from 'react';
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
  IconButton,
  InputAdornment
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { Trans, useTranslation } from 'react-i18next';
import { useUserLogin } from './UserLogin';
import LanguageLink from '../../i18n/LanguageLink';
import useCustomerDefaultLanguage from '../../i18n/useCustomerDefaultLanguage';
import { loadCustomerPortalData } from '../../services/customerPortalService';
import './Login.css';

// The `/` entry point — a compact, tenant-branded customer login that remains
// easy to use on a phone and keeps admin credentials visually distinct.
// `switcher`: the User / Account toggle (SignIn), shown on the credentials step.
const UserLogin = ({ switcher = null }) => {
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
    handleForgotResetSubmit,
    qrSigningIn
  } = useUserLogin();
  const { t } = useTranslation('auth');
  const [showPassword, setShowPassword] = useState(false);

  // Per-tenant branding (logo, brand colour) for this unauthenticated screen —
  // resolved server-side from the request's origin host. Always fetched
  // fresh (no localStorage cache) — starts with no logo until the network
  // request resolves.
  const [portalData, setPortalData] = useState(null);
  useEffect(() => {
    let alive = true;
    loadCustomerPortalData().then((data) => { if (alive && data) setPortalData(data); });
    return () => { alive = false; };
  }, []);

  // The customer is known from the site address, so its language can apply
  // before anyone signs in (and stays after).
  useCustomerDefaultLanguage(portalData?.language);

  const brandColor = portalData?.logo_color;
  // The logo is the customer's own, from customer_portal_data — never a
  // VoipAppz fallback. No logo_url, no logo.
  const brandLogo = portalData?.logo_url || null;
  const brandName = portalData?.logo_title || 'VoipAppz';

  // Favicon/title only while THIS screen is mounted — the admin console (and
  // the account side of the sign-in toggle) must keep its own tab identity, not
  // inherit a tenant's portal branding just because this was on screen.
  useEffect(() => {
    if (!portalData) return;
    const favicon = document.querySelector('link[rel="icon"]');
    const previousTitle = document.title;
    const previousFaviconHref = favicon?.href;
    if (portalData.logo_title) document.title = portalData.logo_title;
    if (portalData.logo_icon && favicon) favicon.href = portalData.logo_icon;
    return () => {
      document.title = previousTitle;
      if (favicon && previousFaviconHref) favicon.href = previousFaviconHref;
    };
  }, [portalData]);
  // A HINT ONLY — it changes copy, never the flow: the step-1 login response
  // (otp_sent) stays the authority on whether OTP actually happens. Reads the
  // same customer-profile key the server enforces on (login_otp_enabled),
  // with the server's own truthy rule, so the hint can't disagree with the
  // enforcement. No portal data (or an older API) defaults to true, matching
  // the backend's own default when the profile key is unset.
  const expectsOtp = (() => {
    const val = portalData?.login_otp_enabled;
    if (val === undefined || val === null || val === '') return true;
    return ['true', '1', 'yes', 'on', 'enabled'].includes(String(val).trim().toLowerCase());
  })();

  const renderLoginForm = () => (
    <>
      <Typography component="h1" className="form-title">
        {t('user.title')}
      </Typography>
      <Typography variant="body2" className="forgot-description">
        {t('user.subtitle')}
      </Typography>

      {expectsOtp && (
        <Typography variant="body2" className="forgot-description" data-testid="user-otp-hint">
          {t('user.otpHint')}
        </Typography>
      )}

      {error && (
        <Alert severity="error" className="login-alert" data-testid="user-error-message">
          {error}
        </Alert>
      )}

      {/* Distinct field names (portal_email / portal_password) and form id
          from the admin form's plain email/password. Chrome keys saved
          credentials by ORIGIN, so the user and account forms on one host
          share a store no matter what — but its form-signature heuristics weight
          field names heavily, and identical names on both screens is what
          made it offer the admin password on the portal (and overwrite one
          with the other). This separates them as far as a single origin
          allows; genuinely separate credentials would need the portal on
          its own subdomain. */}
      <Box component="form" id="portal-login-form" name="portal-login" action="/portal-login" method="post" onSubmit={handleSubmit} className="login-form" data-testid="user-login-form">
        <FormControl fullWidth className="form-group">
          <TextField
            size="medium"
            fullWidth
            id="user-email"
            name="portal_email"
            label={t('user.identifier')}
            placeholder={t('user.identifierPlaceholder')}
            value={email}
            onChange={handleEmailChange}
            onBlur={() => handleBlur('email')}
            variant="outlined"
            className="form-control"
            data-testid="user-email-input"
            required
            error={touched.email && email === ''}
            // type="text", not "email": the platform accepts either an email
            // address OR an extension number as the identifier — the same
            // param, dispatched on format server-side (Mediators::User::Login
            // #find_user!). type="email" made the browser reject "2300"
            // before the form could ever be submitted.
            type="text"
            inputMode="text"
            autoComplete="section-portal username"
          />
          {touched.email && email === '' && (
            <FormHelperText error className="help-block">{t('user.identifierRequired')}</FormHelperText>
          )}
        </FormControl>

        <FormControl fullWidth className="form-group">
          <TextField
            size="medium"
            fullWidth
            id="user-password"
            name="portal_password"
            label={t('field.password')}
            placeholder={t('field.passwordPlaceholder')}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={handlePasswordChange}
            onBlur={() => handleBlur('password')}
            variant="outlined"
            className="form-control"
            data-testid="user-password-input"
            required
            error={touched.password && password === ''}
            autoComplete="section-portal current-password"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? t('user.hidePassword') : t('user.showPassword')}
                    edge="end"
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          {touched.password && password === '' && (
            <FormHelperText error className="help-block">{t('field.passwordRequired')}</FormHelperText>
          )}
        </FormControl>

        <Box className="form-actions">
          <Button
            type="submit"
            variant="contained"
            className="login-button"
            data-testid="user-login-button"
            disabled={loading || !email || !password}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {loading ? t('user.signingIn') : t('user.signIn')}
          </Button>

          <Typography
            variant="body2"
            component="button"
            type="button"
            className="forgot-password"
            onClick={handleForgotPasswordClick}
            data-testid="user-forgot-password-link"
          >
            {t('forgot.linkUser')}
          </Typography>

        </Box>
      </Box>
    </>
  );

  const renderOtpForm = () => (
    <>
      <Typography component="h3" className="form-title">
        {t('otp.title')}
      </Typography>

      <Typography component="p" className="forgot-description">
        <Trans t={t} i18nKey="otp.codeSentContinue" components={{ email: <strong>{email}</strong> }} />
      </Typography>

      {error && (
        <Alert severity="error" className="login-alert" data-testid="user-otp-error-message">
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleOtpSubmit} className="login-form" data-testid="user-otp-form">
        <FormControl fullWidth className="form-group">
          <TextField
            size="medium"
            fullWidth
            id="user-otp-code"
            name="otp-code"
            label={t('field.verificationCode')}
            placeholder={t('field.codePlaceholder')}
            value={otpCode}
            onChange={handleOtpCodeChange}
            variant="outlined"
            className="form-control"
            data-testid="user-otp-input"
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
            data-testid="user-otp-back-button"
          >
            {t('action.back')}
          </Button>

          <Button
            type="submit"
            variant="contained"
            className="login-button"
            data-testid="user-otp-submit-button"
            disabled={loading || otpCode.length !== 6}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {loading ? t('otp.verifying') : t('otp.verify')}
          </Button>
        </Box>
      </Box>
    </>
  );

  const renderForgotForm = () => {
    if (forgotStep === 1) {
      return (
        <>
          <Typography component="h3" className="form-title">
            {t('forgot.title')}
          </Typography>

          <Typography component="p" className="forgot-description">
            {t('forgot.enterEmail')}
          </Typography>

          {error && (
            <Alert severity="error" className="login-alert" data-testid="user-forgot-error-message">
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleForgotEmailSubmit} className="login-form" data-testid="user-forgot-form">
            <FormControl fullWidth className="form-group">
              <TextField
                size="medium"
                fullWidth
                id="user-forgot-email"
                name="forgot-email"
                label={t('field.email')}
                placeholder="you@example.com"
                value={forgotEmail}
                onChange={handleForgotEmailChange}
                onBlur={() => handleBlur('forgotEmail')}
                variant="outlined"
                className="form-control"
                data-testid="user-forgot-email-input"
                required
                error={touched.forgotEmail && forgotEmail === ''}
                type="email"
                autoComplete="off"
              />
              {touched.forgotEmail && forgotEmail === '' && (
                <FormHelperText error className="help-block">{t('field.emailRequired')}</FormHelperText>
              )}
            </FormControl>

            <Box className="form-actions">
              <Button
                type="button"
                variant="outlined"
                className="back-button"
                onClick={handleBackToLogin}
                data-testid="user-back-button"
              >
                {t('action.back')}
              </Button>

              <Button
                type="submit"
                variant="contained"
                className="forgot-submit-button"
                data-testid="user-forgot-submit-button"
                disabled={loading || !forgotEmail}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {loading ? t('forgot.sending') : t('forgot.submit')}
              </Button>
            </Box>
          </Box>
        </>
      );
    }

    if (forgotStep === 2) {
      return (
        <>
          <Typography component="h3" className="form-title">
            {t('forgot.verifyEmailTitle')}
          </Typography>

          <Typography component="p" className="forgot-description">
            <Trans t={t} i18nKey="forgot.codeSent" components={{ email: <strong>{forgotEmail}</strong> }} />
          </Typography>

          {error && (
            <Alert severity="error" className="login-alert" data-testid="user-forgot-otp-error">
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleForgotOtpSubmit} className="login-form" data-testid="user-forgot-otp-form">
            <FormControl fullWidth className="form-group">
              <TextField
                size="medium"
                fullWidth
                id="user-forgot-otp-code"
                name="forgot-otp-code"
                label={t('field.verificationCode')}
                placeholder={t('field.codePlaceholder')}
                value={forgotOtpCode}
                onChange={handleForgotOtpChange}
                variant="outlined"
                className="form-control"
                data-testid="user-forgot-otp-input"
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
                data-testid="user-forgot-otp-back-button"
              >
                {t('action.back')}
              </Button>

              <Button
                type="submit"
                variant="contained"
                className="login-button"
                data-testid="user-forgot-otp-submit-button"
                disabled={loading || forgotOtpCode.length !== 6}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {loading ? t('otp.verifying') : t('otp.verify')}
              </Button>
            </Box>
          </Box>
        </>
      );
    }

    return (
      <>
        <Typography component="h3" className="form-title">
          {t('forgot.newPasswordTitle')}
        </Typography>

        <Typography component="p" className="forgot-description">
          {t('forgot.newPasswordHint')}
        </Typography>

        {error && (
          <Alert
            severity={forgotSent ? 'success' : 'error'}
            className="login-alert"
            data-testid="user-forgot-reset-error"
          >
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleForgotResetSubmit} className="login-form" data-testid="user-forgot-reset-form">
          <FormControl fullWidth className="form-group">
            <TextField
              size="medium"
              fullWidth
              id="user-new-password"
              name="new-password"
              label={t('field.newPassword')}
              placeholder={t('field.newPasswordPlaceholder')}
              type="password"
              value={newPassword}
              onChange={handleNewPasswordChange}
              variant="outlined"
              className="form-control"
              data-testid="user-new-password-input"
              required
              autoFocus
              autoComplete="new-password"
            />
          </FormControl>

          <FormControl fullWidth className="form-group">
            <TextField
              size="medium"
              fullWidth
              id="user-confirm-password"
              name="confirm-password"
              label={t('field.confirmPassword')}
              placeholder={t('field.confirmPasswordPlaceholder')}
              type="password"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              variant="outlined"
              className="form-control"
              data-testid="user-confirm-password-input"
              required
              error={confirmPassword !== '' && newPassword !== confirmPassword}
              autoComplete="new-password"
            />
            {confirmPassword !== '' && newPassword !== confirmPassword && (
              <FormHelperText error className="help-block">{t('field.passwordsDoNotMatch')}</FormHelperText>
            )}
          </FormControl>

          <Box className="form-actions">
            <Button
              type="button"
              variant="outlined"
              className="back-button"
              onClick={handleBackToLogin}
              data-testid="user-forgot-reset-back-button"
            >
              {t('action.back')}
            </Button>

            <Button
              type="submit"
              variant="contained"
              className="login-button"
              data-testid="user-forgot-reset-submit-button"
              disabled={loading || forgotSent || !newPassword || newPassword.length < 8 || newPassword !== confirmPassword}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
            >
              {loading ? t('forgot.resetting') : t('forgot.reset')}
            </Button>
          </Box>
        </Box>
      </>
    );
  };

  return (
    <Box className="login-page login-page--portal" style={brandColor ? { '--accent-color': brandColor } : undefined}>
      <Paper elevation={0} className="login-paper">
        {brandLogo && (
          <Box className="portal-login-brand">
            <img src={brandLogo} alt={brandName} className="portal-login-logo" />
          </Box>
        )}
        {qrSigningIn ? (
          <Box data-testid="qr-signing-in" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
            <CircularProgress />
            <Typography>{t('user.signingYouIn')}</Typography>
          </Box>
        ) : (<>
        {!showForgetForm && !otpStep && switcher}
        {showForgetForm
          ? renderForgotForm()
          : otpStep
            ? renderOtpForm()
            : renderLoginForm()
        }
        </>)}
        <Typography variant="caption" className="portal-login-footer">
          {t('user.secureFooter')}
        </Typography>
      </Paper>
      {/* Below the card: available, but never in the way of signing in. */}
      <LanguageLink sx={{ mt: 2 }} />
    </Box>
  );
};

export default UserLogin;
