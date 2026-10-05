import React, { useMemo } from 'react';
import { Paper, Typography, CircularProgress } from '@mui/material';
import LtrIsland from '../../i18n/LtrIsland.jsx';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Severity color mapping for chart lines
const SEVERITY_COLORS = {
  emerg: '#991b1b',
  emergency: '#991b1b',
  alert: '#b91c1c',
  crit: '#dc2626',
  critical: '#dc2626',
  error: '#ea580c',
  err: '#ea580c',
  warning: '#ca8a04',
  warn: '#ca8a04',
  notice: '#2563eb',
  info: '#0891b2',
  debug: '#16a34a',
  trace: '#805ad5',
};

// Helper to format time labels based on interval
function formatTimeLabel(isoTime, interval) {
  const date = new Date(isoTime);
  if (isNaN(date.getTime())) return isoTime;

  switch (interval) {
    case 'minute':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    case 'hour':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    case 'day':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    default:
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
}

const SeverityLineChart = ({ data, loading, height = 250, timeInterval = 'hour' }) => {
  // Transform raw data into chart-ready format
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Group by time interval
    const groupedData = {};
    const severities = new Set();

    data.forEach(item => {
      // Get time from item - handle both 'time' and 'timestamp' fields
      const timeValue = item.time || item.timestamp;
      if (!timeValue) return;

      // Determine the time bucket based on interval
      let timeBucket;
      const date = new Date(timeValue);
      if (isNaN(date.getTime())) return;

      switch (timeInterval) {
        case 'minute':
          timeBucket = new Date(date.getFullYear(), date.getMonth(), date.getDate(),
                               date.getHours(), date.getMinutes()).toISOString();
          break;
        case 'hour':
        default:
          timeBucket = new Date(date.getFullYear(), date.getMonth(), date.getDate(),
                               date.getHours()).toISOString();
          break;
        case 'day':
          timeBucket = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
          break;
      }

      if (!groupedData[timeBucket]) {
        groupedData[timeBucket] = { time: timeBucket };
      }

      // Handle both 'severity' and legacy 'action'/'priority' fields
      const severity = (item.severity || item.action || item.priority || 'unknown').toLowerCase();
      severities.add(severity);
      groupedData[timeBucket][severity] = (groupedData[timeBucket][severity] || 0) + 1;
    });

    // Convert to array and sort by time
    return Object.values(groupedData)
      .sort((a, b) => new Date(a.time) - new Date(b.time))
      .map(item => ({
        ...item,
        displayTime: formatTimeLabel(item.time, timeInterval),
      }));
  }, [data, timeInterval]);

  const severityKeys = useMemo(() => {
    const keys = new Set();
    chartData.forEach(item => {
      Object.keys(item).forEach(key => {
        if (key !== 'time' && key !== 'displayTime') {
          keys.add(key);
        }
      });
    });
    // Sort by severity level (most severe first)
    const severityOrder = ['emerg', 'emergency', 'alert', 'crit', 'critical', 'error', 'err', 'warning', 'warn', 'notice', 'info', 'debug', 'trace'];
    return Array.from(keys).sort((a, b) => {
      const aIndex = severityOrder.indexOf(a);
      const bIndex = severityOrder.indexOf(b);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
  }, [chartData]);

  if (loading) {
    return (
      <Paper elevation={2} sx={{ p: 2, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={24} />
        <Typography variant="body2" sx={{ ml: 2 }}>Loading chart data...</Typography>
      </Paper>
    );
  }

  if (chartData.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">No data available for chart</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
        Log Severity Over Time
      </Typography>
      {/* LtrIsland: the x-axis is time, and time reads left-to-right in every
          locale. Without this the RTL cache mirrors the plot and the series
          runs backwards. */}
      <LtrIsland sx={{ width: '100%', height, m: 0 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis
              dataKey="displayTime"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: '12px' }}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Legend />
            {severityKeys.map((severity) => (
              <Line
                key={severity}
                type="monotone"
                dataKey={severity}
                name={severity.charAt(0).toUpperCase() + severity.slice(1)}
                stroke={SEVERITY_COLORS[severity] || '#6b7280'}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </LtrIsland>
    </Paper>
  );
};

export default SeverityLineChart;
