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
    expect(await screen.findByTestId('syslog-count')).toHaveTextContent('0 of 0 messages loaded');
  });
});

describe('Syslog scrolling', () => {
  it('loads the next page when scrolled to the bottom and appends it', async () => {
    syslogsApi.fetchLogs.mockImplementation((params) => Promise.resolve(
      params.page === 1 ? { data: page(0, 100), total: 150 } : { data: page(100, 50), total: 150 },
    ));
    render(<LogsScreen />);
    await screen.findByText(/100 of 150 messages loaded/);

    const stream = screen.getByTestId('syslog-stream');
    Object.defineProperties(stream, {
      scrollHeight: { configurable: true, value: 2000 },
      clientHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 1400 },
    });
    fireEvent.scroll(stream);

    expect(await screen.findByText(/150 of 150 messages loaded/)).toBeInTheDocument();
    expect(syslogsApi.fetchLogs).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(screen.getByText('End of the selected time range')).toBeInTheDocument();
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
