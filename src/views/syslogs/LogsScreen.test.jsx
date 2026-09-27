import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ToolDialog from '../../components/TopBar/ToolDialog.jsx';
import LogsScreen from './LogsScreen.jsx';

vi.mock('../../services/api/syslogsApi', () => {
  const ok = (value) => vi.fn(() => Promise.resolve(value));
  const api = {
    fetchLogs: ok({ data: [], total: 0 }), fetchAggregate: ok({ data: [] }), fetchMetrics: ok({ data: [] }),
    getMonitoringStatus: ok({}), setMonitoring: ok({}), fetchAlerts: ok([]), fetchApps: ok([]), fetchNodes: ok([]),
    getTraceStatus: ok({}), enableTrace: ok({}), disableTrace: ok({}), getConsoleStatus: ok({}),
  };
  return { syslogsApi: api, default: api };
});
vi.mock('../../context/CustomerEnvironmentContext', () => ({
  useCustomerEnvironment: () => ({ selectedCustomer: { uuid: 'c-1', name: 'acme' }, isRoot: true, selectedEnvironments: [] }),
}));

// The top bar's Logs button opens this screen inside the tool dialog; it has
// to render there, not only on its own route.
describe('Logs in the top-bar tool dialog', () => {
  it('renders the syslog screen inside the dialog', async () => {
    render(<ToolDialog title="Logs" open onClose={vi.fn()}><LogsScreen /></ToolDialog>);

    expect(screen.getByRole('dialog', { name: 'Logs' })).toBeInTheDocument();
    expect(await screen.findByText(/syslog|logs/i, { selector: 'h1,h2,h3,h4,h5,h6,p,span,div' }, { timeout: 3000 })).toBeInTheDocument();
  });
});
