import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, FormControl, InputLabel, Select, MenuItem, Button,
  CircularProgress, Alert, Chip, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TableViewIcon from '@mui/icons-material/TableView';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { DataGrid } from '@mui/x-data-grid';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts';
import { monitoringApi } from '../../../services/api/monitoringApi';

const AGGREGATIONS = ['mean', 'sum', 'max', 'min', 'last', 'first', 'count'];
const WINDOWS = [
  { label: 'Last 1h', minutes: 60 },
  { label: 'Last 6h', minutes: 360 },
  { label: 'Last 24h', minutes: 1440 },
  { label: 'Last 7d', minutes: 10080 },
];
const PALETTE = ['#65758E', '#28A7E9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

/**
 * Structured metric query — the query is built and executed by Influxer on the
 * backend (GET /api/reports/influxdb/query). The user only picks measurement →
 * field → aggregation; the selected node and time window are injected. No
 * hand-written InfluxQL — but the InfluxQL Influxer generated is shown read-only.
 */
export default function InfluxMetricExplorer({
  host = '', defaultMeasurement = '', defaultField = '', defaultAggregation = 'mean', defaultMinutes = 60,
}) {
  const [schema, setSchema] = useState([]);
  const [schemaErr, setSchemaErr] = useState(null);
  const [measurement, setMeasurement] = useState('');
  const [field, setField] = useState('');
  const [aggregation, setAggregation] = useState(AGGREGATIONS.includes(defaultAggregation) ? defaultAggregation : 'mean');
  const [minutes, setMinutes] = useState(Number(defaultMinutes) > 0 ? Number(defaultMinutes) : 60);
  // A widget's saved window can be any length; keep it selectable.
  const windows = useMemo(
    () => (WINDOWS.some((w) => w.minutes === minutes) ? WINDOWS : [...WINDOWS, { label: `Last ${minutes} min`, minutes }].sort((a, b) => a.minutes - b.minutes)),
    [minutes],
  );
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('chart');

  useEffect(() => {
    let alive = true;
    monitoringApi.getInfluxSchema()
      .then((s) => { if (alive) setSchema(Array.isArray(s) ? s : []); })
      .catch((e) => { if (alive) setSchemaErr(e?.message || 'Failed to load schema'); });
    return () => { alive = false; };
  }, []);

  const measurements = useMemo(() => schema.map((s) => s.measurement).filter(Boolean).sort(), [schema]);
  const fields = useMemo(() => {
    const m = schema.find((s) => s.measurement === measurement);
    return (m?.fields || []).map((f) => (typeof f === 'string' ? f : f.name)).filter(Boolean).sort();
  }, [schema, measurement]);

  // A dashboard can point the explorer at the measurement it is explaining
  // without replacing the general-purpose browser. The Monitoring screen has
  // no preferred series; the calls dashboard starts on CDRs so the query
  // surface is useful as soon as it opens.
  useEffect(() => {
    if (measurement || measurements.length === 0) return;
    setMeasurement(measurements.includes(defaultMeasurement) ? defaultMeasurement : measurements[0]);
  }, [defaultMeasurement, measurement, measurements]);

  // Keep field valid when the measurement changes.
  useEffect(() => {
    if (!measurement || fields.length === 0 || fields.includes(field)) return;
    const preferred = measurement === defaultMeasurement && fields.includes(defaultField)
      ? defaultField
      : fields[0];
    setField(preferred);
  }, [defaultField, defaultMeasurement, measurement, fields, field]);

  const run = async () => {
    if (!measurement || !field) return;
    setRunning(true); setError(null);
    try {
      const r = await monitoringApi.runInfluxQuery({ measurement, field, aggregation, host, minutes });
      setResult(r);
    } catch (e) {
      setError(e?.message || 'Query failed');
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Box>
      {schemaErr && <Alert severity="warning" sx={{ mb: 1 }}>Schema: {schemaErr}</Alert>}

      {/* Builder row */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1.5 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Measurement</InputLabel>
          <Select label="Measurement" value={measurement} onChange={(e) => setMeasurement(e.target.value)}>
            {measurements.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 160 }} disabled={!measurement}>
          <InputLabel>Field</InputLabel>
          <Select label="Field" value={field} onChange={(e) => setField(e.target.value)}>
            {fields.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Aggregation</InputLabel>
          <Select label="Aggregation" value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
            {AGGREGATIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Window</InputLabel>
          <Select label="Window" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
            {windows.map((w) => <MenuItem key={w.minutes} value={w.minutes}>{w.label}</MenuItem>)}
          </Select>
        </FormControl>

        {host && <Chip size="small" variant="outlined" label={`host: ${host}`} />}

        <Button
          variant="contained" size="small" startIcon={running ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
          onClick={run} disabled={running || !measurement || !field} sx={{ textTransform: 'none' }}
        >
          Run
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {result && <Results result={result} view={view} setView={setView} />}
    </Box>
  );
}

function Results({ result, view, setView }) {
  const columns = (result.columns || []).map((c) => (typeof c === 'string' ? c : c.name));
  const rows = (result.rows || []).map((r, i) => ({ id: i, ...r }));

  const xKey = columns.find((c) => /time|date/i.test(c)) || columns[0];
  const numericKeys = columns.filter((c) => c !== xKey && rows.some((r) => r[c] != null && r[c] !== '' && !Number.isNaN(Number(r[c]))));
  const canChart = numericKeys.length > 0 && rows.length > 1;
  const chartData = rows.map((r) => {
    const o = { x: r[xKey] };
    numericKeys.forEach((k) => { o[k] = Number(r[k]); });
    return o;
  });
  const cols = columns.map((c) => ({ field: c, headerName: c, flex: 1, minWidth: 100 }));
  const effectiveView = canChart ? view : 'table';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {rows.length} row{rows.length !== 1 ? 's' : ''}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {canChart && (
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
            <ToggleButton value="table" sx={{ py: 0.25, px: 1 }}><TableViewIcon sx={{ fontSize: 16 }} /></ToggleButton>
            <ToggleButton value="chart" sx={{ py: 0.25, px: 1 }}><ShowChartIcon sx={{ fontSize: 16 }} /></ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>

      {rows.length === 0 ? (
        <Alert severity="info">No rows returned</Alert>
      ) : effectiveView === 'chart' ? (
        <Box sx={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip />
              {numericKeys.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      ) : (
        <Box sx={{ height: 280 }}>
          <DataGrid rows={rows} columns={cols} density="compact"
            pageSizeOptions={[25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            disableRowSelectionOnClick />
        </Box>
      )}

      {result.influxql && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">Generated by Influxer</Typography>
          <Box component="pre" sx={{
            m: 0, mt: 0.5, p: 1, fontSize: '0.72rem', fontFamily: 'monospace',
            bgcolor: 'var(--theme-bg-secondary)', border: '1px solid', borderColor: 'divider',
            borderRadius: 1, overflowX: 'auto', whiteSpace: 'pre-wrap',
          }}>{result.influxql}</Box>
        </Box>
      )}
    </Box>
  );
}
