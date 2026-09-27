// The console's bird's-eye view of calls, built from the Monitoring screen's
// own widgets (WidgetGrid/MetricCard/ChartPanel) so the two read as one
// product: the same cards, the same chart component, the same auto-refresh.
//
// It wraps LiveCallsDashboard — the screen the portal used to land on — and
// adds the period view around it: totals for the window, calls over time, and
// how they ended.
//
// Scope: whatever the console has selected. A ROOT admin with nothing
// selected gets the fleet — every customer, one series each — rather than an
// empty screen, which is the bird's-eye case this screen exists for.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, FormControl, FormControlLabel, IconButton, MenuItem, Paper, Select, Switch, Tooltip, Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import GroupsIcon from '@mui/icons-material/Groups';
import { useAuth } from '../../context/AuthContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext.jsx';
import { usePermissions } from '../../hooks/usePermissions';
import { monitoringApi } from '../../services/api/monitoringApi';
import { MetricCard, ChartPanel, WidgetGrid, Slot } from '../Monitoring/widgets';
import LiveCallsDashboard from './LiveCallsDashboard.jsx';
import CallsBreakdown, { sumByKey } from './CallsBreakdown.jsx';
import WidgetBoard from '../DashboardBuilder/WidgetBoard';

// Same cadence as Monitoring, so a console with both open refreshes together.
const REFRESH_MS = 30000;

const PERIODS = [
  { key: '1h', label: 'Last hour', minutes: 60, bucket: '5m', timeRange: 'hour' },
  { key: '24h', label: 'Last 24 hours', minutes: 1440, bucket: '1h', timeRange: 'day' },
  { key: '7d', label: 'Last 7 days', minutes: 10080, bucket: '1d', timeRange: 'week' },
];

// Enough colours for a fleet; repeats beyond that, which is honest — a legend
// with 12 near-identical shades helps nobody.
const SERIES_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const ANSWERED = /^(answer|answered|normal_clearing)$/i;
const CDR_GROUPS = [
  { key: 'direction', label: 'Direction' },
  { key: 'disposition', label: 'Disposition' },
  { key: 'type', label: 'Type' },
  { key: 'hangup_disposition', label: 'Hangup disposition' },
];

const groupLabel = (key) => CDR_GROUPS.find((group) => group.key === key)?.label || key.replace(/_/g, ' ');

export default function AdminDashboard() {
  const { selectedCustomer, selectedEnvironments } = useCustomerEnvironment();
  const { isRoot, accountUuid } = useAuth();
  const { can } = usePermissions();
  const environment = selectedEnvironments?.[0] || null;
  // CDR monitoring follows the selected customer across every one of its
  // environments. A single environment remains useful to the live panel, but
  // must not silently narrow historical monitoring to the first selection.
  const cdrEnvironmentUuid = selectedCustomer?.uuid ? null : environment?.uuid || null;
  const scope = selectedCustomer?.uuid && selectedCustomer?.name
    ? `${selectedCustomer.name} · all applications`
    : environment?.name || selectedCustomer?.name || '';
  const fleetView = isRoot && !selectedCustomer?.uuid && !environment?.uuid;

  const [period, setPeriod] = useState('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [volume, setVolume] = useState([]);
  const [outcome, setOutcome] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cdrGroupBy, setCdrGroupBy] = useState('direction');
  const timer = useRef(null);

  const range = PERIODS.find((p) => p.key === period) || PERIODS[1];
  const splitBy = cdrGroupBy;

  const load = useCallback(async () => {
    if (!fleetView && !selectedCustomer?.uuid && !environment?.uuid) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(false);
      // Two views of one window — when the calls happened, and how they ended.
      const [rows, outcomeRows] = await Promise.all([
        monitoringApi.getCallsVolumeChart(
          cdrEnvironmentUuid, range.minutes, range.bucket, selectedCustomer?.uuid || null, splitBy,
        ),
        monitoringApi.getCallsVolumeChart(
          cdrEnvironmentUuid, range.minutes, range.bucket, selectedCustomer?.uuid || null, 'disposition',
        ),
      ]);
      setVolume(Array.isArray(rows) ? rows : []);
      setOutcome(Array.isArray(outcomeRows) ? outcomeRows : []);
    } catch {
      setError(true);
      setVolume([]);
      setOutcome([]);
    } finally {
      setLoading(false);
    }
  }, [fleetView, selectedCustomer?.uuid, cdrEnvironmentUuid, range.minutes, range.bucket, splitBy]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [autoRefresh, load]);

  // The series present in the answer decide the legend: the API returns one
  // key per group it found, so an absent direction never shows an empty line.
  const series = useMemo(() => {
    const keys = Object.keys(sumByKey(volume));
    return keys.map((field, i) => ({
      field,
      name: field.replace(/_/g, ' '),
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    }));
  }, [volume]);

  const totals = useMemo(() => {
    const byGroup = sumByKey(volume);
    const all = Object.values(byGroup).reduce((sum, n) => sum + n, 0);
    const outcomes = sumByKey(outcome);
    const answered = Object.entries(outcomes)
      .filter(([label]) => ANSWERED.test(label))
      .reduce((sum, [, n]) => sum + n, 0);
    const busiest = Object.entries(byGroup).sort((a, b) => b[1] - a[1])[0];
    return {
      all,
      answered,
      answeredPct: all ? Math.round((answered / all) * 100) : 0,
      groups: Object.keys(byGroup).length,
      busiest: busiest ? busiest[0].replace(/_/g, ' ') : '—',
    };
  }, [volume, outcome]);

  return (
    <LiveCallsDashboard
      environmentUuid={environment?.uuid || null}
      title="Dashboard"
      subtitle={scope ? `Live activity for ${scope}`
        : fleetView ? 'Every customer — select one for its live activity'
        : 'Select an application to see live activity'}
      callsAllowed={can('calls', 'read')}
      historyPath="/calls"
      testId="admin-dashboard-page"
      liveEnabled={!selectedCustomer?.uuid && Boolean(environment?.uuid)}
      recentCallsEnabled={!selectedCustomer?.uuid && Boolean(environment?.uuid)}
    >
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {fleetView ? 'Every customer' : scope || 'Calls'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select value={period} onChange={(e) => setPeriod(e.target.value)} inputProps={{ 'aria-label': 'Period' }}>
                {PERIODS.map((p) => <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 165 }}>
              <Select
                value={cdrGroupBy}
                onChange={(e) => setCdrGroupBy(e.target.value)}
                inputProps={{ 'aria-label': 'Group CDR calls by' }}
              >
                {CDR_GROUPS.map((group) => <MenuItem key={group.key} value={group.key}>By {group.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControlLabel
              sx={{ mr: 0 }}
              control={<Switch size="small" checked={autoRefresh} onChange={() => setAutoRefresh((v) => !v)} />}
              label={<Typography variant="body2">Auto</Typography>}
            />
            <Tooltip title="Refresh now">
              <span>
                <IconButton size="small" onClick={load} disabled={loading} aria-label="Refresh now">
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>

        <WidgetGrid>
          <Slot span={3}>
            <MetricCard title="Calls" value={totals.all} icon={<PhoneInTalkIcon fontSize="small" />} color="#3b82f6" loading={loading}
              footnote={range.label.toLowerCase()} />
          </Slot>
          <Slot span={3}>
            <MetricCard title="Answered" value={totals.answeredPct} unit="%" icon={<CheckCircleIcon fontSize="small" />} color="#22c55e"
              loading={loading} footnote={`${totals.answered.toLocaleString()} of ${totals.all.toLocaleString()}`} />
          </Slot>
          <Slot span={3}>
            <MetricCard title={groupLabel(splitBy)} value={totals.groups}
              icon={<GroupsIcon fontSize="small" />} color="#8b5cf6" loading={loading} />
          </Slot>
          <Slot span={3}>
            <MetricCard title={`Most calls by ${groupLabel(splitBy).toLowerCase()}`} value={totals.busiest}
              icon={<CallMadeIcon fontSize="small" />} color="#f59e0b" loading={loading} />
          </Slot>

          <Slot span={12}>
            <ChartPanel
              title={`Calls by ${groupLabel(splitBy)}`}
              data={volume}
              series={series}
              timeRange={range.timeRange}
              chartType={series.length > 2 ? 'line' : 'area'}
              loading={loading}
            />
          </Slot>
          <Slot span={12}>
            <Paper elevation={0} sx={{ p: 2, height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>How they ended</Typography>
              {error
                ? <Typography color="text.secondary" variant="body2">The calls chart could not be loaded.</Typography>
                : <CallsBreakdown rows={outcome} />}
            </Paper>
          </Slot>
        </WidgetGrid>

        {/* Ad-hoc metric exploration is a board widget ('explorer' in
            widgetTemplates), not a panel of its own between the two. */}
        {accountUuid && <WidgetBoard key={accountUuid} storageScope={`admin-metrics:${accountUuid}`} />}
      </Box>
    </LiveCallsDashboard>
  );
}
