// Reports — server-side reports engine (voipappz-api), nimbus-admin's model.
//
// Previously this screen loaded the calls list and aggregated it client-side, so
// it could only ever describe the rows the browser happened to have (one page).
// Now the ENGINE aggregates: GET /api/reports/dashboards gives the categories,
// and /api/reports/dashboards/:category returns each report as
// {columns, rows, chart}, which ReportChart renders directly. Adding a report
// server-side needs no code here — it just appears.
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import PageHeader from '../common/PageHeader';
import ReportsDashboards from './ReportsDashboards';

export default function UsageReports() {
  const { t } = useTranslation();
  return (
    // Same page frame as Calls/Dashboard — without it the reports sat flush
    // against the viewport edge, which is unreadable on a phone.
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1440, mx: 'auto', minWidth: 0 }}>
      <PageHeader title={t('menu.reports')} subtitle={t('usageReports.subtitle')} />
      <ReportsDashboards period="d7" />
    </Box>
  );
}
