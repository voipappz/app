import { useMemo } from 'react';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { formatNumber } from '../../utils/numberUtils';
import { formatDate } from '../../utils/dateUtils';

// Level colours match the list; anything else takes the palette in order.
const LEVEL_COLORS = {
  // Fixed status steps (critical / warning) for the levels that ARE a state;
  // the informational levels take categorical slots. Validated with the
  // dataviz skill's palette checks.
  emerg: '#d03b3b', alert: '#d03b3b', crit: '#d03b3b', err: '#d03b3b', error: '#d03b3b',
  warning: '#fab219', warn: '#fab219', notice: '#1baf7a', info: '#2a78d6', debug: '#8a8a85',
};
// Categorical slots in FIXED order (never cycled): the dataviz skill's validated
// palette - passes lightness, chroma, colour-blind separation and normal-vision
// checks. Past 8 values the rest fold into "other".
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
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

  const colorFor = (key, i) => LEVEL_COLORS[key] || (key === 'other' ? '#8a8a85' : PALETTE[Math.min(i, PALETTE.length - 1)]);
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
            <CartesianGrid stroke="var(--mui-palette-divider)" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey="time" tickFormatter={tick} tick={{ fontSize: 10 }} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={44} />
            <Tooltip labelFormatter={(l) => formatDate(l)} contentStyle={{ fontSize: '0.75rem' }} />
            <Legend wrapperStyle={{ fontSize: '0.68rem' }} iconSize={8} />
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="v" fill={colorFor(k, i)} stroke="var(--mui-palette-background-paper)" strokeWidth={2} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </Paper>
  );
}
