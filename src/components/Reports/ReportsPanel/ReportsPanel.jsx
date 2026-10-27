import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Paper, Typography, Alert, Chip, CircularProgress, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend,
} from 'recharts';
import { endOfDay, startOfDay } from 'date-fns';
import { reportsApi } from '../../../services/api/reportsApi';
import DateRangePicker from '../DateRangePicker/DateRangePicker.jsx';
import ReportMap from './ReportMap.jsx';
import { useTranslation } from 'react-i18next';
import LtrIsland from '../../../i18n/LtrIsland';
import { formatDayMonth } from '../../../utils/dateUtils';
import { formatNumber } from '../../../utils/numberUtils';

const SERIES_COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#3b82f6', '#ec4899', '#84cc16'];

const isNumeric = (v) => v !== null && v !== '' && !isNaN(Number(v));

export const linkedColumnUrl = (template, value) => {
  if (!template || value === null || value === undefined || value === '') return null;
  return String(template).replaceAll('{value}', encodeURIComponent(String(value)));
};

/**
 * "29 Jun – 29 Jul 2026" — the window a period key actually resolved to.
 * A bare Today/7d/30d control never says which dates it means; the reader has
 * to guess whether "30d" ends today, yesterday, or at the last complete day.
 */
export const formatRange = (startSec, endSec) => {
  if (!startSec || !endSec) return '';
  const start = new Date(startSec * 1000);
  const end = new Date(endSec * 1000);
  const last = formatDayMonth(end, { withYear: true });
  if (start.toDateString() === end.toDateString()) return last;
  return `${formatDayMonth(start, { withYear: start.getFullYear() !== end.getFullYear() })} – ${last}`;
};

/** queries.yml column keys → readable series names: count_answered_calls → "Answered Calls". */
const prettyColumn = (c) => String(c)
  .replace(/^count_/, '')
  .replace(/_uuid$/, '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (m) => m.toUpperCase());

/** Axis ticks only — the tooltip still shows the full value. */
const shortTick = (v) => {
  const s = String(v ?? '—');
  return s.length > 18 ? `${s.slice(0, 17)}…` : s;
};

/** Split a report's columns into a label column + numeric series columns. */
const splitColumns = (columns, rows) => {
  const sample = rows[0] || {};
  const numeric = columns.filter((c) => isNumeric(sample[c]));
  const label = columns.find((c) => !numeric.includes(c)) || columns[0];
  return { label, numeric: numeric.filter((c) => c !== label) };
};

/** A report can only be drawn if it has at least one numeric series column. */
export const isChartable = (chart, columns = [], rows = []) =>
  chart === 'map'
    ? rows.length > 0
    : ['pie', 'line', 'bar', 'scatter'].includes(chart) &&
      rows.length > 0 &&
      splitColumns(columns, rows).numeric.length > 0;

const ReportTable = ({ columns, rows, linkedColumns = {} }) => (
  <TableContainer sx={{ maxHeight: 320 }}>
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          {columns.map((c) => (
            <TableCell key={c} sx={{ fontWeight: 700, whiteSpace: 'nowrap', backgroundColor: 'var(--mui-palette-surface-muted)' }}>{c}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i} hover>
            {columns.map((c) => (
              <TableCell key={c} sx={{ whiteSpace: 'nowrap' }}>
                {linkedColumnUrl(linkedColumns[c], row[c]) ? (
                  <a href={linkedColumnUrl(linkedColumns[c], row[c])}>{String(row[c])}</a>
                ) : row[c] === null || row[c] === undefined ? '—' : String(row[c])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

// A chart runs left to right in every language (time and axes); its labels
// are the report's own column names.
export const ReportChart = (props) => (
  <LtrIsland>
    <ReportChartBody {...props} />
  </LtrIsland>
);

const ReportChartBody = ({ chart, columns, rows, height = 280 }) => {
  const { t } = useTranslation('reports');
  if (chart === 'map') return <ReportMap columns={columns} rows={rows} height={height} />;

  if (chart === 'scatter') {
    const numericColumns = columns.filter((column) => isNumeric((rows[0] || {})[column]));
    const [xKey, yKey] = numericColumns;
    if (!xKey || !yKey) return <ReportTable columns={columns} rows={rows} />;
    const data = rows.map((row) => ({ ...row, [xKey]: Number(row[xKey]), [yKey]: Number(row[yKey]) }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis type="number" dataKey={xKey} name={prettyColumn(xKey)} tick={{ fontSize: 11 }} />
          <YAxis type="number" dataKey={yKey} name={prettyColumn(yKey)} tick={{ fontSize: 11 }} width={42} />
          <ZAxis range={[55, 55]} />
          <ChartTooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter name={`${prettyColumn(xKey)} / ${prettyColumn(yKey)}`} data={data} fill="#8b5cf6" />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  const { label, numeric } = splitColumns(columns, rows);
  if (!numeric.length) return <ReportTable columns={columns} rows={rows} />;

  const data = rows.map((r) => ({ ...r, [label]: String(r[label] ?? '—') }));

  if (chart === 'pie') {
    const valueKey = numeric[0];
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey={label} outerRadius={Math.min(100, height / 2 - 30)} label>
            {data.map((_, i) => <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />)}
          </Pie>
          <ChartTooltip formatter={(v, n) => [v, prettyColumn(n)]} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={prettyColumn} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const targetKey = numeric.find((column) => String(column).toLowerCase() === 'target');
  const series = numeric.filter((column) => column !== targetKey);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey={label} tick={{ fontSize: 11 }} tickFormatter={shortTick} minTickGap={8} />
        <YAxis tick={{ fontSize: 11 }} width={36} allowDecimals={false} />
        <ChartTooltip formatter={(v, n) => [v, prettyColumn(n)]} />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={prettyColumn} />
        {series.map((c, i) =>
          chart === 'line'
            ? <Line key={c} type="monotone" dataKey={c} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} strokeWidth={2} />
            // maxBarSize: a one-row report would otherwise render a single slab
            // the full width of the plot area.
            : <Bar key={c} dataKey={c} fill={SERIES_COLORS[i % SERIES_COLORS.length]} maxBarSize={48} />
        )}
        {targetKey && (
          <Line type="monotone" dataKey={targetKey} name={t('panel.target')} stroke="#ef4444"
            strokeDasharray="7 4" strokeWidth={2} dot={false} connectNulls />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
};

/**
 * ReportsPanel — runs one queries.yml dashboard category (billing/calls/queue/
 * extensions/providers) via GET /api/reports/dashboards/:category and renders
 * each report as a card, table or chart per the server's auto-detected type.
 * Data-driven: a report added to queries.yml with this :category: appears here
 * with no admin change. Used by the per-screen "Reports" pop-out drawers.
 */
const ReportsPanel = ({ category, open = true, homeStyle = false }) => {
  const { t } = useTranslation('reports');
  const [dateRange, setDateRange] = useState(() => [startOfDay(new Date()), endOfDay(new Date())]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reports, setReports] = useState([]);
  // The window the displayed data actually covers, captured at fetch time.
  const [range, setRange] = useState(null);

  const fetchReports = useCallback(async () => {
    if (!category) return;
    setLoading(true);
    setError(null);
    try {
      const start = Math.floor(new Date(dateRange[0]).getTime() / 1000);
      const end = Math.floor(new Date(dateRange[1]).getTime() / 1000);
      setRange({ start, end });
      const res = await reportsApi.runDashboardCategory(category, { startDate: start, endDate: end });
      setReports(res?.reports || []);
    } catch (err) {
      setError(err.message || t('panel.loadError'));
    } finally {
      setLoading(false);
    }
  }, [category, dateRange, t]);

  useEffect(() => {
    if (open) fetchReports();
  }, [open, fetchReports]);

  const nonEmpty = useMemo(() => reports.filter((r) => !r.error && (r.rows || []).length), [reports]);
  const failed = useMemo(() => reports.filter((r) => r.error), [reports]);
  const empty = useMemo(() => reports.filter((r) => !r.error && !(r.rows || []).length), [reports]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />
        {range && (
          <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', ms: 0.5 }}>
            {formatRange(range.start, range.end)}
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title={t('panel.refresh')}>
          <span>
            <IconButton size="small" onClick={fetchReports} aria-label={t('panel.refresh')} disabled={loading} sx={{ color: 'var(--mui-palette-text-secondary)' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Home-style counter strip — one big colored number per report */}
      {homeStyle && !loading && nonEmpty.length > 0 && (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(${Math.min(nonEmpty.length, 6)}, 1fr)` },
          gap: 1.5, mb: 2,
        }}>
          {nonEmpty.map((report, i) => {
            const colors = ['#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ef4444', '#06b6d4'];
            // Single-row, single-number reports show the number itself; others the row count
            const numericCols = report.columns.filter((c) => report.rows.length > 0 && !isNaN(Number(report.rows[0][c])));
            const value = (report.rows.length === 1 && numericCols.length >= 1)
              ? report.rows[0][numericCols[0]]
              : report.rows.length;
            return (
              <Paper key={report.name} elevation={0} sx={{ p: 1.5, textAlign: 'center', border: '1px solid var(--mui-palette-divider)', borderRadius: 2, bgcolor: 'var(--mui-palette-surface-muted)' }}>
                <Typography sx={{ fontSize: '1.75rem', fontWeight: 800, color: colors[i % colors.length], lineHeight: 1.2 }}>
                  {value}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {report.name}
                </Typography>
              </Paper>
            );
          })}
        </Box>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      )}

      {!loading && !error && reports.length === 0 && (
        <Typography variant="body2" sx={{ color: 'var(--mui-palette-text-secondary)', textAlign: 'center', py: 4 }}>
          {t('panel.noReports')}
        </Typography>
      )}

      {!loading && nonEmpty.map((report) => (
        <Paper key={report.name} elevation={0} sx={{ border: '1px solid var(--mui-palette-divider)', borderRadius: 2, p: 2, mb: 2, backgroundColor: 'var(--mui-palette-background-paper)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--mui-palette-text-primary)' }}>{report.name}</Typography>
            <Chip label={report.chart || report.type} size="small" variant="outlined" sx={{ fontSize: 11 }} />
            <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)' }}>{t('panel.rows', { n: formatNumber(report.rows.length) })}</Typography>
          </Box>
          {/* Blazer layout: the chart first, the full result table underneath —
              never one instead of the other. A report the server typed as
              'table' has no chart to draw, so it shows the table alone. */}
          {isChartable(report.chart, report.columns, report.rows) && (
            <Box sx={{ mb: 2 }}>
              <ReportChart chart={report.chart} columns={report.columns} rows={report.rows} />
            </Box>
          )}
          <ReportTable columns={report.columns} rows={report.rows} linkedColumns={report.linked_columns} />
        </Paper>
      ))}

      {!loading && empty.length > 0 && (
        <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', display: 'block', mb: 1 }}>
          {t('panel.noData', { names: empty.map((r) => r.name).join(', ') })}
        </Typography>
      )}
      {!loading && failed.map((r) => (
        <Alert key={r.name} severity="warning" sx={{ mb: 1 }}>
          {r.name}: {r.error}
        </Alert>
      ))}
    </Box>
  );
};

export default ReportsPanel;
