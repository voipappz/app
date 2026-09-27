import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import MetricChart from '../DashboardBuilder/MetricChart';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import PageHeader from '../common/PageHeader.jsx';
import StatCard from '../common/StatCard.jsx';
import StatusChip from '../common/StatusChip.jsx';
import CallsPerHourChart from '../common/CallsPerHourChart.jsx';
import AddWidgetMenu from '../DashboardBuilder/AddWidgetMenu.jsx';
import WidgetEditor from '../DashboardBuilder/WidgetEditor.jsx';
import BuilderWidget from '../DashboardBuilder/BuilderWidget.jsx';
import { useWidgetValue } from '../DashboardBuilder/useWidgetValue.js';
import { formatWidgetValue, resolveIcon, thresholdColor } from '../DashboardBuilder/widgetPresentation.js';
import {
  getWidgets, createWidget, updateWidget, deleteWidget, moveWidget, sectionOf, setDashboardStorageScope
} from '../../services/api/dashboardWidgetsApi.js';
import { useDashboardSnapshot } from './useDashboardSnapshot.js';
import { useUserAuth } from '../../context/UserAuthContext.jsx';
import { useAuth } from '../../context/AuthContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { hasPermission, canAccessScreen } from '../../utils/jwt.js';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtTime(value) {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(value)) ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const CALL_COLUMNS = {
  started_at: { key: 'Time', cell: (c) => fmtTime(c.started_at) },
  direction: { key: 'Direction', cell: (c) => c.direction },
  from_number: { key: 'From', cell: (c) => c.from_number || '—' },
  to_number: { key: 'To', cell: (c) => c.to_number || '—' },
  status: { key: 'Status', cell: (c) => <StatusChip status={c.status} variant="outlined" /> },
  duration_sec: { key: 'Duration', align: 'right', cell: (c) => fmtDuration(c.duration_sec) }
};
const DEFAULT_CALL_FIELDS = Object.keys(CALL_COLUMNS);

// "Calls in progress" — from `live_state`, the series CollectIdentities
// samples once a minute, like everything else on this screen. There used to
// be a second flavour reading /api/calls?action=live for admin sessions; the
// screen is the portal's alone now and has one data path.
const CALLS_IN_PROGRESS_TILE = {
  title: 'Calls in progress',
  type: 'counter',
  measurement: 'live_state',
  field: 'calls_total',
  aggregation: 'last',
  minutes: 15,
  icon: 'Call',
  color: 'success.main',
  unit: 'calls'
};

// Custom tile/chart widgets are self-sufficient InfluxDB queries
// ({measurement, field, aggregation}) — same model BuilderWidget.jsx uses
// inside the builder dialog. Reading their value from the dashboard-level
// `stats` (total/inbound/outbound only) would silently show 0 for any
// widget pointed at a different field, so each widget queries itself here too.
function DashboardStatTile({ widget }) {
  const { value, error, loading } = useWidgetValue(widget);
  // Never show a confident 0 for a number we failed to fetch — deployments
  // differ (older APIs 404/500 on the monitoring and live endpoints), and a
  // fabricated zero reads as "no calls" rather than "couldn't ask".
  const display = error ? '—' : (loading && value === null ? '…' : formatWidgetValue(widget, value));
  return (
    <StatCard
      label={widget.title}
      value={display}
      icon={resolveIcon(widget.icon)}
      color={error ? undefined : thresholdColor(widget, value)}
      deltaLabel={error ? 'unavailable' : undefined}
    />
  );
}

function DashboardTrendCard({ widget }) {
  const { series, loading, error } = useWidgetValue(widget);
  return (
    <Paper elevation={0} sx={{ p: { xs: 1.75, sm: 2.5 }, height: '100%', minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>{widget.title}</Typography>
      {error ? <Typography role="alert">Could not load data.</Typography> : loading ? <Typography>Loading…</Typography> : <MetricChart type={widget.type} series={series} />}
    </Paper>
  );
}

function RecentCallsTable({ calls, fields, title }) {
  const columns = (fields?.length ? fields : DEFAULT_CALL_FIELDS).filter((f) => CALL_COLUMNS[f]);
  return (
    <Paper elevation={0} sx={{ p: { xs: 1.75, sm: 2.5 }, height: '100%', minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>{title || 'Recent calls'}</Typography>
      {calls.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          No calls yet — events will appear here as they arrive.
        </Typography>
      ) : (
        <Box sx={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Table size="small" sx={{ '& .MuiTableCell-root': { whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                {columns.map((field) => (
                  <TableCell key={field} sx={{ fontWeight: 700 }} align={CALL_COLUMNS[field].align}>
                    {CALL_COLUMNS[field].key}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {calls.map((call) => (
                <TableRow key={call.id} hover>
                  {columns.map((field) => (
                    <TableCell key={field} align={CALL_COLUMNS[field].align} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}>
                      {CALL_COLUMNS[field].cell(call)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}

/**
 * The end-user portal's landing screen (`/`), also mounted in the account
 * console at `/admin/dashboard`. One screen, two sources of scope: a portal
 * user has exactly one environment and it is on the session; an admin has
 * none on theirs, so it follows the console's customer/environment selection,
 * the same way LiveDashboard does. A browser holding both sessions keeps the
 * admin one (see sessionIsolation.js), so the admin session wins here too.
 *
 * Every number here comes from InfluxDB through /api/monitoring/*. The one
 * agreed exception to that rule on this surface is the phone's own recent
 * calls list, which lives in PhoneCallsTab.
 */
export default function Dashboard() {
  const user = useUserAuth();
  const admin = useAuth();
  const { selectedCustomer, selectedEnvironments } = useCustomerEnvironment();
  const isAdmin = Boolean(admin?.isAuthenticated);

  // The console selector is multi-select; this screen is one environment at a
  // time, so it follows the first of the selection and falls back to the
  // customer when none is picked.
  const adminEnv = Array.isArray(selectedEnvironments) ? selectedEnvironments[0] : null;
  const environmentUuid = (isAdmin ? adminEnv?.uuid : user.user?.environment?.uuid) || null;
  const customerUuid = (isAdmin ? selectedCustomer?.uuid : null) || null;
  // localStorage widget definitions are scoped per-tenant so boards don't
  // bleed across environments (see dashboardWidgetsApi.js).
  const storageScope = environmentUuid || customerUuid || 'global';
  useEffect(() => { setDashboardStorageScope(storageScope); }, [storageScope]);

  const { snapshot, status } = useDashboardSnapshot({ environmentUuid, customerUuid });
  const { stats, calls_per_hour: callsPerHour } = snapshot;

  // Portal: same gate app used (`can('dashboard:read')`) — the plural is
  // passed on purpose: hasPermission's fallback resolves it to the user ACL's
  // singular 'dashboard' key. Admin: the console's ACLs have no dashboard key,
  // so the widget controls follow `reports`, the key App.jsx gates the route
  // on. Read access to the screen itself is enforced one level up either way.
  const canEditDashboard = isAdmin
    ? canAccessScreen(admin.acl, 'reports')
    : hasPermission(user.acl, 'dashboards', 'read');
  const [editingWidget, setEditingWidget] = useState(null);
  const [savingWidget, setSavingWidget] = useState(false);
  const [dashboardId] = useState(() => {
    try { return localStorage.getItem('selected-dashboard-id') || 'default'; } catch { return 'default'; }
  });

  const [customWidgets, setCustomWidgets] = useState([]);
  const loadWidgets = useCallback(() => {
    getWidgets(dashboardId).then(setCustomWidgets).catch(() => setCustomWidgets([]));
  }, [dashboardId]);
  useEffect(() => { loadWidgets(); }, [loadWidgets, storageScope]);

  // Definitions live in localStorage (see dashboardWidgetsApi) — the store is
  // the source of truth, so every mutation refetches rather than keeping
  // optimistic copies that can drift.
  const saveWidget = useCallback(async (draft) => {
    setSavingWidget(true);
    try {
      const { uuid, ...definition } = draft;
      if (uuid) await updateWidget(uuid, definition, dashboardId);
      else await createWidget(definition, dashboardId);
      loadWidgets();
      setEditingWidget(null);
    } finally {
      setSavingWidget(false);
    }
  }, [dashboardId, loadWidgets]);

  const removeWidget = useCallback(async (widget) => {
    await deleteWidget(widget.uuid);
    loadWidgets();
  }, [loadWidgets]);

  const duplicateWidget = useCallback(async (widget) => {
    const definition = { ...widget };
    delete definition.uuid;
    delete definition.dashboard_uuid;
    await createWidget({ ...definition, title: `${definition.title} copy` }, dashboardId);
    loadWidgets();
  }, [dashboardId, loadWidgets]);

  // One step up or down among the widgets of the same section; the store
  // keeps the order, so the board comes back the way it was left.
  const shiftWidget = useCallback(async (widget, delta) => {
    await moveWidget(widget.uuid, delta, dashboardId);
    loadWidgets();
  }, [dashboardId, loadWidgets]);

  // Already in stored order (getWidgets sorts by position); split by section.
  const { tiles, charts, tables } = useMemo(() => ({
    tiles: customWidgets.filter((w) => sectionOf(w.type) === 'tiles'),
    charts: customWidgets.filter((w) => sectionOf(w.type) === 'charts'),
    tables: customWidgets.filter((w) => sectionOf(w.type) === 'tables')
  }), [customWidgets]);
  const customPanels = charts.length > 0 || tables.length > 0;
  // "Nothing configured AND nothing happened" — distinct from "something
  // failed", which the Offline chip and the widgets' own "—" already say.
  const isEmpty = customWidgets.length === 0
    && callsPerHour.length === 0
    && snapshot.recent_calls.length === 0;

  return (
    <Box data-testid="dashboard-page" sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        title="Live dashboard"
        subtitle="Live — last hour"
        actions={
          <>
            {/* The builder lives HERE, not behind a modal: adding a widget is
                the main thing anyone does on this screen, and presets (see
                AddWidgetMenu) keep it a pick-something choice rather than a
                query-writing one. */}
            {canEditDashboard && <AddWidgetMenu onPick={setEditingWidget} />}
            <Chip
              size="small"
              icon={<RadioButtonCheckedIcon fontSize="small" />}
              label={status === 'error' ? 'Offline' : 'Live'}
              color={status === 'error' ? 'default' : 'success'}
              variant={status === 'live' ? 'filled' : 'outlined'}
            />
          </>
        }
      />

      {/* The editor stays a dialog — it's a focused form — but it's reached
          by picking a widget, and by the per-widget Edit action on the grid
          below, not by entering a separate "builder mode". */}
      <WidgetEditor
        open={Boolean(editingWidget)}
        widget={editingWidget?.uuid ? editingWidget : null}
        initialDraft={editingWidget}
        saving={savingWidget}
        onClose={() => setEditingWidget(null)}
        onSave={saveWidget}
      />

      <Box data-testid="dashboard-kpis" sx={{ display: 'grid', gap: 2, mb: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
        {tiles.length > 0 ? (
          // Editable in place: BuilderWidget carries its own edit/duplicate/
          // delete menu and queries its own live value, so there's no separate
          // "builder mode" to enter just to change a tile.
          tiles.map((widget) => (
            canEditDashboard
              ? <BuilderWidget
                  key={widget.uuid} widget={widget} snapshot={snapshot} saving={savingWidget}
                  onEdit={setEditingWidget} onDuplicate={duplicateWidget} onDelete={removeWidget} onMove={shiftWidget}
                />
              : <DashboardStatTile key={widget.uuid} widget={widget} />
          ))
        ) : customPanels ? null : (
          // All three read InfluxDB: the tile queries `live_state` directly,
          // the two totals come from the same measurement via the snapshot's
          // windowed chart.
          <>
            <DashboardStatTile widget={CALLS_IN_PROGRESS_TILE} />
            <StatCard label="Inbound (1h)" value={stats.inbound} icon={CallReceivedIcon} color="info.main" />
            <StatCard label="Outbound (1h)" value={stats.outbound} icon={CallMadeIcon} color="success.main" />
          </>
        )}
      </Box>

      {/* A dashboard with no widgets AND nothing to show is otherwise a wall
          of zeroes, which reads as a broken screen rather than a quiet one.
          Say which it is, and point at the thing that fixes it. */}
      {isEmpty && canEditDashboard && (
        <Paper
          elevation={0} data-testid="dashboard-empty-state"
          sx={{ p: { xs: 3, md: 5 }, mb: 2, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 3 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>No calls in the last hour</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520, mx: 'auto', mb: 2 }}>
            Calls will show up here as they happen. In the meantime you can add a widget —
            &ldquo;Calls in progress&rdquo; updates live, and the phone is always in the sidebar.
          </Typography>
          <AddWidgetMenu onPick={setEditingWidget} />
        </Paper>
      )}

      <Box sx={{ display: 'grid', gap: 2, mb: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'stretch' }}>
        {customPanels ? (
          <>
            {charts.map((widget) => (
              canEditDashboard
                ? <BuilderWidget
                    key={widget.uuid} widget={widget} snapshot={snapshot} saving={savingWidget}
                    onEdit={setEditingWidget} onDuplicate={duplicateWidget} onDelete={removeWidget} onMove={shiftWidget}
                  />
                : <DashboardTrendCard key={widget.uuid} widget={widget} />
            ))}
            {tables.map((widget) => (
              <RecentCallsTable key={widget.uuid} calls={snapshot.recent_calls} fields={widget.fields} title={widget.title} />
            ))}
          </>
        ) : (
          <>
            <CallsPerHourChart points={callsPerHour} title="Calls" />
            <RecentCallsTable calls={snapshot.recent_calls} />
          </>
        )}
      </Box>
    </Box>
  );
}
