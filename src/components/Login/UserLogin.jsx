import { useEffect, useRef, useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
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
import { useOptionalLocale } from '../../i18n/LocaleContext';
import useCustomerDefaultLanguage from '../../i18n/useCustomerDefaultLanguage';
import { loadCustomerPortalData } from '../../services/customerPortalService';
import './Login.css';
import './UserLogin.css';

// The `/` entry point — a compact, tenant-branded customer login that remains
// easy to use on a phone and keeps admin credentials visually distinct.
// Administrators reach the account sign-in through the small link at the bottom.
// Six boxes, always left to right. Typing moves on, backspace moves back and a
// pasted code fills them all; the value still reaches the hook as one string.
function OtpBoxes({ value, onChange, label }) {
  const refs = useRef([]);
  const set = (next) => onChange({ target: { value: next } });
  const focus = (i) => refs.current[Math.max(0, Math.min(5, i))]?.focus();
  const type = (i, raw) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return;
    const chars = value.padEnd(6, ' ').split('');
    digits.split('').forEach((d, k) => { if (i + k < 6) chars[i + k] = d; });
    set(chars.join('').replace(/ /g, ''));
    focus(i + digits.length);
  };
  const key = (i, e) => {
    if (e.key !== 'Backspace') return;
    e.preventDefault();
    const chars = value.padEnd(6, ' ').split('');
    if (chars[i] !== ' ') chars[i] = ' '; else if (i > 0) { chars[i - 1] = ' '; focus(i - 1); }
    set(chars.join('').trimEnd().replace(/ /g, ''));
  };
  return (
    <Box className="ul-otp" data-testid="user-otp-input">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i} ref={(el) => { refs.current[i] = el; }} value={value[i] || ''} aria-label={label(i + 1)}
          inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} autoFocus={i === 0}
          onChange={(e) => type(i, e.target.value)} onKeyDown={(e) => key(i, e)}
          onPaste={(e) => { e.preventDefault(); type(0, e.clipboardData.getData('text')); }}
        />
      ))}
    </Box>
  );
}

const UserLogin = () => {
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
  const locale = useOptionalLocale();
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

        <Box className="ul-row">
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
        </Box>
      </Box>

      <Box className="ul-qr"><i aria-hidden="true" /><span>{t('user.qrHint')}</span></Box>
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
        <OtpBoxes value={otpCode} onChange={handleOtpCodeChange} label={(n) => t('otp.digit', { n })} />

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
    <Box className="ul-page" style={brandColor ? { '--accent-color': brandColor } : undefined}>
      <Box component="aside" className="ul-brand">
        <Box className="ul-logo">
          {brandLogo ? <img src={brandLogo} alt={brandName} /> : <span>{brandName}</span>}
        </Box>
        <Box className="ul-hero">
          <Box className="ul-circle" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z" /></svg>
          </Box>
          <Box className="ul-eq" aria-hidden="true">
            {[8, 15, 22, 13, 7].map((h, i) => <i key={i} style={{ height: h }} />)}
          </Box>
          <Box>
            <h2>{t('user.brandHeadline')}</h2>
            <p>{t('user.brandLine')}</p>
          </Box>
        </Box>
        {locale ? (
          <Box className="ul-lang" role="group" aria-label={t('user.language')}>
            <button type="button" aria-pressed={locale.language === 'en'} onClick={() => locale.setLanguage('en')}>English</button>
            <button type="button" aria-pressed={locale.language === 'he'} onClick={() => locale.setLanguage('he')}>עברית</button>
          </Box>
        ) : <span />}
      </Box>
      <Box className="ul-form">
        {qrSigningIn ? (
          <Box data-testid="qr-signing-in" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
            <CircularProgress />
            <Typography>{t('user.signingYouIn')}</Typography>
          </Box>
        ) : (
          showForgetForm
            ? renderForgotForm()
            : otpStep
              ? renderOtpForm()
              : renderLoginForm()
        )}
        {!qrSigningIn && !showForgetForm && !otpStep && (
          <Typography className="ul-admin" component="div">
            {t('user.adminPrompt')} <a href="/admin">{t('user.adminLink')}</a>
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default UserLogin;
