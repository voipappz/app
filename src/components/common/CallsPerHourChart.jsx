import { useMemo } from 'react';
import { Paper, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { statusColor, statusLabel } from './statusColors';

/**
 * CallsPerHourChart — stacked bar of calls bucketed by hour.
 *
 * Two inputs, in priority order:
 *  1. `points` — pre-aggregated by the local DuckDB Dashboard projection.
 *  2. `calls` — already-windowed PostgREST rows (started_at + status), bucketed
 *     CLIENT-SIDE by hour (epoch-keyed so hours on different days stay distinct)
 *     and stacked by status. Honors the dashboard's active time-range filter and
 *     never disagrees with the KPI numbers.
 *
 * Recharts; bar colors from the shared status→theme-color map (brand-aware).
 */
export default function CallsPerHourChart({ calls = [], points = null, series: only = null, title = null, variant = 'bar' }) {
  const theme = useTheme();
  const { t } = useTranslation();
  // A 300px-tall chart eats most of a phone screen before the numbers below it
  // are even reachable; shrink it (and thin the hour labels) below `sm`.
  const isNarrow = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });

  const useProjection = Array.isArray(points) && points.length > 0;

  const hexFor = (status) => {
    const key = statusColor(status);
    return key === 'default'
      ? theme.palette.grey[500]
      : (theme.palette[key]?.main || theme.palette.grey[500]);
  };

  // DuckDB projection: server-bucketed points → inbound/outbound stacks. The bucket
  // is a zoneless UTC instant; render the hour label in the browser's local tz.
  const projectionData = useMemo(() => {
    if (!useProjection) return [];
    return points
      .map((p) => {
        const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(p.bucket)) ? p.bucket : `${p.bucket}Z`);
        return {
          _ts: p.bucket,
          hour: Number.isNaN(d.getTime()) ? String(p.bucket) : fmtHour(d),
          inbound: p.inbound || 0,
          outbound: p.outbound || 0,
          total: p.total || 0,
        };
      })
      .sort((a, b) => String(a._ts).localeCompare(String(b._ts)))
      .slice(-24);
  }, [useProjection, points]);

  // Fallback: bucket the (already-windowed) calls by hour, one column per status.
  // Keyed by the hour's epoch so hours on different days stay distinct.
  const { data: callsData, statuses } = useMemo(() => {
    const byHour = new Map();
    const statusSet = new Set();
    for (const c of Array.isArray(calls) ? calls : []) {
      if (!c?.started_at) continue;
      const d = new Date(String(c.started_at).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) continue;
      d.setMinutes(0, 0, 0);
      const key = d.getTime();
      const status = c.status || 'unknown';
      statusSet.add(status);
      const entry = byHour.get(key) || { key, hour: fmtHour(d) };
      entry[status] = (entry[status] || 0) + 1;
      byHour.set(key, entry);
    }
    const ordered = [...byHour.values()].sort((a, b) => a.key - b.key);
    return { data: ordered, statuses: [...statusSet] };
  }, [calls]);

  const data = useProjection ? projectionData : callsData;
  // A dashboard-builder `trend` widget may pin the stacks it wants (its field
  // select); otherwise show the projection's inbound/outbound split.
  const defaultSeries = useProjection ? ['inbound', 'outbound'] : statuses;
  const series = Array.isArray(only) && only.length
    ? only.filter((s) => data.some((row) => row[s] !== undefined))
    : defaultSeries;
  const seriesLabel = (s) => useProjection ? t(`callDashboard.${s}`, s) : t(`usageReports.status.${s}`, statusLabel(s));
  const PROJECTION_PALETTE = { inbound: 'info', outbound: 'success', total: 'primary' };
  const seriesColor = (s) => useProjection
    ? (theme.palette[PROJECTION_PALETTE[s] || 'primary']?.main || theme.palette.grey[500])
    : hexFor(s);
  const pieData = series.map((name) => ({
    name: seriesLabel(name),
    key: name,
    value: data.reduce((sum, row) => sum + (Number(row[name]) || 0), 0),
  }));

  return (
    <Paper elevation={0} sx={{ p: { xs: 1.75, sm: 2.5 }, height: '100%', minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>{title || t('callDashboard.callsPerHour')}</Typography>
      {data.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {t('callDashboard.noCallData', 'No call data yet.')}
        </Typography>
      ) : (
        <ResponsiveContainer width="100%" height={isNarrow ? 220 : 300}>
          {variant === 'pie' ? (
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="44%" outerRadius="76%" paddingAngle={2}>
                {pieData.map((entry) => <Cell key={entry.key} fill={seriesColor(entry.key)} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          ) : variant === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: isNarrow ? 10 : 12, fill: theme.palette.text.secondary }} interval={isNarrow ? 2 : 'preserveEnd'} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
              <Tooltip contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => seriesLabel(v)} />
              {series.map((s) => <Line key={s} type="monotone" dataKey={s} name={seriesLabel(s)} stroke={seriesColor(s)} strokeWidth={2} dot={false} />)}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: isNarrow ? 10 : 12, fill: theme.palette.text.secondary }}
              // 24 hour labels overlap into mush at phone width — show every 3rd.
              interval={isNarrow ? 2 : 'preserveEnd'}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
            <Tooltip
              contentStyle={{
                background: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => seriesLabel(v)} />
            {series.map((s) => (
              <Bar key={s} dataKey={s} name={seriesLabel(s)} stackId="calls" fill={seriesColor(s)} radius={[2, 2, 0, 0]} />
            ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </Paper>
  );
}

// Date → "21:00" (hour-of-day label, local time).
function fmtHour(d) {
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}
