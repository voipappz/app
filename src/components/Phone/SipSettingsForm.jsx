// Settings tab. The phone has NO credential fields: it signs in as a device
// from the short-lived token GET /api/devices/:uuid/phone issues (see
// lib/sip/phoneToken.js and SoftphoneContext), so there is no username,
// password or server to type. This shows which device the token is for, the
// server it registers on and when the token renews; Connect asks for a fresh
// token and registers again.
import { useState } from 'react';
import { Box, Button, FormControlLabel, Switch, Typography, Stack } from '@mui/material';
import { useSoftphone } from '../../context/SoftphoneContext';
import { formatDate } from '../../utils/dateUtils';

const STATUS_COLOR = { registered: '#16a34a', connecting: '#f59e0b', failed: '#dc2626', unregistered: '#9ca3af', idle: '#9ca3af' };

const Row = ({ label, value }) => (
  <Box sx={{ mb: 1.25 }}>
    <Typography sx={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.55)', mb: 0.25 }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{value || '—'}</Typography>
  </Box>
);

export default function SipSettingsForm() {
  const { settings, updateSettings, connect, disconnect, status, connected, lastError } = useSoftphone();
  const [busy, setBusy] = useState(false);

  const device = settings.username ? `${settings.username}@${settings.domain}` : '';
  const renews = settings.tokenExp ? formatDate(settings.tokenExp * 1000) : '';

  const onConnect = async () => {
    setBusy(true);
    try { await connect(); } catch { /* lastError says why */ } finally { setBusy(false); }
  };

  return (
    <Box sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: STATUS_COLOR[status] || '#9ca3af' }} />
        <Typography variant="body2" sx={{ color: '#475569' }}>
          {connected ? 'Ready' : status === 'connecting' ? 'Connecting…' : status === 'failed' ? 'Connection failed' : 'Offline'}
        </Typography>
      </Stack>

      <Row label="Device" value={settings.displayName && device ? `${settings.displayName} (${device})` : device} />
      <Row label="WebSocket server" value={settings.wssUrl} />
      <Row label="Sign-in renews at" value={renews} />
      {lastError && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }} data-testid="phone-signin-error">
          {lastError}
        </Typography>
      )}

      <FormControlLabel
        control={<Switch size="small" checked={!!settings.autoConnect} onChange={(e) => updateSettings({ ...settings, autoConnect: e.target.checked })} />}
        label={<Typography variant="body2">Connect automatically</Typography>}
        sx={{ mt: 0.5 }}
      />

      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button fullWidth variant="contained" size="small" disabled={busy || !settings.deviceUuid} onClick={onConnect}>
          {connected ? 'Reconnect' : 'Connect'}
        </Button>
        {connected && (
          <Button fullWidth variant="outlined" size="small" color="inherit" onClick={() => disconnect()}>
            Disconnect
          </Button>
        )}
      </Stack>
    </Box>
  );
}
