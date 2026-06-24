import { Box, Chip, Typography, CircularProgress } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import PersonIcon from '@mui/icons-material/Person';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

/**
 * Call transcription, rendered as a chat — caller bubbles on one side, agent on
 * the other, with timecodes. Data comes from the event store via
 * GET /calls/:id/transcript (transcription.* events projected in api/store.ts).
 * Mirrors nimbus-admin's CallTranscript bubble layout.
 *
 * Props: transcript = { status, language, confidence, text, segments[], error }
 *        loading     = boolean (fetch in flight)
 */
function fmtTime(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function CallTranscript({ transcript, loading }) {
  const { t } = useTranslation();
  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={20} /></Box>;
  }
  const status = transcript?.status ?? 'none';

  if (status === 'none') {
    return <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>{t('calls.tx.none')}</Typography>;
  }
  if (status === 'queued' || status === 'processing') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2, justifyContent: 'center', color: 'text.secondary' }}>
        <HourglassEmptyIcon fontSize="small" />
        <Typography variant="body2">{status === 'queued' ? t('calls.tx.queuedMsg') : t('calls.tx.processingMsg')}</Typography>
      </Box>
    );
  }
  if (status === 'failed') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2, justifyContent: 'center', color: 'error.main' }}>
        <ErrorOutlineIcon fontSize="small" />
        <Typography variant="body2">{t('calls.tx.failedMsg')}{transcript?.error ? ` — ${transcript.error}` : ''}</Typography>
      </Box>
    );
  }

  const segments = Array.isArray(transcript?.segments) ? transcript.segments : [];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Chip size="small" color="success" variant="outlined" label={t('calls.tx.transcribed')} sx={{ borderRadius: '6px' }} />
        {transcript?.language && <Chip size="small" variant="outlined" label={transcript.language} sx={{ borderRadius: '6px', unicodeBidi: 'isolate' }} />}
        {transcript?.confidence != null && (
          <Typography variant="caption" color="text.secondary">
            {t('calls.tx.confidence')} {Math.round(Number(transcript.confidence) * 100)}%
          </Typography>
        )}
      </Box>

      {segments.length === 0 ? (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{transcript?.text || '—'}</Typography>
      ) : (
        segments.map((seg, i) => {
          const isCaller = seg.speaker === 'caller';
          return (
            <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, flexDirection: isCaller ? 'row' : 'row-reverse' }}>
              {isCaller
                ? <PersonIcon sx={{ fontSize: 20, color: 'info.main', mt: 0.5 }} />
                : <SupportAgentIcon sx={{ fontSize: 20, color: 'success.main', mt: 0.5 }} />}
              <Box sx={{ maxWidth: '78%' }}>
                <Box
                  sx={{
                    px: 1.5, py: 0.75, borderRadius: 2,
                    // agent bubble = a faint tint of the success color. `success.50`/`.100`
                    // are NOT in the default MUI palette, so derive shades via alpha().
                    bgcolor: isCaller ? 'action.hover' : (theme) => alpha(theme.palette.success.main, 0.1),
                    border: 1,
                    borderColor: isCaller ? 'divider' : (theme) => alpha(theme.palette.success.main, 0.3),
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>{seg.text}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: isCaller ? 'left' : 'right', mt: 0.25 }}>
                  {isCaller ? t('calls.tx.caller') : t('calls.tx.agent')} · {fmtTime(seg.start)}
                </Typography>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
