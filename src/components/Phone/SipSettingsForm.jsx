// Settings tab — SIP config (jambonz "Settings" screen). Defaults come from
// VITE_SIP_* so only the extension creds are usually needed. Connect/Disconnect
// toggles registration; status dot shows ● Ready / ○ Offline / failed.
import { useState } from 'react';
import { Box, TextField, Button, FormControlLabel, Switch, Typography, Stack } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSipPhoneCtx } from '../../context/SipPhoneContext';

const STATUS_COLOR = { registered: '#16a34a', connecting: '#f59e0b', failed: '#dc2626', unregistered: '#9ca3af', idle: '#9ca3af' };

export default function SipSettingsForm() {
  const { t } = useTranslation();
  const { settings, updateSettings, connect, disconnect, status, connected } = useSipPhoneCtx();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const field = (k, label, type = 'text') => (
    <TextField size="small" fullWidth type={type} label={label} value={form[k] ?? ''} onChange={set(k)} margin="dense" />
  );

  const onConnect = async () => {
    setBusy(true);
    try { updateSettings(form); await connect(form); } catch { /* status reflects failure */ } finally { setBusy(false); }
  };

  return (
    <Box sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: STATUS_COLOR[status] || '#9ca3af' }} />
        <Typography variant="body2" sx={{ color: '#475569' }}>
          {connected ? t('phone.ready', 'Ready') : status === 'connecting' ? t('phone.connecting', 'Connecting…') : status === 'failed' ? t('phone.failed', 'Connection failed') : t('phone.offline', 'Offline')}
        </Typography>
      </Stack>

      {field('username', t('phone.extension', 'Extension'))}
      {field('password', t('phone.password', 'Password'), 'password')}
      {field('domain', t('phone.domain', 'SIP domain'))}
      {field('wssUrl', t('phone.server', 'WebSocket server'))}
      {field('displayName', t('phone.displayName', 'Display name'))}

      <FormControlLabel
        control={<Switch size="small" checked={!!form.autoConnect} onChange={(e) => setForm((f) => ({ ...f, autoConnect: e.target.checked }))} />}
        label={<Typography variant="body2">{t('phone.autoConnect', 'Connect automatically')}</Typography>}
        sx={{ mt: 0.5 }}
      />

      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button fullWidth variant="contained" size="small" disabled={busy} onClick={onConnect}>
          {connected ? t('phone.reconnect', 'Reconnect') : t('phone.connect', 'Connect')}
        </Button>
        {connected && (
          <Button fullWidth variant="outlined" size="small" color="inherit" onClick={() => disconnect()}>
            {t('phone.disconnect', 'Disconnect')}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
