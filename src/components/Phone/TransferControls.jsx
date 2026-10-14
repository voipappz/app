// TransferControls — the in-call transfer panel (PBX REFER). Two shapes:
//   picking     -> target field + "Transfer now" (blind) / "Consult" (attended)
//   consulting  -> the second leg is up: "Complete transfer" / "Cancel"
//
// The panel opens on demand (`open`), but it also forces itself open whenever
// the hook reports a transfer or a consultation leg — those outlive the button
// press and the user must be able to finish or abandon them.
//
// It never decides whether a transfer succeeded: that comes from the SIP NOTIFY
// via the hook's `transfer` state, which this only renders.
//
// Ported from app (i18n stripped, useSipPhoneCtx -> useSoftphone).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, IconButton, Stack, TextField, Typography } from '@mui/material';
import PhoneForwardedIcon from '@mui/icons-material/PhoneForwarded';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import CloseIcon from '@mui/icons-material/Close';
import { useSoftphone } from '../../context/SoftphoneContext';
import { isolated } from './isolated.js';
import { ACCENT, DANGER, GREEN, MUTED } from './panelTheme';

const FIELD_SX = {
  '& .MuiOutlinedInput-root': { bgcolor: 'var(--mui-palette-background-paper)', borderRadius: 1.5 }
};

export default function TransferControls({ open, onClose, callActive }) {
  const { t } = useTranslation('phone');
  const {
    transfer, consult, transferBlind, startAttendedTransfer,
    completeAttendedTransfer, cancelAttendedTransfer
  } = useSoftphone();
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
    ? t('transfer.referring')
    : transfer?.phase === 'completed'
      ? t('transfer.completed')
      : transfer?.phase === 'failed'
        ? t('transfer.failed', { reason: transfer.reason || '' })
        : null;

  if (!open && !consulting && !transfer) return null;

  return (
    <Box sx={{ mt: 1, p: 1.25, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.18)', textAlign: 'start' }} data-testid="phone-transfer-panel">
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED }}>
          {consulting ? t('transfer.consulting', { remote: isolated(consult.remote) }) : t('transfer.to')}
        </Typography>
        {!consulting && !referring && (
          <IconButton size="small" sx={{ color: MUTED }} onClick={closeAndReset} aria-label={t('action.close')}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {consulting ? (
        <>
          <Typography sx={{ fontSize: '0.72rem', color: MUTED, mb: 1 }}>
            {consult.state === 'active' ? t('transfer.connectedAnnounce') : t('transfer.ringing')}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              data-testid="phone-transfer-complete"
              fullWidth size="small" variant="contained"
              disabled={busy || consult.state !== 'active'}
              onClick={complete}
              sx={{ bgcolor: GREEN, borderRadius: 1.5, '&:hover': { bgcolor: '#28b14c' } }}
            >
              {t('transfer.complete')}
            </Button>
            <Button
              data-testid="phone-transfer-cancel"
              fullWidth size="small" variant="outlined" disabled={busy} onClick={cancel}
              sx={{ borderRadius: 1.5, color: '#e5e7eb', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              {t('transfer.cancel')}
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
            placeholder={t('transfer.target')}
            inputProps={{ style: { direction: 'ltr', color: 'var(--mui-palette-text-primary)' } }}
            sx={FIELD_SX}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              data-testid="phone-transfer-blind"
              fullWidth size="small" variant="contained" startIcon={<PhoneForwardedIcon fontSize="small" />}
              disabled={!canStart || referring} onClick={blind}
              sx={{ bgcolor: GREEN, borderRadius: 1.5, '&:hover': { bgcolor: '#28b14c' } }}
            >
              {t('transfer.now')}
            </Button>
            <Button
              data-testid="phone-transfer-attended"
              fullWidth size="small" variant="outlined" startIcon={<PhoneInTalkIcon fontSize="small" />}
              disabled={!canStart || referring} onClick={consultFirst}
              sx={{ borderRadius: 1.5, color: '#e5e7eb', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              {t('transfer.consult')}
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
