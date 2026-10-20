import React from 'react';
import { Box, Typography, IconButton, Tooltip, Divider, Button } from '@mui/material';
import { Close as CloseIcon, ContentCopy as ContentCopyIcon, Subject as SyslogIcon } from '@mui/icons-material';
import { PERIOD_OPTIONS } from '../../utils/logFormatting';

// One event, in full: the row shows a line, this shows everything the event
// carries — its data and its metadata — so a failure's reason (error=…,
// Scalla's reply) is read here without leaving Events.
const Section = ({ title, values }) => {
  const entries = Object.entries(values || {}).filter(([, v]) => v != null && v !== '');
  return (
    <Box sx={{ mb: 2 }}>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em', color: 'var(--mui-palette-text-secondary)', mb: 0.5 }}>
        {title}
      </Typography>
      {entries.length === 0 ? (
        <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>—</Typography>
      ) : entries.map(([k, v]) => (
        <Box key={k} data-testid={`event-detail-${title.toLowerCase()}-${k}`}
          sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 1, py: 0.25, borderBottom: '1px solid var(--mui-palette-divider)' }}>
          <Typography sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--mui-palette-text-secondary)', wordBreak: 'break-all' }}>{k}</Typography>
          <Typography sx={{
            fontSize: '0.75rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            color: k === 'error' ? 'var(--mui-palette-error-main)' : 'var(--mui-palette-text-primary)',
          }}>
            {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

const PERIOD_MS = { '15m': 9e5, '1h': 36e5, '3h': 108e5, '6h': 216e5, '24h': 864e5, '7d': 6048e5, '30d': 2592e6 };

// The id the syslog lines of this event share: a call's uuid (the node's
// session=<uuid>, the API's call=<uuid>), else the event's own session.
export const syslogNeedle = (event) => {
  const d = event?.data || {};
  const m = event?.metadata || {};
  const callish = (d.type || event?.subject) === 'call' ? (d.type_uuid || event?.subject_uuid) : null;
  return m.call_uuid || d.call_uuid || d.va_call_uuid || callish || event?.session || d.session || '';
};

// Syslog takes a relative period, not a range: the shortest one that still
// reaches back to the event.
export const syslogLink = (event, now = Date.now()) => {
  const needle = syslogNeedle(event);
  if (!needle) return null;
  const at = Date.parse(event.time);
  const age = Number.isNaN(at) ? 0 : now - at;
  const period = PERIOD_OPTIONS.find((p) => PERIOD_MS[p] && PERIOD_MS[p] > age + 6e5) || '30d';
  return `/logs?${new URLSearchParams({ search: needle, period })}`;
};

// The same fields, compact, for hovering a row's message.
export const EventFieldsTooltip = ({ event }) => {
  const lines = (title, values) => Object.entries(values || {})
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => (
      <Box key={`${title}-${k}`} component="div" sx={{ fontFamily: 'monospace', fontSize: '0.72rem', wordBreak: 'break-word' }}>
        <b>{k}</b>: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
      </Box>
    ));
  const data = lines('data', event?.data);
  const meta = lines('metadata', event?.metadata);
  return (
    <Box data-testid="event-fields-tooltip">
      {data.length > 0 && <><Box sx={{ fontWeight: 600, fontSize: '0.7rem', mb: 0.25 }}>Data</Box>{data}</>}
      {meta.length > 0 && <><Box sx={{ fontWeight: 600, fontSize: '0.7rem', mt: 0.75, mb: 0.25 }}>Metadata</Box>{meta}</>}
      {data.length + meta.length === 0 && '—'}
    </Box>
  );
};

const EventDetailPanel = ({ event, message, onClose }) => {
  if (!event) return null;
  const logs = syslogLink(event);
  const copy = () => {
    const { id, data, metadata, event_type: type, time, event_id: eventId } = event;
    navigator.clipboard?.writeText(JSON.stringify({ id, event_id: eventId, type, time, data, metadata }, null, 2));
  };
  return (
    <Box data-testid="event-detail-panel" sx={{
      width: { xs: '100%', md: 420 }, flexShrink: 0, ml: { md: 1 }, overflow: 'auto', p: 1.5,
      border: '1px solid var(--mui-palette-divider)', borderRadius: '8px',
      bgcolor: 'var(--mui-palette-background-paper)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }} noWrap>
          {event.event_type || event.type}{event.action ? ` · ${event.action}` : ''}
        </Typography>
        <Tooltip title="Copy as JSON">
          <IconButton size="small" onClick={copy}><ContentCopyIcon sx={{ fontSize: 16 }} /></IconButton>
        </Tooltip>
        <IconButton size="small" onClick={onClose} aria-label="close"><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
      </Box>
      <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', mb: 1 }}>
        {event.time}{event.event_id ? ` · ${event.event_id}` : ''}
      </Typography>
      {message && (
        <Typography data-testid="event-detail-message" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 1.5 }}>
          {message}
        </Typography>
      )}
      {logs && (
        <Button size="small" variant="outlined" startIcon={<SyslogIcon />} data-testid="event-detail-syslog"
          href={logs} target="_blank" rel="noopener" sx={{ mb: 1.5, textTransform: 'none' }}>
          View in Syslog
        </Button>
      )}
      <Divider sx={{ mb: 1.5 }} />
      <Section title="Data" values={event.data} />
      <Section title="Metadata" values={event.metadata} />
    </Box>
  );
};

export default EventDetailPanel;
