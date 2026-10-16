import { Box, Chip, Link, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import Bdi from '../../i18n/Bdi';

const clock = (sec) => {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

/** A readable call card; only show details supplied by the history API. */
export default function CallSummary({ s, t, time }) {
  const url = safeUrl(s.recording_url || (typeof s.recording === 'string' ? s.recording : null));
  const direction = s.direction && t(`direction.${s.direction}`, { defaultValue: '' });
  const agent = s.user_name || s.agent_name;
  const missed = s.outcome === 'missed' || s.outcome === 'failed';
  const Icon = ['incoming', 'inbound'].includes(s.direction) ? CallReceivedIcon : ['outgoing', 'outbound'].includes(s.direction) ? CallMadeIcon : PhoneOutlinedIcon;
  if (!direction && !s.outcome && s.duration == null && s.talk_duration == null && !agent && !url) return null;
  return (
    <Box data-testid="call-summary" sx={{ width: '100%', maxWidth: 460, boxSizing: 'border-box', border: 1, borderColor: 'divider', borderRadius: 3, p: 2, bgcolor: 'background.paper', boxShadow: '0 2px 6px rgba(0,0,0,0.025)' }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', flexShrink: 0, width: 40, height: 40, borderRadius: 2, color: missed ? 'error.main' : 'primary.main', bgcolor: alpha(missed ? theme.palette.error.main : theme.palette.primary.main, 0.08) })}><Icon fontSize="small" /></Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{direction ? t('summary.callDirection', { direction }) : t('summary.call')}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
            {s.outcome && <Chip size="small" label={t(`outcome.${s.outcome}`, { defaultValue: s.outcome })} sx={{ height: 22, fontSize: 12, bgcolor: missed ? 'error.main' : 'action.hover', color: missed ? 'error.contrastText' : 'text.secondary' }} />}
            {time && <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{time}</Typography>}
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 1.5, color: 'text.secondary', '& > *': { fontSize: 13 } }}>
        {s.duration != null && <Typography>{t('summary.duration')} <Bdi>{clock(s.duration)}</Bdi></Typography>}
        {s.talk_duration != null && <Typography>{t('summary.talk')} <Bdi>{clock(s.talk_duration)}</Bdi></Typography>}
        {agent && <Typography sx={{ overflowWrap: 'anywhere' }}>{t('summary.user')} · {agent}</Typography>}
      </Box>
      {url && <Link href={url} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 13, mt: 1.5 }}><PlayCircleOutlineIcon fontSize="small" />{t('summary.listen')}</Link>}
    </Box>
  );
}
