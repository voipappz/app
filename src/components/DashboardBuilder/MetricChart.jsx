import { Typography } from '@mui/material';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTranslation } from 'react-i18next';
import LtrIsland from '../../i18n/LtrIsland';
import { formatDayMonth, formatTime } from '../../utils/dateUtils';

// An axis label for a point in time ("29 Jun 14:05"); other names as they are.
const tickLabel = (value) => {
  const time = formatTime(value);
  return time ? `${formatDayMonth(value)} ${time}` : value;
};

const COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#0288d1'];

export default function MetricChart({ type, series = [] }) {
  const { t } = useTranslation('widgets');
  const data = series.map((row, index) => ({
    name: row.time || String(index + 1),
    value: row.value === null || row.value === undefined || row.value === '' ? null : Number(row.value),
  })).filter((row) => row.value === null || Number.isFinite(row.value));
  if (!data.some((row) => row.value !== null)) return <Typography sx={{ py: 4 }} color="text.secondary">{t('result.noData')}</Typography>;
  if (type === 'pie' && data.some((row) => row.value < 0)) return <Typography color="text.secondary">{t('chart.pieNegative')}</Typography>;
  if (type === 'pie' && !data.some((row) => row.value > 0)) return <Typography color="text.secondary">{t('chart.allZero')}</Typography>;
  const Chart = type === 'bar' ? BarChart : LineChart;
  const kind = type === 'trend' ? 'line' : type;
  return <LtrIsland role="img" aria-label={t('chart.label', { type: t(`types.${kind}`, { defaultValue: kind }) })} sx={{ height: 240, minWidth: 0 }}>
    <ResponsiveContainer width="100%" height="100%">
      {type === 'pie' ? <PieChart><Pie data={data} dataKey="value" nameKey="name" outerRadius={85}>
        {data.map((row, index) => <Cell key={`${row.name}-${index}`} fill={COLORS[index % COLORS.length]} />)}
      </Pie><Tooltip /></PieChart> : <Chart data={data}>
        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" minTickGap={35} tick={{ fontSize: 10 }} tickFormatter={tickLabel} /><YAxis /><Tooltip />
        {type === 'bar' ? <Bar dataKey="value" fill={COLORS[0]} /> : <Line dataKey="value" stroke={COLORS[0]} dot={false} connectNulls={false} />}
      </Chart>}
    </ResponsiveContainer>
  </LtrIsland>;
}
