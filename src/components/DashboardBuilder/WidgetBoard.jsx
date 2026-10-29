import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, ListItemText, Menu, MenuItem, Switch, TextField, Typography } from '@mui/material';
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import AddWidgetMenu from './AddWidgetMenu';
import WidgetEditor from '../Monitoring/Metrics/WidgetEditor';
import WidgetBuilder from '../Monitoring/Metrics/WidgetBuilder';
import BuilderWidget from './BuilderWidget';
import CdrEditor from './CdrEditor';
import LiveWidgetEditor from './LiveWidgetEditor';
import { displayTitle } from './widgetTemplates';
import { getWidgets, createWidget, updateWidget, deleteWidget, updateWidgetLayout, setDashboardStorageScope, seedWidgets } from '../../services/api/dashboardWidgetsApi';
import { monitoringApi } from '../../services/api/monitoringApi';
import { mapCdrCall } from '../Dashboard/useDashboardSnapshot';
import { GRID_COLS, ROW_HEIGHT, layoutFor, layoutChanges } from './widgetLayout';
import { useTranslation } from 'react-i18next';
import LtrIsland from '../../i18n/LtrIsland';
import { useTheme } from '@mui/material/styles';

// Reuses the dashboard's existing definitions, editor and card actions.
// Metric endpoints scope to the authenticated account; `environmentUuid`
// narrows every widget's query to one environment inside that scope.
// `callsScope` ({ customerUuid, environmentUuid, fleet }) is what the calls
// widgets follow; `seed` ({ key, widgets }) puts a starter set on the board
// once (seedWidgets). `heading` false drops the "Your widgets" intro when the
// board IS the page. "Build widget" opens a builder: a call report (CdrEditor,
// the CDR report for `callsScope`) or a metric from any InfluxDB measurement
// (WidgetBuilder); editing a widget reopens the builder that made it.
// `mode`: 'monitoring' (the default) is the operator's board — call reports
// from InfluxDB `cdr` and metrics from any InfluxDB measurement, with the
// builders. 'live' is the Live screen: ready-made widgets only (its sections
// from the cable, drawn by `renderLive`, and the live data's history from
// identities), no builder; editing names a widget and sets its range.
export default function WidgetBoard({ storageScope = 'admin-metrics', environmentUuid = '', callsScope = {}, seed = null, heading = true, mode = 'monitoring', renderLive }) {
  const live = mode === 'live';
  // Only the operator's board opens with the InfluxDB starter set.
  const starter = !live;
  const [liveEditing, setLiveEditing] = useState(null);
  const { t } = useTranslation('widgets');
  const pageDirection = useTheme().direction;
  const [widgets, setWidgets] = useState([]);
  const [draft, setDraft] = useState(null);
  // The query widget open in the builder: {} for a new one, the widget to edit.
  const [building, setBuilding] = useState(null);
  // The report builder: { type } for a new report, the 'cdr'/'identity' widget to edit.
  const [editingCdr, setEditingCdr] = useState(null);
  const [buildMenu, setBuildMenu] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [minutes, setMinutes] = useState(0);
  const [auto, setAuto] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [calls, setCalls] = useState([]);
  const [callsError, setCallsError] = useState(null);
  const { width, containerRef } = useContainerWidth();
  // One column on a phone; the grid clamps saved placements into it, and
  // nothing seen there is saved back. So a phone neither drags nor resizes:
  // a finger on a widget scrolls the page.
  const cols = width < 720 ? 1 : GRID_COLS;
  const arranging = cols === GRID_COLS;
  const layout = useMemo(() => layoutFor(widgets), [widgets]);
  const reload = async () => {
    setDashboardStorageScope(storageScope, { starter });
    setWidgets(await getWidgets());
  };
  const seedKey = seed?.key;
  useEffect(() => {
    let active = true;
    (async () => {
      setDashboardStorageScope(storageScope, { starter });
      if (seedKey) await seedWidgets(seedKey, seed.widgets);
      const rows = await getWidgets();
      if (active) setWidgets(rows);
    })();
    return () => { active = false; };
  // The seed is fixed per key, so only the key re-runs this.
  }, [storageScope, seedKey]);
  const hasTable = widgets.some((widget) => widget.type === 'table');
  useEffect(() => {
    if (!hasTable) return undefined;
    let active = true;
    const load = async () => {
      try {
        const result = await monitoringApi.getInfluxRows({ measurement: 'cdr', minutes: minutes || 1440, limit: 100, environmentUuid });
        if (active) { setCalls((result?.rows || []).map(mapCdrCall)); setCallsError(null); }
      } catch { if (active) { setCalls([]); setCallsError(t('board.callsError')); } }
    };
    load();
    const timer = auto ? setInterval(load, 30000) : null;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [hasTable, minutes, refreshKey, auto, environmentUuid]);
  const mutate = async (action) => {
    setSaving(true); setError(null);
    setDashboardStorageScope(storageScope, { starter });
    try { await action(); await reload(); setDraft(null); setBuilding(null); setEditingCdr(null); setLiveEditing(null); }
    catch (err) { setError(err.message || t('board.saveError')); }
    finally { setSaving(false); }
  };
  const persistLayout = (next) => {
    if (cols !== GRID_COLS) return;
    const changes = layoutChanges(widgets, next);
    if (!changes.length) return;
    setDashboardStorageScope(storageScope, { starter });
    changes.forEach((change) => { updateWidgetLayout(change.uuid, change.layout); });
    setWidgets((current) => current.map((widget) => {
      const change = changes.find((entry) => entry.uuid === widget.uuid);
      return change ? { ...widget, layout: change.layout } : widget;
    }));
  };
  const editWidget = (item) => {
    if (live) setLiveEditing(item);
    else if (item.type === 'query') setBuilding(item);
    else if (item.type === 'cdr' || item.type === 'identity') setEditingCdr(item);
    else setDraft(item);
  };
  // A report template goes straight onto the board; the builder tunes it later.
  const pickTemplate = (item) => (live || item.type === 'cdr' || item.type === 'identity' ? mutate(() => createWidget(item)) : setDraft(item));
  return <Box sx={{ mt: heading ? 3 : 0, width: '100%' }}>
    {heading && <>
      <Typography variant="h6">{t('board.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {environmentUuid ? t('board.scopeEnvironment') : t('board.scopeAccount')}
        {arranging && ` ${t('board.arrangeHint')}`}
      </Typography>
    </>}
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
      <AddWidgetMenu onPick={pickTemplate} disabled={saving} categories={live ? ['liveNow', 'identities'] : null} custom={!live} />
      {!live && <>
      <Button variant="outlined" size="small" onClick={(event) => setBuildMenu(event.currentTarget)} disabled={saving} data-testid="build-widget" sx={{ textTransform: 'none' }}>{t('board.build')}</Button>
      <Menu anchorEl={buildMenu} open={Boolean(buildMenu)} onClose={() => setBuildMenu(null)}>
        <MenuItem onClick={() => { setBuildMenu(null); setEditingCdr({ type: 'cdr' }); }}>
          <ListItemText primary={t('board.buildCallReport')} secondary={t('board.buildCallReportHint')} />
        </MenuItem>
        <MenuItem onClick={() => { setBuildMenu(null); setBuilding({}); }}>
          <ListItemText primary={t('board.buildMetric')} secondary={t('board.buildMetricHint')} />
        </MenuItem>
      </Menu>
      <TextField select size="small" label={t('board.timeRange')} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} sx={{ minWidth: 190, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
        <MenuItem value={0}>{t('board.eachWidget')}</MenuItem>
        <MenuItem value={60}>{t('board.lastHour')}</MenuItem>
        <MenuItem value={1440}>{t('board.last24Hours')}</MenuItem>
        <MenuItem value={10080}>{t('board.last7Days')}</MenuItem>
      </TextField>
      <FormControlLabel control={<Switch checked={auto} onChange={(_, checked) => setAuto(checked)} />} label={t('board.autoRefresh')} />
      <Button onClick={() => setRefreshKey((key) => key + 1)}>{t('board.refresh')}</Button>
      </>}
    </Box>
    {error && <Alert severity="error">{error}</Alert>}
    {callsError && <Alert severity="error">{callsError}</Alert>}
    {!widgets.length && <Alert severity="info">{t('board.empty')}</Alert>}
    {/* The grid places widgets by left offset and drags in screen pixels, so
        it is laid out left to right in every language; each widget's own
        content keeps the page direction. */}
    <LtrIsland ref={containerRef} data-testid="widget-grid">
      <ReactGridLayout
        width={width}
        layout={layout}
        gridConfig={{ cols, rowHeight: ROW_HEIGHT, margin: [16, 16], containerPadding: [0, 0] }}
        dragConfig={{ enabled: arranging, handle: '.widget-drag-handle' }}
        resizeConfig={{ enabled: arranging }}
        onLayoutChange={persistLayout}
      >
        {widgets.map((widget) => (
          <div key={widget.uuid} dir={pageDirection}>
            <BuilderWidget widget={widget} snapshot={{ recent_calls: calls }} saving={saving} callsScope={callsScope} renderLive={renderLive}
              queryOptions={{ minutes: minutes || undefined, refreshKey, refreshInterval: auto ? 30000 : 0, environmentUuid }}
              onEdit={editWidget} onDelete={(item) => mutate(() => deleteWidget(item.uuid))}
              onDuplicate={(item) => mutate(() => { const { uuid: _uuid, layout: _layout, ...copy } = item; return createWidget({ ...copy, title: t('board.copyTitle', { title: displayTitle(copy) }), customTitle: true }); })} />
          </div>
        ))}
      </ReactGridLayout>
    </LtrIsland>
    {/* Mounted only while open: the builder asks the API for its catalog, and
        a board that nobody is building on (Live) must not call the API. */}
    {live ? (
      <LiveWidgetEditor widget={liveEditing} saving={saving} onClose={() => setLiveEditing(null)}
        onSave={(item) => mutate(() => updateWidget(item.uuid, item))} />
    ) : <>
    {editingCdr && (
      <CdrEditor open source={editingCdr.type || 'cdr'} scope={callsScope} editing={editingCdr.uuid ? editingCdr : null} saving={saving}
        onClose={() => setEditingCdr(null)}
        onSave={(item) => mutate(() => (item.uuid ? updateWidget(item.uuid, item) : createWidget(item)))} />
    )}
    <WidgetBuilder open={Boolean(building)} widget={building?.uuid ? building : null} saving={saving} environmentUuid={environmentUuid}
      onClose={() => setBuilding(null)}
      onSave={(item) => mutate(() => (item.uuid ? updateWidget(item.uuid, item) : createWidget(item)))} />
    <WidgetEditor open={Boolean(draft)} widget={draft?.uuid ? draft : null} initialDraft={draft} saving={saving} onClose={() => setDraft(null)}
      onSave={(item) => mutate(() => item.uuid ? updateWidget(item.uuid, item) : createWidget(item))} />
    </>}
  </Box>;
}
