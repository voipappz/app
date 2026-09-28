import { useMemo } from 'react';
import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { pivot, summarize } from './metricQuery';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const tick = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));

/**
 * A metric query's answer drawn as line, bar, one number, or a table —
 * the builder's preview and the saved 'query' widget are the same component.
 */
export default function MetricResult({ rows, view = 'line', splitBy = '', aggregation = 'mean', loading, error, unit = '' }) {
  const { data, series } = useMemo(() => pivot(rows, splitBy), [rows, splitBy]);
  if (error) return <Typography role="alert" variant="body2" color="error">{error}</Typography>;
  if (loading && !data.length) return <LinearProgress aria-label="Running query" />;
  if (!data.length) return <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', my: 'auto', py: 3 }}>No data in this time range.</Typography>;

  if (view === 'number') {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', py: 2 }}>
        <Typography variant="h3" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }} data-testid="metric-number">
          {fmt(summarize(rows, aggregation))}{unit ? ` ${unit}` : ''}
        </Typography>
      </Stack>
    );
  }

  if (view === 'table') {
    return (
      <Box sx={{ overflow: 'auto', maxHeight: '100%' }} data-testid="metric-table">
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, '& th, & td': { p: 0.75, borderBottom: '1px solid', borderColor: 'divider', textAlign: 'left', whiteSpace: 'nowrap' } }}>
          <thead><tr><th>time</th>{series.map((name) => <th key={name}>{name}</th>)}</tr></thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.time}><td>{new Date(row.time).toLocaleString()}</td>{series.map((name) => <td key={name}>{fmt(row[name])}</td>)}</tr>
            ))}
          </tbody>
        </Box>
      </Box>
    );
  }

  const Chart = view === 'bar' ? BarChart : LineChart;
  return (
    <Box sx={{ flex: 1, minHeight: 180, height: '100%' }} data-testid={`metric-${view}`}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
          <XAxis dataKey="time" tickFormatter={tick} tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={(value) => new Date(value).toLocaleString()} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((name, i) => (view === 'bar'
            ? <Bar key={name} dataKey={name} stackId="s" fill={COLORS[i % COLORS.length]} />
            : <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
          ))}
        </Chart>
      </ResponsiveContainer>
    </Box>
  );
}
