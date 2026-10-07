import { Paper, Typography, useMediaQuery } from '@mui/material';
import LtrIsland from '../../i18n/LtrIsland';
import { useTheme } from '@mui/material/styles';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';

/**
 * CallsPerHourChart — inbound/outbound call volume bucketed by hour.
 * Ported from app (i18n stripped, simplified to the single data shape
 * useDashboardSnapshot produces — no raw-calls client bucketing fallback,
 * since the backend already returns bucketed points here).
 */
export default function CallsPerHourChart({ points = [], title = 'Calls per hour', variant = 'bar' }) {
  const theme = useTheme();
  // A 300px-tall chart eats most of a phone screen before the numbers below
  // it are even reachable; shrink it (and thin the hour labels) below `sm`.
  const isNarrow = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const data = Array.isArray(points) ? points.slice(-24) : [];

  return (
    <Paper elevation={0} sx={{ p: { xs: 1.75, sm: 2.5 }, height: '100%', minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>{title}</Typography>
      {data.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          No call data yet.
        </Typography>
      ) : (
        <LtrIsland>
          <ResponsiveContainer width="100%" height={isNarrow ? 220 : 300}>
            {variant === 'line' ? (
              <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: isNarrow ? 10 : 12, fill: theme.palette.text.secondary }} interval={isNarrow ? 2 : 'preserveEnd'} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
                <Tooltip contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="inbound" name="Inbound" stroke={theme.palette.info.main} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="outbound" name="Outbound" stroke={theme.palette.success.main} strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: isNarrow ? 10 : 12, fill: theme.palette.text.secondary }}
                  interval={isNarrow ? 2 : 'preserveEnd'}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
                <Tooltip
                  contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="inbound" name="Inbound" stackId="calls" fill={theme.palette.info.main} radius={[2, 2, 0, 0]} />
                <Bar dataKey="outbound" name="Outbound" stackId="calls" fill={theme.palette.success.main} radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </LtrIsland>
      )}
    </Paper>
  );
}
