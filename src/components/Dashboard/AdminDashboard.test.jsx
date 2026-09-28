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
    getCallsVolumeChart: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.mockReturnValue({ isRoot: false, accountUuid: 'acct-1' });
  monitoringApi.getCallsVolumeChart.mockImplementation(async (_env, _m, _b, _c, groupBy) => (
    groupBy === 'disposition'
      ? [{ time: '2026-09-28T10:00:00Z', answered: 3, no_answer: 1 }]
      : [{ time: '2026-09-28T10:00:00Z', inbound: 5, outbound: 2 }]
  ));
});

describe('AdminDashboard', () => {
  it('is all widgets: the calls panels are on the board', async () => {
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [{ uuid: 'env-1', name: 'main' }] });
    render(<AdminDashboard />);

    const page = screen.getByTestId('admin-dashboard-page');
    expect(page).toHaveTextContent('Activity for acme · all applications');
    const grid = await screen.findByTestId('widget-grid');
    for (const title of ['Calls', 'Answered', 'Live calls', 'How they ended', 'Calls by direction']) {
      expect(within(grid).getByText(title)).toBeInTheDocument();
    }
    // The calls panels plus the board's own starter widgets, every one editable.
    expect(within(grid).getAllByRole('button', { name: 'Widget actions' }).length).toBeGreaterThanOrEqual(DASHBOARD_SEED.widgets.length);
  });

  it('computes the numbers from the calls chart for the selected customer', async () => {
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [{ uuid: 'env-1', name: 'main' }] });
    render(<AdminDashboard />);

    await waitFor(() => expect(monitoringApi.getCallsVolumeChart).toHaveBeenCalledWith(null, 1440, '1h', 'c-1', 'direction'));
    expect(monitoringApi.getCallsVolumeChart).toHaveBeenCalledWith(null, 1440, '1h', 'c-1', 'disposition');
    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('charts every customer for a root admin with no selection', async () => {
    auth.mockReturnValue({ isRoot: true, accountUuid: 'acct-1' });
    scope.mockReturnValue({ selectedCustomer: null, selectedEnvironments: [] });
    render(<AdminDashboard />);

    await waitFor(() => expect(monitoringApi.getCallsVolumeChart).toHaveBeenCalledWith(null, 1440, '1h', null, 'direction'));
    expect(screen.getByText(/Every customer/)).toBeInTheDocument();
  });

  it('asks for a selection instead of querying when there is none', async () => {
    scope.mockReturnValue({ selectedCustomer: null, selectedEnvironments: [] });
    render(<AdminDashboard />);

    expect((await screen.findAllByText('Select a customer or application in the top bar.')).length).toBeGreaterThan(0);
    expect(monitoringApi.getCallsVolumeChart).not.toHaveBeenCalled();
  });

  it('adds the calls panels once: a deleted one stays deleted', async () => {
    scope.mockReturnValue({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, selectedEnvironments: [] });
    const { unmount } = render(<AdminDashboard />);
    await screen.findByText('How they ended');
    unmount();

    const key = 'dashboard-definitions:admin-metrics:acct-1';
    const store = JSON.parse(localStorage.getItem(key));
    store.widgets.default = store.widgets.default.filter((w) => w.title !== 'How they ended');
    localStorage.setItem(key, JSON.stringify(store));

    render(<AdminDashboard />);
    await screen.findByText('Calls by direction');
    expect(screen.queryByText('How they ended')).not.toBeInTheDocument();
  });
});
