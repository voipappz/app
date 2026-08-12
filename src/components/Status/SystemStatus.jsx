import { useEffect, useState } from 'react';
import { Box, Paper, Typography, Chip, Stack, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { DENO_API_BASE } from '../../lib/clients/denoApi';
import { getApiCdrEvents } from '../../services/eventsApi';

// In-app status page — reads deno's /health dependency report (cable, events
// freshness, engine) and renders it natively (RTL/MUI). No Gatus:
// the engine /health is the single source, polled live.
const DOT = {
  up: '#16a34a', registered: '#16a34a',
  down: '#dc2626', stale: '#dc2626', failed: '#dc2626',
  idle: '#9ca3af', disabled: '#9ca3af', unknown: '#9ca3af',
};
const POLL_MS = 10_000;

function age(seconds) {
  if (seconds == null) return null;
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export default function SystemStatus() {
  const { t } = useTranslation();
  const [report, setReport] = useState(null);
  const [reachable, setReachable] = useState(true);
  const [apiCdrEvents, setApiCdrEvents] = useState(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${DENO_API_BASE}/health`);
        const d = await r.json();
        if (alive) { setReport(d); setReachable(true); }
      } catch {
        if (alive) setReachable(false);
      }
      try {
        const page = await getApiCdrEvents({ perPage: 25 });
        if (alive) setApiCdrEvents({ events: page.rows, total: page.total });
      } catch (error) {
        if (alive) setApiCdrEvents({ error: String(error), events: [], total: 0 });
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const overall = !reachable ? 'down' : (report?.status === 'ok' ? 'up' : report ? 'degraded' : 'idle');
  const overallColor = overall === 'up' ? 'success' : overall === 'down' ? 'error' : 'warning';
  const checks = report?.checks ? Object.entries(report.checks) : [];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 760, mx: 'auto' }} data-testid="system-status">
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{t('status.title', 'System status')}</Typography>
        <Chip
          label={!reachable ? t('status.unreachable', 'Unreachable')
            : overall === 'up' ? t('status.allOk', 'All systems operational')
            : t('status.degraded', 'Degraded')}
          color={overallColor}
          variant={overall === 'up' ? 'filled' : 'outlined'}
        />
      </Stack>

      {!report && reachable && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      )}

      <Stack spacing={1}>
        {!reachable && (
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Typography variant="body2" color="error">{t('status.healthUnreachable', 'Cannot reach the health endpoint.')}</Typography>
          </Paper>
        )}
        {checks.map(([name, c]) => {
          const ageStr = age(c.age_seconds);
          return (
            <Paper key={name} elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }} data-testid={`status-${name}`}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Box sx={{ width: 11, height: 11, borderRadius: '50%', flexShrink: 0, bgcolor: DOT[c.status] || DOT.unknown }} />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
                    {t(`status.checks.${name}`, name)}
                  </Typography>
                  {(c.detail || ageStr) && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {c.detail || (ageStr ? t('status.lastEvent', { age: ageStr }) : '')}
                    </Typography>
                  )}
                </Box>
                <Chip size="small" label={t(`status.state.${c.status}`, c.status)} variant="outlined"
                  sx={{ color: DOT[c.status] || DOT.unknown, borderColor: DOT[c.status] || DOT.unknown }} />
              </Stack>
            </Paper>
          );
        })}
      </Stack>

      {report?.timestamp && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
          {t('status.updated', 'Updated')}: {new Date(report.timestamp).toLocaleTimeString()}
        </Typography>
      )}

      {apiCdrEvents && (
        <Box sx={{ mt: 3 }} data-testid="api-cdr-events">
          <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
            {t('status.apiCdrEvents.title', 'Mothership API CDR events')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('status.apiCdrEvents.summary', 'Showing the newest {{shown}} of {{total}} tenant-scoped EventCdr rows.', {
              shown: apiCdrEvents.events.length,
              total: apiCdrEvents.total,
            })}
          </Typography>
          {apiCdrEvents.error && (
            <Typography variant="body2" color="error" sx={{ mb: 1 }}>
              {t('status.apiCdrEvents.error', 'Could not load API CDR events')}: {apiCdrEvents.error}
            </Typography>
          )}
          {!apiCdrEvents.error && apiCdrEvents.events.length === 0 && (
            <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('status.apiCdrEvents.empty', 'The API returned no CDR events for this tenant.')}
              </Typography>
            </Paper>
          )}
          <Stack spacing={1}>
            {apiCdrEvents.events.map((event) => (
              <Paper key={event.event_id} elevation={0}
                sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
              >
                <Box component="details">
                  <Box component="summary" sx={{ cursor: 'pointer' }}>
                    <Typography component="span" variant="subtitle2" sx={{ fontFamily: 'monospace' }}>
                      {event.event_type || event.type || 'EventCdr'}
                    </Typography>
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ mx: 1 }}>
                      {event.data?.va_call_uuid || event.metadata?.call_uuid || event.event_id}
                    </Typography>
                    <Typography component="span" variant="caption" color="text.secondary">
                      {event.time ? new Date(event.time).toLocaleString() : ''}
                    </Typography>
                  </Box>
                  <Box component="pre" sx={{ m: 0, mt: 1.5, p: 1.5, overflow: 'auto', borderRadius: 1,
                    bgcolor: 'action.hover', fontSize: '0.75rem', direction: 'ltr', textAlign: 'left' }}>
                    {JSON.stringify({
                      event_id: event.event_id,
                      data: event.data,
                      metadata: event.metadata,
                    }, null, 2)}
                  </Box>
                </Box>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
