import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, CircularProgress, IconButton, Tooltip, Select, MenuItem,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AssessmentIcon from '@mui/icons-material/Assessment';
import LiveDrawer from '../../Live/LiveDrawer.jsx';
import ReportsPanel, { ReportChart, isChartable, formatRange } from './ReportsPanel.jsx';
import { reportsApi } from '../../../services/api/reportsApi';

const PERIODS = [
  { key: 'today', labelKey: 'strip.period.today', seconds: 24 * 3600 },
  { key: '7d', labelKey: 'strip.period.days7', seconds: 7 * 24 * 3600 },
  { key: '30d', labelKey: 'strip.period.days30', seconds: 30 * 24 * 3600 },
];

/**
 * ReportsStrip — THE chart of a screen: one dropdown decides what it shows
 * (each queries.yml report of the screen's category), one period control
 * (Today/7d/30d), an expand action for the full report view (drawer with
 * tables), and a collapse chevron remembered per screen. Renders nothing when
 * the category has no reports. Same pattern on every screen that has reports.
 */
const ReportsStrip = ({ category, title, height = 140, sx }) => {
  const { t } = useTranslation('reports');
  const collapseKey = `reportsStrip:${category}:collapsed`;
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [activeName, setActiveName] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The window the displayed data actually covers, captured at fetch time.
  const [range, setRange] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(collapseKey) === '1'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(collapseKey, c ? '0' : '1'); } catch { /* storage unavailable */ }
      return !c;
    });
  };

  const fetchReports = useCallback(async () => {
    if (!category) return;
    setLoading(true);
    try {
      const now = Math.floor(Date.now() / 1000);
      const span = PERIODS.find((p) => p.key === period)?.seconds || PERIODS[0].seconds;
      setRange({ start: now - span, end: now });
      const res = await reportsApi.runDashboardCategory(category, { startDate: now - span, endDate: now });
      setReports(res?.reports || []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [category, period]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const chartable = useMemo(
    // Same test the panel uses — a report with no numeric series has no chart,
    // and the strip is chart-only (the table lives in the drawer).
    () => reports.filter((r) => !r.error && isChartable(r.chart, r.columns, r.rows)),
    [reports]
  );
  const active = useMemo(
    () => chartable.find((r) => r.name === activeName) || chartable[0] || null,
    [chartable, activeName]
  );

  if (!loading && !chartable.length) return null; // nothing to show for this screen

  return (
    <Paper
      elevation={0}
      sx={{
        flexShrink: 0, border: '1px solid var(--theme-border, #e0e0e0)', borderRadius: '8px',
        backgroundColor: 'var(--theme-bg-secondary, #fff)', px: 1.5, pt: 0.75, pb: collapsed ? 0.75 : 0.5, ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <AssessmentIcon sx={{ fontSize: 16, color: '#0e9488', opacity: 0.9 }} />
        {/* WHAT the chart shows — one dropdown, one entry per report */}
        <Select
          value={active?.name || ''}
          onChange={(e) => setActiveName(e.target.value)}
          size="small"
          sx={{
            height: 26, fontSize: '0.78rem', minWidth: 170, maxWidth: 280,
            // A long report name must not push the period/action controls off the strip.
            '& .MuiSelect-select': { py: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }}
        >
          {chartable.map((r) => (
            <MenuItem key={r.name} value={r.name} sx={{ fontSize: '0.8rem' }}>{r.name}</MenuItem>
          ))}
        </Select>
        <Box sx={{ flexGrow: 1 }} />
        {/* WHEN — the period control, and the dates it actually resolved to */}
        {range && (
          <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
            {formatRange(range.start, range.end)}
          </Typography>
        )}
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, v) => { if (v) setPeriod(v); }}
          size="small"
          sx={{ '& .MuiToggleButton-root': { py: 0.1, px: 1, fontSize: '0.7rem', textTransform: 'none', height: 24 } }}
        >
          {PERIODS.map((p) => <ToggleButton key={p.key} value={p.key}>{t(p.labelKey)}</ToggleButton>)}
        </ToggleButtonGroup>
        <Tooltip title={t('panel.refresh')}>
          <span>
            <IconButton size="small" onClick={fetchReports} disabled={loading} sx={{ color: 'var(--mui-palette-text-secondary)', p: 0.25 }}>
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('strip.openFull')}>
          <IconButton size="small" onClick={() => setDrawerOpen(true)} sx={{ color: 'var(--mui-palette-text-secondary)', p: 0.25 }}>
            <OpenInFullIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={collapsed ? t('strip.showChart') : t('strip.hideChart')}>
          <IconButton size="small" onClick={toggleCollapsed} sx={{ color: 'var(--mui-palette-text-secondary)', p: 0.25 }}>
            {collapsed ? <ExpandMoreIcon sx={{ fontSize: 17 }} /> : <ExpandLessIcon sx={{ fontSize: 17 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {!collapsed && (
        loading && !active ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
            <CircularProgress size={22} />
          </Box>
        ) : active ? (
          <ReportChart chart={active.chart} columns={active.columns} rows={active.rows} height={height} />
        ) : (
          <Typography variant="caption" sx={{ color: 'var(--mui-palette-text-secondary)', display: 'block', textAlign: 'center', py: 2 }}>
            {t('strip.noData')}
          </Typography>
        )
      )}

      {/* Full report view — every report incl. tables, in a drawer */}
      <LiveDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={title || t('title')}
        icon={<AssessmentIcon sx={{ color: '#0e9488' }} />}
        count={reports.length}
      >
        {drawerOpen && <ReportsPanel category={category} open={drawerOpen} />}
      </LiveDrawer>
    </Paper>
  );
};

export default ReportsStrip;
