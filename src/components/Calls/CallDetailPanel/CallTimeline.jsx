import { useEffect, useState } from 'react';
import { Box, Button, Collapse, LinearProgress, Typography } from '@mui/material';
import { eventsApi } from '../../../services/api/eventsApi';

// What each event about a call means, in words. Anything else shows its type.
const LABELS = {
  EventCall: 'Call',
  EventCdr: 'Call record saved',
  RecordingUploaded: 'Recording uploaded',
  CallTranscribed: 'Transcribed',
  VoiceAgentCallCosted: 'AI voice agent cost',
  ServiceActionExecuted: 'Service ran',
  ServiceLog: 'Service log',
  ServiceHandlerAudit: 'Service handler',
};
const LEVEL_COLOR = { error: 'error.main', warn: 'warning.main', warning: 'warning.main' };

const clock = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

/**
 * Everything that happened around a call, in order — the call record, its
 * recording and transcription, the services and webhooks that ran on it
 * (GET /api/events?subject=call&subject_uuid=…). A row opens to its details;
 * "Open in Events" shows the same rows in the full Events window.
 */
export default function CallTimeline({ callUuid, onOpenEvents }) {
  const [state, setState] = useState({ rows: [], loading: true, error: null });
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (!callUuid) return undefined;
    let live = true;
    setState({ rows: [], loading: true, error: null });
    setOpen(null);
    eventsApi.fetchLogs({ subject: 'call', subject_uuid: callUuid, per_page: 100, order_by: 'created_at', order_type: 'asc' })
      .then((res) => { if (live) setState({ rows: Array.isArray(res?.data) ? res.data : [], loading: false, error: null }); })
      .catch(() => { if (live) setState({ rows: [], loading: false, error: 'The events of this call could not be loaded.' }); });
    return () => { live = false; };
  }, [callUuid]);

  const { rows, loading, error } = state;
  return (
    <Box data-testid="call-timeline" sx={{ px: 2, pb: 1 }}>
      {loading && <LinearProgress aria-label="Loading call events" sx={{ my: 1 }} />}
      {error && <Typography variant="body2" color="error">{error}</Typography>}
      {!loading && !error && !rows.length && (
        <Typography variant="body2" color="text.secondary">No events for this call yet.</Typography>
      )}
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: 240, overflowY: 'auto' }}>
        {rows.map((row, i) => {
          const key = row.event_id || row.id || i;
          const expanded = open === key;
          const detail = row.msg || row.action || '';
          return (
            <Box component="li" key={key} sx={{ borderLeft: '2px solid', borderColor: LEVEL_COLOR[row.level] || 'divider', pl: 1.25, py: 0.5 }}>
              <Box component="button" type="button" onClick={() => setOpen(expanded ? null : key)} aria-expanded={expanded}
                sx={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 1, width: '100%', alignItems: 'baseline' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{clock(row.time)}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>{LABELS[row.event_type] || row.event_type}</Typography>
                {detail && <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0 }}>{detail}</Typography>}
              </Box>
              <Collapse in={expanded} unmountOnExit>
                <Box component="pre" sx={{ m: 0, mt: 0.5, p: 1, fontSize: 11, bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {JSON.stringify({ ...row.data, ...(Object.keys(row.metadata || {}).length ? { metadata: row.metadata } : {}) }, null, 2)}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>
      {onOpenEvents && rows.length > 0 && (
        <Button size="small" onClick={onOpenEvents} sx={{ mt: 0.5, textTransform: 'none' }}>Open in Events</Button>
      )}
    </Box>
  );
}
