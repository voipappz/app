// PhoneCallsTab — the phone panel's "Calls" tab: recent call history with
// click-to-dial, as the legacy portal had. Sourced from the same
// Postgres-backed call list the dashboard uses (callsApi), which
// voipappz-api's Endpoints::Calls already serves to a user token via its
// auth_type dispatch — InfluxDB has no per-call row data to read here.
//
// Lazily fetched: only when this tab is actually shown, so opening the phone
// on the Dialpad never fires a calls request.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import CallIcon from '@mui/icons-material/Call';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import { callsApi } from '../../services/api/callsApi';
import { usePermissions } from '../../hooks/usePermissions';
import { mapRecentCall } from '../Dashboard/useDashboardSnapshot.js';
import Bdi from '../../i18n/Bdi';
import { formatTime } from '../../utils/dateUtils';
import { isolated } from './isolated.js';
import { MUTED, GREEN } from './panelTheme.js';

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// "incoming" / "inbound" — anchored, because "outgoing" contains "in" too.
const isInbound = (call) => /^in/i.test(call.direction || '');

// The number worth calling back is the OTHER party: for an inbound call
// that's who called us, for an outbound one it's who we called.
function counterparty(call) {
  const inbound = isInbound(call);
  return (inbound ? call.from_number : call.to_number) || call.from_number || call.to_number || '';
}

export default function PhoneCallsTab({ active, onDial, onOpenCall }) {
  const { t } = useTranslation('phone');
  const [calls, setCalls] = useState(null); // null = not loaded yet
  const [error, setError] = useState(null);
  // Without the Calls read permission the API answers 403: do not ask.
  const { can } = usePermissions();
  const allowed = can('calls', 'read');

  useEffect(() => {
    if (!active || !allowed || calls !== null) return;
    let alive = true;
    callsApi.getCalls({ page: 1, per_page: 20 })
      .then((response) => {
        if (!alive) return;
        const rows = Array.isArray(response) ? response
          : Array.isArray(response?.data) ? response.data
            : [];
        setCalls(rows.map(mapRecentCall));
      })
      .catch((err) => { if (alive) { setError(err?.message || t('recent.couldNotLoad')); setCalls([]); } });
    return () => { alive = false; };
  }, [active, allowed, calls, t]);

  if (!allowed) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: MUTED }}>{t('recent.noPermission')}</Typography>
      </Box>
    );
  }

  if (calls === null) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={24} sx={{ color: MUTED }} /></Box>
    );
  }

  if (error && calls.length === 0) {
    return <Typography variant="body2" sx={{ p: 2, textAlign: 'center', color: '#fca5a5' }}>{error}</Typography>;
  }

  if (calls.length === 0) {
    return <Typography variant="body2" sx={{ p: 2, textAlign: 'center', color: MUTED }}>{t('recent.empty')}</Typography>;
  }

  return (
    <Box data-testid="phone-calls-list" sx={{ py: 0.5 }}>
      {calls.map((call) => {
        const number = counterparty(call);
        const inbound = isInbound(call);
        return (
          <Stack
            key={call.id}
            direction="row"
            alignItems="center"
            spacing={1}
            onClick={() => onOpenCall?.(call.call)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenCall?.(call.call);
              }
            }}
            sx={{ px: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
          >
            {inbound
              ? <CallReceivedIcon fontSize="small" sx={{ color: '#60a5fa' }} />
              : <CallMadeIcon fontSize="small" sx={{ color: GREEN }} />}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.85rem', color: '#e5e7eb' }} noWrap>
                <Bdi>{number || '—'}</Bdi>
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: MUTED }} noWrap>
                {formatTime(call.started_at)}{call.duration_sec ? ` • ${fmtDuration(call.duration_sec)}` : ''}
                {call.status ? ` • ${call.status}` : ''}
              </Typography>
            </Box>
            <Tooltip title={number ? t('recent.callNumber', { number: isolated(number) }) : t('recent.noNumber')}>
              <span>
                <IconButton
                  size="small"
                  disabled={!number}
                  onClick={(event) => { event.stopPropagation(); onDial(number); }}
                  sx={{ color: GREEN }}
                  data-testid="phone-calls-dial"
                >
                  <CallIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        );
      })}
    </Box>
  );
}
