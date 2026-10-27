import React, { useMemo } from 'react';
import { Box, Chip, Typography, CircularProgress, Alert } from '@mui/material';
import { ChartPanel } from '../Monitoring/widgets';
import { useLiveCharts } from './useLiveCharts';
import LtrIsland from '../../i18n/LtrIsland';

/**
 * Transforms API response format into flat array for ChartPanel:
 *   API: [{ name: 'incoming', series: [{ name: ts, value: N }] }, ...]
 *   ChartPanel: [{ time: ts, incoming: N, outgoing: M }, ...]
 */
function transformSeriesData(apiData) {
  if (!apiData?.length) return [];

  const byTime = {};
  apiData.forEach(({ name: seriesName, series }) => {
    if (!Array.isArray(series)) return;
    series.forEach(({ name: ts, value }) => {
      if (!ts) return;
      if (!byTime[ts]) byTime[ts] = { time: ts };
      byTime[ts][seriesName] = value ?? 0;
    });
  });

  return Object.values(byTime).sort((a, b) => new Date(a.time) - new Date(b.time));
}

// Stable palette cycled through for auto-generated series. Kept distinct from the hand-picked
// palettes used in named series so auto vs. explicit charts feel visually separate.
const AUTO_PALETTE = [
  '#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#a855f7',
];

/**
 * Derive a series config from response keys when the caller doesn't know the set in advance
 * (e.g. CDR breakdown by disposition/cause/sip_status — series are data-driven tag values).
 */
function deriveSeries(apiData) {
  if (!apiData?.length) return [];
  const names = apiData
    .map((s) => s?.name)
    .filter((n) => n != null && n !== '' && n !== 'unknown');
  return names.map((name, idx) => ({
    field: name,
    name,
    color: AUTO_PALETTE[idx % AUTO_PALETTE.length],
  }));
}

/**
 * LiveChartStrip - Time series chart for Live screen tabs
 *
 * Props:
 *   chartType       - 'live_calls' | 'live_registrations' | 'cdr' | 'cdr_by_*' | ...
 *   series          - array of { field, name, color }. Omit (or pass null) with autoSeries=true
 *                     to derive the series set from the response.
 *   autoSeries      - if true, derive series from the response data (tag-driven breakdowns).
 *   title           - chart title string
 */
const LiveChartStrip = ({ chartType, series, title, uuid = null, autoSeries = false }) => {
  const {
    chartData, loading, error, timeWindow, setTimeWindow, TIME_WINDOWS
  } = useLiveCharts(chartType, uuid);

  const flatData = useMemo(() => transformSeriesData(chartData), [chartData]);
  const effectiveSeries = useMemo(
    () => (autoSeries ? deriveSeries(chartData) : series),
    [autoSeries, chartData, series]
  );

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ color: 'var(--mui-palette-text-secondary)', fontWeight: 600 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, ms: 'auto' }}>
          {TIME_WINDOWS.map((tw) => (
            <Chip
              key={tw.label}
              label={tw.label}
              size="small"
              variant={timeWindow.label === tw.label ? 'filled' : 'outlined'}
              color={timeWindow.label === tw.label ? 'primary' : 'default'}
              onClick={() => setTimeWindow(tw)}
              sx={{ cursor: 'pointer', fontSize: '0.7rem', height: 24 }}
            />
          ))}
        </Box>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 1, py: 0 }}>
          {error}
        </Alert>
      )}

      {/* Time runs left to right in every language. */}
      <LtrIsland>
        <ChartPanel
          title=""
          data={flatData}
          series={effectiveSeries}
          timeRange={timeWindow.minutes <= 60 ? 'hour' : timeWindow.minutes <= 240 ? 'day' : 'week'}
          chartType="area"
          loading={loading}
        />
      </LtrIsland>
    </Box>
  );
};

export default LiveChartStrip;
