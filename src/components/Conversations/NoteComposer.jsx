import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, TextField, Typography } from '@mui/material';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';

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
    <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', px: { xs: 2, md: 3 }, py: 2 }}>
      <Box sx={{ maxWidth: 720, mx: 'auto', border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden', '&:focus-within': { borderColor: 'primary.main' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, pt: 1.5, color: 'text.secondary' }}>
          <NotesOutlinedIcon sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{t('composer.note')}</Typography>
        </Box>
        <TextField fullWidth multiline minRows={2} maxRows={5} value={text} disabled={busy}
          onChange={(e) => setText(e.target.value)} placeholder={t('composer.notePlaceholder')}
          inputProps={{ 'aria-label': t('composer.input') }}
          sx={{ '& .MuiOutlinedInput-root': { fontSize: 14, alignItems: 'flex-start' }, '& fieldset': { border: 0 } }} />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1.5, pb: 1.5 }}>
          <Button variant="contained" disableElevation onClick={send} disabled={!text.trim() || busy} sx={{ borderRadius: 2, px: 2.5, textTransform: 'none' }}>{t('composer.send')}</Button>
        </Box>
      </Box>
      {(sendError || failed) && <Typography role="alert" variant="caption" color="error" sx={{ display: 'block', maxWidth: 720, mx: 'auto', mt: 1 }}>{t('composer.error')}</Typography>}
    </Box>
  );
}
