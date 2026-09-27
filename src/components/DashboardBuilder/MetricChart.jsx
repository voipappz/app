import { Box, Typography } from '@mui/material';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#0288d1'];

export default function MetricChart({ type, series = [] }) {
  const data = series.map((row, index) => ({
    name: row.time || String(index + 1),
    value: row.value === null || row.value === undefined || row.value === '' ? null : Number(row.value),
  })).filter((row) => row.value === null || Number.isFinite(row.value));
  if (!data.some((row) => row.value !== null)) return <Typography sx={{ py: 4 }} color="text.secondary">No data in this time range.</Typography>;
  if (type === 'pie' && data.some((row) => row.value < 0)) return <Typography color="text.secondary">Pie charts require non-negative values. Choose line or bar.</Typography>;
  if (type === 'pie' && !data.some((row) => row.value > 0)) return <Typography color="text.secondary">All values are zero. Use table view to inspect them.</Typography>;
  const Chart = type === 'bar' ? BarChart : LineChart;
  return <Box role="img" aria-label={`${type === 'trend' ? 'line' : type} chart`} sx={{ height: 240, minWidth: 0 }}>
    <ResponsiveContainer width="100%" height="100%">
      {type === 'pie' ? <PieChart><Pie data={data} dataKey="value" nameKey="name" outerRadius={85}>
        {data.map((row, index) => <Cell key={`${row.name}-${index}`} fill={COLORS[index % COLORS.length]} />)}
      </Pie><Tooltip /></PieChart> : <Chart data={data}>
        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" minTickGap={35} tick={{ fontSize: 10 }} tickFormatter={(value) => {
          const time = new Date(value);
          return Number.isNaN(time.getTime()) ? value : time.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }} /><YAxis /><Tooltip />
        {type === 'bar' ? <Bar dataKey="value" fill={COLORS[0]} /> : <Line dataKey="value" stroke={COLORS[0]} dot={false} connectNulls={false} />}
      </Chart>}
    </ResponsiveContainer>
  </Box>;
}
