import { useMemo } from 'react';
import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallsBreakdown, { sumByKey } from '../Dashboard/CallsBreakdown.jsx';
import useLiveEntities from '../../hooks/useLiveEntities';
import { useCallsVolume } from './useCallsVolume';
import { ANSWERED, bucketFor, groupLabel } from './callsWidgets';

const SERIES_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const tick = (timeRange) => (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return timeRange === 'week'
    ? date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const NoScope = () => (
  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', my: 'auto' }}>
    Select a customer or application in the top bar.
  </Typography>
);

function Big({ value, caption, color = 'primary.main', Icon = PhoneInTalkIcon }) {
  return (
    <Stack sx={{ height: '100%' }} justifyContent="center" alignItems="center" spacing={1}>
      <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', color }}><Icon /></Box>
      <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textTransform: 'capitalize', textAlign: 'center' }}>{value}</Typography>
      {caption && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>{caption}</Typography>}
    </Stack>
  );
}

function CallsStat({ widget, minutes, data }) {
  const { rows, loading, error } = data;
  const byGroup = sumByKey(rows);
  const all = Object.values(byGroup).reduce((sum, n) => sum + n, 0);
  if (error) return <Big value="—" caption="unavailable" />;
  if (loading && !rows.length) return <Big value="…" />;
  const windowText = minutes >= 10080 ? 'last 7 days' : minutes >= 1440 ? 'last 24 hours' : minutes >= 60 ? `last ${Math.round(minutes / 60)} h` : `last ${minutes} min`;
  if (widget.metric === 'answered') {
    const answered = Object.entries(byGroup).filter(([label]) => ANSWERED.test(label)).reduce((sum, [, n]) => sum + n, 0);
    const pct = all ? Math.round((answered / all) * 100) : 0;
    return <Big value={`${pct}%`} color="#22c55e" caption={`${answered.toLocaleString()} of ${all.toLocaleString()} · ${windowText}`} />;
  }
  if (widget.metric === 'groups') {
    return <Big value={Object.keys(byGroup).length} color="#8b5cf6" caption={`${groupLabel(widget.groupBy).toLowerCase()} values · ${windowText}`} />;
  }
  if (widget.metric === 'busiest') {
    const top = Object.entries(byGroup).sort((a, b) => b[1] - a[1])[0];
    return <Big value={top ? top[0].replace(/_/g, ' ') : '—'} color="#f59e0b" Icon={CallMadeIcon}
      caption={top ? `${top[1].toLocaleString()} calls · by ${groupLabel(widget.groupBy).toLowerCase()}` : windowText} />;
  }
  return <Big value={all.toLocaleString()} color="#3b82f6" caption={windowText} />;
}

function CallsChart({ minutes, data }) {
  const { rows, loading, error } = data;
  const series = useMemo(() => Object.keys(sumByKey(rows)), [rows]);
  const { timeRange } = bucketFor(minutes);
  if (error) return <Typography role="alert" variant="body2">The calls chart could not be loaded.</Typography>;
  if (loading && !rows.length) return <LinearProgress aria-label="Loading calls chart" />;
  if (!series.length) return <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', my: 'auto' }}>No calls in this window.</Typography>;
  const Chart = series.length > 2 ? LineChart : AreaChart;
  return (
    <Box sx={{ flex: 1, minHeight: 160, height: '100%' }} data-testid="calls-chart">
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
          <XAxis dataKey="time" tickFormatter={tick(timeRange)} tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={(value) => new Date(value).toLocaleString()} />
          <Legend wrapperStyle={{ fontSize: 12, textTransform: 'capitalize' }} />
          {series.map((key, i) => (series.length > 2
            ? <Line key={key} type="monotone" dataKey={key} name={key.replace(/_/g, ' ')} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} strokeWidth={2} />
            : <Area key={key} type="monotone" dataKey={key} name={key.replace(/_/g, ' ')} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} fill={SERIES_COLORS[i % SERIES_COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
          ))}
        </Chart>
      </ResponsiveContainer>
    </Box>
  );
}

function LiveCalls({ environmentUuid }) {
  const live = useLiveEntities(environmentUuid || null);
  const env = live.byScope('environment')[0] || {};
  const num = (...keys) => { for (const key of keys) { const n = Number(env?.[key]); if (Number.isFinite(n)) return n; } return 0; };
  if (!environmentUuid) {
    return <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', my: 'auto' }}>Select one application in the top bar to see its live calls.</Typography>;
  }
  const tiles = [
    { label: 'In progress', value: num('live_calls_current', 'calls_total'), Icon: PhoneInTalkIcon, color: 'success.main' },
    { label: 'Incoming', value: num('call_incoming_count', 'incoming_count'), Icon: CallReceivedIcon, color: 'info.main' },
    { label: 'Outgoing', value: num('call_outgoing_count', 'outgoing_count'), Icon: CallMadeIcon, color: 'primary.main' },
  ];
  return (
    <Stack spacing={1} sx={{ height: '100%' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, flex: 1 }}>
        {tiles.map(({ label, value, Icon, color }) => (
          <Stack key={label} alignItems="center" justifyContent="center" spacing={0.5} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Box sx={{ color }}><Icon fontSize="small" /></Box>
            <Typography variant="h4" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{live.connected ? value : '—'}</Typography>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Stack>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {live.connected ? 'Live updates connected' : 'Reconnecting to live updates'}
      </Typography>
    </Stack>
  );
}

/**
 * The body of a calls widget (see callsWidgets.js). `scope` is the top bar's
 * selection; `queryOptions` carries the board's time range and refresh.
 */
export default function CallsWidgetBody({ widget, scope = {}, queryOptions = {} }) {
  const minutes = Number(queryOptions.minutes || widget.minutes) || 1440;
  const groupBy = widget.metric === 'answered' ? 'disposition' : (widget.groupBy || 'direction');
  const data = useCallsVolume({
    minutes, groupBy, scope, enabled: widget.type !== 'live_calls',
    refreshKey: queryOptions.refreshKey, refreshInterval: queryOptions.refreshInterval ?? 30_000,
  });
  if (widget.type === 'live_calls') return <LiveCalls environmentUuid={scope.environmentUuid} />;
  if (!data.hasScope) return <NoScope />;
  if (widget.type === 'calls_chart') return <CallsChart minutes={minutes} data={data} />;
  if (widget.type === 'calls_outcome') {
    return data.error
      ? <Typography role="alert" variant="body2">The calls breakdown could not be loaded.</Typography>
      : data.loading && !data.rows.length ? <LinearProgress aria-label="Loading calls breakdown" /> : <CallsBreakdown rows={data.rows} />;
  }
  return <CallsStat widget={widget} minutes={minutes} data={data} />;
}
