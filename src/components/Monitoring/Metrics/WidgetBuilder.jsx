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
import { monitoringApi } from '../../../services/api/monitoringApi';
import MetricResult from './MetricResult';
import { AGGREGATIONS, RANGES, VIEWS, queryReady } from './metricQuery';
import { useMetricQuery } from './useMetricQuery';
import { useTranslation } from 'react-i18next';

const NEW_QUERY = { title: '', type: 'query', measurement: '', field: '', aggregation: 'mean', minutes: 60, where: {}, splitBy: '', view: 'line', unit: '' };

function TagRow({ measurement, tag, active, splitActive, onSplit, onFilter }) {
  const { t } = useTranslation('widgets');
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(null);
  useEffect(() => {
    if (!open || values) return;
    monitoringApi.getInfluxTagValues({ measurement, tag }).then(setValues).catch(() => setValues([]));
  }, [open, values, measurement, tag]);
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ps: 3, pe: 1, py: 0.25 }}>
        <IconButton size="small" aria-label={t(open ? 'builder.hideValues' : 'builder.showValues', { tag })} onClick={() => setOpen((v) => !v)} disabled={!active}>
          {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{tag}</Typography>
        <Chip size="small" label={t('builder.tag')} variant="outlined" sx={{ height: 18, fontSize: 10 }} />
        <Tooltip title={t('builder.oneSeries', { tag })}>
          <span><Button size="small" disabled={!active} variant={splitActive ? 'contained' : 'text'} onClick={() => onSplit(splitActive ? '' : tag)} sx={{ minWidth: 0, px: 0.75, fontSize: 11 }}>{t('builder.split')}</Button></span>
        </Tooltip>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ ps: 7, pe: 1, pb: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {values === null ? <CircularProgress size={14} /> : values.length === 0
            ? <Typography variant="caption" color="text.secondary">{t('builder.noValues')}</Typography>
            : values.map((value) => (
              <Chip key={value} size="small" label={value} onClick={() => onFilter(tag, value)} aria-label={t('builder.filterValue', { tag, value })} />
            ))}
        </Box>
      </Collapse>
    </Box>
  );
}

function SchemaBrowser({ schema, loading, query, onPickField, onSplit, onFilter }) {
  const { t } = useTranslation('widgets');
  const [search, setSearch] = useState('');
  const [openName, setOpenName] = useState(query.measurement || '');
  const list = useMemo(() => (schema || []).filter((m) => m.measurement.toLowerCase().includes(search.toLowerCase())), [schema, search]);
  return (
    // On a phone the schema sits above the query, short enough to leave it in view.
    <Box sx={{ width: { xs: '100%', md: 320 }, maxHeight: { xs: '40vh', md: 'none' }, flexShrink: 0, borderInlineEnd: { md: '1px solid' }, borderBottom: { xs: '1px solid', md: 'none' }, borderColor: 'divider', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>{t('builder.schema')}</Typography>
        <TextField size="small" fullWidth placeholder={t('builder.searchMeasurements')} value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto' }} data-testid="schema-browser">
        {loading && <CircularProgress size={20} sx={{ m: 2 }} />}
        {!loading && !list.length && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{t('builder.noMeasurements')}</Typography>}
        {list.map((m) => {
          const open = openName === m.measurement;
          const active = query.measurement === m.measurement;
          return (
            <Box key={m.measurement} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
              <ListItemButton onClick={() => setOpenName(open ? '' : m.measurement)} selected={active} aria-label={t('builder.measurement', { name: m.measurement })}>
                <TableChartOutlinedIcon fontSize="small" sx={{ me: 1, color: 'text.secondary' }} />
                <ListItemText primary={m.measurement} primaryTypographyProps={{ fontWeight: 600, variant: 'body2' }} />
                {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </ListItemButton>
              <Collapse in={open} unmountOnExit>
                <List dense disablePadding>
                  {(m.fields || []).map((f) => {
                    const name = f.name || f;
                    const picked = active && query.field === name;
                    return (
                      <ListItemButton key={name} sx={{ ps: 4 }} selected={picked} onClick={() => onPickField(m.measurement, name)} aria-label={t('builder.field', { name: `${m.measurement}.${name}` })}>
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
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 4, pb: 1 }}>{t('builder.pickFieldHint')}</Typography>
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
  const { t } = useTranslation('widgets');
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
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography id="widget-builder-title" variant="h6" sx={{ fontWeight: 700 }}>{widget?.uuid ? t('builder.titleEdit') : t('builder.titleBuild')}</Typography>
        <TextField size="small" label={t('builder.title')} value={draft.title} onChange={(e) => set({ title: e.target.value })} sx={{ flex: { xs: '1 1 100%', sm: 1 }, maxWidth: { sm: 420 } }} />
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{t('builder.cancel')}</Button>
        <Button variant="contained" disabled={saving || !queryReady(draft) || !draft.title.trim()} onClick={() => onSave({ ...draft, type: 'query' })}>
          {widget?.uuid ? t('builder.saveWidget') : t('builder.saveAsWidget')}
        </Button>
        <IconButton aria-label={t('builder.close')} onClick={onClose}><CloseIcon /></IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, overflowY: { xs: 'auto', md: 'visible' } }}>
        <SchemaBrowser schema={schema} loading={schema === null} query={draft}
          onPickField={pickField} onSplit={(tag) => set({ splitBy: tag })} onFilter={addFilter} />

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', p: 2, gap: 1.5, minHeight: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip color={queryReady(draft) ? 'primary' : 'default'} label={queryReady(draft) ? `${draft.measurement} · ${draft.field}` : t('builder.pickField')} />
            <TextField select size="small" label={t('builder.aggregation')} value={draft.aggregation} onChange={(e) => set({ aggregation: e.target.value })} sx={{ minWidth: 130 }}>
              {AGGREGATIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('builder.timeRange')} value={draft.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} sx={{ minWidth: 170 }}>
              {RANGES.map((minutes) => <MenuItem key={minutes} value={minutes}>{t(`ranges.${minutes}`)}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('builder.splitBy')} value={draft.splitBy} onChange={(e) => set({ splitBy: e.target.value })} sx={{ minWidth: 150 }} disabled={!tags.length}>
              <MenuItem value=""><em>{t('builder.none')}</em></MenuItem>
              {tags.map((tag) => <MenuItem key={tag} value={tag}>{tag}</MenuItem>)}
            </TextField>
            <Box sx={{ flex: 1 }} />
            {result.tookMs != null && !result.loading && <Typography variant="caption" color="text.secondary">{t('builder.ms', { n: result.tookMs })}</Typography>}
            <Button variant="contained" startIcon={<PlayArrowIcon />} disabled={!queryReady(draft) || result.loading} onClick={() => setRunKey((k) => k + 1)}>{t('builder.run')}</Button>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }} data-testid="builder-filters">
            <Typography variant="caption" color="text.secondary">{t('builder.filters')}</Typography>
            {Object.keys(draft.where).length === 0 && <Typography variant="caption" color="text.secondary">{t('builder.noFilters')}</Typography>}
            {Object.entries(draft.where).map(([tag, value]) => (
              <Chip key={tag} size="small" label={`${tag} = ${value}`} onDelete={() => dropFilter(tag)} />
            ))}
          </Box>

          {result.influxql && (
            <Box component="pre" dir="ltr" data-testid="builder-influxql" sx={{ m: 0, p: 1, fontSize: 12, fontFamily: 'monospace', bgcolor: 'action.hover', borderRadius: 1, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
              {result.influxql}
            </Box>
          )}

          <Divider />
          <ToggleButtonGroup exclusive size="small" value={draft.view} onChange={(_, v) => v && set({ view: v })} aria-label={t('builder.visualization')}>
            {VIEWS.map((v) => <ToggleButton key={v} value={v} sx={{ textTransform: 'capitalize', px: 2 }}>{t(`views.${v}`)}</ToggleButton>)}
          </ToggleButtonGroup>
          {!queryReady(draft)
            ? <Alert severity="info">{t('builder.startHint')}</Alert>
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
