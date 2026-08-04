import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CallIcon from '@mui/icons-material/Call';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PhoneMissedIcon from '@mui/icons-material/PhoneMissed';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import { useTranslation } from 'react-i18next';
import PageHeader from '../common/PageHeader';
import StatCard from '../common/StatCard';
import StatusChip from '../common/StatusChip';
import CallsPerHourChart from '../common/CallsPerHourChart';
import { DashboardWidgets } from './widgets';
import { useDashboardSnapshot, type DashboardCall } from './useDashboardSnapshot';
import { useCallsPerHour } from './useCallsPerHour';
import DashboardBuilder from '../DashboardBuilder/DashboardBuilder';
import { formatWidgetValue, resolveIcon, thresholdColor } from '../DashboardBuilder/widgetPresentation';
import { getWidgets } from '../../services/dashboardsApi';
import { useACL } from '../../hooks/useACL';

interface LocalWidget {
  uuid: string;
  title: string;
  type?: string;
  metric: string;
  fields?: string[];
  icon?: string;
  color?: string;
  unit?: string;
  thresholds?: { warning?: number; critical?: number };
  inverse?: boolean;
  min?: number;
  max?: number;
}

/**
 * End-user live dashboard.
 *
 * Two data planes, deliberately separate:
 *  - The local DuckDB projection (deno `/dashboard/snapshot`, polled) powers the
 *    KPI tiles, the calls-per-hour chart and the recent-calls table.
 *  - The va-crystal Cable stream powers the live queues/agents widgets; that
 *    section renders only once widget frames actually arrive, so an
 *    unconfigured cable never leaves the page empty.
 */

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtTime(value: string): string {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(value)) ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// recent_calls column → header key + cell renderer. A `table` widget picks a
// subset of these by field name; unknown names fall back to the raw value.
type Translate = (key: string, fallback?: string) => string;

const CALL_COLUMNS: Record<string, { key: string; align?: 'right'; cell: (c: DashboardCall, t: Translate) => ReactNode }> = {
  started_at: { key: 'time', cell: (c) => fmtTime(c.started_at) },
  direction: { key: 'direction', cell: (c, t) => t(`callDashboard.${c.direction}`, c.direction) },
  from_number: { key: 'from', cell: (c) => c.from_number || '—' },
  to_number: { key: 'to', cell: (c) => c.to_number || '—' },
  status: { key: 'status', cell: (c) => <StatusChip status={c.status} variant="outlined" /> },
  duration_sec: { key: 'duration', align: 'right', cell: (c) => fmtDuration(c.duration_sec) },
};
const DEFAULT_CALL_FIELDS = Object.keys(CALL_COLUMNS);

function RecentCallsTable({ calls, fields, title }: { calls: DashboardCall[]; fields?: string[]; title?: string }) {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;
  const columns = (fields?.length ? fields : DEFAULT_CALL_FIELDS).filter((f) => CALL_COLUMNS[f]);
  return (
    <Paper elevation={0} sx={{ p: { xs: 1.75, sm: 2.5 }, height: '100%', minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>{title || t('callDashboard.recentCalls', 'Recent calls')}</Typography>
      {calls.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {t('callDashboard.noCalls', 'No calls yet — events will appear here as they arrive.')}
        </Typography>
      ) : (
        // Six columns never fit a phone. Rather than hide data, every cell refuses
        // to wrap so the table keeps its shape and this box scrolls sideways.
        <Box sx={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Table size="small" sx={{ '& .MuiTableCell-root': { whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                {columns.map((field) => (
                  <TableCell key={field} sx={{ fontWeight: 700 }} align={CALL_COLUMNS[field].align}>
                    {t(`callDashboard.table.${CALL_COLUMNS[field].key}`, field)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {calls.map((call) => (
                <TableRow key={call.id} hover>
                  {columns.map((field) => (
                    <TableCell
                      key={field} align={CALL_COLUMNS[field].align}
                      sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', unicodeBidi: 'isolate' }}
                    >
                      {CALL_COLUMNS[field].cell(call, tr)}
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

export default function Dashboard() {
  const { t } = useTranslation();
  // Rolling last-24h window, fixed at mount; the hook re-polls it every 10s.
  const [range] = useState(() => {
    const now = Date.now();
    return { from: new Date(now - 24 * 3_600_000), to: new Date(now + 3_600_000) };
  });
  const { snapshot, status } = useDashboardSnapshot(range);
  // Calls-per-hour comes from the MOTHERSHIP's call list, not the local DuckDB
  // projection: that projection is fed by the cable tap, which is unconfigured
  // on most installs, so the chart sat empty while the Calls page showed the
  // very same calls. Falls back to the projection if the API series is absent.
  const { points: apiCallsPerHour } = useCallsPerHour({ minutes: 1440 });
  const callsPerHour = apiCallsPerHour ?? snapshot.calls_per_hour;
  const { stats } = snapshot;
  const { can } = useACL();
  const [builderOpen, setBuilderOpen] = useState(false);

  // User-defined widgets (local DuckDB definitions). When present they replace
  // the default KPI row; values always come from the same snapshot stats.
  const [customWidgets, setCustomWidgets] = useState<LocalWidget[]>([]);
  const loadWidgets = useCallback(() => {
    getWidgets().then(setCustomWidgets).catch(() => setCustomWidgets([]));
  }, []);
  useEffect(() => { loadWidgets(); }, [loadWidgets]);

  // A definition's type decides which snapshot section renders it: counters and
  // gauges read `stats`, trends read `calls_per_hour`, tables read `recent_calls`.
  const { tiles, trends, tables } = useMemo(() => ({
    tiles: customWidgets.filter((w) => !w.type || w.type === 'counter' || w.type === 'gauge'),
    trends: customWidgets.filter((w) => w.type === 'trend'),
    tables: customWidgets.filter((w) => w.type === 'table'),
  }), [customWidgets]);
  const customPanels = trends.length > 0 || tables.length > 0;

  const rawValue = (metric: string): number =>
    (stats as unknown as Record<string, number>)[metric] ?? 0;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        title={t('dashboardLive.heading', 'Live dashboard')}
        subtitle={t('callDashboard.timeRange.last24Hours', 'Last 24 hours')}
        actions={
          <>
            {can('dashboard:write') && (
              <Button
                size="small" variant="outlined" color="inherit" startIcon={<EditOutlinedIcon />}
                onClick={() => setBuilderOpen(true)} data-testid="dashboard-builder-button"
                sx={{ borderColor: 'divider' }}
              >
                {t('dashboardBuilder.open', 'Edit dashboard')}
              </Button>
            )}
            <Chip
              size="small"
              icon={<RadioButtonCheckedIcon fontSize="small" />}
              label={status === 'error' ? t('callDashboard.offline', 'Offline') : t('callDashboard.live', 'Live')}
              color={status === 'error' ? 'default' : 'success'}
              variant={status === 'live' ? 'filled' : 'outlined'}
            />
          </>
        }
      />
      <DashboardBuilder
        open={builderOpen} onClose={() => setBuilderOpen(false)}
        onChange={loadWidgets} snapshot={snapshot}
      />

      <Box data-testid="dashboard-kpis" sx={{ display: 'grid', gap: 2, mb: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        {tiles.length > 0 ? (
          tiles.map((widget) => (
            <StatCard
              key={widget.uuid}
              label={widget.title || t(`dashboardBuilder.metric.${widget.metric}`, widget.metric)}
              value={formatWidgetValue(widget, rawValue(widget.metric))}
              icon={resolveIcon(widget.icon)}
              color={thresholdColor(widget, rawValue(widget.metric))}
            />
          ))
        ) : customPanels ? null : (
          <>
            <StatCard label={t('callDashboard.callsTotal', 'Total calls')} value={stats.total} icon={CallIcon} />
            <StatCard label={t('callDashboard.answered', 'Answered')} value={stats.answered} icon={CheckCircleOutlineIcon} color="success.main" />
            <StatCard label={t('callDashboard.failed', 'Failed / missed')} value={stats.failed} icon={PhoneMissedIcon} color="error.main" />
            <StatCard label={t('callDashboard.avgDuration', 'Avg duration')} value={fmtDuration(stats.avg_duration_sec)} icon={TimerOutlinedIcon} color="info.main" />
          </>
        )}
      </Box>

      {/* `minmax(0, …)` rather than a bare `7fr 5fr`: a grid track defaults to a
          min-content floor, so the wide recent-calls table would otherwise
          stretch the column and put the whole page into a horizontal scroll. */}
      <Box sx={{ display: 'grid', gap: 2, mb: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'stretch' }}>
        {customPanels ? (
          <>
            {trends.map((widget) => (
              <CallsPerHourChart
                key={widget.uuid} points={callsPerHour}
                series={widget.fields} title={widget.title}
              />
            ))}
            {tables.map((widget) => (
              <RecentCallsTable
                key={widget.uuid} calls={snapshot.recent_calls}
                fields={widget.fields} title={widget.title}
              />
            ))}
          </>
        ) : (
          <>
            <CallsPerHourChart points={callsPerHour} />
            <RecentCallsTable calls={snapshot.recent_calls} />
          </>
        )}
      </Box>

      <DashboardWidgets />
    </Box>
  );
}
