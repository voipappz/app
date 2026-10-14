import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ToolDialog from '../../components/TopBar/ToolDialog.jsx';
import LogsScreen from './LogsScreen.jsx';
import { syslogsApi } from '../../services/api/syslogsApi';

vi.mock('../../services/api/syslogsApi', () => {
  const ok = (value) => vi.fn(() => Promise.resolve(value));
  const api = {
    fetchLogs: ok({ data: [], total: 0 }), fetchAggregate: ok({ data: [] }), fetchMetrics: ok({ data: [] }),
    getMonitoringStatus: ok({}), setMonitoring: ok({}), fetchAlerts: ok([]), fetchApps: ok([]), fetchNodes: ok([]),
    getTraceStatus: ok({}), enableTrace: ok({}), disableTrace: ok({}), getConsoleStatus: ok({}),
    fetchActions: ok([{ action: 'dialplan', count: 3 }, { action: 'sip_auth', count: 9 }]),
  };
  return { syslogsApi: api, default: api };
});
vi.mock('../../context/CustomerEnvironmentContext', () => ({
  useCustomerEnvironment: () => ({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, isRoot: true, selectedEnvironments: [] }),
}));

const line = (n, extra = {}) => ({ id: `l-${n}`, time: `2026-09-27T10:00:${String(n).padStart(2, '0')}Z`, severity: 'info', app: 'api', host: 'node-1', message: `line ${n} call_uuid=abc`, ...extra });
const page = (from, count) => Array.from({ length: count }, (_, i) => line(from + i));

beforeEach(() => {
  vi.clearAllMocks();
  syslogsApi.fetchLogs.mockImplementation(() => Promise.resolve({ data: [], total: 0 }));
});

// The top bar's Syslog button opens this screen inside the tool dialog; it has
// to render there, not only on its own route.
describe('Logs in the top-bar tool dialog', () => {
  it('renders the syslog screen inside the dialog', async () => {
    render(<ToolDialog title="Syslog" open onClose={vi.fn()}><LogsScreen /></ToolDialog>);

    expect(await screen.findByRole('dialog', { name: 'Syslog' })).toBeInTheDocument();
    expect(await screen.findByTestId('syslog-pagination')).toHaveTextContent('0–0 of 0');
  });
});

describe('Syslog paging', () => {
  it('pages through the server one page at a time, replacing the list', async () => {
    syslogsApi.fetchLogs.mockImplementation((params) => Promise.resolve(
      params.page === 1 ? { data: page(0, 100), total: 150 } : { data: page(100, 50), total: 150 },
    ));
    const user = userEvent.setup();
    render(<LogsScreen />);
    const pager = await screen.findByTestId('syslog-pagination');
    await waitFor(() => expect(pager).toHaveTextContent('1–100 of 150'));
    expect(screen.getAllByText(/line 0 call_uuid/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(pager).toHaveTextContent('101–150 of 150'));
    expect(syslogsApi.fetchLogs).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, per_page: 100 }));
    // The second page REPLACES the first.
    expect(screen.queryByText(/^line 0 call_uuid/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/line 149 call_uuid/).length).toBeGreaterThan(0);
  });
});

describe('Facets and the volume chart come from the server', () => {
  it('lists each facet\'s values with the server\'s counts, and filters on a click', async () => {
    syslogsApi.fetchAggregate.mockImplementation((params) => Promise.resolve({
      data: params.group_by === 'severity'
        ? [{ time: 't1', info: 40, err: 2 }, { time: 't2', info: 10 }]
        : params.group_by === 'app'
          ? [{ time: 't1', node: 30, api: 22 }]
          : [],
    }));
    syslogsApi.fetchApps.mockImplementation(() => Promise.resolve(['Node', 'api']));
    const user = userEvent.setup();
    render(<LogsScreen />);

    const facets = await screen.findByTestId('syslog-facets');
    // Summed over every bucket of the whole window, largest first.
    expect(await screen.findByRole('button', { name: 'Level info, 50' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Level err, 2' })).toBeInTheDocument();
    // The aggregate lowercases tags; the facet shows and filters by the real name.
    const nodeSource = await screen.findByRole('button', { name: 'Source Node, 30' });
    expect(facets).toContainElement(nodeSource);

    await user.click(nodeSource);
    await waitFor(() => expect(syslogsApi.fetchLogs).toHaveBeenLastCalledWith(expect.objectContaining({ app: 'Node', page: 1 })));
    // A facet's own filter is left out of its count, the others are applied.
    await waitFor(() => {
      const appCall = syslogsApi.fetchAggregate.mock.calls.map((c) => c[0]).filter((p) => p.group_by === 'app').pop();
      expect(appCall.app).toBeUndefined();
      const levelCall = syslogsApi.fetchAggregate.mock.calls.map((c) => c[0]).filter((p) => p.group_by === 'severity' && p.interval === 'day').pop();
      expect(levelCall.app).toBe('Node');
    });

    // Clicking the selected value clears it.
    await user.click(screen.getByRole('button', { name: 'Source Node, 30' }));
    await waitFor(() => expect(syslogsApi.fetchLogs.mock.calls.at(-1)[0].app).toBeUndefined());
  });

  it('charts the whole window from the server, split by the chosen facet', async () => {
    syslogsApi.fetchAggregate.mockImplementation(() => Promise.resolve({ data: [{ time: '2026-09-27T10:00:00Z', info: 7, err: 1 }] }));
    render(<LogsScreen />);
    const chart = await screen.findByTestId('syslog-volume');
    await waitFor(() => expect(chart).toHaveTextContent('8 in range'));
    expect(chart).toHaveTextContent('by level');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Split the volume chart by' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Server' }));
    await waitFor(() => expect(syslogsApi.fetchAggregate.mock.calls.some(([p]) => p.group_by === 'host' && p.interval !== 'day')).toBe(true));
  });
});

describe('Syslog filters from a log line', () => {
  it('filters by a value picked in Log details', async () => {
    syslogsApi.fetchLogs.mockImplementation(() => Promise.resolve({ data: [line(1)], total: 1 }));
    const user = userEvent.setup();
    render(<LogsScreen />);

    await user.click(await screen.findByText(/line 1/));
    await user.click(screen.getByRole('button', { name: 'Filter by server' }));
    await waitFor(() => expect(syslogsApi.fetchLogs).toHaveBeenLastCalledWith(expect.objectContaining({ host: 'node-1', page: 1 })));

    await user.click(await screen.findByText(/line 1/));
    await user.click(screen.getByRole('button', { name: 'Filter by call uuid' }));
    await waitFor(() => expect(syslogsApi.fetchLogs).toHaveBeenLastCalledWith(expect.objectContaining({ inline: 'call_uuid=abc' })));
  });
});

// A node's lines (and this API's for the same call) carry `session=<id>` and
// the message type (`kind=`/`action=`) as key=value extras; the screen shows
// them as chips and filters on them in one click.
describe('Calls and message types', () => {
  const nodeLine = line(1, {
    app: 'node', host: 'node-7c2cdba6', severity: 'warning',
    message: 'dialplan: Mothership refused the dialplan (404): extension_not_found session=c0ffee00-0000-4000-8000-000000000001 kind=dialplan',
  });

  it('shows the type and the session as chips, not in the message text', async () => {
    syslogsApi.fetchLogs.mockImplementation(() => Promise.resolve({ data: [nodeLine], total: 1 }));
    render(<LogsScreen />);

    expect(await screen.findByText(/Mothership refused the dialplan/)).not.toHaveTextContent('session=');
    expect(screen.getByRole('button', { name: 'Filter by type dialplan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter by session c0ffee00-0000-4000-8000-000000000001' })).toHaveTextContent('c0ffee00…');
  });

  it('filters the whole call from a session chip and a type from its chip', async () => {
    syslogsApi.fetchLogs.mockImplementation(() => Promise.resolve({ data: [nodeLine], total: 1 }));
    const user = userEvent.setup();
    render(<LogsScreen />);

    await user.click(await screen.findByRole('button', { name: 'Filter by session c0ffee00-0000-4000-8000-000000000001' }));
    await waitFor(() => expect(syslogsApi.fetchLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ inline: 'session=c0ffee00-0000-4000-8000-000000000001', page: 1 }),
    ));
    expect(screen.getByText('Call: c0ffee00-0000-4000-8000-000000000001')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Filter by type dialplan' }));
    await waitFor(() => expect(syslogsApi.fetchLogs).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'dialplan' })));
    expect(screen.getByText('Type: dialplan')).toBeInTheDocument();
  });

  it('opens on one call from ?session= and loads the types of the window', async () => {
    render(<LogsScreen initialParams="session=abc123&type=sip_auth" />);

    await waitFor(() => expect(syslogsApi.fetchLogs).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'session=abc123', action: 'sip_auth' }),
    ));
    expect(syslogsApi.fetchActions).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(Number), to: expect.any(Number) }));
  });
});
