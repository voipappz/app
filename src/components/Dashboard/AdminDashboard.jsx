// The console's dashboard IS the widget board: every panel on it, including
// the calls panels this screen used to hard-code (totals, answered, calls over
// time, how they ended, live calls), is a widget that can be moved, resized,
// edited, duplicated or removed, and more are added from "Add widget". The
// page spans the full width of the window.
//
// Scope: calls widgets follow whatever the top bar has selected. A customer
// covers all of its applications; a ROOT admin with nothing selected gets the
// fleet (every customer) rather than an empty board. Metric widgets query the
// account's own data (see WidgetBoard).
import { Box, Button } from '@mui/material';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext.jsx';
import { usePermissions } from '../../hooks/usePermissions';
import PageHeader from '../common/PageHeader.jsx';
import WidgetBoard from '../DashboardBuilder/WidgetBoard';
import { applyTemplate } from '../DashboardBuilder/widgetTemplates';

// The starter board, placed on top once (dashboardWidgetsApi.seedWidgets) —
// call-centre reports from the CDR report, the same data the query editor
// reads. Boards that already carry the older calls panels keep them below.
// Layout is in board units: 4 columns, 120px rows.
export const DASHBOARD_SEED = {
  key: 'cdr-reports-v1',
  widgets: [
    { key: 'cdrKpis', layout: { x: 0, y: 0, col: 4, row: 2 } },
    { key: 'cdrByEnvironment', layout: { x: 0, y: 2, col: 2, row: 3 } },
    { key: 'cdrStatusOverTime', layout: { x: 2, y: 2, col: 2, row: 3 } },
    { key: 'cdrTopCallers', layout: { x: 0, y: 5, col: 2, row: 3 } },
    { key: 'cdrTopCallees', layout: { x: 2, y: 5, col: 2, row: 3 } },
  ],
};
const seed = {
  key: DASHBOARD_SEED.key,
  widgets: DASHBOARD_SEED.widgets.map(({ key, layout }) => ({ ...applyTemplate(key), layout })),
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { selectedCustomer, selectedEnvironments } = useCustomerEnvironment();
  const { isRoot, accountUuid } = useAuth();
  const { can } = usePermissions();
  const environment = selectedEnvironments?.[0] || null;
  const fleet = Boolean(isRoot && !selectedCustomer?.uuid && !environment?.uuid);
  const scopeName = selectedCustomer?.uuid && selectedCustomer?.name
    ? `${selectedCustomer.name} · all applications`
    : environment?.name || selectedCustomer?.name || '';
  const subtitle = scopeName ? `Activity for ${scopeName}`
    : fleet ? 'Every customer — select one in the top bar to narrow it'
    : 'Select a customer or application in the top bar';
  // A customer covers every one of its applications; one application is
  // passed down only when no customer is selected (and to live calls).
  const callsScope = {
    customerUuid: selectedCustomer?.uuid || null,
    environmentUuid: environment?.uuid || null,
    environmentUuids: (selectedEnvironments || []).map((env) => env?.uuid).filter(Boolean),
    fleet,
  };

  return (
    <Box data-testid="admin-dashboard-page" sx={{ p: { xs: 2, md: 3 }, width: '100%', boxSizing: 'border-box' }}>
      <PageHeader
        title="Dashboard"
        subtitle={subtitle}
        actions={can('calls', 'read') ? <Button variant="outlined" onClick={() => navigate('/calls')}>View call history</Button> : null}
      />
      {accountUuid && (
        <WidgetBoard key={accountUuid} storageScope={`admin-metrics:${accountUuid}`} callsScope={callsScope} seed={seed} heading={false} />
      )}
    </Box>
  );
}
