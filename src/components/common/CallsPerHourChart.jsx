import { useMemo } from 'react';
import { Paper, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
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
export default function CallsPerHourChart({ calls = [], points = null }) {
  const theme = useTheme();
  const { t } = useTranslation();

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
  const series = useProjection ? ['inbound', 'outbound'] : statuses;
  const seriesLabel = (s) => useProjection ? t(`callDashboard.${s}`, s) : t(`usageReports.status.${s}`, statusLabel(s));
  const seriesColor = (s) => useProjection
    ? (theme.palette[s === 'inbound' ? 'info' : 'success']?.main || theme.palette.grey[500])
    : hexFor(s);

  return (
    <Paper elevation={0} sx={{ p: 2.5, height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>{t('callDashboard.callsPerHour')}</Typography>
      {data.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {t('callDashboard.noCallData', 'No call data yet.')}
        </Typography>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
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
        </ResponsiveContainer>
      )}
    </Paper>
  );
}

// Date → "21:00" (hour-of-day label, local time).
function fmtHour(d) {
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}
