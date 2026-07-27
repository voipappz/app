import { useEffect, useState } from 'react';
import { Box, Paper, Typography, Chip, Stack, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { EVENTS_API } from '../Calls/useCalls';

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

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${EVENTS_API}/health`);
        const d = await r.json();
        if (alive) { setReport(d); setReachable(true); }
      } catch {
        if (alive) setReachable(false);
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
    </Box>
  );
}
