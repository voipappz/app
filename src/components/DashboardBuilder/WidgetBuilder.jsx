import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, Divider, IconButton, InputAdornment, List, ListItemButton,
  ListItemText, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { monitoringApi } from '../../services/api/monitoringApi';
import MetricResult from './MetricResult';
import { AGGREGATIONS, RANGES, VIEWS, queryReady } from './metricQuery';
import { useMetricQuery } from './useMetricQuery';

const NEW_QUERY = { title: '', type: 'query', measurement: '', field: '', aggregation: 'mean', minutes: 60, where: {}, splitBy: '', view: 'line', unit: '' };

function TagRow({ measurement, tag, active, splitActive, onSplit, onFilter }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(null);
  useEffect(() => {
    if (!open || values) return;
    monitoringApi.getInfluxTagValues({ measurement, tag }).then(setValues).catch(() => setValues([]));
  }, [open, values, measurement, tag]);
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 3, pr: 1, py: 0.25 }}>
        <IconButton size="small" aria-label={`${open ? 'Hide' : 'Show'} values of ${tag}`} onClick={() => setOpen((v) => !v)} disabled={!active}>
          {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{tag}</Typography>
        <Chip size="small" label="tag" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
        <Tooltip title={`One series per ${tag}`}>
          <span><Button size="small" disabled={!active} variant={splitActive ? 'contained' : 'text'} onClick={() => onSplit(splitActive ? '' : tag)} sx={{ minWidth: 0, px: 0.75, fontSize: 11 }}>Split</Button></span>
        </Tooltip>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pl: 7, pr: 1, pb: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {values === null ? <CircularProgress size={14} /> : values.length === 0
            ? <Typography variant="caption" color="text.secondary">No values in the last 7 days</Typography>
            : values.map((value) => (
              <Chip key={value} size="small" label={value} onClick={() => onFilter(tag, value)} aria-label={`Filter ${tag} = ${value}`} />
            ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function SchemaBrowser({ schema, loading, query, onPickField, onSplit, onFilter }) {
  const [search, setSearch] = useState('');
  const [openName, setOpenName] = useState(query.measurement || '');
  const list = useMemo(() => (schema || []).filter((m) => m.measurement.toLowerCase().includes(search.toLowerCase())), [schema, search]);
  return (
    <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0, borderRight: { md: '1px solid' }, borderColor: 'divider', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Schema</Typography>
        <TextField size="small" fullWidth placeholder="Search measurements…" value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto' }} data-testid="schema-browser">
        {loading && <CircularProgress size={20} sx={{ m: 2 }} />}
        {!loading && !list.length && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No measurements.</Typography>}
        {list.map((m) => {
          const open = openName === m.measurement;
          const active = query.measurement === m.measurement;
          return (
            <Box key={m.measurement} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
              <ListItemButton onClick={() => setOpenName(open ? '' : m.measurement)} selected={active} aria-label={`Measurement ${m.measurement}`}>
                <TableChartOutlinedIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                <ListItemText primary={m.measurement} primaryTypographyProps={{ fontWeight: 600, variant: 'body2' }} />
                {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </ListItemButton>
              <Collapse in={open} unmountOnExit>
                <List dense disablePadding>
                  {(m.fields || []).map((f) => {
                    const name = f.name || f;
                    const picked = active && query.field === name;
                    return (
                      <ListItemButton key={name} sx={{ pl: 4 }} selected={picked} onClick={() => onPickField(m.measurement, name)} aria-label={`Field ${m.measurement}.${name}`}>
                        <ListItemText primary={name} secondary={f.type} primaryTypographyProps={{ variant: 'body2' }} secondaryTypographyProps={{ variant: 'caption' }} />
                      </ListItemButton>
                    );
                  })}
                </List>
                {(m.tags || []).map((tag) => (
                  <TagRow key={tag} measurement={m.measurement} tag={tag} active={active}
                    splitActive={active && query.splitBy === tag} onSplit={onSplit} onFilter={onFilter} />
                ))}
                {!active && (m.tags || []).length > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 4, pb: 1 }}>Pick a field to filter or split by its tags.</Typography>
                )}
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * Build a widget from a metric query, the way InfluxDB 3 Explorer's Data
 * Explorer builds one: schema on the left, the query and its preview on the
 * right. Every run goes through voipappz-api (tenant-scoped); nothing here
 * talks to InfluxDB. Saves a 'query' widget.
 */
export default function WidgetBuilder({ open, widget, onClose, onSave, saving, environmentUuid = '' }) {
  const [draft, setDraft] = useState(NEW_QUERY);
  const [schema, setSchema] = useState(null);
  const [runKey, setRunKey] = useState(0);
  useEffect(() => {
    if (!open) return;
    setDraft({ ...NEW_QUERY, ...(widget || {}), where: { ...(widget?.where || {}) } });
    if (!schema) monitoringApi.getInfluxSchema().then((s) => setSchema(Array.isArray(s) ? s : [])).catch(() => setSchema([]));
  }, [open, widget, schema]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const result = useMetricQuery(draft, { runKey, environmentUuid, enabled: open });
  const tags = (schema || []).find((m) => m.measurement === draft.measurement)?.tags || [];

  const pickField = (measurement, field) => set({
    measurement, field,
    // A new measurement's tags differ: drop filters and split that no longer apply.
    ...(measurement !== draft.measurement ? { where: {}, splitBy: '' } : {}),
    title: draft.title || `${measurement} · ${field}`,
  });
  const addFilter = (tag, value) => set({ where: { ...draft.where, [tag]: value } });
  const dropFilter = (tag) => { const where = { ...draft.where }; delete where[tag]; set({ where }); };

  return (
    <Dialog fullScreen open={open} onClose={onClose} aria-labelledby="widget-builder-title" PaperProps={{ 'data-testid': 'widget-builder' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography id="widget-builder-title" variant="h6" sx={{ fontWeight: 700 }}>{widget?.uuid ? 'Edit widget' : 'Build widget'}</Typography>
        <TextField size="small" label="Title" value={draft.title} onChange={(e) => set({ title: e.target.value })} sx={{ flex: 1, maxWidth: 420 }} />
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={saving || !queryReady(draft) || !draft.title.trim()} onClick={() => onSave({ ...draft, type: 'query' })}>
          {widget?.uuid ? 'Save widget' : 'Save as widget'}
        </Button>
        <IconButton aria-label="Close builder" onClick={onClose}><CloseIcon /></IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
        <SchemaBrowser schema={schema} loading={schema === null} query={draft}
          onPickField={pickField} onSplit={(tag) => set({ splitBy: tag })} onFilter={addFilter} />

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', p: 2, gap: 1.5, minHeight: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip color={queryReady(draft) ? 'primary' : 'default'} label={queryReady(draft) ? `${draft.measurement} · ${draft.field}` : 'Pick a field from the schema'} />
            <TextField select size="small" label="Aggregation" value={draft.aggregation} onChange={(e) => set({ aggregation: e.target.value })} sx={{ minWidth: 130 }}>
              {AGGREGATIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Time range" value={draft.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} sx={{ minWidth: 170 }}>
              {RANGES.map((r) => <MenuItem key={r.minutes} value={r.minutes}>{r.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Split by" value={draft.splitBy} onChange={(e) => set({ splitBy: e.target.value })} sx={{ minWidth: 150 }} disabled={!tags.length}>
              <MenuItem value=""><em>None</em></MenuItem>
              {tags.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
            <Box sx={{ flex: 1 }} />
            {result.tookMs != null && !result.loading && <Typography variant="caption" color="text.secondary">{result.tookMs} ms</Typography>}
            <Button variant="contained" startIcon={<PlayArrowIcon />} disabled={!queryReady(draft) || result.loading} onClick={() => setRunKey((k) => k + 1)}>Run</Button>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }} data-testid="builder-filters">
            <Typography variant="caption" color="text.secondary">Filters:</Typography>
            {Object.keys(draft.where).length === 0 && <Typography variant="caption" color="text.secondary">none — open a tag in the schema and pick a value</Typography>}
            {Object.entries(draft.where).map(([tag, value]) => (
              <Chip key={tag} size="small" label={`${tag} = ${value}`} onDelete={() => dropFilter(tag)} />
            ))}
          </Box>

          {result.influxql && (
            <Box component="pre" data-testid="builder-influxql" sx={{ m: 0, p: 1, fontSize: 12, fontFamily: 'monospace', bgcolor: 'action.hover', borderRadius: 1, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
              {result.influxql}
            </Box>
          )}

          <Divider />
          <ToggleButtonGroup exclusive size="small" value={draft.view} onChange={(_, v) => v && set({ view: v })} aria-label="Visualization">
            {VIEWS.map((v) => <ToggleButton key={v} value={v} sx={{ textTransform: 'capitalize', px: 2 }}>{v}</ToggleButton>)}
          </ToggleButtonGroup>
          {!queryReady(draft)
            ? <Alert severity="info">Open a measurement on the left and pick a field to start.</Alert>
            : (
              <Box sx={{ flex: 1, minHeight: 240, display: 'flex', flexDirection: 'column', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <MetricResult rows={result.rows} view={draft.view} splitBy={draft.splitBy} aggregation={draft.aggregation} loading={result.loading} error={result.error} unit={draft.unit} />
              </Box>
            )}
        </Box>
      </Box>
    </Dialog>
  );
}
