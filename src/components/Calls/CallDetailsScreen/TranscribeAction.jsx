import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { Subtitles as TranscribeIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

/**
 * The Transcribe button for a recorded call with no transcription, as both
 * call screens show it. `request` and `onTranscribe` come from useCallDetails.
 */
export default function TranscribeAction({ request, onTranscribe }) {
  const { t } = useTranslation('calls');
  if (request.status === 'sent') {
    return <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }} role="status">{t('mobile.details.transcribeSent')}</Typography>;
  }
  return (
    <Box sx={{ mt: 1 }}>
      <Button size="small" variant="outlined" startIcon={request.status === 'sending' ? <CircularProgress size={16} /> : <TranscribeIcon />}
        disabled={request.status === 'sending'} onClick={onTranscribe}>
        {t('mobile.details.transcribe')}
      </Button>
      {request.status === 'error' && (
        <Typography variant="body2" color="error" sx={{ mt: 0.5 }} role="alert">{request.error || t('mobile.details.transcribeError')}</Typography>
      )}
    </Box>
  );
}
