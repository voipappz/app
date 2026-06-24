import { useMemo, useState } from 'react';
import { Box, Paper, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import PhoneIcon from '@mui/icons-material/Phone';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimerIcon from '@mui/icons-material/Timer';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import { useCalls, computeCallStats } from '../Calls/useCalls';
import PageHeader from '../common/PageHeader';
import StatCard from '../common/StatCard';

/**
 * UsageReports — call-usage analytics built on the same live `useCalls` source
 * the Dashboard and Calls pages use (DuckDB via the Deno /calls API, refreshed
 * on WebSocket call.* events). All aggregation is client-side and memoised.
 *
 * Best-practice analytics surface: period filter → KPI band → time-series →
 * status mix → load-by-hour → top destinations. Fully responsive (CSS grid),
 * RTL/Hebrew-first.
 */

const PERIODS = [
  { key: 'today', days: 1 },
  { key: 'd7', days: 7 },
  { key: 'd30', days: 30 },
  { key: 'all', days: null },
];

function periodStart(days) {
  if (days == null) return 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.getTime();
}

function ts(v) {
  if (!v) return 0;
  return new Date(String(v).replace(' ', 'T')).getTime();
}

// Average / per-call duration — precise mm:ss (hh:mm:ss only if needed).
function fmtDuration(s) {
  if (!s) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Aggregate talk time — compact (1h 6m / 6m) so it fits a narrow KPI tile.
function fmtTalk(s) {
  if (!s) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const STATUS_KEYS = ['completed', 'failed', 'no_answer', 'busy', 'ringing', 'in_progress'];

export default function UsageReports() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { calls } = useCalls();
  const [period, setPeriod] = useState('d7');

  const days = PERIODS.find((p) => p.key === period)?.days ?? 7;

  const rows = useMemo(() => {
    const start = periodStart(days);
    return calls.filter((c) => ts(c.started_at) >= start);
  }, [calls, days]);

  const stats = computeCallStats(rows);
  const answerRate = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
  const talkTime = useMemo(
    () => rows.reduce((sum, c) => sum + (Number(c.duration_seconds) || 0), 0),
    [rows],
  );

  // Calls over time — bucket by day (or by hour when period is "today")
  const overTime = useMemo(() => {
    const byHour = days === 1;
    const map = new Map();
    for (const c of rows) {
      const d = new Date(ts(c.started_at));
      const key = byHour
        ? `${String(d.getHours()).padStart(2, '0')}:00`
        : `${d.getMonth() + 1}/${d.getDate()}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    if (byHour) {
      return Array.from({ length: 24 }, (_, h) => {
        const k = `${String(h).padStart(2, '0')}:00`;
        return { label: k, calls: map.get(k) || 0 };
      });
    }
    // chronological order for day buckets
    return Array.from(map.entries())
      .map(([label, calls]) => ({ label, calls }))
      .sort((a, b) => {
        const [am, ad] = a.label.split('/').map(Number);
        const [bm, bd] = b.label.split('/').map(Number);
        return am - bm || ad - bd;
      });
  }, [rows, days]);

  // Calls by status (pie)
  const byStatus = useMemo(() => {
    const map = new Map();
    for (const c of rows) map.set(c.status, (map.get(c.status) || 0) + 1);
    return STATUS_KEYS
      .map((s) => ({ key: s, name: t(`usageReports.status.${s}`, s), value: map.get(s) || 0 }))
      .filter((d) => d.value > 0);
  }, [rows, t]);

  // Busiest hours (bar 0-23)
  const byHour = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}`, calls: 0 }));
    for (const c of rows) {
      const h = new Date(ts(c.started_at)).getHours();
      if (h >= 0 && h < 24) arr[h].calls++;
    }
    return arr;
  }, [rows]);

  // Top destinations
  const topDest = useMemo(() => {
    const map = new Map();
    for (const c of rows) {
      const n = c.to_number || '—';
      map.set(n, (map.get(n) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([number, count]) => ({ number, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [rows]);

  const statusColors = {
    completed: theme.palette.success.main,
    failed: theme.palette.error.main,
    no_answer: theme.palette.warning.main,
    busy: theme.palette.grey[500],
    ringing: theme.palette.info.main,
    in_progress: theme.palette.primary.main,
  };

  const teal = theme.palette.primary.main;

  const periodToggle = (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={period}
      onChange={(_e, v) => v && setPeriod(v)}
      sx={{ '& .MuiToggleButton-root': { px: 1.5, textTransform: 'none', fontWeight: 600 } }}
    >
      {PERIODS.map((p) => (
        <ToggleButton key={p.key} value={p.key}>{t(`usageReports.period.${p.key}`)}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  );

  const card = { p: 2.5, height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 3 };
  const cardTitle = { mb: 1.5, fontWeight: 700 };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader title={t('menu.reports')} subtitle={t('usageReports.subtitle')} actions={periodToggle} />

      {/* KPI band */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' }, mb: 3 }}>
        <StatCard label={t('usageReports.totalCalls')} value={stats.total} icon={PhoneIcon} color="primary.main" />
        <StatCard label={t('usageReports.answerRate')} value={`${answerRate}%`} icon={CheckCircleIcon} color="success.main" />
        <StatCard label={t('usageReports.avgDuration')} value={fmtDuration(stats.avgDurationSec)} icon={TimerIcon} color="info.main" />
        <StatCard label={t('usageReports.talkTime')} value={fmtTalk(talkTime)} icon={AccessTimeIcon} color="primary.main" />
        <StatCard label={t('usageReports.inbound')} value={stats.inbound} icon={CallReceivedIcon} color="info.main" />
        <StatCard label={t('usageReports.outbound')} value={stats.outbound} icon={CallMadeIcon} color="success.main" />
      </Box>

      {/* Time series + status mix */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, mb: 3 }}>
        <Paper elevation={0} sx={card}>
          <Typography variant="h6" sx={cardTitle}>{t('usageReports.callsOverTime')}</Typography>
          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>{t('usageReports.noData')}</Typography>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={overTime} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="tealFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={teal} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={teal} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="calls" name={t('usageReports.calls')} stroke={teal} strokeWidth={2} fill="url(#tealFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Paper>

        <Paper elevation={0} sx={card}>
          <Typography variant="h6" sx={cardTitle}>{t('usageReports.byStatus')}</Typography>
          {byStatus.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>{t('usageReports.noData')}</Typography>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={byStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={88}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {byStatus.map((d) => <Cell key={d.key} fill={statusColors[d.key] || theme.palette.grey[400]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
          {/* legend */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
            {byStatus.map((d) => (
              <Box key={d.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: statusColors[d.key] || 'grey.400' }} />
                <Typography variant="caption" color="text.secondary">{d.name} · {d.value}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      </Box>

      {/* Busiest hours + top destinations */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' } }}>
        <Paper elevation={0} sx={card}>
          <Typography variant="h6" sx={cardTitle}>{t('usageReports.busiestHours')}</Typography>
          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>{t('usageReports.noData')}</Typography>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byHour} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="calls" name={t('usageReports.calls')} fill={teal} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Paper>

        <Paper elevation={0} sx={card}>
          <Typography variant="h6" sx={cardTitle}>{t('usageReports.topDestinations')}</Typography>
          {topDest.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>{t('usageReports.noData')}</Typography>
          ) : (
            <Box>
              {topDest.map((d, i) => {
                const max = topDest[0].count || 1;
                return (
                  <Box key={d.number} sx={{ py: 1, borderBottom: i < topDest.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} noWrap>{d.number}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{d.count}</Typography>
                    </Box>
                    <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
                      <Box sx={{ height: '100%', width: `${(d.count / max) * 100}%`, bgcolor: 'primary.main', borderRadius: 3 }} />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
