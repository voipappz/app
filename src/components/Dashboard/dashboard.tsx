import { useMemo, useState } from 'react';
import { Box, Paper, Typography, Chip, ToggleButton, ToggleButtonGroup, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import PhoneIcon from '@mui/icons-material/Phone';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import TimerIcon from '@mui/icons-material/Timer';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PhoneMissedIcon from '@mui/icons-material/PhoneMissed';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import DateRangeIcon from '@mui/icons-material/DateRange';
// useCalls/computeCallStats are plain JS (.js) — same DuckDB-backed source the
// Calls page uses, so the Dashboard and Calls never disagree on the numbers.
import { useCalls, computeCallStats } from '../Calls/useCalls';
import { useCallsPerHour } from './useCallsPerHour';
import { LiveEvents, DashboardWidgets } from './widgets';
import PageHeader from '../common/PageHeader';
import StatCard from '../common/StatCard';
import StatusChip from '../common/StatusChip';
import CallsPerHourChart from '../common/CallsPerHourChart';
import { useDirection } from '../../context/DirectionContext';

/**
 * Dashboard — KPIs + calls-per-hour chart + recent calls + live event stream.
 * All call data comes from the Deno `/calls` API (DuckDB), via the shared
 * useCalls hook, with live re-fetch on WebSocket `call.*` events.
 *
 * Layout uses CSS grid (Box display:grid) rather than MUI <Grid item>, because
 * MUI v7's Grid dropped the v5 item/xs/md API — using it collapses every tile
 * to content width. CSS grid is explicit, RTL-safe, and fully responsive.
 */

function fmtDuration(s: number) {
  if (!s) return '0s';
  const m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

// Time-range presets for the dashboard filter (+ a custom from/to option).
const RANGES = [
  { key: '1h', hours: 1, labelKey: 'lastHour' },
  { key: '3h', hours: 3, labelKey: 'last3Hours' },
  { key: '9h', hours: 9, labelKey: 'last9Hours' },
  { key: '12h', hours: 12, labelKey: 'last12Hours' },
  { key: '24h', hours: 24, labelKey: 'last24Hours' },
  { key: 'custom', labelKey: 'custom' },
] as const;

function inWindow(ts: string | null | undefined, from: Date, to: Date) {
  if (!ts) return false;
  const ms = new Date(String(ts).replace(' ', 'T')).getTime();
  return !Number.isNaN(ms) && ms >= from.getTime() && ms <= to.getTime();
}

// Date → "YYYY-MM-DDTHH:MM" for <input type="datetime-local"> (local time).
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  const { calls, source, wsStatus } = useCalls() as any;

  // Time-range filter: a preset (1h/3h/9h/12h/24h) or a custom from/to range.
  const [range, setRange] = useState<string>('24h');
  const [customFrom, setCustomFrom] = useState(() => toLocalInput(new Date(Date.now() - 24 * 3600_000)));
  const [customTo, setCustomTo] = useState(() => toLocalInput(new Date()));

  const { from, to } = useMemo(() => {
    if (range === 'custom') {
      const f = new Date(customFrom);
      const tt = new Date(customTo);
      if (!Number.isNaN(f.getTime()) && !Number.isNaN(tt.getTime()) && f <= tt) {
        return { from: f, to: tt };
      }
    }
    const hours = RANGES.find((r) => r.key === range)?.hours ?? 24;
    return { from: new Date(Date.now() - hours * 3600_000), to: new Date() };
  }, [range, customFrom, customTo]);

  // Calls-per-hour pre-aggregated by InfluxDB 3 (deno /dashboard/calls-per-hour),
  // scoped to the selected range. null when InfluxDB is unavailable → the chart
  // falls back to client-side bucketing of `windowed`.
  const rangeMinutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
  const { points: callsPerHour } = useCallsPerHour({ minutes: rangeMinutes });

  const windowed = useMemo(
    () => calls.filter((c: any) => inWindow(c.started_at, from, to)),
    [calls, from, to],
  );
  const stats = computeCallStats(windowed);
  const answerRate = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
  const recent = windowed.slice(0, 6);

  const live = wsStatus === 'open';
  const sourceChip = (
    <Chip
      size="small"
      icon={<RadioButtonCheckedIcon fontSize="small" />}
      label={source === 'mock' ? t('callDashboard.mock') : live ? t('callDashboard.live') : wsStatus}
      color={source === 'mock' ? 'default' : live ? 'success' : 'warning'}
      variant={live ? 'filled' : 'outlined'}
    />
  );

  const kpis = [
    { label: t('callDashboard.callsTotal'), value: stats.total, icon: PhoneIcon, color: 'primary.main' },
    { label: t('callDashboard.answerRate'), value: `${answerRate}%`, icon: CheckCircleIcon, color: 'success.main' },
    { label: t('callDashboard.avgDuration'), value: fmtDuration(stats.avgDurationSec), icon: TimerIcon, color: 'info.main' },
    { label: t('callDashboard.inbound'), value: stats.inbound, icon: CallReceivedIcon, color: 'info.main' },
    { label: t('callDashboard.outbound'), value: stats.outbound, icon: CallMadeIcon, color: 'success.main' },
    { label: t('callDashboard.failed'), value: stats.failed, icon: PhoneMissedIcon, color: 'error.main' },
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader title={t('menu.dashboard')} subtitle={t('callDashboard.subtitle')} actions={sourceChip} />

      {/* Time-range filter — segmented pill control */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={range}
          onChange={(_e, v) => v && setRange(v)}
          sx={{
            gap: 0.5,
            flexWrap: 'wrap',
            p: 0.5,
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 999,
            '& .MuiToggleButtonGroup-grouped': {
              m: 0,
              border: 0,
              borderRadius: '999px !important',
              px: 1.75,
              py: 0.5,
              textTransform: 'none',
              fontWeight: 600,
              color: 'text.secondary',
              transition: 'background-color 0.15s ease, color 0.15s ease',
              '&:hover': { bgcolor: 'action.selected' },
              '&.Mui-selected': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.18)',
                '&:hover': { bgcolor: 'primary.dark' },
              },
            },
          }}
        >
          {RANGES.map((r) => (
            <ToggleButton key={r.key} value={r.key} disableRipple>
              {r.key === 'custom' && <DateRangeIcon sx={{ fontSize: 16, mr: 0.5 }} />}
              {t(`callDashboard.timeRange.${r.labelKey}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {range === 'custom' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              type="datetime-local"
              size="small"
              label={t('callDashboard.timeRange.from')}
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              type="datetime-local"
              size="small"
              label={t('callDashboard.timeRange.to')}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>
        )}
      </Box>

      {/* KPI row — 6 across on desktop, 3 on tablet, 2 on phone */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' },
          mb: 3,
        }}
      >
        {kpis.map((k) => (
          <StatCard key={k.label} label={k.label} value={k.value} icon={k.icon} color={k.color} />
        ))}
      </Box>

      {/* Chart + live events */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' },
          mb: 3,
          alignItems: 'stretch',
        }}
      >
        <CallsPerHourChart calls={windowed} points={callsPerHour} />
        <LiveEvents from={from} to={to} />
      </Box>

      {/* Live dashboard — widgets streamed as-is from va-crystal cable (DashboardLive) */}
      <Box sx={{ mb: 3 }}>
        <DashboardWidgets />
      </Box>

      {/* Recent calls */}
      <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>{t('callDashboard.recentCalls')}</Typography>
        {recent.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('callDashboard.noCalls')}
          </Typography>
        )}
        {recent.map((c: any) => (
          <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
            {c.direction === 'inbound'
              ? <CallReceivedIcon fontSize="small" sx={{ color: 'info.main' }} />
              : <CallMadeIcon fontSize="small" sx={{ color: 'success.main' }} />}
            <Typography variant="body2" sx={{ flex: 1, fontVariantNumeric: 'tabular-nums' }} noWrap>{c.from_number} {isRTL ? '←' : '→'} {c.to_number}</Typography>
            <StatusChip status={c.status} />
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {c.started_at ? new Date(String(c.started_at).replace(' ', 'T')).toLocaleTimeString() : ''}
            </Typography>
          </Box>
        ))}
      </Paper>
    </Box>
  );
}
