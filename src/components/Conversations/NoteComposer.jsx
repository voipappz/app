import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, TextField, Typography } from '@mui/material';

/** Mounted per call ID so drafts never move to another conversation. */
export default function NoteComposer({ onNote, sendError }) {
  const { t } = useTranslation('conversations');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      if (await onNote(text.trim())) setText('');
      else setFailed(true);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', p: 1.25, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <TextField size="small" multiline maxRows={4} value={text} disabled={busy}
        onChange={(e) => setText(e.target.value)} placeholder={t('composer.notePlaceholder')}
        inputProps={{ 'aria-label': t('composer.input') }} sx={{ flex: '1 1 160px', minWidth: 0 }} />
      <Button variant="contained" onClick={send} disabled={!text.trim() || busy}>{t('composer.send')}</Button>
      {(sendError || failed) && <Typography role="alert" variant="caption" color="error" sx={{ flexBasis: '100%' }}>{t('composer.error')}</Typography>}
    </Box>
  );
}
