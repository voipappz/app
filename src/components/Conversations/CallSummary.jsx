import { Box, Link, Typography } from '@mui/material';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { formatCallDuration } from './groupCallHistory';
import Bdi from '../../i18n/Bdi';

const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

/** One compact call activity. The expandable history is supplied by the thread. */
export default function CallSummary({ s, t, time, children }) {
  const url = safeUrl(s.recording_url || (typeof s.recording === 'string' ? s.recording : null));
  const agent = s.user_name || s.agent_name;
  const incoming = ['incoming', 'inbound'].includes(s.direction);
  const outgoing = ['outgoing', 'outbound'].includes(s.direction);
  const missed = s.outcome === 'missed' || s.outcome === 'failed';
  const Icon = incoming ? CallReceivedIcon : outgoing ? CallMadeIcon : PhoneOutlinedIcon;
  const title = s.outcome === 'failed' ? 'failedCall'
    : s.outcome === 'missed' ? (outgoing ? 'unansweredCall' : 'missedCall')
      : s.outcome === 'bot' ? 'automatedCall'
        : incoming ? 'receivedCall' : outgoing ? 'madeCall' : 'call';
  const duration = s.duration ?? s.talk_duration;
  return (
    <Box data-testid="call-summary" sx={{ display: 'flex', gap: 1.25, width: '100%', boxSizing: 'border-box', py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 30, height: 30, borderRadius: '50%', color: missed ? 'error.main' : 'text.secondary', bgcolor: 'action.hover' }}><Icon sx={{ fontSize: 17 }} /></Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{t(`summary.${title}`)}</Typography>
          {time && <Typography variant="caption" color="text.secondary" sx={{ marginInlineStart: 'auto', fontVariantNumeric: 'tabular-nums' }}>{time}</Typography>}
        </Box>
        {(agent || duration != null || url) && <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5, mt: 0.5, color: 'text.secondary', '& > *': { fontSize: 13 } }}>
          {agent && <Typography sx={{ overflowWrap: 'anywhere' }}>{t('summary.handledBy', { name: agent })}</Typography>}
          {duration != null && !missed && <Typography>{t('summary.duration')} <Bdi>{formatCallDuration(duration)}</Bdi></Typography>}
          {url && <Link href={url} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 32 }}><PlayCircleOutlineIcon sx={{ fontSize: 18 }} />{t('summary.listen')}</Link>}
        </Box>}
        {children}
      </Box>
    </Box>
  );
}
