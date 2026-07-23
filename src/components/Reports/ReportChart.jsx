// ReportChart — renders ANY report from the engine's {columns, rows, chart}
// payload with zero per-report config. Port of nimbus-admin's
// ReportsPanel/ReportsPanel.jsx (ReportChart + splitColumns), on recharts.
//
// The trick is `splitColumns`: pick the first non-numeric column as the label
// axis and treat every numeric column as a series. That's what lets one
// component draw every report the API returns.
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';

// Rotation used for pie slices / multiple series.
export const SERIES_COLORS = ['#00ADB4', '#f5a623', '#34c759', '#d32f2f', '#7b61ff', '#ed6c02', '#0288d1', '#9c27b0'];

const isBlank = (v) => v === null || v === undefined || v === '';

/**
 * Split report columns into the label column + numeric series columns.
 * A column is a series when every NON-EMPTY row value parses as a number (blanks
 * are ignored — reports routinely have empty cells — but a column needs at least
 * one real number to plot).
 * Returns { label, series } — `label` is null when every column is numeric.
 */
export function splitColumns(columns = [], rows = []) {
  const cols = Array.isArray(columns) ? columns : [];
  const rws = Array.isArray(rows) ? rows : [];
  const numeric = cols.filter((c) => {
    const vals = rws.map((r) => r?.[c]).filter((v) => !isBlank(v));
    return vals.length > 0 && vals.every((v) => !Number.isNaN(Number(v)));
  });
  const label = cols.find((c) => !numeric.includes(c)) ?? null;
  return { label, series: numeric };
}

/** Coerce the engine's stringy numbers ("16") into real numbers for recharts. */
function toChartData(rows, label, series) {
  return (rows || []).map((r) => {
    const out = { [label ?? 'name']: r?.[label] ?? '' };
    for (const s of series) out[s] = Number(r?.[s] ?? 0);
    return out;
  });
}

function ReportTable({ columns, rows }) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>{columns.map((c) => <TableCell key={c}>{c}</TableCell>)}</TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>{columns.map((c) => <TableCell key={c}>{String(r?.[c] ?? '')}</TableCell>)}</TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * @param report {{ name, type, columns, rows, chart, error }} — straight from
 *   GET /api/reports/dashboards/:category
 * @param height chart height in px
 */
export default function ReportChart({ report, height = 260 }) {
  const { name, columns = [], rows = [], chart, error } = report || {};
  const { label, series } = splitColumns(columns, rows);

  if (error) return <Typography variant="body2" color="error">{String(error)}</Typography>;
  if (!rows.length) return <Typography variant="body2" color="text.secondary">No data</Typography>;
  // Nothing numeric to plot (or the engine asked for a table) → render the table.
  if (!series.length || chart === 'table' || !chart) return <ReportTable columns={columns} rows={rows} />;

  const data = toChartData(rows, label, series);
  const axis = label ?? 'name';

  if (chart === 'pie') {
    // Pie shows a single series.
    const value = series[0];
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={value} nameKey={axis} outerRadius={Math.min(height / 2 - 20, 100)} label>
            {data.map((_, i) => <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const Chart = chart === 'line' ? LineChart : BarChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} aria-label={name}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey={axis} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        {series.length > 1 && <Legend />}
        {series.map((s, i) => (
          chart === 'line'
            ? <Line key={s} type="monotone" dataKey={s} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} />
            : <Bar key={s} dataKey={s} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
        ))}
      </Chart>
    </ResponsiveContainer>
  );
}

/** A report in a titled card — the unit the dashboards grid lays out. */
export function ReportCard({ report, height }) {
  return (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>{report?.name}</Typography>
      <Box sx={{ overflowX: 'auto' }}><ReportChart report={report} height={height} /></Box>
    </Paper>
  );
}
