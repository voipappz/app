import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Collapse, Dialog, Divider, FormControlLabel, IconButton, MenuItem, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CodeIcon from '@mui/icons-material/Code';
import AddIcon from '@mui/icons-material/Add';
import { useAuth } from '../../context/AuthContext';
import { monitoringApi } from '../../services/api/monitoringApi';
import CdrResult from './CdrResult';
import { useCdrReport } from './useCdrReport';
import {
  BUCKET_LABELS, CDR_RANGES, CDR_VIEWS, FALLBACK_CATALOG, NEW_CDR_QUERY, cdrQueryReady, dimensionLabel, dimensionText, scopeParams,
} from './cdrReport';

let catalogCache = null;
// What this deployment's cdr table can answer; the API's full lists until it says.
export function useCdrCatalog() {
  const [catalog, setCatalog] = useState(catalogCache || FALLBACK_CATALOG);
  useEffect(() => {
    if (catalogCache) return;
    monitoringApi.getCdrCatalog().then((c) => {
      if (c?.dimensions?.length) { catalogCache = c; setCatalog(c); }
    }).catch(() => {});
  }, []);
  return catalog;
}

// Filter by one dimension: pick it, then a value — suggested from the busiest
// values in the current scope, or typed.
function FilterAdder({ catalog, scope, minutes, onAdd }) {
  const [dim, setDim] = useState('');
  const [value, setValue] = useState('');
  const [options, setOptions] = useState([]);
  const [labels, setLabels] = useState({});
  const scopeKey = JSON.stringify(scopeParams(scope));
  useEffect(() => {
    if (!dim) { setOptions([]); return undefined; }
    let active = true;
    monitoringApi.runCdrReport({ measures: ['calls'], dimensions: [dim], minutes, limit: 50, ...JSON.parse(scopeKey) })
      .then((res) => { if (active) { setOptions((res?.rows || []).map((row) => String(row[dim]))); setLabels(res?.labels || {}); } })
      .catch(() => { if (active) setOptions([]); });
    return () => { active = false; };
  }, [dim, minutes, scopeKey]);
  const add = () => { if (dim && value.trim()) { onAdd(dim, value.trim(), labels); setValue(''); } };
  return (
    <Stack spacing={1}>
      <TextField select size="small" label="Filter by" value={dim} onChange={(e) => { setDim(e.target.value); setValue(''); }}>
        <MenuItem value=""><em>Choose a field</em></MenuItem>
        {catalog.dimensions.map((d) => <MenuItem key={d.key} value={d.key}>{d.label}</MenuItem>)}
      </TextField>
      {dim && (
        <Stack direction="row" spacing={1}>
          <Autocomplete freeSolo size="small" options={options} sx={{ flex: 1 }} inputValue={value}
            onInputChange={(_, v) => setValue(v)} getOptionLabel={(o) => dimensionText(dim, o, labels)}
            renderInput={(params) => <TextField {...params} label="Value" onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />} />
          <Button size="small" variant="outlined" onClick={add} aria-label="Add filter" sx={{ minWidth: 0 }}><AddIcon fontSize="small" /></Button>
        </Stack>
      )}
    </Stack>
  );
}

function RawTable({ rows, columns }) {
  if (!rows.length) return <Typography variant="body2" color="text.secondary">No rows.</Typography>;
  return (
    <Box sx={{ overflow: 'auto', maxHeight: 360 }} data-testid="sql-result">
      <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: 12, '& th, & td': { px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap', textAlign: 'left' } }}>
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{columns.map((c) => <td key={c}>{row[c] == null ? '—' : String(row[c])}</td>)}</tr>)}</tbody>
      </Box>
    </Box>
  );
}

/**
 * Build a call-report widget: the board's "Build widget" helper, full screen.
 * Pick measures, group by up to two CDR fields, optionally over time, filter,
 * and see the answer and the SQL the API ran (a root account can also edit
 * and run the SQL). "Save as widget" puts the query on the board; editing a
 * report widget reopens it here.
 */
export default function CdrEditor({ open = true, scope = {}, editing = null, onSave, onClose, saving = false }) {
  const { isRoot } = useAuth();
  const catalog = useCdrCatalog();
  const [draft, setDraft] = useState(NEW_CDR_QUERY);
  const [filterLabels, setFilterLabels] = useState({});
  const [runKey, setRunKey] = useState(0);
  const [showSql, setShowSql] = useState(false);
  const [sqlText, setSqlText] = useState('');
  const [sqlResult, setSqlResult] = useState(null);
  useEffect(() => {
    if (!open) return;
    setDraft(editing ? { ...NEW_CDR_QUERY, ...editing, where: { ...(editing.where || {}) } } : NEW_CDR_QUERY);
    setShowSql(false);
    setSqlResult(null);
  }, [open, editing]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const result = useCdrReport(draft, { scope, runKey, enabled: open });
  const labels = { ...filterLabels, ...result.labels };

  const available = useMemo(() => new Set(catalog.measures.map((m) => m.key)), [catalog]);
  const toggleMeasure = (key) => set({ measures: draft.measures.includes(key) ? draft.measures.filter((m) => m !== key) : [...draft.measures, key] });
  const setDimension = (index, key) => {
    const dims = [...draft.dimensions];
    if (key) dims[index] = key; else dims.splice(index, 1);
    set({ dimensions: [...new Set(dims.filter(Boolean))] });
  };
  const addFilter = (dim, value, more = {}) => {
    const current = String(draft.where[dim] || '').split(',').filter(Boolean);
    if (!current.includes(String(value))) set({ where: { ...draft.where, [dim]: [...current, String(value)].join(',') } });
    setFilterLabels((l) => ({ ...l, ...Object.fromEntries(Object.entries(more).map(([k, v]) => [k, { ...(l[k] || {}), ...v }])) }));
  };
  const dropFilter = (dim) => { const where = { ...draft.where }; delete where[dim]; set({ where }); };
  // Drill into a group: filter to it and stop grouping by that field.
  const drill = (dim, value) => {
    if (value === undefined || value === null) return;
    setFilterLabels((l) => ({ ...l, ...Object.fromEntries(Object.entries(result.labels || {}).map(([k, v]) => [k, { ...(l[k] || {}), ...v }])) }));
    setDraft((d) => ({ ...d, where: { ...d.where, [dim]: String(value) }, dimensions: d.dimensions.filter((x) => x !== dim) }));
  };
  const runSql = async () => {
    setSqlResult({ loading: true });
    try {
      const res = await monitoringApi.runCdrSql(sqlText);
      setSqlResult({ rows: res?.rows || [], columns: res?.columns || [] });
    } catch (err) {
      setSqlResult({ error: err?.message || 'The query failed.' });
    }
  };
  const openSql = () => { setShowSql((v) => !v); if (!sqlText && result.sql) setSqlText(result.sql); };

  return (
    <Dialog fullScreen open={open} onClose={onClose} aria-labelledby="cdr-editor-title" PaperProps={{ 'data-testid': 'cdr-editor' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Typography id="cdr-editor-title" variant="subtitle1" sx={{ fontWeight: 750 }}>{editing ? `Edit “${editing.title}”` : 'Build a call report widget'}</Typography>
        <TextField select size="small" label="Time range" value={draft.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} sx={{ minWidth: 160 }}>
          {CDR_RANGES.map((r) => <MenuItem key={r.minutes} value={r.minutes}>{r.label}</MenuItem>)}
        </TextField>
        <Button variant="contained" size="small" startIcon={<PlayArrowIcon />} disabled={!cdrQueryReady(draft) || result.loading} onClick={() => setRunKey((k) => k + 1)}>Run</Button>
        {result.tookMs != null && !result.loading && <Typography variant="caption" color="text.secondary">{result.rows.length} rows · {result.tookMs} ms</Typography>}
        <Box sx={{ flex: 1 }} />
        <TextField size="small" label="Widget title" value={draft.title} onChange={(e) => set({ title: e.target.value })} sx={{ width: { xs: '100%', sm: 220 } }} />
        <Button size="small" onClick={onClose}>Cancel</Button>
        <Button size="small" variant="outlined" disabled={saving || !cdrQueryReady(draft) || !draft.title.trim()}
          onClick={() => onSave?.({ ...draft, type: 'cdr', title: draft.title.trim() })}>
          {editing ? 'Save widget' : 'Save as widget'}
        </Button>
        <IconButton size="small" aria-label="Close" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: 0, overflow: 'auto' }}>
        <Stack spacing={2} sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0, p: 2, borderRight: { md: '1px solid' }, borderColor: 'divider', overflow: 'auto' }}>
          <Box>
            <Typography variant="overline" color="text.secondary">Measures</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr' }} data-testid="cdr-measures">
              {FALLBACK_CATALOG.measures.filter((m) => available.has(m.key)).map((m) => (
                <FormControlLabel key={m.key} sx={{ m: 0 }} label={<Typography variant="body2">{m.label}</Typography>}
                  control={<Checkbox size="small" sx={{ py: 0.25 }} checked={draft.measures.includes(m.key)} onChange={() => toggleMeasure(m.key)} />} />
              ))}
            </Box>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Group by</Typography>
            <Stack spacing={1}>
              {[0, 1].map((i) => (i === 0 || draft.dimensions[0]) && (
                <TextField key={i} select size="small" label={i === 0 ? 'Group by' : 'Then by'} value={draft.dimensions[i] || ''} onChange={(e) => setDimension(i, e.target.value)}>
                  <MenuItem value=""><em>{i === 0 ? 'Nothing — totals' : 'Nothing'}</em></MenuItem>
                  {catalog.dimensions.filter((d) => d.key === draft.dimensions[i] || !draft.dimensions.includes(d.key)).map((d) => <MenuItem key={d.key} value={d.key}>{d.label}</MenuItem>)}
                </TextField>
              ))}
              <TextField select size="small" label="Over time" value={draft.bucket} onChange={(e) => set({ bucket: e.target.value })}>
                {Object.entries(BUCKET_LABELS).map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
              </TextField>
            </Stack>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Filters</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }} data-testid="cdr-filters">
              {Object.keys(draft.where).length === 0 && <Typography variant="caption" color="text.secondary">All calls</Typography>}
              {Object.entries(draft.where).map(([dim, value]) => (
                <Chip key={dim} size="small" onDelete={() => dropFilter(dim)}
                  label={`${dimensionLabel(catalog, dim)} = ${String(value).split(',').map((v) => dimensionText(dim, v, labels)).join(', ')}`} />
              ))}
            </Box>
            <FilterAdder catalog={catalog} scope={scope} minutes={draft.minutes} onAdd={addFilter} />
          </Box>
        </Stack>

        <Box sx={{ flex: 1, minWidth: 0, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <ToggleButtonGroup exclusive size="small" value={draft.view} onChange={(_, v) => v && set({ view: v })} aria-label="Visualization">
              {CDR_VIEWS.map((v) => <ToggleButton key={v} value={v} sx={{ textTransform: 'capitalize', px: 1.75 }}>{v}</ToggleButton>)}
            </ToggleButtonGroup>
            <Box sx={{ flex: 1 }} />
            <Button size="small" startIcon={<CodeIcon />} onClick={openSql} aria-expanded={showSql}>SQL</Button>
          </Stack>
          {!result.hasScope ? <Alert severity="info">Select a customer or application in the top bar.</Alert>
            : !cdrQueryReady(draft) ? <Alert severity="info">Tick at least one measure.</Alert>
            : (
              <Box sx={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
                <CdrResult result={result} query={draft} catalog={catalog} onDrill={drill} />
              </Box>
            )}
          <Collapse in={showSql} unmountOnExit>
            <Divider sx={{ mb: 1.5 }} />
            {isRoot ? (
              <Stack spacing={1}>
                <TextField multiline minRows={3} maxRows={12} fullWidth value={sqlText} onChange={(e) => setSqlText(e.target.value)}
                  inputProps={{ 'aria-label': 'SQL', style: { fontFamily: 'monospace', fontSize: 12 } }} />
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button size="small" variant="contained" onClick={runSql} disabled={!sqlText.trim() || sqlResult?.loading}>Run SQL</Button>
                  <Button size="small" onClick={() => setSqlText(result.sql || '')} disabled={!result.sql}>Use the builder&apos;s SQL</Button>
                  <Typography variant="caption" color="text.secondary">Root only · reads every tenant · SELECT only</Typography>
                </Stack>
                {sqlResult?.error && <Alert severity="error">{sqlResult.error}</Alert>}
                {sqlResult?.rows && <RawTable rows={sqlResult.rows} columns={sqlResult.columns} />}
              </Stack>
            ) : (
              <Box component="pre" data-testid="cdr-sql" sx={{ m: 0, p: 1.25, fontSize: 12, fontFamily: 'monospace', bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                {result.sql || 'Run a query to see its SQL.'}
              </Box>
            )}
          </Collapse>
        </Box>
      </Box>
    </Dialog>
  );
}
