import { Box, Paper, Typography } from '@mui/material';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import { useTranslation } from 'react-i18next';
import StatusChip from '../common/StatusChip';
import TranscriptionChip from './TranscriptionChip';
import { fmtDuration, asDate } from './callFormat';
import { useDirection } from '../../context/DirectionContext';

/**
 * CallMobileCard — one call as a tappable card, the phone-sized replacement for
 * a table row (modeled on nimbus-admin's CallMobileCard, rebuilt on this app's
 * StatusChip / callFormat helpers instead of moment + country flags).
 *
 * Every column of the desktop table survives here — nothing is dropped, it is
 * just stacked: numbers + time on top, duration on the trailing edge, then the
 * status / transcript chips and the leg + event counts.
 *
 * RTL: phone numbers are `unicodeBidi: 'isolate'` so a Hebrew page can't reorder
 * their digits, the from→to arrow follows the reading direction, and spacing is
 * logical (marginInline*) so the card mirrors correctly.
 */
export default function CallMobileCard({ call, onClick }) {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  const inbound = call.direction === 'inbound';
  const DirectionIcon = inbound ? CallReceivedIcon : CallMadeIcon;
  const started = asDate(call.started_at);
  const activate = () => onClick?.(call);

  return (
    <Paper
      elevation={0}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
      }}
      data-testid="call-mobile-card"
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        cursor: 'pointer',
        '&:active': { bgcolor: 'action.selected' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box
          sx={{
            width: 34, height: 34, flexShrink: 0, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: inbound ? 'info.main' : 'success.main', color: 'common.white',
          }}
        >
          <DirectionIcon sx={{ fontSize: 18 }} />
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', unicodeBidi: 'isolate' }} noWrap>
            {call.from_number} {isRTL ? '←' : '→'} {call.to_number}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ unicodeBidi: 'isolate' }} noWrap>
            {started ? started.toLocaleString() : '—'}
          </Typography>
        </Box>

        <Typography
          sx={{
            flexShrink: 0, fontWeight: 600, fontSize: '0.85rem',
            fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate',
          }}
        >
          {fmtDuration(call.duration_seconds)}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}>
        <StatusChip status={call.status} />
        <TranscriptionChip status={call.transcription_status} />
        <Typography variant="caption" color="text.secondary" sx={{ marginInlineStart: 'auto' }}>
          {call.leg_count ?? 0} {t('calls.legsLabel')} · {call.event_count ?? 0} {t('calls.eventsLabel')}
        </Typography>
      </Box>
    </Paper>
  );
}
