import { Fragment } from 'react';
import NoteComposer from './NoteComposer.jsx';
import { useTranslation } from 'react-i18next';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import CallSummary from './CallSummary.jsx';
import { formatOnlyDate, formatTime } from '../../utils/dateUtils';

function Event({ ev, t }) {
  const time = <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{ev.at ? formatTime(ev.at) : ''}</Typography>;
  let box;
  if (ev.kind === 'call' && (ev.data?.summary === 'true' || ev.data?.summary === true)) {
    box = <CallSummary s={ev.data} t={t} />;
  } else if (ev.kind === 'note') {
    box = (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1, bgcolor: 'background.paper', maxWidth: 380 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t('thread.note')}{ev.user_name || ev.agent_name ? ` · ${ev.user_name || ev.agent_name}` : ''}</Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{ev.text}</Typography>
      </Box>
    );
  } else {
    const action = ev.kind === 'call' ? (ev.data?.action || ev.text) : null;
    const label = action ? t(`events.${action}`, { defaultValue: ev.text || '' }) : ev.text;
    box = <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{label}</Typography>;
  }
  return (
    <Box data-testid={`event-${ev.kind}`} sx={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: 1.25, alignItems: 'baseline' }}>
      {time}{box}
    </Box>
  );
}

/** Middle pane: one flowing list, notes as cards, the composer writes notes. */
export default function ConversationThread({ selected, events, loading, error, onRetry, canNotes, onNote, sendError }) {
  const { t } = useTranslation('conversations');
  if (!selected) {
    return <Box sx={{ p: 3 }}><Typography color="text.secondary">{t('thread.select')}</Typography></Box>;
  }

  const summary = events.find((ev) => ev.kind === 'call' && ev.data?.call_uuid === selected.call_uuid && (ev.data?.summary === 'true' || ev.data?.summary === true));
  const ordered = [...events].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {!summary && <CallSummary s={selected} t={t} />}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {loading && <CircularProgress size={22} sx={{ alignSelf: 'center' }} />}
        {!loading && !error && events.length === 0 && <Typography variant="body2" color="text.secondary">{t('thread.empty')}</Typography>}
        {error && <Box role="alert"><Typography color="error">{t('thread.error')}</Typography><Button onClick={onRetry}>{t('thread.retry')}</Button></Box>}
        {!loading && !error && ordered.map((ev, index) => {
          const day = ev.at ? formatOnlyDate(ev.at) : '';
          const previous = index > 0 && ordered[index - 1].at ? formatOnlyDate(ordered[index - 1].at) : '';
          return <Fragment key={ev.id}>
            {day && day !== previous && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>{day}</Typography>}
            <Event ev={ev} t={t} />
          </Fragment>;
        })}
      </Box>
      {canNotes && <NoteComposer key={selected.call_uuid} onNote={onNote} sendError={sendError} />}
    </Box>
  );
}
