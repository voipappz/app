import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, ListItemText, Menu, MenuItem, Switch, TextField, Typography } from '@mui/material';
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import AddWidgetMenu from './AddWidgetMenu';
import WidgetEditor from './WidgetEditor';
import WidgetBuilder from './WidgetBuilder';
import BuilderWidget from './BuilderWidget';
import CdrEditor from './CdrEditor';
import { getWidgets, createWidget, updateWidget, deleteWidget, updateWidgetLayout, setDashboardStorageScope, seedWidgets } from '../../services/api/dashboardWidgetsApi';
import { monitoringApi } from '../../services/api/monitoringApi';
import { mapCdrCall } from '../Dashboard/useDashboardSnapshot';
import { GRID_COLS, ROW_HEIGHT, layoutFor, layoutChanges } from './widgetLayout';

// Reuses the dashboard's existing definitions, editor and card actions.
// Metric endpoints scope to the authenticated account; `environmentUuid`
// narrows every widget's query to one environment inside that scope.
// `callsScope` ({ customerUuid, environmentUuid, fleet }) is what the calls
// widgets follow; `seed` ({ key, widgets }) puts a starter set on the board
// once (seedWidgets). `heading` false drops the "Your widgets" intro when the
// board IS the page. "Build widget" opens a builder: a call report (CdrEditor,
// the CDR report for `callsScope`) or a metric from any InfluxDB measurement
// (WidgetBuilder); editing a widget reopens the builder that made it.
export default function WidgetBoard({ storageScope = 'admin-metrics', environmentUuid = '', callsScope = {}, seed = null, heading = true }) {
  const [widgets, setWidgets] = useState([]);
  const [draft, setDraft] = useState(null);
  // The query widget open in the builder: {} for a new one, the widget to edit.
  const [building, setBuilding] = useState(null);
  // The call-report builder: {} for a new report, the 'cdr' widget to edit.
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
  // nothing seen there is saved back.
  const cols = width < 720 ? 1 : GRID_COLS;
  const layout = useMemo(() => layoutFor(widgets), [widgets]);
  const reload = async () => {
    setDashboardStorageScope(storageScope);
    setWidgets(await getWidgets());
  };
  const seedKey = seed?.key;
  useEffect(() => {
    let active = true;
    (async () => {
      setDashboardStorageScope(storageScope);
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
      } catch { if (active) { setCalls([]); setCallsError('Could not load call records. Try refreshing.'); } }
    };
    load();
    const timer = auto ? setInterval(load, 30000) : null;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [hasTable, minutes, refreshKey, auto, environmentUuid]);
  const mutate = async (action) => {
    setSaving(true); setError(null);
    setDashboardStorageScope(storageScope);
    try { await action(); await reload(); setDraft(null); setBuilding(null); setEditingCdr(null); }
    catch (err) { setError(err.message || 'Could not save widgets'); }
    finally { setSaving(false); }
  };
  const persistLayout = (next) => {
    if (cols !== GRID_COLS) return;
    const changes = layoutChanges(widgets, next);
    if (!changes.length) return;
    setDashboardStorageScope(storageScope);
    changes.forEach((change) => { updateWidgetLayout(change.uuid, change.layout); });
    setWidgets((current) => current.map((widget) => {
      const change = changes.find((entry) => entry.uuid === widget.uuid);
      return change ? { ...widget, layout: change.layout } : widget;
    }));
  };
  const editWidget = (item) => {
    if (item.type === 'query') setBuilding(item);
    else if (item.type === 'cdr') setEditingCdr(item);
    else setDraft(item);
  };
  // A report template goes straight onto the board; the builder tunes it later.
  const pickTemplate = (item) => (item.type === 'cdr' ? mutate(() => createWidget(item)) : setDraft(item));
  return <Box sx={{ mt: heading ? 3 : 0, width: '100%' }}>
    {heading && <>
      <Typography variant="h6">Your widgets</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {environmentUuid
          ? 'Metrics follow the environment shown above. Drag a widget by its title to move it, and its corner to resize; the layout is saved in this browser.'
          : 'Metrics cover your account’s accessible data. The customer/application picker above does not filter these widgets. Drag a widget by its title to move it, and its corner to resize; the layout is saved in this browser.'}
      </Typography>
    </>}
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
      <AddWidgetMenu onPick={pickTemplate} disabled={saving} />
      <Button variant="outlined" size="small" onClick={(event) => setBuildMenu(event.currentTarget)} disabled={saving} data-testid="build-widget" sx={{ textTransform: 'none' }}>Build widget</Button>
      <Menu anchorEl={buildMenu} open={Boolean(buildMenu)} onClose={() => setBuildMenu(null)}>
        <MenuItem onClick={() => { setBuildMenu(null); setEditingCdr({}); }}>
          <ListItemText primary="Call report" secondary="Calls, answer rate, billed time… by environment, caller, status" />
        </MenuItem>
        <MenuItem onClick={() => { setBuildMenu(null); setBuilding({}); }}>
          <ListItemText primary="Metric" secondary="Any InfluxDB measurement, with filters and a split" />
        </MenuItem>
      </Menu>
      <TextField select size="small" label="Widget time range" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} sx={{ minWidth: 190 }}>
        <MenuItem value={0}>Each widget’s time range</MenuItem><MenuItem value={60}>Last hour</MenuItem><MenuItem value={1440}>Last 24 hours</MenuItem><MenuItem value={10080}>Last 7 days</MenuItem>
      </TextField>
      <FormControlLabel control={<Switch checked={auto} onChange={(_, checked) => setAuto(checked)} />} label="Refresh every 30 seconds" />
      <Button onClick={() => setRefreshKey((key) => key + 1)}>Refresh widgets</Button>
    </Box>
    {error && <Alert severity="error">{error}</Alert>}
    {callsError && <Alert severity="error">{callsError}</Alert>}
    {!widgets.length && <Alert severity="info">Add a widget to start your dashboard.</Alert>}
    <Box ref={containerRef} data-testid="widget-grid">
      <ReactGridLayout
        width={width}
        layout={layout}
        gridConfig={{ cols, rowHeight: ROW_HEIGHT, margin: [16, 16], containerPadding: [0, 0] }}
        dragConfig={{ enabled: true, handle: '.widget-drag-handle' }}
        resizeConfig={{ enabled: true }}
        onLayoutChange={persistLayout}
      >
        {widgets.map((widget) => (
          <div key={widget.uuid}>
            <BuilderWidget widget={widget} snapshot={{ recent_calls: calls }} saving={saving} callsScope={callsScope}
              queryOptions={{ minutes: minutes || undefined, refreshKey, refreshInterval: auto ? 30000 : 0, environmentUuid }}
              onEdit={editWidget} onDelete={(item) => mutate(() => deleteWidget(item.uuid))}
              onDuplicate={(item) => mutate(() => { const { uuid: _uuid, layout: _layout, ...copy } = item; return createWidget({ ...copy, title: `${copy.title} copy` }); })} />
          </div>
        ))}
      </ReactGridLayout>
    </Box>
    <CdrEditor open={Boolean(editingCdr)} scope={callsScope} editing={editingCdr?.uuid ? editingCdr : null} saving={saving}
      onClose={() => setEditingCdr(null)}
      onSave={(item) => mutate(() => (item.uuid ? updateWidget(item.uuid, item) : createWidget(item)))} />
    <WidgetBuilder open={Boolean(building)} widget={building?.uuid ? building : null} saving={saving} environmentUuid={environmentUuid}
      onClose={() => setBuilding(null)}
      onSave={(item) => mutate(() => (item.uuid ? updateWidget(item.uuid, item) : createWidget(item)))} />
    <WidgetEditor open={Boolean(draft)} widget={draft?.uuid ? draft : null} initialDraft={draft} saving={saving} onClose={() => setDraft(null)}
      onSave={(item) => mutate(() => item.uuid ? updateWidget(item.uuid, item) : createWidget(item))} />
  </Box>;
}
