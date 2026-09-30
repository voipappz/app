import { useMemo, useState } from 'react';
import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import StatCounter from '../common/StatCounter/StatCounter.jsx';
import { dimensionLabel, dimensionText, formatMeasure, groupName, measureOf, timeSeries } from './cdrReport';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#64748b'];

const tick = (bucket) => (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return bucket === '1d' ? date.toLocaleDateString([], { month: 'short', day: 'numeric' }) : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Each measure in the colour the Calls counters use for the same meaning.
const MEASURE_COLOR = {
  calls: 'var(--counter-total)', unique_callers: 'var(--counter-total)',
  answered: 'var(--counter-answered)', answer_rate: 'var(--counter-answered)', service_level: 'var(--counter-answered)',
  missed: 'var(--counter-no-answer)', abandoned: 'var(--counter-no-answer)', abandon_rate: 'var(--counter-no-answer)', short_calls: 'var(--counter-no-answer)',
  billsec: 'var(--counter-outgoing)', duration: 'var(--counter-outgoing)', avg_talk: 'var(--counter-outgoing)', max_talk: 'var(--counter-outgoing)',
  avg_duration: 'var(--counter-outgoing)', avg_wait: 'var(--counter-incoming)', billed: 'var(--counter-incoming)', mos: 'var(--counter-incoming)',
};

// The number view: the Calls counter design (StatCounter), one per measure.
function Tiles({ row, measures, catalog }) {
  return (
    <Box data-testid="cdr-tiles" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, height: '100%', alignContent: 'center' }}>
      {measures.map((key) => {
        const m = measureOf(catalog, key);
        const value = row?.[key];
        return (
          <StatCounter key={key} label={m.label} color={MEASURE_COLOR[key]}
            value={value === undefined || value === null ? null : formatMeasure(m.unit, value)} />
        );
      })}
    </Box>
  );
}

// Group rows with a column per measure. Clicking a header sorts by it;
// clicking a group value drills into it (adds it as a filter).
function ReportTable({ rows, dimensions, measures, labels, catalog, bucket, onDrill }) {
  const [sort, setSort] = useState({ key: null, desc: true });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const val = (row) => (measures.includes(sort.key) ? Number(row[sort.key]) || 0 : String(dimensionText(sort.key, row[sort.key], labels)));
    return [...rows].sort((a, b) => {
      const x = val(a); const y = val(b);
      const c = typeof x === 'number' ? x - y : x.localeCompare(y);
      return sort.desc ? -c : c;
    });
  }, [rows, sort, measures, labels]);
  const header = (key, label, numeric) => (
    <th key={key} style={{ textAlign: numeric ? 'right' : 'left' }}>
      <Box component="button" type="button" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
        sx={{ all: 'unset', cursor: 'pointer', fontWeight: 700 }} aria-label={`Sort by ${label}`}>
        {label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </Box>
    </th>
  );
  return (
    <Box sx={{ overflow: 'auto', height: '100%' }} data-testid="cdr-table">
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, '& th, & td': { px: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap' }, '& thead th': { position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 } }}>
        <thead><tr>
          {bucket && header('time', 'Time', false)}
          {dimensions.map((d) => header(d, dimensionLabel(catalog, d), false))}
          {measures.map((m) => header(m, measureOf(catalog, m).label, true))}
        </tr></thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={`${row.time || ''}-${dimensions.map((d) => row[d]).join('|')}-${i}`}>
              {bucket && <td>{new Date(row.time).toLocaleString()}</td>}
              {dimensions.map((d) => (
                <td key={d}>
                  {onDrill ? (
                    <Box component="button" type="button" onClick={() => onDrill(d, row[d])} aria-label={`Filter ${dimensionLabel(catalog, d)} = ${dimensionText(d, row[d], labels)}`}
                      sx={{ all: 'unset', cursor: 'pointer', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}>
                      {dimensionText(d, row[d], labels)}
                    </Box>
                  ) : dimensionText(d, row[d], labels)}
                </td>
              ))}
              {measures.map((m) => <td key={m} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMeasure(measureOf(catalog, m).unit, row[m])}</td>)}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

/**
 * A CDR report drawn as KPI tiles, a table, a bar/line chart over time or
 * by group, or a pie — the editor's preview and a saved 'cdr' widget are the
 * same component.
 */
export default function CdrResult({ result, query, catalog, onDrill }) {
  const { rows = [], labels = {}, loading, error } = result;
  const dimensions = query.dimensions || [];
  const measures = query.measures || [];
  const bucket = query.bucket || '';
  const view = query.view || 'table';
  const first = measureOf(catalog, measures[0]);
  const series = useMemo(() => (bucket ? timeSeries(rows, { dimensions, measures, labels }) : null), [rows, bucket, dimensions, measures, labels]);
  const groups = useMemo(() => rows.map((row) => ({ name: groupName(row, dimensions, labels), value: Number(row[measures[0]]) || 0, row })), [rows, dimensions, measures, labels]);

  if (error) return <Typography role="alert" variant="body2" color="error">{error}</Typography>;
  if (loading && !rows.length) return <LinearProgress aria-label="Running report" />;
  if (!rows.length) return <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', my: 'auto', py: 3 }}>No calls in this time range.</Typography>;

  if (view === 'number') return <Tiles row={rows[0]} measures={measures} catalog={catalog} />;
  if (view === 'table') return <ReportTable rows={rows} dimensions={dimensions} measures={measures} labels={labels} catalog={catalog} bucket={bucket} onDrill={onDrill} />;

  const fmt = (value) => formatMeasure(first.unit, value);
  if (view === 'pie') {
    const top = groups.slice(0, 8);
    const rest = groups.slice(8).reduce((sum, g) => sum + g.value, 0);
    const data = rest ? [...top, { name: 'Other', value: rest }] : top;
    return (
      <Box sx={{ flex: 1, minHeight: 200, height: '100%' }} data-testid="cdr-pie">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" paddingAngle={1}
              onClick={(entry) => entry?.row && onDrill && dimensions[0] && onDrill(dimensions[0], entry.row[dimensions[0]])}>
              {data.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} cursor={onDrill ? 'pointer' : undefined} />)}
            </Pie>
            <Tooltip formatter={fmt} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </Box>
    );
  }

  if (series) {
    const Chart = view === 'line' ? LineChart : BarChart;
    const name = (key) => (dimensions.length ? key : measureOf(catalog, key).label);
    return (
      <Box sx={{ flex: 1, minHeight: 200, height: '100%' }} data-testid={`cdr-${view}`}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={series.data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
            <XAxis dataKey="time" tickFormatter={tick(bucket)} tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} width={64} />
            <Tooltip labelFormatter={(value) => new Date(value).toLocaleString()} formatter={(value, key) => [fmt(value), name(key)]} />
            {series.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} formatter={name} />}
            {series.series.map((key, i) => (view === 'line'
              ? <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
              : <Bar key={key} dataKey={key} stackId={dimensions.length ? 's' : undefined} fill={COLORS[i % COLORS.length]} />
            ))}
          </Chart>
        </ResponsiveContainer>
      </Box>
    );
  }

  // No time axis: one bar per group, the first measure.
  return (
    <Box sx={{ flex: 1, minHeight: 200, height: '100%' }} data-testid="cdr-bar">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={groups.slice(0, 30)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={groups.length > 8 ? -30 : 0} textAnchor={groups.length > 8 ? 'end' : 'middle'} height={groups.length > 8 ? 70 : 30} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} width={64} />
          <Tooltip formatter={(value) => [fmt(value), first.label]} />
          <Bar dataKey="value" fill={COLORS[0]} cursor={onDrill ? 'pointer' : undefined}
            onClick={(entry) => onDrill && dimensions[0] && onDrill(dimensions[0], entry?.row?.[dimensions[0]] ?? entry?.payload?.row?.[dimensions[0]])} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
