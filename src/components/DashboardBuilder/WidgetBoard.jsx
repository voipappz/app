import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@mui/material';
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import AddWidgetMenu from './AddWidgetMenu';
import WidgetEditor from './WidgetEditor';
import BuilderWidget from './BuilderWidget';
import { getWidgets, createWidget, updateWidget, deleteWidget, updateWidgetLayout, setDashboardStorageScope } from '../../services/api/dashboardWidgetsApi';
import { monitoringApi } from '../../services/api/monitoringApi';
import { mapCdrCall } from '../Dashboard/useDashboardSnapshot';
import { GRID_COLS, ROW_HEIGHT, layoutFor, layoutChanges } from './widgetLayout';

// Reuses the dashboard's existing definitions, editor and card actions.
// Metric endpoints scope to the authenticated account; `environmentUuid`
// narrows every widget's query to one environment inside that scope.
export default function WidgetBoard({ storageScope = 'admin-metrics', environmentUuid = '' }) {
  const [widgets, setWidgets] = useState([]);
  const [draft, setDraft] = useState(null);
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
  useEffect(() => {
    let active = true;
    setDashboardStorageScope(storageScope);
    getWidgets().then((rows) => { if (active) setWidgets(rows); });
    return () => { active = false; };
  }, [storageScope]);
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
    try { await action(); await reload(); setDraft(null); }
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
  return <Box sx={{ mt: 3 }}>
    <Typography variant="h6">Your widgets</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      {environmentUuid
        ? 'Metrics follow the environment shown above. Drag a widget by its title to move it, and its corner to resize; the layout is saved in this browser.'
        : 'Metrics cover your account’s accessible data. The customer/application picker above does not filter these widgets. Drag a widget by its title to move it, and its corner to resize; the layout is saved in this browser.'}
    </Typography>
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
      <AddWidgetMenu onPick={setDraft} disabled={saving} />
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
            <BuilderWidget widget={widget} snapshot={{ recent_calls: calls }} saving={saving}
              queryOptions={{ minutes: minutes || undefined, refreshKey, refreshInterval: auto ? 30000 : 0, environmentUuid }}
              onEdit={setDraft} onDelete={(item) => mutate(() => deleteWidget(item.uuid))}
              onDuplicate={(item) => mutate(() => { const { uuid: _uuid, layout: _layout, ...copy } = item; return createWidget({ ...copy, title: `${copy.title} copy` }); })} />
          </div>
        ))}
      </ReactGridLayout>
    </Box>
    <WidgetEditor open={Boolean(draft)} widget={draft?.uuid ? draft : null} initialDraft={draft} saving={saving} onClose={() => setDraft(null)}
      onSave={(item) => mutate(() => item.uuid ? updateWidget(item.uuid, item) : createWidget(item))} />
  </Box>;
}
