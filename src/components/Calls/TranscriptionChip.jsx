import { Chip } from '@mui/material';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import { useTranslation } from 'react-i18next';

// Transcription job status → compact chip. Unknown/none renders a dash.
// Shared by the desktop Calls table and the mobile call card.
const TX_COLOR = { completed: 'success', processing: 'warning', queued: 'default', failed: 'error' };
const TX_LABEL_KEY = { completed: 'transcript', processing: 'transcribing', queued: 'queued', failed: 'failed' };

export default function TranscriptionChip({ status }) {
  const { t } = useTranslation();
  const color = TX_COLOR[status];
  if (!color) return <span style={{ color: 'var(--mui-palette-text-disabled, #aaa)' }}>—</span>;
  return (
    <Chip
      size="small"
      icon={<SubtitlesIcon sx={{ fontSize: 15 }} />}
      label={t(`calls.tx.${TX_LABEL_KEY[status]}`)}
      color={color}
      variant="outlined"
      sx={{ borderRadius: '6px', fontSize: '0.7rem', unicodeBidi: 'isolate' }}
    />
  );
}
