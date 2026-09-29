import { render, screen, waitFor, within } from '@testing-library/react';
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

const scope = vi.fn();
vi.mock('../../context/CustomerEnvironmentContext.jsx', () => ({ useCustomerEnvironment: () => scope() }));

import AdminDashboard, { DASHBOARD_SEED } from './AdminDashboard.jsx';

// The CDR report answers by what it was asked: totals for the KPI tiles, one
// row per environment, status per hour, top callers/callees.
const report = async ({ dimensions = [], bucket = '' }) => {
  if (!dimensions.length) return { rows: [{ calls: 40, answer_rate: 75, billsec: 3725, avg_talk: 85, avg_wait: 9, service_level: 60 }], labels: {}, sql: 'SELECT COUNT(*) AS a_calls FROM cdr' };
  if (dimensions[0] === 'environment') return { rows: [{ environment: 'env-1', calls: 40, answered: 30, answer_rate: 75, billsec: 3725 }], labels: { environment: { 'env-1': 'Main office' } }, sql: '' };
  if (bucket) return { rows: [{ status: 'answer', time: '2026-09-28T10:00:00', calls: 30 }], labels: {}, sql: '' };
  return { rows: [{ [dimensions[0]]: '0241432120', calls: 12, billsec: 600, answer_rate: 50 }], labels: {}, sql: '' };
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.mockReturnValue({ isRoot: false, accountUuid: 'acct-1' });
  monitoringApi.runCdrReport.mockImplementation(report);
});

describe('AdminDashboard', () => {
  it('puts the query editor at the top and call reports on the board', async () => {
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [{ uuid: 'env-1', name: 'main' }] });
    render(<AdminDashboard />);

    const page = screen.getByTestId('admin-dashboard-page');
    expect(page).toHaveTextContent('Activity for acme · all applications');
    expect(screen.getByTestId('cdr-editor')).toBeInTheDocument();
    const grid = await screen.findByTestId('widget-grid');
    for (const title of ['Today at a glance', 'Calls by environment', 'Status over time', 'Top callers', 'Top callees']) {
      expect(within(grid).getByText(title)).toBeInTheDocument();
    }
    // The reports plus the board's own starter widgets, every one editable.
    expect(within(grid).getAllByRole('button', { name: 'Widget actions' }).length).toBeGreaterThanOrEqual(DASHBOARD_SEED.widgets.length);
  });

  it('reads the reports for the selected customer and shows real numbers', async () => {
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [{ uuid: 'env-1', name: 'main' }] });
    render(<AdminDashboard />);

    await waitFor(() => expect(monitoringApi.runCdrReport).toHaveBeenCalledWith(expect.objectContaining({
      dimensions: ['environment'], customerUuid: 'c-1',
    })));
    const grid = await screen.findByTestId('widget-grid');
    // Answer rate on the KPI tiles and in the per-environment table.
    expect((await within(grid).findAllByText('75%')).length).toBeGreaterThanOrEqual(2);
    expect(within(grid).getAllByText('1h 2m').length).toBeGreaterThanOrEqual(1);
    expect(await within(grid).findByText('Main office')).toBeInTheDocument();
  });

  it('reports on every customer for a root admin with no selection', async () => {
    auth.mockReturnValue({ isRoot: true, accountUuid: 'acct-1' });
    scope.mockReturnValue({ selectedCustomer: null, selectedEnvironments: [] });
    render(<AdminDashboard />);

    await waitFor(() => expect(monitoringApi.runCdrReport).toHaveBeenCalled());
    expect(monitoringApi.runCdrReport.mock.calls[0][0]).not.toHaveProperty('customerUuid');
    expect(monitoringApi.runCdrReport.mock.calls[0][0].environmentUuids).toEqual([]);
    expect(screen.getByText(/Every customer/)).toBeInTheDocument();
  });

  it('asks for a selection instead of querying when there is none', async () => {
    scope.mockReturnValue({ selectedCustomer: null, selectedEnvironments: [] });
    render(<AdminDashboard />);

    expect((await screen.findAllByText('Select a customer or application in the top bar.')).length).toBeGreaterThan(0);
    expect(monitoringApi.runCdrReport).not.toHaveBeenCalled();
  });

  it('adds the starter reports once: a deleted one stays deleted', async () => {
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [] });
    const { unmount } = render(<AdminDashboard />);
    await screen.findByText('Top callees');
    unmount();

    const key = 'dashboard-definitions:admin-metrics:acct-1';
    const store = JSON.parse(localStorage.getItem(key));
    store.widgets.default = store.widgets.default.filter((w) => w.title !== 'Top callees');
    localStorage.setItem(key, JSON.stringify(store));

    render(<AdminDashboard />);
    await screen.findByText('Top callers');
    expect(screen.queryByText('Top callees')).not.toBeInTheDocument();
  });
});
