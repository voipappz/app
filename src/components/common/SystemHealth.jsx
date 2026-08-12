import { useEffect, useState } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { DENO_API_BASE } from '../../lib/clients/denoApi';
const POLL_MS = 15_000;
const DOT = { healthy: '#16a34a', degraded: '#d97706', down: '#dc2626', checking: '#9ca3af' };

export function healthPresentation(report, reachable = true) {
  if (!reachable) return { state: 'down', label: 'Status — unreachable' };
  if (!report) return { state: 'checking', label: 'Status — checking…' };
  const checks = Object.entries(report.checks ?? {});
  const failed = checks.filter(([, check]) => check?.status === 'down').map(([name]) => name);
  if (failed.length) return { state: 'down', label: `Status — DOWN (${failed.join(', ')})` };
  const pending = checks.filter(([, check]) => ['stale', 'idle'].includes(check?.status)).map(([name]) => name);
  if (report.status === 'ok' && report.ready !== false && pending.length === 0) {
    return { state: 'healthy', label: 'Status — all events reconciled' };
  }
  return { state: 'degraded', label: `Status — DEGRADED${pending.length ? ` (${pending.join(', ')})` : ''}` };
}

/** Shared overall-health indicator. compact=true is the Nimbus-style rail dot. */
export default function SystemHealth({ compact = false }) {
  const { t } = useTranslation();
  const [report, setReport] = useState(null);
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch(`${DENO_API_BASE}/health`);
        const body = await response.json();
        if (alive) { setReport(body); setReachable(true); }
      } catch {
        if (alive) setReachable(false);
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const presentation = healthPresentation(report, reachable);
  const dot = (
    <Box sx={{
      width: compact ? 14 : 9, height: compact ? 14 : 9,
      borderRadius: '50%', flexShrink: 0, backgroundColor: DOT[presentation.state],
      boxShadow: presentation.state === 'healthy' ? `0 0 0 3px ${DOT.healthy}22` : 'none',
    }} />
  );

  return (
    <Tooltip title={presentation.label} placement={compact ? 'right' : 'bottom'} arrow>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
        data-testid={compact ? 'rail-system-health' : 'system-health'}
        aria-label={presentation.label}
      >
        {dot}
        {!compact && (
          <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' }, color: '#475569', whiteSpace: 'nowrap' }}>
            {presentation.state === 'healthy' ? t('health.live')
              : presentation.state === 'degraded' ? t('status.degraded', 'Degraded')
              : presentation.state === 'down' ? t('health.offline')
              : t('status.checking', 'Checking')}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}
