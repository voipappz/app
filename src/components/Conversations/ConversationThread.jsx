import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import Bdi from '../../i18n/Bdi';
import { formatTime } from '../../utils/dateUtils';

const clock = (sec) => {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

/** What the call was: direction, outcome, duration, talk time, agent, recording. Only what is known. */
function CallSummary({ s, t }) {
  const url = safeUrl(s.recording_url);
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
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
          <Typography variant="body2" component="div">{value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function Event({ ev, t }) {
  const time = <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{ev.at ? formatTime(ev.at) : ''}</Typography>;
  let box;
  if (ev.kind === 'note') {
    box = (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1, bgcolor: 'background.paper', maxWidth: 380 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t('thread.note')}</Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{ev.text}</Typography>
      </Box>
    );
  } else {
    box = <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{ev.text}</Typography>;
  }
  return (
    <Box data-testid={`event-${ev.kind}`} sx={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: 1.25, alignItems: 'baseline' }}>
      {time}{box}
    </Box>
  );
}

/** Middle pane: one flowing list, notes as cards, the composer writes notes. */
export default function ConversationThread({ selected, events, loading, canNotes, onNote, sendError }) {
  const { t } = useTranslation('conversations');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const canCompose = Boolean(selected) && canNotes;

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const ok = await onNote(body);
    setBusy(false);
    if (ok) setText('');
  };

  if (!selected) {
    return <Box sx={{ p: 3 }}><Typography color="text.secondary">{t('thread.select')}</Typography></Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <CallSummary s={selected} t={t} />
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {loading && <CircularProgress size={22} sx={{ alignSelf: 'center' }} />}
        {!loading && events.length === 0 && <Typography variant="body2" color="text.secondary">{t('thread.empty')}</Typography>}
        {events.map((ev) => <Event key={ev.id} ev={ev} t={t} />)}
      </Box>
      {canCompose && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', p: 1.25, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* A channel switch (note / other channels) can be added here later. */}
          <TextField
            size="small" multiline maxRows={4} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={t('composer.notePlaceholder')}
            inputProps={{ 'aria-label': t('composer.input') }}
            sx={{ flex: '1 1 160px', minWidth: 0 }}
          />
          <Button variant="contained" onClick={send} disabled={!text.trim() || busy}>{t('composer.send')}</Button>
          {sendError && <Typography role="alert" variant="caption" color="error" sx={{ flexBasis: '100%' }}>{t('composer.error')}</Typography>}
        </Box>
      )}
    </Box>
  );
}
