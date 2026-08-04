// RecentCalls — the phone dock's "Calls" tab: real call history from the
// mothership on top, this browser's dial log underneath.
//
// The tab used to show only the local dial log, which meant a tab labelled
// "Calls" that knew nothing about the calls the switch actually handled — and
// said "No recent calls" to a user who had taken twenty. The history is fetched
// lazily (see useRecentCalls) the first time this tab is opened.
import { Box, CircularProgress, Divider, IconButton, List, ListItemButton, ListItemText, Tooltip, Typography } from '@mui/material';
import CallIcon from '@mui/icons-material/Call';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMissedIcon from '@mui/icons-material/CallMissed';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useRecentCalls } from './useRecentCalls';
import { counterpartyNumber, fmtCallTime, isInbound, isMissed } from './recentCallFormat';

// The dock's palette (mirrors PhoneWidget — this list lives inside its panel).
const MUTED = '#9aa6b6';
const GREEN = '#34c759';
const RED = '#ef4444';

function DirectionIcon({ call }) {
  if (isMissed(call)) return <CallMissedIcon fontSize="small" sx={{ color: RED }} />;
  if (isInbound(call)) return <CallReceivedIcon fontSize="small" sx={{ color: GREEN }} />;
  return <CallMadeIcon fontSize="small" sx={{ color: MUTED }} />;
}

export default function RecentCalls({ active, dials = [], onDial, onPickNumber, onNavigate }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { calls, loading, error, reload } = useRecentCalls(active);

  // A row is a way INTO the Calls page — the dock is a glance, the page is the
  // record (filters, transcript, recording).
  const openCalls = () => {
    navigate('/calls');
    onNavigate?.();
  };

  return (
    <Box sx={{ flex: 1, overflow: 'auto' }} data-testid="phone-recent-calls">
      <Box sx={{ px: 1.5, pt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('phone.recentCalls', 'Recent calls')}
        </Typography>
        {loading && <CircularProgress size={14} sx={{ color: MUTED }} />}
        <Tooltip title={t('phone.refresh', 'Refresh')}>
          <IconButton size="small" onClick={() => reload()} sx={{ color: MUTED }} data-testid="phone-recent-refresh">
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Typography variant="body2" sx={{ px: 1.5, py: 1, color: '#fca5a5' }} data-testid="phone-recent-error">
          {t('phone.recentCallsError', "Couldn't load recent calls")}
        </Typography>
      )}
      {!error && !loading && calls.length === 0 && (
        <Typography variant="body2" sx={{ px: 1.5, py: 1, color: MUTED }}>
          {t('phone.noHistory', 'No recent calls')}
        </Typography>
      )}

      <List dense disablePadding>
        {calls.map((call) => {
          const number = counterpartyNumber(call);
          return (
            <ListItemButton
              key={call.id}
              onClick={openCalls}
              data-testid="phone-recent-call"
              sx={{ gap: 1, '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}
            >
              <DirectionIcon call={call} />
              <ListItemText
                primary={<span style={{ direction: 'ltr', color: '#e5e7eb' }}>{number || t('common.unknown', 'Unknown')}</span>}
                secondary={<span style={{ color: MUTED }}>{fmtCallTime(call.started_at)}</span>}
              />
              {number && (
                <Tooltip title={t('phone.call', 'Call')}>
                  <IconButton
                    edge="end"
                    sx={{ color: GREEN }}
                    aria-label={t('phone.call', 'Call')}
                    onClick={(e) => { e.stopPropagation(); onDial?.(number); }}
                  >
                    <CallIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </ListItemButton>
          );
        })}
      </List>

      {/* This browser's dial log — kept from the original tab: it is the only
          record of a number dialled from here that never reached the switch. */}
      {dials.length > 0 && (
        <>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mt: 1 }} />
          <Typography variant="caption" sx={{ display: 'block', px: 1.5, pt: 1, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('phone.dialed', 'Dialled from here')}
          </Typography>
          <List dense disablePadding>
            {dials.map((d) => (
              <ListItemButton key={d.at} onClick={() => onPickNumber?.(d.n)} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}>
                <ListItemText
                  primary={<span style={{ direction: 'ltr', color: '#e5e7eb' }}>{d.n}</span>}
                  secondary={<span style={{ color: MUTED }}>{new Date(d.at).toLocaleString()}</span>}
                />
                <IconButton edge="end" sx={{ color: GREEN }} aria-label={t('phone.call', 'Call')} onClick={(e) => { e.stopPropagation(); onDial?.(d.n); }}>
                  <CallIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            ))}
          </List>
        </>
      )}
    </Box>
  );
}
