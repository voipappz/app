import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../hooks/useLiveEntities', () => ({
  default: (environmentUuid) => ({
    connected: Boolean(environmentUuid), error: null, rows: [],
    byScope: () => (environmentUuid ? [{ live_calls_current: 3, call_incoming_count: 2, call_outgoing_count: 1 }] : []),
  }),
}));
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
const auth = vi.fn(() => ({ isRoot: false, accountUuid: 'acct-1' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth() }));
vi.mock('../../services/api/identityReportApi', () => ({
  identityReportApi: { runReport: vi.fn(), getCatalog: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../../services/api/monitoringApi', () => ({
  monitoringApi: {
    runCdrReport: vi.fn(),
    getCdrCatalog: vi.fn().mockResolvedValue(null),
    runCdrSql: vi.fn(),
    getInfluxSchema: vi.fn().mockResolvedValue([]),
    runInfluxQuery: vi.fn().mockResolvedValue({ rows: [] }),
    getInfluxRows: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));
// jsdom has no width; pin the desktop board.
vi.mock('react-grid-layout', async (importOriginal) => ({
  ...(await importOriginal()),
  useContainerWidth: () => ({ width: 1280, containerRef: { current: null }, mounted: true }),
}));
vi.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass, AreaChart: Pass, LineChart: Pass, BarChart: Pass, PieChart: Pass,
    Area: () => null, Line: () => null, Bar: () => null, Pie: () => null, Cell: () => null,
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  };
});
import { monitoringApi } from '../../services/api/monitoringApi';
import { identityReportApi } from '../../services/api/identityReportApi';

const scope = vi.fn();
vi.mock('../../context/CustomerEnvironmentContext.jsx', () => ({ useCustomerEnvironment: () => scope() }));

import AdminDashboard, { DASHBOARD_SEED } from './AdminDashboard.jsx';

// The identities report answers by what it was asked: totals for the tiles,
// one row per type, events per hour, top events, busiest hours.
const report = async ({ dimensions = [], bucket = '' }) => {
  if (!dimensions.length) return { rows: [{ events: 1234, identities: 56 }], labels: {}, sql: 'SELECT COUNT(*) AS a0 FROM identities' };
  if (bucket) return { rows: [{ type: 'queue', time: '2026-10-28T10:00:00', events: 30 }], labels: {}, sql: '' };
  if (dimensions[0] === 'type') return { rows: [{ type: 'queue', events: 300, identities: 4 }, { type: 'user', events: 200, identities: 9 }], labels: {}, sql: '' };
  return { rows: [{ [dimensions[0]]: dimensions[0] === 'hour' ? 9 : 'user.answer', events: 120 }], labels: {}, sql: '' };
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.mockReturnValue({ isRoot: false, accountUuid: 'acct-1' });
  identityReportApi.runReport.mockImplementation(report);
});

describe('AdminDashboard', () => {
  it('is the activity board: identity reports on it, no call reports, no InfluxDB', async () => {
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [{ uuid: 'env-1', name: 'main' }] });
    render(<AdminDashboard />);

    expect(screen.getByTestId('admin-dashboard-page')).toHaveTextContent('Activity for acme · all applications');
    const grid = await screen.findByTestId('widget-grid');
    for (const title of ['Activity today', 'Activity by type', 'Activity over time', 'Top events', 'Busiest hours']) {
      expect(within(grid).getByText(title)).toBeInTheDocument();
    }
    expect(within(grid).getAllByRole('button', { name: 'Widget actions' })).toHaveLength(DASHBOARD_SEED.widgets.length);
    await waitFor(() => expect(identityReportApi.runReport).toHaveBeenCalled());
    expect(monitoringApi.runCdrReport).not.toHaveBeenCalled();
    expect(monitoringApi.runInfluxQuery).not.toHaveBeenCalled();
  });

  it('reads the reports for the selected customer and shows real numbers', async () => {
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [{ uuid: 'env-1', name: 'main' }] });
    render(<AdminDashboard />);

    await waitFor(() => expect(identityReportApi.runReport).toHaveBeenCalledWith(expect.objectContaining({
      dimensions: ['type'], customerUuid: 'c-1',
    })));
    const grid = await screen.findByTestId('widget-grid');
    expect(await within(grid).findByText('1,234')).toBeInTheDocument();
    expect(await within(grid).findByText('queue')).toBeInTheDocument();
  });

  it('builds an activity report from Build widget, and offers no call report', async () => {
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [] });
    const user = userEvent.setup();
    render(<AdminDashboard />);
    await screen.findByText('Busiest hours');

    await user.click(screen.getByTestId('build-widget'));
    expect(screen.queryByRole('menuitem', { name: /Call report/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Activity report/ }));
    const builder = await screen.findByTestId('cdr-editor');
    await user.type(within(builder).getByLabelText('Widget title'), 'Queue activity');
    await user.click(within(builder).getByRole('button', { name: 'Save as widget' }));

    await waitFor(() => expect(screen.queryByTestId('cdr-editor')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('widget-grid')).getByText('Queue activity')).toBeInTheDocument();
  });

  it('says the server lacks activity reports instead of a raw 404', async () => {
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [] });
    identityReportApi.runReport.mockRejectedValue(Object.assign(new Error('Failed running identities report: HTTP 404: {}'), { status: 404 }));
    render(<AdminDashboard />);

    expect((await screen.findAllByText(/Activity reports aren’t available on this server yet/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/HTTP 404/)).not.toBeInTheDocument();
  });

  it('reports on every customer for a root admin with no selection', async () => {
    auth.mockReturnValue({ isRoot: true, accountUuid: 'acct-1' });
    scope.mockReturnValue({ selectedCustomer: null, selectedEnvironments: [] });
    render(<AdminDashboard />);

    await waitFor(() => expect(identityReportApi.runReport).toHaveBeenCalled());
    expect(identityReportApi.runReport.mock.calls[0][0]).not.toHaveProperty('customerUuid');
    expect(identityReportApi.runReport.mock.calls[0][0].environmentUuids).toEqual([]);
    expect(screen.getByText(/Every customer/)).toBeInTheDocument();
  });

  it('asks for a selection instead of querying when there is none', async () => {
    scope.mockReturnValue({ selectedCustomer: null, selectedEnvironments: [] });
    render(<AdminDashboard />);

    expect((await screen.findAllByText('Select a customer or application in the top bar.')).length).toBeGreaterThan(0);
    expect(identityReportApi.runReport).not.toHaveBeenCalled();
  });

  it('starts its own board, and adds the starter reports once: a deleted one stays deleted', async () => {
    localStorage.setItem('dashboard-definitions:admin-metrics:acct-1', JSON.stringify({ widgets: { default: [{ uuid: 'old', type: 'cdr', title: 'Old call report', measures: ['calls'] }] }, seeded: [] }));
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [] });
    const { unmount } = render(<AdminDashboard />);
    await screen.findByText('Busiest hours');
    // The old board stays where it was: it is the Monitoring page's Metrics tab now.
    expect(screen.queryByText('Old call report')).not.toBeInTheDocument();
    unmount();

    const key = 'dashboard-definitions:admin-identities:acct-1';
    const store = JSON.parse(localStorage.getItem(key));
    store.widgets.default = store.widgets.default.filter((w) => w.title !== 'Busiest hours');
    localStorage.setItem(key, JSON.stringify(store));

    render(<AdminDashboard />);
    await screen.findByText('Top events');
    expect(screen.queryByText('Busiest hours')).not.toBeInTheDocument();
  });
});
