import { useEffect, useState } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';

// Small header indicator for the live event stream. Polls deno's /health and
// reflects the `events` freshness check (api/health_freshness.ts):
//   up → green "Live" · stale → red "No call events for Nm" · idle → grey
//   · offline/unreachable → grey. Informational only.
// Same base rule as useCalls.js: same-origin in prod, /events-api proxy in dev.
const EVENTS_API = import.meta.env.VITE_EVENTS_API_URL ?? (import.meta.env.DEV ? '/events-api' : '');
const POLL_MS = 30_000;

const DOT = { up: '#16a34a', stale: '#dc2626', idle: '#9ca3af', offline: '#9ca3af' };

export default function SystemHealth() {
  const { t } = useTranslation();
  const [events, setEvents] = useState(null); // { status, age_seconds } | null=offline

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`${EVENTS_API}/health`);
        const data = await res.json();
        if (alive) setEvents(data?.checks?.events ?? { status: 'offline' });
      } catch {
        if (alive) setEvents({ status: 'offline' });
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!events || events.status === 'disabled') return null;

  const status = events.status === 'up' || events.status === 'stale' || events.status === 'idle'
    ? events.status : 'offline';
  const mins = Math.max(1, Math.round((events.age_seconds ?? 0) / 60));
  const label = status === 'up' ? t('health.live')
    : status === 'stale' ? t('health.stale', { mins })
    : status === 'idle' ? t('health.idle')
    : t('health.offline');

  return (
    <Tooltip title={events.last_event_at ? t('health.lastEvent', { at: new Date(events.last_event_at).toLocaleString() }) : label}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }} data-testid="system-health">
        <Box sx={{
          width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
          backgroundColor: DOT[status],
          boxShadow: status === 'up' ? `0 0 0 3px ${DOT.up}22` : 'none',
        }} />
        <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' }, color: '#475569', whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
      </Box>
    </Tooltip>
  );
}
