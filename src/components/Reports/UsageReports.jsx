// Reports — server-side reports engine (voipappz-api), nimbus-admin's model.
//
// Previously this screen loaded the calls list and aggregated it client-side, so
// it could only ever describe the rows the browser happened to have (one page).
// Now the ENGINE aggregates: GET /api/reports/dashboards gives the categories,
// and /api/reports/dashboards/:category returns each report as
// {columns, rows, chart}, which ReportChart renders directly. Adding a report
// server-side needs no code here — it just appears.
import { useTranslation } from 'react-i18next';
import PageHeader from '../common/PageHeader';
import ReportsDashboards from './ReportsDashboards';

export default function UsageReports() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('menu.reports')} subtitle={t('usageReports.subtitle')} />
      <ReportsDashboards period="d7" />
    </>
  );
}
