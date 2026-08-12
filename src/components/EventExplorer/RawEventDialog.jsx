import { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useTranslation } from 'react-i18next';

const json = (value) => JSON.stringify(value, null, 2);

export default function RawEventDialog({ event, onClose }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [event]);
  if (!event) return null;

  const raw = event.raw_payload ?? null;
  const copy = async () => {
    await navigator.clipboard?.writeText(json(raw));
    setCopied(true);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" data-testid="raw-event-dialog">
      <DialogTitle sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{event.event_id}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {t('eventExplorer.rawPayload', 'Raw event as stored')}
        </Typography>
        <Box component="pre" sx={{ m: 0, p: 2, overflow: 'auto', maxHeight: '52vh', borderRadius: 1,
          bgcolor: 'action.hover', fontSize: '0.78rem', direction: 'ltr', textAlign: 'left' }}>
          {json(raw)}
        </Box>
        <Divider sx={{ my: 2 }} />
        <Box component="details">
          <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 600 }}>
            {t('eventExplorer.normalizedPayload', 'Normalized Deno projection')}
          </Box>
          <Box component="pre" sx={{ p: 2, overflow: 'auto', borderRadius: 1, bgcolor: 'action.hover',
            fontSize: '0.78rem', direction: 'ltr', textAlign: 'left' }}>
            {json(event.payload)}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={copy} startIcon={<ContentCopyIcon />}>
          {copied ? t('eventExplorer.copied', 'Copied') : t('eventExplorer.copyRaw', 'Copy raw JSON')}
        </Button>
        <Button onClick={onClose}>{t('common.buttons.close', 'Close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
