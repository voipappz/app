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
import { useTranslation } from 'react-i18next';
import LtrIsland from '../../i18n/LtrIsland';
import { formatDate, formatDayMonth, formatTime } from '../../utils/dateUtils';
import { formatNumber } from '../../utils/numberUtils';

const SERIES_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// Axis labels: the day over a week, the clock time otherwise.
const tick = (timeRange) => (value) => {
  if (!formatTime(value)) return String(value);
  return timeRange === 'week' ? formatDayMonth(value) : formatTime(value);
};

function NoScope() {
  const { t } = useTranslation('widgets');
  return (
    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', my: 'auto' }}>
      {t('widget.noScope')}
    </Typography>
  );
}

// The window a stat covers, as words ("last 24 hours").
function windowWords(t, minutes) {
  if (minutes >= 10080) return t('calls.last7Days');
  if (minutes >= 1440) return t('calls.last24Hours');
  if (minutes >= 60) return t('calls.lastHours', { n: Math.round(minutes / 60) });
  return t('calls.lastMinutes', { n: minutes });
}

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
  const { t } = useTranslation('widgets');
  const { rows, loading, error } = data;
  const byGroup = sumByKey(rows);
  const all = Object.values(byGroup).reduce((sum, n) => sum + n, 0);
  if (error) return <Big value="—" caption={t('calls.unavailable')} />;
  if (loading && !rows.length) return <Big value="…" />;
  const windowText = windowWords(t, minutes);
  const group = groupLabel(widget.groupBy).toLowerCase();
  if (widget.metric === 'answered') {
    const answered = Object.entries(byGroup).filter(([label]) => ANSWERED.test(label)).reduce((sum, [, n]) => sum + n, 0);
    const pct = all ? Math.round((answered / all) * 100) : 0;
    return <Big value={`${pct}%`} color="#22c55e" caption={t('calls.answeredOf', { answered: formatNumber(answered), all: formatNumber(all), window: windowText })} />;
  }
  if (widget.metric === 'groups') {
    return <Big value={Object.keys(byGroup).length} color="#8b5cf6" caption={t('calls.groupValues', { group, window: windowText })} />;
  }
  if (widget.metric === 'busiest') {
    const top = Object.entries(byGroup).sort((a, b) => b[1] - a[1])[0];
    return <Big value={top ? top[0].replace(/_/g, ' ') : '—'} color="#f59e0b" Icon={CallMadeIcon}
      caption={top ? t('calls.busiest', { n: formatNumber(top[1]), group }) : windowText} />;
  }
  return <Big value={formatNumber(all)} color="#3b82f6" caption={windowText} />;
}

function CallsChart({ minutes, data }) {
  const { t } = useTranslation('widgets');
  const { rows, loading, error } = data;
  const series = useMemo(() => Object.keys(sumByKey(rows)), [rows]);
  const { timeRange } = bucketFor(minutes);
  if (error) return <Typography role="alert" variant="body2">{t('calls.chartFailed')}</Typography>;
  if (loading && !rows.length) return <LinearProgress aria-label={t('calls.loadingChart')} />;
  if (!series.length) return <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', my: 'auto' }}>{t('calls.noCalls')}</Typography>;
  const Chart = series.length > 2 ? LineChart : AreaChart;
  return (
    <LtrIsland sx={{ flex: 1, minHeight: 160, height: '100%' }} data-testid="calls-chart">
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
          <XAxis dataKey="time" tickFormatter={tick(timeRange)} tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={formatDate} />
          <Legend wrapperStyle={{ fontSize: 12, textTransform: 'capitalize' }} />
          {series.map((key, i) => (series.length > 2
            ? <Line key={key} type="monotone" dataKey={key} name={key.replace(/_/g, ' ')} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} strokeWidth={2} />
            : <Area key={key} type="monotone" dataKey={key} name={key.replace(/_/g, ' ')} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} fill={SERIES_COLORS[i % SERIES_COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
          ))}
        </Chart>
      </ResponsiveContainer>
    </LtrIsland>
  );
}

function LiveCalls({ environmentUuid }) {
  const { t } = useTranslation('widgets');
  const live = useLiveEntities(environmentUuid || null);
  const env = live.byScope('environment')[0] || {};
  const num = (...keys) => { for (const key of keys) { const n = Number(env?.[key]); if (Number.isFinite(n)) return n; } return 0; };
  if (!environmentUuid) {
    return <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', my: 'auto' }}>{t('calls.selectOneApp')}</Typography>;
  }
  const tiles = [
    { label: t('calls.inProgress'), value: num('live_calls_current', 'calls_total'), Icon: PhoneInTalkIcon, color: 'success.main' },
    { label: t('calls.incoming'), value: num('call_incoming_count', 'incoming_count'), Icon: CallReceivedIcon, color: 'info.main' },
    { label: t('calls.outgoing'), value: num('call_outgoing_count', 'outgoing_count'), Icon: CallMadeIcon, color: 'primary.main' },
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
        {live.connected ? t('calls.liveConnected') : t('calls.reconnecting')}
      </Typography>
    </Stack>
  );
}

/**
 * The body of a calls widget (see callsWidgets.js). `scope` is the top bar's
 * selection; `queryOptions` carries the board's time range and refresh.
 */
export default function CallsWidgetBody({ widget, scope = {}, queryOptions = {} }) {
  const { t } = useTranslation('widgets');
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
      ? <Typography role="alert" variant="body2">{t('calls.breakdownFailed')}</Typography>
      : data.loading && !data.rows.length ? <LinearProgress aria-label={t('calls.loadingBreakdown')} /> : <CallsBreakdown rows={data.rows} />;
  }
  return <CallsStat widget={widget} minutes={minutes} data={data} />;
}
