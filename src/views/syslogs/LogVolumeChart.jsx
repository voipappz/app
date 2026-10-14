import { useMemo } from 'react';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { formatNumber } from '../../utils/numberUtils';
import { formatDate } from '../../utils/dateUtils';

// Level colours match the list; anything else takes the palette in order.
const LEVEL_COLORS = {
  emerg: '#7f1d1d', alert: '#991b1b', crit: '#dc2626', err: '#ef4444', error: '#ef4444',
  warning: '#f59e0b', warn: '#f59e0b', notice: '#06b6d4', info: '#3b82f6', debug: '#94a3b8',
};
const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];
const MAX_SERIES = 8;

const BUCKET_MS = { minute: 60e3, hour: 3.6e6, day: 8.64e7 };

/**
 * Message volume over the selected window, stacked by the list's grouping.
 * `data` is /api/logs/aggregate: [{ time, <value>: count, ... }]. Past
 * MAX_SERIES values the smallest are summed into "other", so a busy source
 * list stays readable. Clicking a bar narrows the window to that bucket.
 */
export default function LogVolumeChart({ data = [], loading, groupLabel = 'Level', interval = 'hour', onSelectRange }) {
  const { rows, keys, total } = useMemo(() => {
    const totals = {};
    data.forEach((row) => Object.entries(row).forEach(([k, v]) => {
      if (k !== 'time' && typeof v === 'number') totals[k] = (totals[k] || 0) + v;
    }));
    const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
    const shown = ranked.slice(0, MAX_SERIES);
    const rest = ranked.slice(MAX_SERIES);
    const out = data
      .map((row) => {
        const r = { time: row.time };
        shown.forEach((k) => { r[k] = row[k] || 0; });
        if (rest.length) r.other = rest.reduce((sum, k) => sum + (row[k] || 0), 0);
        return r;
      })
      .sort((a, b) => new Date(a.time) - new Date(b.time));
    return {
      rows: out,
      keys: rest.length ? [...shown, 'other'] : shown,
      total: Object.values(totals).reduce((a, b) => a + b, 0),
    };
  }, [data]);

  const colorFor = (key, i) => LEVEL_COLORS[key] || (key === 'other' ? '#64748b' : PALETTE[i % PALETTE.length]);
  const tick = (t) => {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return t;
    return interval === 'day'
      ? `${d.getDate()}/${d.getMonth() + 1}`
      : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <Paper elevation={0} data-testid="syslog-volume" sx={{ flexShrink: 0, px: 1.5, pt: 1, pb: 0.5, border: '1px solid var(--mui-palette-divider)', borderRadius: 1, bgcolor: 'var(--mui-palette-background-paper)' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Messages over time</Typography>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
          by {groupLabel.toLowerCase()} · {formatNumber(total)} in range{onSelectRange ? ' · click a bar to zoom in' : ''}
        </Typography>
        {loading && <CircularProgress size={12} sx={{ ml: 'auto' }} />}
      </Box>
      {rows.length === 0 ? (
        <Typography sx={{ py: 3, textAlign: 'center', fontSize: '0.75rem', color: 'text.secondary' }}>
          {loading ? 'Loading…' : 'No messages in this range'}
        </Typography>
      ) : (
        <ResponsiveContainer width="100%" height={130}>
          <BarChart
            data={rows}
            margin={{ top: 6, right: 4, bottom: 0, left: -18 }}
            onClick={(e) => {
              const t = e?.activeLabel;
              if (!t || !onSelectRange) return;
              const start = new Date(t);
              onSelectRange(start, new Date(start.getTime() + (BUCKET_MS[interval] || BUCKET_MS.hour)));
            }}
            style={{ cursor: onSelectRange ? 'pointer' : 'default' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--mui-palette-divider)" vertical={false} />
            <XAxis dataKey="time" tickFormatter={tick} tick={{ fontSize: 10 }} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={44} />
            <Tooltip labelFormatter={(l) => formatDate(l)} contentStyle={{ fontSize: '0.75rem' }} />
            <Legend wrapperStyle={{ fontSize: '0.68rem' }} iconSize={8} />
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="v" fill={colorFor(k, i)} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </Paper>
  );
}
