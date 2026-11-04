import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import AssessmentIcon from '@mui/icons-material/Assessment';
import StatChips from '../../shared/StatChips/StatChips.jsx';
import LiveDrawer from '../../Live/LiveDrawer.jsx';
import ReportsPanel from './ReportsPanel.jsx';
import { reportsApi } from '../../../services/api/reportsApi';

/**
 * ScreenReports — one-line per-screen reports pop-out. Renders a "Reports"
 * stat chip (count = how many queries.yml reports carry this :category:) that
 * opens a right drawer running the whole category via ReportsPanel.
 *
 * Usage: <ScreenReports category="billing" title="Billing Reports" />
 * Renders nothing when the category has no reports defined.
 */
const ScreenReports = ({ category, title, sx }) => {
  const { t } = useTranslation('reports');
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    reportsApi.getDashboards()
      .then((res) => {
        if (cancelled) return;
        const dash = (res?.dashboards || []).find((d) => d.category === category);
        setCount(dash ? dash.count : 0);
      })
      .catch(() => { if (!cancelled) setCount(0); });
    return () => { cancelled = true; };
  }, [category]);

  if (!count) return null; // no reports for this screen (or still loading)

  return (
    <>
      <StatChips
        sx={sx}
        items={[{
          key: 'reports',
          label: t('title'),
          value: count,
          icon: <AssessmentIcon />,
          color: '#0e9488',
          active: open,
          onClick: () => setOpen(true),
        }]}
      />
      <LiveDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={title || t('title')}
        icon={<AssessmentIcon sx={{ color: '#0e9488' }} />}
        count={count}
      >
        {open && <ReportsPanel category={category} open={open} />}
      </LiveDrawer>
    </>
  );
};

export default ScreenReports;
