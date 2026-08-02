import { useCallback, useEffect, useState, type ElementType } from 'react';
import { Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
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
import DashboardBuilder from '../DashboardBuilder/DashboardBuilder';
import { getWidgets } from '../../services/dashboardsApi';
import { useACL } from '../../hooks/useACL';

interface LocalWidget {
  uuid: string;
  title: string;
  metric: string;
}

// metric → tile accent for user-defined counters.
const METRIC_STYLE: Record<string, { icon: ElementType; color?: string }> = {
  total: { icon: CallIcon },
  answered: { icon: CheckCircleOutlineIcon, color: 'success.main' },
  failed: { icon: PhoneMissedIcon, color: 'error.main' },
  inbound: { icon: CallIcon, color: 'info.main' },
  outbound: { icon: CallIcon, color: 'warning.main' },
  avg_duration_sec: { icon: TimerOutlinedIcon, color: 'info.main' },
};

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

function RecentCallsTable({ calls }: { calls: DashboardCall[] }) {
  const { t } = useTranslation();
  return (
    <Paper elevation={0} sx={{ p: 2.5, height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>{t('callDashboard.recentCalls', 'Recent calls')}</Typography>
      {calls.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {t('callDashboard.noCalls', 'No calls yet — events will appear here as they arrive.')}
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{t('callDashboard.table.time', 'Time')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t('callDashboard.table.direction', 'Direction')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t('callDashboard.table.from', 'From')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t('callDashboard.table.to', 'To')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t('callDashboard.table.status', 'Status')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{t('callDashboard.table.duration', 'Duration')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {calls.map((call) => (
                <TableRow key={call.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(call.started_at)}</TableCell>
                  <TableCell>{t(`callDashboard.${call.direction}`, call.direction)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{call.from_number || '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{call.to_number || '—'}</TableCell>
                  <TableCell><StatusChip status={call.status} variant="outlined" /></TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(call.duration_sec)}</TableCell>
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

  const metricValue = (metric: string): string | number => {
    const value = (stats as unknown as Record<string, number>)[metric] ?? 0;
    return metric === 'avg_duration_sec' ? fmtDuration(value) : value;
  };

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
      <DashboardBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} onChange={loadWidgets} />

      <Box data-testid="dashboard-kpis" sx={{ display: 'grid', gap: 2, mb: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        {customWidgets.length > 0 ? (
          customWidgets.map((widget) => {
            const style = METRIC_STYLE[widget.metric] || { icon: InsightsIcon };
            return (
              <StatCard
                key={widget.uuid}
                label={widget.title || t(`dashboardBuilder.metric.${widget.metric}`, widget.metric)}
                value={metricValue(widget.metric)}
                icon={style.icon}
                color={style.color}
              />
            );
          })
        ) : (
          <>
            <StatCard label={t('callDashboard.callsTotal', 'Total calls')} value={stats.total} icon={CallIcon} />
            <StatCard label={t('callDashboard.answered', 'Answered')} value={stats.answered} icon={CheckCircleOutlineIcon} color="success.main" />
            <StatCard label={t('callDashboard.failed', 'Failed / missed')} value={stats.failed} icon={PhoneMissedIcon} color="error.main" />
            <StatCard label={t('callDashboard.avgDuration', 'Avg duration')} value={fmtDuration(stats.avg_duration_sec)} icon={TimerOutlinedIcon} color="info.main" />
          </>
        )}
      </Box>

      <Box sx={{ display: 'grid', gap: 2, mb: 2, gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' }, alignItems: 'stretch' }}>
        <CallsPerHourChart points={snapshot.calls_per_hour} />
        <RecentCallsTable calls={snapshot.recent_calls} />
      </Box>

      <DashboardWidgets />
    </Box>
  );
}
