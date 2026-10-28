import { useMemo } from 'react';
import { Box, Paper, Typography, Chip, CircularProgress, IconButton, Tooltip as MuiTooltip } from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { formatDate, formatDayMonth, formatTime } from '../../../utils/dateUtils';
import { useTranslation } from 'react-i18next';

/** Color palette for multi-series lines */
const HOST_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
];

const tooltipStyle = {
  backgroundColor: 'var(--theme-bg-primary)',
  border: '1px solid var(--theme-border)',
  borderRadius: '8px', fontSize: '0.8rem',
};

/** Format x-axis tick based on time range */
const formatXAxis = (timeRange) => (tickItem) => {
  if (!tickItem) return '';
  if (!formatTime(tickItem)) return tickItem;
  if (timeRange === 'week' || timeRange === 'month') return formatDayMonth(tickItem);
  return formatTime(tickItem);
};

/** Format bytes to human readable */
export const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

/**
 * ChartPanel — Recharts area/line chart rendered from integration config
 *
 * Props:
 *   title        — chart panel title
 *   data         — raw chart data array from API
 *   series       — array of { field, name, color }
 *   timeRange    — current time range key
 *   yUnit        — y-axis unit string (%, B, ms, etc.)
 *   yDomain      — [min, max] for y-axis (optional)
 *   threshold    — horizontal reference line value (optional)
 *   loading      — boolean
 *   formatter    — custom tooltip value formatter (optional)
 *   chartType    — 'area' | 'line' (default: 'area' for single series, 'line' for multi)
 *   groupBy      — field to group/pivot by (e.g. 'host', 'container_name')
 */
const ChartPanel = ({
  title, data = [], series = [], timeRange = 'day',
  yUnit = '', yDomain, threshold, loading,
  formatter, chartType, groupBy, onEditQuery,
}) => {
  const { t } = useTranslation();
  const xAxisFormatter = useMemo(() => formatXAxis(timeRange), [timeRange]);

  // Pivot data by groupBy field when provided (multi-host line chart)
  const { pivotedData, groupKeys } = useMemo(() => {
    if (!groupBy || !data.length) return { pivotedData: data, groupKeys: [] };

    const groups = [...new Set(data.map(p => p[groupBy]).filter(Boolean))];
    if (groups.length <= 1 && series.length > 0) return { pivotedData: data, groupKeys: [] };

    // Build pivoted data: { time, groupVal_field: value, ... }
    const byTime = {};
    data.forEach(point => {
      const t = point.time;
      if (!t) return;
      if (!byTime[t]) byTime[t] = { time: t };
      const group = point[groupBy];
      if (!group) return;
      series.forEach(s => {
        byTime[t][`${group}_${s.field}`] = point[s.field] ?? 0;
      });
    });
    return {
      pivotedData: Object.values(byTime).sort((a, b) => new Date(a.time) - new Date(b.time)),
      groupKeys: groups,
    };
  }, [data, groupBy, series]);

  const isEmpty = !pivotedData.length;

  // Determine actual tooltip formatter
  const valueFormatter = formatter || (yUnit === 'B' ? (v) => formatBytes(v) : undefined);

  // Determine chart type
  const useArea = chartType === 'area' || (!chartType && !groupKeys.length && series.length <= 2);

  return (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid var(--theme-border)', borderRadius: '12px', backgroundColor: 'var(--theme-bg-primary)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'var(--theme-text-primary)' }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {threshold != null && (
            <Chip label={t('chart.threshold', { value: `${threshold}${yUnit}` })} size="small" color="warning" variant="outlined" sx={{ fontSize: '0.7rem' }} />
          )}
          {onEditQuery && (
            <MuiTooltip title="Edit this chart's InfluxQL query">
              <IconButton size="small" onClick={onEditQuery} sx={{ color: 'var(--theme-text-secondary)' }}>
                <CodeIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </MuiTooltip>
          )}
        </Box>
      </Box>

      {loading && isEmpty ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : isEmpty ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
          <Typography variant="body2" color="text.secondary">{t('chart.noData')}</Typography>
        </Box>
      ) : groupKeys.length > 0 ? (
        /* Multi-group line chart */
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={pivotedData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
            <XAxis dataKey="time" tickFormatter={xAxisFormatter} tick={{ fontSize: 11, fill: 'var(--theme-text-secondary)' }} />
            <YAxis domain={yDomain || ['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--theme-text-secondary)' }} unit={yUnit} tickFormatter={valueFormatter} />
            <RechartsTooltip contentStyle={tooltipStyle} labelFormatter={(l) => formatDate(l)} formatter={valueFormatter} />
            <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
            {threshold != null && <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `${threshold}${yUnit}`, position: 'right', fill: '#ef4444', fontSize: 11 }} />}
            {groupKeys.map((group, gi) =>
              series.map((s, si) => (
                <Line key={`${group}_${s.field}`} type="monotone"
                  dataKey={`${group}_${s.field}`}
                  name={`${group} ${s.name}`}
                  stroke={s.color || HOST_COLORS[(gi * series.length + si) % HOST_COLORS.length]}
                  strokeWidth={1.5} dot={false}
                />
              ))
            )}
          </LineChart>
        </ResponsiveContainer>
      ) : useArea ? (
        /* Single/dual series area chart */
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={pivotedData}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={`grad_${s.field}`} id={`grad_${s.field}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.color || HOST_COLORS[i]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={s.color || HOST_COLORS[i]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
            <XAxis dataKey="time" tickFormatter={xAxisFormatter} tick={{ fontSize: 11, fill: 'var(--theme-text-secondary)' }} />
            <YAxis domain={yDomain || ['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--theme-text-secondary)' }} unit={yUnit} tickFormatter={valueFormatter} />
            <RechartsTooltip contentStyle={tooltipStyle} labelFormatter={(l) => formatDate(l)} formatter={valueFormatter} />
            <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
            {threshold != null && <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `${threshold}${yUnit}`, position: 'right', fill: '#ef4444', fontSize: 11 }} />}
            {series.map((s, i) => (
              <Area key={s.field} type="monotone" dataKey={s.field} name={s.name}
                stroke={s.color || HOST_COLORS[i]} fill={`url(#grad_${s.field})`} strokeWidth={2} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        /* Multi-series line chart (no grouping) */
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={pivotedData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" />
            <XAxis dataKey="time" tickFormatter={xAxisFormatter} tick={{ fontSize: 11, fill: 'var(--theme-text-secondary)' }} />
            <YAxis domain={yDomain || ['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--theme-text-secondary)' }} unit={yUnit} tickFormatter={valueFormatter} />
            <RechartsTooltip contentStyle={tooltipStyle} labelFormatter={(l) => formatDate(l)} formatter={valueFormatter} />
            <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
            {threshold != null && <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `${threshold}${yUnit}`, position: 'right', fill: '#ef4444', fontSize: 11 }} />}
            {series.map((s, i) => (
              <Line key={s.field} type="monotone" dataKey={s.field} name={s.name}
                stroke={s.color || HOST_COLORS[i]} strokeWidth={1.5} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Paper>
  );
};

export default ChartPanel;
