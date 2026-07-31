import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import PageHeader from '../common/PageHeader';
import { DashboardWidgets } from './widgets';

/**
 * End-user live dashboard.
 *
 * The dashboard definition is built and stored by the mature mothership API.
 * va-crystal resolves that definition against live PBX state and delivers the
 * ready widget stream over Cable. This app is intentionally only the renderer:
 * local DuckDB powers local event projections, but it does not invent a second
 * dashboard definition or duplicate the builder's business logic.
 */
export default function Dashboard() {
  const { t } = useTranslation();

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        title={t('dashboardLive.heading', 'Live dashboard')}
        subtitle={t('dashboardLive.subtitle', 'Your live queues, agents and call activity')}
      />
      <DashboardWidgets hideHeading />
    </Box>
  );
}
