import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { formatTime } from '../../utils/dateUtils';

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
