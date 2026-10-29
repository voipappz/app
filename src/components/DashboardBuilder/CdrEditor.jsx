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
import { config } from '../../config';
import { monitoringApi } from '../../services/api/monitoringApi';
import CdrResult from './CdrResult';
import { useCdrReport } from './useCdrReport';
import { reportSource } from './reportSources';
import { useTranslation } from 'react-i18next';
import {
  BUCKETS, CDR_RANGES, CDR_VIEWS, FALLBACK_CATALOG, cdrQueryReady, hasScope, dimensionLabel, dimensionText, measureOf, scopeParams,
} from './cdrReport';

// Per API server and scope (picking an environment can switch servers), and
// only as long as the API keeps its own discovery (5 minutes), so a counter a
// deployment starts publishing shows up without a reload.
const catalogCache = {};
const CATALOG_TTL_MS = 5 * 60 * 1000;
const cachedCatalog = (key) => {
  const hit = catalogCache[key];
  return hit && Date.now() - hit.at < CATALOG_TTL_MS ? hit.catalog : null;
};

// What a source can answer (cdr: this deployment's cdr table; identity: the
// fixed list plus the keys the API discovered in this scope); its fallback
// list until the API says.
export function useCdrCatalog(type = 'cdr', scope = {}) {
  const source = reportSource(type);
  const scopeKey = JSON.stringify(source.type === 'identity' ? scopeParams(scope) : {});
  const cacheKey = `${config.apiBaseUrl}|${source.type}:${scopeKey}`;
  const [catalog, setCatalog] = useState(() => cachedCatalog(cacheKey) || source.fallback);
  useEffect(() => {
    // No environments is no scope, never "every environment".
    if (source.type === 'identity' && !hasScope(scope)) return undefined;
    const hit = cachedCatalog(cacheKey);
    if (hit) { setCatalog(hit); return undefined; }
    let active = true;
    source.catalog(JSON.parse(scopeKey)).then((c) => {
      if (c?.dimensions?.length) {
        const next = { ...c, source: source.type };
        catalogCache[cacheKey] = { at: Date.now(), catalog: next };
        if (active) setCatalog(next);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [cacheKey]);
  return catalog;
}

// Filter by one dimension: pick it, then a value — suggested from the busiest
// values in the current scope, or typed.
function FilterAdder({ catalog, scope, minutes, onAdd, source }) {
  const { t } = useTranslation('widgets');
  const [dim, setDim] = useState('');
  const [value, setValue] = useState('');
  const [options, setOptions] = useState([]);
  const [labels, setLabels] = useState({});
  const scopeKey = JSON.stringify(scopeParams(scope));
  useEffect(() => {
    if (!dim) { setOptions([]); return undefined; }
    let active = true;
    source.run({ measures: [source.newQuery.measures[0]], dimensions: [dim], minutes, limit: 50, ...JSON.parse(scopeKey) })
      .then((res) => { if (active) { setOptions((res?.rows || []).map((row) => String(row[dim]))); setLabels(res?.labels || {}); } })
      .catch(() => { if (active) setOptions([]); });
    return () => { active = false; };
  }, [dim, minutes, scopeKey, source]);
  const add = () => { if (dim && value.trim()) { onAdd(dim, value.trim(), labels); setValue(''); } };
  return (
    <Stack spacing={1}>
      <TextField select size="small" label={t('cdr.filterBy')} value={dim} onChange={(e) => { setDim(e.target.value); setValue(''); }}>
        <MenuItem value=""><em>{t('cdr.chooseField')}</em></MenuItem>
        {catalog.dimensions.map((d) => <MenuItem key={d.key} value={d.key}>{dimensionLabel(catalog, d.key)}</MenuItem>)}
      </TextField>
      {dim && (
        <Stack direction="row" spacing={1}>
          <Autocomplete freeSolo size="small" options={options} sx={{ flex: 1 }} inputValue={value}
            onInputChange={(_, v) => setValue(v)} getOptionLabel={(o) => dimensionText(dim, o, labels)}
            renderInput={(params) => <TextField {...params} label={t('cdr.value')} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />} />
          <Button size="small" variant="outlined" onClick={add} aria-label={t('cdr.addFilter')} sx={{ minWidth: 0 }}><AddIcon fontSize="small" /></Button>
        </Stack>
      )}
    </Stack>
  );
}

function RawTable({ rows, columns }) {
  const { t } = useTranslation('widgets');
  if (!rows.length) return <Typography variant="body2" color="text.secondary">{t('cdr.noRows')}</Typography>;
  return (
    <Box sx={{ overflow: 'auto', maxHeight: 360 }} data-testid="sql-result">
      <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: 12, '& th, & td': { px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap', textAlign: 'start' } }}>
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
export default function CdrEditor({ open = true, scope = {}, editing = null, onSave, onClose, saving = false, source: sourceName = 'cdr' }) {
  const { t } = useTranslation('widgets');
  const { isRoot } = useAuth();
  const source = reportSource(sourceName);
  const fresh = source.newQuery;
  const words = source.type === 'identity' ? 'identity' : 'cdr';
  const catalog = useCdrCatalog(source.type, scope);
  const [draft, setDraft] = useState(fresh);
  const [filterLabels, setFilterLabels] = useState({});
  const [runKey, setRunKey] = useState(0);
  const [showSql, setShowSql] = useState(false);
  const [sqlText, setSqlText] = useState('');
  const [sqlResult, setSqlResult] = useState(null);
  useEffect(() => {
    if (!open) return;
    setDraft(editing ? { ...fresh, ...editing, where: { ...(editing.where || {}) } } : fresh);
    setShowSql(false);
    setSqlResult(null);
  }, [open, editing, fresh]);
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
      setSqlResult({ error: err?.message || t('cdr.queryFailed') });
    }
  };
  const openSql = () => { setShowSql((v) => !v); if (!sqlText && result.sql) setSqlText(result.sql); };

  return (
    <Dialog fullScreen open={open} onClose={onClose} aria-labelledby="cdr-editor-title" PaperProps={{ 'data-testid': 'cdr-editor' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Typography id="cdr-editor-title" variant="subtitle1" sx={{ fontWeight: 750 }}>{editing ? t('cdr.titleEdit', { title: editing.title }) : t(`${words}.titleBuild`)}</Typography>
        <TextField select size="small" label={t('cdr.timeRange')} value={draft.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} sx={{ minWidth: 160 }}>
          {CDR_RANGES.map((minutes) => <MenuItem key={minutes} value={minutes}>{t(`ranges.${minutes}`)}</MenuItem>)}
        </TextField>
        <Button variant="contained" size="small" startIcon={<PlayArrowIcon />} disabled={!cdrQueryReady(draft) || result.loading} onClick={() => setRunKey((k) => k + 1)}>{t('cdr.run')}</Button>
        {result.tookMs != null && !result.loading && <Typography variant="caption" color="text.secondary">{t('cdr.rowsTook', { n: result.rows.length, ms: result.tookMs })}</Typography>}
        <Box sx={{ flex: 1 }} />
        <TextField size="small" label={t('cdr.widgetTitle')} value={draft.title} onChange={(e) => set({ title: e.target.value })} sx={{ width: { xs: '100%', sm: 220 } }} />
        <Button size="small" onClick={onClose}>{t('cdr.cancel')}</Button>
        <Button size="small" variant="outlined" disabled={saving || !cdrQueryReady(draft) || !draft.title.trim()}
          onClick={() => onSave?.({ ...draft, type: source.type, title: draft.title.trim() })}>
          {editing ? t('cdr.saveWidget') : t('cdr.saveAsWidget')}
        </Button>
        <IconButton size="small" aria-label={t('cdr.close')} onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: 0, overflow: 'auto' }}>
        <Stack spacing={2} sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0, p: 2, borderInlineEnd: { md: '1px solid' }, borderColor: 'divider', overflow: 'auto' }}>
          <Box>
            <Typography variant="overline" color="text.secondary">{t('cdr.measures')}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr' }} data-testid="cdr-measures">
              {(source.type === 'cdr' ? FALLBACK_CATALOG.measures.filter((m) => available.has(m.key)) : catalog.measures).map((m) => (
                <FormControlLabel key={m.key} sx={{ m: 0 }} label={<Typography variant="body2">{measureOf(catalog, m.key).label}</Typography>}
                  control={<Checkbox size="small" sx={{ py: 0.25 }} checked={draft.measures.includes(m.key)} onChange={() => toggleMeasure(m.key)} />} />
              ))}
            </Box>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">{t('cdr.groupBy')}</Typography>
            <Stack spacing={1}>
              {[0, 1].map((i) => (i === 0 || draft.dimensions[0]) && (
                <TextField key={i} select size="small" label={i === 0 ? t('cdr.groupBy') : t('cdr.thenBy')} value={draft.dimensions[i] || ''} onChange={(e) => setDimension(i, e.target.value)}>
                  <MenuItem value=""><em>{i === 0 ? t('cdr.totals') : t('cdr.nothing')}</em></MenuItem>
                  {catalog.dimensions.filter((d) => d.key === draft.dimensions[i] || !draft.dimensions.includes(d.key)).map((d) => <MenuItem key={d.key} value={d.key}>{dimensionLabel(catalog, d.key)}</MenuItem>)}
                </TextField>
              ))}
              <TextField select size="small" label={t('cdr.overTime')} value={draft.bucket} onChange={(e) => set({ bucket: e.target.value })}>
                {BUCKETS.map((bucket) => <MenuItem key={bucket} value={bucket}>{t(`bucket.${bucket || 'none'}`)}</MenuItem>)}
              </TextField>
            </Stack>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">{t('cdr.filters')}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }} data-testid="cdr-filters">
              {Object.keys(draft.where).length === 0 && <Typography variant="caption" color="text.secondary">{t(words === 'identity' ? 'identity.all' : 'cdr.allCalls')}</Typography>}
              {Object.entries(draft.where).map(([dim, value]) => (
                <Chip key={dim} size="small" onDelete={() => dropFilter(dim)}
                  label={t('cdr.filterChip', { field: dimensionLabel(catalog, dim), values: String(value).split(',').map((v) => dimensionText(dim, v, labels)).join(', ') })} />
              ))}
            </Box>
            <FilterAdder catalog={catalog} scope={scope} minutes={draft.minutes} onAdd={addFilter} source={source} />
          </Box>
        </Stack>

        <Box sx={{ flex: 1, minWidth: 0, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <ToggleButtonGroup exclusive size="small" value={draft.view} onChange={(_, v) => v && set({ view: v })} aria-label={t('cdr.visualization')}>
              {CDR_VIEWS.map((v) => <ToggleButton key={v} value={v} sx={{ textTransform: 'capitalize', px: 1.75 }}>{t(`views.${v}`)}</ToggleButton>)}
            </ToggleButtonGroup>
            <Box sx={{ flex: 1 }} />
            <Button size="small" startIcon={<CodeIcon />} onClick={openSql} aria-expanded={showSql}>{t('cdr.sql')}</Button>
          </Stack>
          {!result.hasScope ? <Alert severity="info">{t('widget.noScope')}</Alert>
            : !cdrQueryReady(draft) ? <Alert severity="info">{t('cdr.tickMeasure')}</Alert>
            : (
              <Box sx={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
                <CdrResult result={result} query={draft} catalog={catalog} onDrill={drill} />
              </Box>
            )}
          <Collapse in={showSql} unmountOnExit>
            <Divider sx={{ mb: 1.5 }} />
            {isRoot && source.sql ? (
              <Stack spacing={1}>
                <TextField multiline minRows={3} maxRows={12} fullWidth value={sqlText} onChange={(e) => setSqlText(e.target.value)}
                  inputProps={{ 'aria-label': t('cdr.sql'), dir: 'ltr', style: { fontFamily: 'monospace', fontSize: 12 } }} />
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button size="small" variant="contained" onClick={runSql} disabled={!sqlText.trim() || sqlResult?.loading}>{t('cdr.runSql')}</Button>
                  <Button size="small" onClick={() => setSqlText(result.sql || '')} disabled={!result.sql}>{t('cdr.useBuilderSql')}</Button>
                  <Typography variant="caption" color="text.secondary">{t('cdr.rootOnly')}</Typography>
                </Stack>
                {sqlResult?.error && <Alert severity="error">{sqlResult.error}</Alert>}
                {sqlResult?.rows && <RawTable rows={sqlResult.rows} columns={sqlResult.columns} />}
              </Stack>
            ) : (
              <Box component="pre" dir="ltr" data-testid="cdr-sql" sx={{ m: 0, p: 1.25, fontSize: 12, fontFamily: 'monospace', bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                {result.sql || t('cdr.noSqlYet')}
              </Box>
            )}
          </Collapse>
        </Box>
      </Box>
    </Dialog>
  );
}
