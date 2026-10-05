import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Box, Typography, Chip, IconButton, Tooltip, Switch, FormControlLabel,
  Paper, Select, MenuItem, FormControl, Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import RefreshIcon from '@mui/icons-material/Refresh';
import FavoriteIcon from '@mui/icons-material/Favorite';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import SdStorageIcon from '@mui/icons-material/SdStorage';
import SpeedIcon from '@mui/icons-material/Speed';
import ArticleIcon from '@mui/icons-material/Article';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AppsIcon from '@mui/icons-material/Apps';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import YabedaMetricViewer from './YabedaMetricViewer.jsx';
import GatusHealthPanel from './GatusHealthPanel.jsx';
import MonitoringNodes from './MonitoringNodes.jsx';
import { nodesApi } from '../../services/api/nodesApi';
import useNodeHealth from '../../hooks/useNodeHealth';
import useGatusHealth from '../../hooks/useGatusHealth';
import useApiHealth from '../../hooks/useApiHealth';
import ApiHealthPanel from './ApiHealthPanel.jsx';
import HealthList from './HealthList.jsx';
import IntegrationCard from './IntegrationCard.jsx';
import { usePermissions } from '../../hooks/usePermissions';

// The app log viewer, as this screen's second view: the top bar no longer has
// a Syslog icon of its own.
const LogsScreen = lazy(() => import('../../views/syslogs/LogsScreen.jsx'));
import { INTEGRATIONS, useIntegrations } from './integrations.js';
import useMonitoring, { SYSTEM_METRICS } from './Monitoring.js';
import { stripedDataGridSx } from '../shared/tableTheme.jsx';
import { MetricCard, ChartPanel } from './widgets';
import './Monitoring.css';

/**
 * Monitoring — status and aggregations, from the three endpoints that have data
 * behind them (see Monitoring.js for the mapping).
 *
 * One page: health, host metrics, log aggregations, the integration cards, and
 * the edge fleet's Gatus health + node list. It was three tabs; the tabs only
 * hid half the picture from whoever was looking at the other half.
 *
 * The integration cards used to fan out over 20 config files against
 * `/api/dashboard/metrics/*`, a mount deleted from the mothership — all of them
 * 404'd, so every card read zero, and they were deleted for it. They are back as
 * a nine-row table (integrations.js) reading /api/monitoring/influxdb/query.
 * Anything with no Influxer model behind it is absent rather than showing 0.
 */

const SYSTEM_ICONS = { cpu: MemoryIcon, mem: StorageIcon, disk: SdStorageIcon, load: SpeedIcon };

const LOG_CARDS = [
  { key: 'total',    label: 'Log lines', icon: ArticleIcon },
  { key: 'errors',   label: 'Errors',    icon: ErrorOutlineIcon, thresholdPath: 'logs.error_rate' },
  { key: 'warnings', label: 'Warnings',  icon: WarningAmberIcon },
  { key: 'apps',     label: 'Apps',      icon: AppsIcon },
];

const SEVERITY_SERIES = [
  { field: 'debug',   name: 'Debug',    color: 'var(--mui-palette-text-secondary)' },
  { field: 'info',    name: 'Info',     color: '#3b82f6' },
  { field: 'notice',  name: 'Notice',   color: '#06b6d4' },
  { field: 'warning', name: 'Warning',  color: '#f59e0b' },
  { field: 'err',     name: 'Error',    color: '#ef4444' },
  { field: 'crit',    name: 'Critical', color: '#dc2626' },
];

const APP_COLUMNS = [
  { field: 'app', headerName: 'App', flex: 1, minWidth: 140 },
  { field: 'err', headerName: 'Error', width: 90, type: 'number' },
  { field: 'warning', headerName: 'Warning', width: 90, type: 'number' },
  { field: 'info', headerName: 'Info', width: 90, type: 'number' },
  { field: 'debug', headerName: 'Debug', width: 90, type: 'number' },
  { field: 'total', headerName: 'Total', width: 100, type: 'number' },
];

/** "warn 80 · crit 95" — or nothing, when alerts.yaml has no entry. */
const thresholdNote = ({ warn, crit }, unit = '') =>
  warn == null && crit == null
    ? null
    : [warn != null && `warn ${warn}${unit}`, crit != null && `crit ${crit}${unit}`].filter(Boolean).join(' · ');

const HostSelector = ({ hosts, value, onChange }) => (
  <FormControl size="small" sx={{ minWidth: 170 }}>
    <Select
      value={value || '__all__'}
      onChange={(e) => onChange(e.target.value === '__all__' ? null : e.target.value)}
      startAdornment={<StorageIcon sx={{ fontSize: 16, color: 'var(--theme-text-secondary)', mr: 0.75 }} />}
      sx={{ fontSize: '0.82rem', height: 36, borderRadius: '8px' }}
    >
      <MenuItem value="__all__">All hosts</MenuItem>
      {hosts.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
    </Select>
  </FormControl>
);

/**
 * Integrations — one card per service, all from /api/monitoring/influxdb/query.
 * The table lives in integrations.js: series + fields + thresholds, one row each.
 */
const IntegrationsPanel = ({ minutes, bucket, host, alertConfig }) => {
  const { data, loading } = useIntegrations({ minutes, bucket, host, alertConfig });

  return (
    <Box sx={{
      display: 'grid', gap: 1.5,
      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
    }}>
      {INTEGRATIONS.map(config => (
        <IntegrationCard key={config.id} config={config} data={data[config.id]} loading={loading} />
      ))}
    </Box>
  );
};

const Monitoring = () => {
  const navigate = useNavigate();
  const {
    timeRange, setTimeRange, TIME_RANGES,
    hosts, selectedHost, setSelectedHost,
    autoRefresh, toggleAutoRefresh,
    loading,
    logSummary, appBreakdown, syslogSeries,
    currentValue, chartRows, thresholds, alertConfig,
    fetchData,
  } = useMonitoring();
  const apiHealth = useApiHealth();

  const { canAccess } = usePermissions();
  const canReadLogs = canAccess('logs');
  // 'status' (health, metrics, log volume) or 'logs' (the log lines themselves).
  const [view, setView] = useState('status');
  const showLogs = view === 'logs' && canReadLogs;

  const [monitorNodes, setMonitorNodes] = useState([]);
  // The service whose verbose health is open (null: closed).
  const [healthFocus, setHealthFocus] = useState(null);

  // Syslog hosts are display names; the Gatus relay is addressed by node UUID.
  // Resolve that mapping once so the monitoring panel calls the existing
  // authenticated NATS-backed endpoint instead of a nonexistent system route.
  useEffect(() => {
    nodesApi.getNodes().then((nodes) => {
      const list = Array.isArray(nodes) ? nodes : (nodes?.data || nodes?.items || []);
      setMonitorNodes(list);
    }).catch(() => setMonitorNodes([]));
  }, []);

  const selectedNode = selectedHost
    ? monitorNodes.find((node) => [node.uuid, node.name, node.host, node.hostname].filter(Boolean).includes(selectedHost))
    : null;
  const nodeHealth = useNodeHealth(selectedNode?.uuid);
  const fleetHealth = useGatusHealth();
  const visibleGatus = selectedNode ? nodeHealth : fleetHealth;

  const gridSx = useMemo(() => ({
    ...stripedDataGridSx,
    border: 'none', fontSize: '0.8rem',
    '& .MuiDataGrid-columnHeaders': { backgroundColor: 'var(--widget-header-bg)' },
    '& .MuiDataGrid-cell': { borderBottom: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' },
  }), []);

  return (
    <Box sx={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <Box sx={{
        flex: 1, minWidth: 0, px: { xs: 1, sm: 2, md: 3 }, py: { xs: 1, sm: 1.5 },
        display: 'flex', flexDirection: 'column', overflow: 'auto', gap: 2,
      }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, color: 'var(--theme-text-primary)' }}>{showLogs ? 'Logs' : 'Status'}</Typography>
            {canReadLogs && (
              <Box sx={{ display: 'flex', gap: 0.5 }} role="tablist" aria-label="Monitoring view">
                {[['status', 'Status'], ['logs', 'Logs']].map(([key, label]) => (
                  <Chip key={key} label={label} size="small" role="tab" aria-selected={view === key}
                    variant={view === key ? 'filled' : 'outlined'}
                    color={view === key ? 'primary' : 'default'}
                    onClick={() => setView(key)}
                    sx={{ fontSize: '0.75rem', cursor: 'pointer' }} />
                ))}
              </Box>
            )}
            {!showLogs && <HostSelector hosts={hosts} value={selectedHost} onChange={setSelectedHost} />}
          </Box>
          {!showLogs && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {Object.entries(TIME_RANGES).map(([key, { label }]) => (
                <Chip key={key} label={label} size="small"
                  variant={timeRange === key ? 'filled' : 'outlined'}
                  color={timeRange === key ? 'primary' : 'default'}
                  onClick={() => setTimeRange(key)}
                  sx={{ fontSize: '0.75rem', cursor: 'pointer' }} />
              ))}
            </Box>
            <FormControlLabel
              control={<Switch size="small" checked={autoRefresh} onChange={toggleAutoRefresh} />}
              label={<Typography variant="caption" sx={{ fontSize: '0.75rem' }}>Auto</Typography>}
              sx={{ ml: 1, mr: 0 }} />
            <Tooltip title="Refresh now">
              <span>
                <IconButton size="small" onClick={fetchData} disabled={loading}><RefreshIcon fontSize="small" /></IconButton>
              </span>
            </Tooltip>
          </Box>}
        </Box>

        {showLogs ? (
          <Suspense fallback={null}>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <LogsScreen />
            </Box>
          </Suspense>
        ) : (
        <>
            {/* Gatus is the first operational surface: choose a node and see
                its live relay status before drilling into historical metrics. */}
            <Paper elevation={0} sx={{
              border: '1px solid var(--theme-border)', borderRadius: '12px',
              backgroundColor: 'var(--theme-bg-primary)', overflow: 'hidden',
            }}>
              <Box sx={{ p: 2, borderBottom: '1px solid var(--theme-border)', display: 'flex', alignItems: 'center', gap: 1 }}>
                <FavoriteIcon fontSize="small" sx={{ color: visibleGatus.summary.down === 0 && visibleGatus.summary.total > 0 ? '#10b981' : '#f59e0b' }} />
                <Typography sx={{ fontWeight: 600 }}>Live service health</Typography>
                {selectedHost && <Chip size="small" variant="outlined" label={selectedHost} />}
                <Typography variant="caption" sx={{ ml: 'auto', color: 'var(--theme-text-secondary)' }}>Gatus · node checks</Typography>
              </Box>
              <Box sx={{ p: 2 }}>
                <GatusHealthPanel
                  endpoints={visibleGatus.endpoints}
                  summary={visibleGatus.summary}
                  loading={visibleGatus.loading}
                  error={visibleGatus.error || visibleGatus.response?.error}
                  title={selectedNode ? `${selectedNode.name || selectedHost} · Gatus` : 'Fleet · Gatus'}
                  {...(selectedNode ? {
                    detailApiBase: `/custom/nodes/${encodeURIComponent(selectedNode.uuid)}/endpoints`,
                  } : {})}
                />
              </Box>
            </Paper>

            <Paper elevation={0} sx={{
              px: 2, py: 1, border: '1px solid var(--theme-border)',
              borderRadius: '8px', backgroundColor: 'var(--theme-bg-primary)',
            }}>
              <HealthList health={apiHealth} gatusSummary={fleetHealth.summary} onOpen={setHealthFocus} />
            </Paper>

            {/* Host metrics — Influxer models, thresholds from config/alerts.yaml */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {SYSTEM_METRICS.map(m => {
                const Icon = SYSTEM_ICONS[m.key];
                const t = thresholds(m.key);
                const value = currentValue(m.key);
                return (
                  <MetricCard
                    key={m.key}
                    title={m.label}
                    value={value}
                    unit={m.unit}
                    icon={<Icon sx={{ fontSize: 20 }} />}
                    color="#6366f1"
                    loading={loading && value == null}
                    warn={t.warn} crit={t.crit}
                    footnote={thresholdNote(t, m.unit)}
                  />
                );
              })}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, '& > *': { minWidth: 0 } }}>
              {SYSTEM_METRICS.map(m => (
                <ChartPanel
                  key={m.key}
                  title={m.label}
                  data={chartRows(m.key)}
                  series={[{ field: 'value', name: m.label, color: '#6366f1' }]}
                  groupBy="host"
                  timeRange={timeRange}
                  yUnit={m.unit}
                  yDomain={m.unit === '%' ? [0, 100] : undefined}
                  threshold={thresholds(m.key).crit}
                  loading={loading}
                  onEditQuery={() => navigate('/admin/dashboard')}
                />
              ))}
            </Box>

            {/* Log aggregations — /api/logs */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {LOG_CARDS.map(c => {
                const t = c.thresholdPath
                  ? {
                      warn: alertConfig?.logs?.error_rate?.warning,
                      crit: alertConfig?.logs?.error_rate?.critical,
                    }
                  : {};
                return (
                  <MetricCard
                    key={c.key}
                    title={c.label}
                    value={logSummary[c.key] ?? '—'}
                    icon={<c.icon sx={{ fontSize: 20 }} />}
                    color="#8b5cf6"
                    loading={loading && logSummary[c.key] == null}
                    warn={t.warn} crit={t.crit}
                    footnote={thresholdNote(t)}
                  />
                );
              })}
            </Box>

            <ChartPanel
              title="Log volume by severity"
              data={syslogSeries}
              series={SEVERITY_SERIES}
              timeRange={timeRange}
              chartType="line"
              loading={loading}
            />

            <Paper elevation={0} sx={{
              border: '1px solid var(--theme-border)', borderRadius: '12px',
              backgroundColor: 'var(--theme-bg-primary)', overflow: 'hidden',
            }}>
              <Box sx={{ p: 2, borderBottom: '1px solid var(--theme-border)' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Logs by app</Typography>
              </Box>
              <Box sx={{ height: 320 }}>
                <DataGrid
                  rows={appBreakdown} columns={APP_COLUMNS}
                  loading={loading && !appBreakdown.length}
                  density="compact"
                  hideFooter={appBreakdown.length <= 10}
                  pageSizeOptions={[10, 25]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  sx={gridSx}
                />
              </Box>
            </Paper>

            <Accordion defaultExpanded disableGutters elevation={0}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SpeedIcon fontSize="small" />
                  <Typography sx={{ fontWeight: 600 }}>API metrics</Typography>
                  <Chip size="small" variant="outlined" label="Yabeda" />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <YabedaMetricViewer />
              </AccordionDetails>
            </Accordion>

            {/* Integrations — one card per service, same page as everything else. */}
            <IntegrationsPanel
              minutes={(TIME_RANGES[timeRange] || TIME_RANGES.day).minutes}
              bucket={(TIME_RANGES[timeRange] || TIME_RANGES.day).bucket}
              host={selectedHost || ''}
              alertConfig={alertConfig} />

            <Accordion defaultExpanded disableGutters elevation={0}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <DnsIcon fontSize="small" />
                  <Typography sx={{ fontWeight: 600 }}>Nodes</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <MonitoringNodes />
              </AccordionDetails>
            </Accordion>

        </>
        )}
      </Box>

      <Dialog open={Boolean(healthFocus)} onClose={() => setHealthFocus(null)} maxWidth="md" fullWidth>
        <DialogTitle>Health — verbose</DialogTitle>
        <DialogContent><ApiHealthPanel focus={healthFocus} summary={apiHealth.response} /></DialogContent>
        <DialogActions><Button onClick={() => setHealthFocus(null)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default Monitoring;
