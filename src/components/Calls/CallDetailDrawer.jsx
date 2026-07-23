import { useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Chip, CircularProgress, Alert, Drawer, IconButton,
  List, ListItem, ListItemText, Button,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CloseIcon from '@mui/icons-material/Close';
import { useTranscript } from './useTranscript';
import { callEvents } from '../../lib/clients/api';
import StatusChip from '../common/StatusChip';
import CallTranscript from './CallTranscript';
import { mockTranscriptForCall, storeMockTranscript } from './conversation-mocks';
import { fmtDuration, asDate } from './callFormat';
import { useDirection } from '../../context/DirectionContext';

// Right-side drawer for a single call: header summary, transcript (with a
// Transcribe action), and the raw event timeline read from the Postgres event
// store via PostgREST (api.events filtered by va_call_uuid).
export default function CallDetailDrawer({ call, onClose, onTxStatus }) {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  const [events, setEvents] = useState(null);
  const { transcript, loading: txLoading, setTranscript } = useTranscript(call?.id);
  const [txTriggering, setTxTriggering] = useState(false);
  const [txError, setTxError] = useState(null);
  // Tracks the call currently shown in the drawer, so the mocked-transcription
  // simulation below can bail if the user switches to (or closes) another call.
  const activeCallRef = useRef(null);

  // Event timeline: read straight from the Postgres event store via PostgREST
  // (api.events filtered by va_call_uuid). Transcript is owned by useTranscript.
  useEffect(() => {
    activeCallRef.current = call?.id ?? null;
    if (!call) return;
    let cancelled = false;
    setEvents(null);
    setTxError(null);
    callEvents(call.id)
      .then((rows) => {
        if (cancelled) return;
        setEvents((Array.isArray(rows) ? rows : []).map((r) => ({
          type: r.event_type, occurred_at: r.created_at, seq: r.event_id, data: r.data,
        })));
      })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [call]);

  // Generate a transcript for this call. The real Gemini transcription backend
  // is bypassed for the demo: we replay the same queued → processing → completed
  // progression locally and reveal a mocked Hebrew conversation picked by call
  // direction (see conversation-mocks.ts). The flow is indistinguishable from
  // the live one in the UI. `activeCallRef` lets us bail if the drawer moves to
  // another call mid-run.
  async function triggerTranscribe() {
    if (!call) return;
    const callId = call.id;
    const stillActive = () => activeCallRef.current === callId;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    setTxTriggering(true);
    setTxError(null);
    try {
      setTranscript({ status: 'queued', segments: [] });
      onTxStatus?.(callId, 'queued');
      await sleep(1000);
      if (!stillActive()) return;
      setTranscript({ status: 'processing', segments: [] });
      onTxStatus?.(callId, 'processing');
      await sleep(2000);
      if (!stillActive()) return;
      const generated = mockTranscriptForCall(call);
      storeMockTranscript(callId, generated);
      setTranscript(generated);
      onTxStatus?.(callId, 'completed');
    } finally {
      if (stillActive()) setTxTriggering(false);
    }
  }

  const txStatus = transcript?.status ?? 'none';
  const canTrigger = !txTriggering && (txStatus === 'none' || txStatus === 'failed' || txStatus === 'completed');

  return (
    <Drawer anchor="right" open={!!call} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6">{t('calls.timeline')}</Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </Box>
      {call && (
        <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            {call.direction === 'inbound'
              ? <CallReceivedIcon fontSize="small" sx={{ color: 'info.main' }} />
              : <CallMadeIcon fontSize="small" sx={{ color: 'success.main' }} />}
            <Typography variant="subtitle1" sx={{ fontWeight: 600, unicodeBidi: 'isolate' }}>{call.from_number} {isRTL ? '←' : '→'} {call.to_number}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <StatusChip status={call.status} />
            <Typography variant="caption" color="text.secondary">
              {fmtDuration(call.duration_seconds)} · {call.leg_count} {t('calls.legsLabel')} · {call.event_count} {t('calls.eventsLabel')}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, unicodeBidi: 'isolate' }}>{call.id}</Typography>
        </Box>
      )}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="overline" color="text.secondary">{t('calls.transcriptLabel')}</Typography>
          <Button
            size="small"
            variant="outlined"
            color="primary"
            startIcon={txTriggering ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeIcon sx={{ fontSize: 16 }} />}
            disabled={!canTrigger}
            onClick={triggerTranscribe}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {txTriggering ? t('calls.tx.triggering') : (txStatus === 'completed' ? t('calls.tx.retranscribe') : t('calls.tx.transcribeNow'))}
          </Button>
        </Box>
        {txError && <Alert severity="warning" sx={{ mt: 1 }}>{txError}</Alert>}
        <Box sx={{ mt: 1 }}><CallTranscript transcript={transcript} loading={txLoading} /></Box>
      </Box>
      <Box sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary">{t('calls.eventTimeline')}</Typography>
        {events === null ? <CircularProgress size={24} /> : (
          <List dense disablePadding>
            {events.map((e, i) => (
              <ListItem key={`${e.seq}-${i}`} sx={{ py: 0.5, px: 0 }}>
                <ListItemText
                  primary={<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Chip size="small" label={e.type} variant="outlined" sx={{ borderRadius: '6px', fontSize: '0.72rem', unicodeBidi: 'isolate' }} />
                    <Typography variant="caption" color="text.secondary">{asDate(e.occurred_at)?.toLocaleTimeString()}</Typography>
                  </Box>}
                />
              </ListItem>
            ))}
            {events.length === 0 && <Typography variant="body2" color="text.secondary">{t('calls.noEvents')}</Typography>}
          </List>
        )}
      </Box>
    </Drawer>
  );
}
