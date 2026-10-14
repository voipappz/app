import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, ButtonBase, CircularProgress, Tab, Tabs, TextField, Typography } from '@mui/material';
import { usePhoneSignIn } from './PhoneSignIn.js';
import { ACCENT, MUTED } from './panelTheme.js';
import SecretField from '../common/SecretField.jsx';
import Bdi from '../../i18n/Bdi';
import { isolated } from './isolated.js';

const FIELD_SX = {
  '& .MuiOutlinedInput-root': { bgcolor: 'var(--mui-palette-background-paper)', borderRadius: '8px' },
  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
};

// Static label ABOVE the input, as SipSettingsForm does: floating labels were
// clipped on the tight dark panel.
function Field({ id, label, type = 'text', value, onChange, autoComplete, inputMode, ltr = false }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography component="label" htmlFor={id} sx={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.55)', mb: 0.5 }}>
        {label}
      </Typography>
      {type === 'password' ? (
        <SecretField
          id={id} size="small" fullWidth value={value} onChange={(e) => onChange(e.target.value)} sx={FIELD_SX}
        />
      ) : (
        <TextField
          id={id} size="small" fullWidth type={type} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} inputProps={{ inputMode, dir: ltr ? 'ltr' : undefined }} sx={FIELD_SX}
        />
      )}
    </Box>
  );
}

/**
 * The phone's sign-in for an account session: as a device of the account, or
 * as a user through the portal's login. See usePhoneSignIn.
 */
export default function PhoneSignIn({ device }) {
  const { t } = useTranslation('phone');
  const s = usePhoneSignIn({ device });

  if (s.openedForDevice) {
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, color: '#e5e7eb' }} data-testid="phone-sign-in">
        {s.busy && <CircularProgress size={22} sx={{ color: ACCENT }} />}
        <Typography variant="body2" sx={{ color: MUTED }}>
          {s.busy
            ? t('signIn.signingInAs', { name: isolated(device.name || device.username) })
            : t('signIn.phoneFor', { name: isolated(device.name || device.username) })}
        </Typography>
        {s.error && <Alert severity="error" sx={{ width: '100%' }}>{s.error}</Alert>}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, color: '#e5e7eb' }} data-testid="phone-sign-in">
      <Tabs
        value={s.mode} onChange={(_, v) => s.setMode(v)} variant="fullWidth"
        sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, color: MUTED, textTransform: 'none' }, '& .Mui-selected': { color: `${ACCENT} !important` }, '& .MuiTabs-indicator': { bgcolor: ACCENT } }}
      >
        <Tab value="device" label={t('signIn.tabDevice')} />
        <Tab value="user" label={t('signIn.tabUser')} />
      </Tabs>

      <Box sx={{ p: 1.5, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {s.error && <Alert severity="error" sx={{ mb: 1.5 }}>{s.error}</Alert>}

        {s.mode === 'device' ? (
          <>
            <Field id="phone-device-search" label={t('signIn.findDevice')} value={s.query} onChange={s.setQuery} autoComplete="off" />
            {s.devices.map((d) => (
              <ButtonBase
                key={d.uuid} onClick={() => s.signInAsDevice(d)} disabled={s.busy}
                sx={{ width: '100%', justifyContent: 'space-between', px: 1.25, py: 1, borderRadius: 1, textAlign: 'start', '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
              >
                <Typography component="span" variant="body2" noWrap>{d.name || d.username}</Typography>
                <Typography component="span" variant="caption" sx={{ color: MUTED, fontFamily: 'monospace', ms: 1 }}><Bdi>{d.username}</Bdi></Typography>
              </ButtonBase>
            ))}
          </>
        ) : s.otpStep ? (
          <Box component="form" onSubmit={s.submitCode}>
            <Typography variant="body2" sx={{ color: MUTED, mb: 1.5 }}>{t('signIn.enterCode', { email: isolated(s.email) })}</Typography>
            <Field id="phone-otp" label={t('signIn.verificationCode')} value={s.code} onChange={s.setCode} autoComplete="one-time-code" inputMode="numeric" ltr />
            <Button type="submit" fullWidth variant="contained" size="small" disabled={s.busy}>{t('signIn.verify')}</Button>
          </Box>
        ) : (
          // Its own field names: the admin console's login form uses plain
          // email/password, and the browser would offer that credential here.
          <Box component="form" onSubmit={s.submitUserLogin}>
            <Field id="phone-user-email" label={t('signIn.emailOrExtension')} value={s.email} onChange={s.setEmail} autoComplete="off" ltr />
            <Field id="phone-user-password" label={t('signIn.password')} type="password" value={s.password} onChange={s.setPassword} autoComplete="off" />
            <Button type="submit" fullWidth variant="contained" size="small" disabled={s.busy}>{t('signIn.submit')}</Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
