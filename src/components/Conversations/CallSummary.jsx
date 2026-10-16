import { Box, Typography } from '@mui/material';
import Bdi from '../../i18n/Bdi';
import { summaryLabelSx, summaryValueSx } from './sessionRowStyles';

const clock = (sec) => {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

/** What the call was: direction, outcome, duration, talk time, agent, recording. Only what is known. */
export default function CallSummary({ s, t }) {
  const url = safeUrl(s.recording_url || (typeof s.recording === 'string' ? s.recording : null));
  const rows = [
    [t('summary.direction'), s.direction && t(`direction.${s.direction}`, { defaultValue: '' })],
    [t('summary.outcome'), s.outcome && t(`outcome.${s.outcome}`, { defaultValue: '' })],
    [t('summary.duration'), s.duration != null && <Bdi>{clock(s.duration)}</Bdi>],
    [t('summary.talk'), s.talk_duration != null && <Bdi>{clock(s.talk_duration)}</Bdi>],
    [t('summary.user'), s.user_name || s.agent_name],
    [t('summary.recording'), url && <a href={url} target="_blank" rel="noopener noreferrer">{t('summary.listen')}</a>],
  ].filter(([, v]) => v);
  if (rows.length === 0) return null;
  return (
    <Box data-testid="call-summary" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, px: 2, py: 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ minWidth: 0 }}>
          <Typography sx={{ display: 'block', ...summaryLabelSx }}>{label}</Typography>
          <Typography component="div" sx={summaryValueSx}>{value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

