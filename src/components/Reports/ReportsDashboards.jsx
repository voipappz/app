import React, { useState, useEffect } from 'react';
import { Box, Paper, Tab, Typography, CircularProgress, Alert } from '@mui/material';
import SectionTabs from '../shared/SectionTabs.jsx';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import QueueIcon from '@mui/icons-material/Queue';
import DevicesIcon from '@mui/icons-material/Devices';
import LoyaltyIcon from '@mui/icons-material/Loyalty';
import HubIcon from '@mui/icons-material/Hub';
import TableViewIcon from '@mui/icons-material/TableView';

// Home-screen style: one icon per dashboard category
const CATEGORY_ICONS = {
  calls: <PhoneInTalkIcon />, queue: <QueueIcon />, extensions: <DevicesIcon />,
  billing: <LoyaltyIcon />, providers: <HubIcon />, table: <TableViewIcon />,
};
import ReportsPanel from './ReportsPanel/ReportsPanel.jsx';
import { reportsApi } from '../../services/api/reportsApi';

/**
 * ReportsDashboards — the Blazer-style VISUAL view of the Reports screen.
 * Every queries.yml category becomes a dashboard tab (chips, with report
 * counts); the selected category runs all of its reports server-side and
 * renders each as a card (table/pie/line/bar per the auto-detected chart)
 * via ReportsPanel — the same building block the per-screen report drawers
 * use, so a report added to queries.yml shows up here with no admin change.
 */
const ReportsDashboards = () => {
  const [dashboards, setDashboards] = useState([]);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    reportsApi.getDashboards()
      .then((res) => {
        if (cancelled) return;
        const list = res?.dashboards || [];
        // Biggest dashboards first; 'general' (untagged) last.
        list.sort((a, b) => (a.category === 'general') - (b.category === 'general') || b.count - a.count);
        setDashboards(list);
        setCategory((prev) => prev || list[0]?.category || null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load dashboards'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (error) return <Alert severity="error">{error}</Alert>;

  if (!dashboards.length) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, color: 'var(--mui-palette-text-secondary)' }}>
        <AssessmentIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
        <Typography variant="body1" sx={{ fontWeight: 500 }}>No report dashboards defined</Typography>
        <Typography variant="body2" sx={{ mt: 0.5, color: '#bbb' }}>
          Add a report with a :category: to queries.yml and it appears here.
        </Typography>
      </Box>
    );
  }

  return (
    <Paper sx={{ backgroundColor: 'var(--mui-palette-background-paper)', border: '1px solid var(--mui-palette-divider)', borderRadius: 2 }}>
      {/* Category tabs — same look as the old Home screen */}
      <SectionTabs
        value={category || false}
        onChange={(e, v) => setCategory(v)}
      >
        {dashboards.map((d) => (
          <Tab
            key={d.category}
            value={d.category}
            icon={CATEGORY_ICONS[d.category] || <AssessmentIcon />}
            iconPosition="start"
            label={`${d.category} (${d.count})`}
          />
        ))}
      </SectionTabs>

      <Box sx={{ p: 2 }}>
        {category && <ReportsPanel key={category} category={category} open homeStyle />}
      </Box>
    </Paper>
  );
};

export default ReportsDashboards;
