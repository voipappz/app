// TransferControls — the in-call transfer panel (PBX REFER), rendered under
// PhoneWidget's active-call control row. Two shapes:
//
//   picking     → target field + "Transfer now" (blind) / "Consult" (attended)
//   consulting  → the second leg is up: "Complete transfer" / "Cancel"
//
// The panel opens on demand (`open`), but it also forces itself open whenever
// the hook reports a transfer or a consultation leg — those outlive the button
// press and the user must be able to finish or abandon them.
//
// It never decides whether a transfer succeeded: that comes from the SIP NOTIFY
// via the hook's `transfer` state, which this only renders.
import { useState } from 'react';
import { Box, Button, IconButton, Stack, TextField, Typography } from '@mui/material';
import PhoneForwardedIcon from '@mui/icons-material/PhoneForwarded';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { useSipPhoneCtx } from '../../context/SipPhoneContext';
import { ACCENT, DANGER, GREEN, MUTED } from './panelTheme';

const FIELD_SX = {
  '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 1.5 },
};

export default function TransferControls({ open, onClose, callActive }) {
  const { t } = useTranslation();
  const {
    transfer, consult, transferBlind, startAttendedTransfer,
    completeAttendedTransfer, cancelAttendedTransfer,
  } = useSipPhoneCtx();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const consulting = Boolean(consult && consult.state !== 'ended');
  const referring = transfer?.phase === 'referring';
  const canStart = callActive && !busy && Boolean(target.trim());

  // Every action is fire-and-report: the hook throws with a reason, which it has
  // already pushed into `lastError` (shown in the panel header).
  const run = async (action) => {
    setBusy(true);
    try { await action(); } catch { /* surfaced via lastError */ }
    finally { setBusy(false); }
  };

  const closeAndReset = () => { setTarget(''); onClose(); };
  const blind = () => run(async () => { await transferBlind(target); closeAndReset(); });
  const consultFirst = () => run(() => startAttendedTransfer(target));
  const complete = () => run(async () => { await completeAttendedTransfer(); closeAndReset(); });
  const cancel = () => run(async () => { await cancelAttendedTransfer(); closeAndReset(); });

  const statusLine = referring
    ? t('phone.transferring', 'Transferring…')
    : transfer?.phase === 'completed'
    ? t('phone.transferCompleted', 'Call transferred')
    : transfer?.phase === 'failed'
    ? t('phone.transferFailed', 'Transfer failed: {{reason}}', { reason: transfer.reason || '' })
    : null;

  if (!open && !consulting && !transfer) return null;

  return (
    <Box sx={{ mt: 1, p: 1.25, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.18)', textAlign: 'start' }} data-testid="phone-transfer-panel">
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED }}>
          {consulting ? t('phone.consulting', 'Consulting {{target}}', { target: consult.remote }) : t('phone.transferTo', 'Transfer to')}
        </Typography>
        {!consulting && !referring && (
          <IconButton size="small" sx={{ color: MUTED }} onClick={closeAndReset} aria-label={t('phone.close', 'Close')}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {consulting ? (
        <>
          <Typography sx={{ fontSize: '0.72rem', color: MUTED, mb: 1 }}>
            {consult.state === 'active' ? t('phone.consultConnected', 'Connected — announce the call') : t('phone.ringing', 'Ringing…')}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              data-testid="phone-transfer-complete"
              fullWidth size="small" variant="contained"
              disabled={busy || consult.state !== 'active'}
              onClick={complete}
              sx={{ bgcolor: GREEN, borderRadius: 1.5, '&:hover': { bgcolor: '#28b14c' } }}
            >
              {t('phone.completeTransfer', 'Complete transfer')}
            </Button>
            <Button
              data-testid="phone-transfer-cancel"
              fullWidth size="small" variant="outlined" disabled={busy} onClick={cancel}
              sx={{ borderRadius: 1.5, color: '#e5e7eb', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              {t('phone.cancelTransfer', 'Cancel')}
            </Button>
          </Stack>
        </>
      ) : (
        <>
          <TextField
            data-testid="phone-transfer-target"
            fullWidth size="small" value={target} disabled={busy || referring}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canStart) blind(); }}
            placeholder={t('phone.transferTarget', 'Extension or number')}
            inputProps={{ style: { direction: 'ltr', color: '#0f172a' } }}
            sx={FIELD_SX}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              data-testid="phone-transfer-blind"
              fullWidth size="small" variant="contained" startIcon={<PhoneForwardedIcon fontSize="small" />}
              disabled={!canStart || referring} onClick={blind}
              sx={{ bgcolor: GREEN, borderRadius: 1.5, '&:hover': { bgcolor: '#28b14c' } }}
            >
              {t('phone.blindTransfer', 'Transfer now')}
            </Button>
            <Button
              data-testid="phone-transfer-attended"
              fullWidth size="small" variant="outlined" startIcon={<PhoneInTalkIcon fontSize="small" />}
              disabled={!canStart || referring} onClick={consultFirst}
              sx={{ borderRadius: 1.5, color: '#e5e7eb', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              {t('phone.attendedTransfer', 'Consult')}
            </Button>
          </Stack>
        </>
      )}

      {statusLine && (
        <Typography
          data-testid="phone-transfer-status"
          sx={{ mt: 1, fontSize: '0.7rem', color: transfer?.phase === 'failed' ? DANGER : ACCENT }}
        >
          {statusLine}
        </Typography>
      )}
    </Box>
  );
}
