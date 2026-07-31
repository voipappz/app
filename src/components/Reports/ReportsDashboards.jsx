// ReportsDashboards — the "home look" from nimbus-admin: icon tabs per report
// category (with counts), a counter strip of single-number reports, then a grid
// of charts. All aggregation happens SERVER-side in the reports engine; this
// component just renders whatever {columns, rows, chart} comes back.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Tabs, Tab, Paper, Typography, CircularProgress, Alert,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import CallIcon from '@mui/icons-material/Call';
import GroupsIcon from '@mui/icons-material/Groups';
import DevicesIcon from '@mui/icons-material/Devices';
import HubIcon from '@mui/icons-material/Hub';
import LoyaltyIcon from '@mui/icons-material/Loyalty';
import TableChartIcon from '@mui/icons-material/TableChart';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { getDashboards, runCategory } from '../../services/reportsApi';
import ReportChart, { ReportCard, splitColumns, SERIES_COLORS } from './ReportChart';

const CATEGORY_ICONS = {
  calls: CallIcon,
  queue: GroupsIcon,
  extensions: DevicesIcon,
  providers: HubIcon,
  billing: LoyaltyIcon,
  table: TableChartIcon,
};

// Period → {startDate, endDate} in epoch SECONDS for the engine.
export const PERIODS = {
  today: 1,
  d7: 7,
  d30: 30,
};
export function periodRange(period) {
  if (!PERIODS[period]) return {};                       // 'all' → engine default
  const end = Math.floor(Date.now() / 1000);
  return { startDate: end - PERIODS[period] * 86400, endDate: end };
}

/** A report whose result is one number → rendered big in the counter strip. */
function isCounter(report) {
  if (report?.error) return false;
  const { series } = splitColumns(report?.columns, report?.rows);
  return report?.rows?.length === 1 && series.length === 1;
}
function counterValue(report) {
  const { series } = splitColumns(report.columns, report.rows);
  return Number(report.rows[0]?.[series[0]] ?? 0);
}

export default function ReportsDashboards({ period = 'd7' }) {
  const [dashboards, setDashboards] = useState([]);
  const [active, setActive] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [localPeriod, setLocalPeriod] = useState(period);

  // Tabs: the categories the engine exposes.
  useEffect(() => {
    let dead = false;
    getDashboards()
      .then((d) => {
        if (dead) return;
        setDashboards(d);
        setActive((cur) => cur ?? d[0]?.category ?? null);
        setError(null);
      })
      .catch((e) => { if (!dead) setError(String(e)); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, []);

  // Data for the selected category + period.
  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const r = await runCategory(active, periodRange(localPeriod));
      setReports(r);
      setError(null);
    } catch (e) {
      setError(String(e));
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [active, localPeriod]);

  useEffect(() => { load(); }, [load]);

  const { counters, charts } = useMemo(() => ({
    counters: reports.filter(isCounter),
    charts: reports.filter((r) => !isCounter(r)),
  }), [reports]);

  if (error && !dashboards.length) return <Alert severity="warning">{error}</Alert>;

  if (!loading && !dashboards.length) {
    return (
      <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <AssessmentIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
        <Typography variant="body1" sx={{ fontWeight: 500 }}>No report dashboards defined</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Add a categorized report to the reports configuration and it will appear here.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Tabs
          value={active ?? false}
          onChange={(_e, v) => setActive(v)}
          variant="scrollable"
          scrollButtons="auto"
          data-testid="reports-tabs"
        >
          {dashboards.map((d) => {
            const Icon = CATEGORY_ICONS[d.category] || AssessmentIcon;
            return (
              <Tab
                key={d.category}
                value={d.category}
                icon={<Icon fontSize="small" />}
                iconPosition="start"
                label={`${d.category} (${d.count})`}
                sx={{ minHeight: 48, textTransform: 'capitalize' }}
              />
            );
          })}
        </Tabs>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={localPeriod}
          onChange={(_e, v) => v && setLocalPeriod(v)}
          data-testid="reports-period"
        >
          <ToggleButton value="today">Today</ToggleButton>
          <ToggleButton value="d7">7d</ToggleButton>
          <ToggleButton value="d30">30d</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          {error && <Alert severity="warning" sx={{ mt: 2 }}>{error}</Alert>}

          {/* Counter strip — one big number per single-value report. */}
          {counters.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2, mt: 2 }}>
              {counters.map((r, i) => (
                <Paper key={r.name} elevation={0}
                  sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
                    {counterValue(r).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{r.name}</Typography>
                </Paper>
              ))}
            </Box>
          )}

          {/* Chart grid — every other report, drawn from its own {columns, rows, chart}. */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 2 }}>
            {charts.map((r) => <ReportCard key={r.name} report={r} />)}
          </Box>

          {!counters.length && !charts.length && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No reports in this category.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

export { ReportChart };
