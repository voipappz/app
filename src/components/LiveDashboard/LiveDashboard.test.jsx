import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import LiveDashboard from './LiveDashboard';

/**
 * Renders the screen for real, with the two contexts and the cable mocked.
 *
 * What this pins: the screen has ONE source. Every row is a document off the
 * cable, and when the cable is not delivering the screen says so rather than
 * showing anything — there is no API to fall back to, and the assertion at
 * the bottom is that none is called.
 */

const mockApiGet = vi.fn();
vi.mock('../../services/apiService', () => ({
  apiService: { get: (...a) => mockApiGet(...a), post: (...a) => mockApiGet(...a) },
}));

// The cable, as the hook presents it: rows plus the subscription's state.
let liveRows = [];
let liveStatus = 'confirmed';
let liveAskedFor = null;
vi.mock('../../hooks/useLiveEntities', () => ({
  default: (environmentUuid) => (liveAskedFor = environmentUuid, {
    rows: liveRows,
    byScope: (want) => liveRows.filter((r) => r.scope === want),
    connected: liveStatus === 'confirmed',
    rejected: liveStatus === 'rejected',
    status: liveStatus,
    subscription: { status: liveStatus, confirmedAt: null, frames: liveRows.length, lastFrameAt: null, identifier: null, environmentUuid },
  }),
}));

// A portal session: one environment, straight off the user object.
const PORTAL_USER = {
  uuid: 'user-1',
  environment: { uuid: 'env-906', name: '4186 - MATEMATICA' },
};
let portalUser = PORTAL_USER;
vi.mock('../../context/UserAuthContext', () => ({
  useUserAuth: () => ({ user: portalUser }),
}));

let selectedEnvironments = [];
vi.mock('../../context/CustomerEnvironmentContext', () => ({
  useCustomerEnvironment: () => ({ selectedEnvironments }),
}));
// History widgets read /api/identities; live widgets read only the cable.
const mockReport = vi.fn();
const mockCatalog = vi.fn(async () => ({ dimensions: [] }));
vi.mock('../../services/api/identityReportApi', () => ({
  identityReportApi: { runReport: (...a) => mockReport(...a), getCatalog: (...a) => mockCatalog(...a) },
}));
vi.mock('react-grid-layout', async (importOriginal) => ({
  ...(await importOriginal()),
  useContainerWidth: () => ({ width: 1280, containerRef: { current: null }, mounted: true }),
}));
vi.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return { ResponsiveContainer: Pass, LineChart: Pass, BarChart: Pass, PieChart: Pass, Line: () => null, Bar: () => null,
    Pie: () => null, Cell: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null };
});
let accountUuid = null;
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ accountUuid }) }));
vi.mock('../Live/panels/LiveCallsPanel.jsx', () => ({ default: () => <div>calls in progress panel</div> }));
// The ACL grants, as `screen:action` (usePermissions' `can`).
let grants = [];
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (screen, action = 'read') => grants.includes(`${screen}:${action}`) }),
}));

// A user document as the node writes it: identity from the mothership, the
// rest from the switch.
const agent = (over = {}) => ({
  scope: 'user',
  id: 'a1',
  user_name: '20 Noam',
  extension_username: '211',
  status: 'available',
  status_name: 'Available',
  state: 'waiting',
  status_updated_at: '',
  call_outgoing_count: 3,
  call_incoming_count: null,
  first_call_at: '',
  call_answer_at: '',
  talking_to_number: '',
  ...over,
});

const environment = (over = {}) => ({
  scope: 'environment',
  id: 'env-906',
  live_calls_incoming: ['c1', 'c2'],
  live_calls_outgoing: ['c3'],
  live_calls_local: [],
  ...over,
});

describe('LiveDashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiGet.mockReset();
    liveRows = [];
    liveStatus = 'confirmed';
    selectedEnvironments = [];
    mockReport.mockReset();
    mockReport.mockResolvedValue({ rows: [], labels: {} });
  });

  it('renders the environment from the session, not from a picker', async () => {
    render(<LiveDashboard />);

    expect(screen.getByText('4186 - MATEMATICA')).toBeInTheDocument();
    // `/api/applications` answers 401 for a user token, so the screen must
    // never depend on having fetched a list.
    expect(screen.queryByLabelText('Environment')).not.toBeInTheDocument();
  });

  it('shows agent rows straight off the cable, identity included', async () => {
    liveRows = [agent(), agent({ id: 'a2', user_name: 'Dana', extension_username: '212' })];

    render(<LiveDashboard />);

    expect(await screen.findByText('20 Noam')).toBeInTheDocument();
    expect(await screen.findByText('Dana')).toBeInTheDocument();
    expect(await screen.findByText('211')).toBeInTheDocument();
    expect(await screen.findByText('212')).toBeInTheDocument();
  });

  it("labels the status chip with the tenant's own status name", async () => {
    // `status` is the switch's type and keys the colour; `status_name` is what
    // the tenant called it, and is what an operator recognises.
    liveRows = [agent({ status: 'on_break', status_name: 'Lunch' })];

    render(<LiveDashboard />);

    expect(await screen.findByText('Lunch')).toBeInTheDocument();
    expect(await screen.findByText('1 On Break')).toBeInTheDocument();
  });

  it('falls back to the status type when the node has no name for it yet', async () => {
    liveRows = [agent({ status: 'logged_out', status_name: undefined })];

    render(<LiveDashboard />);

    expect(await screen.findByText('logged_out')).toBeInTheDocument();
  });

  it('counts the pills from the rows rather than a second source', async () => {
    liveRows = [agent(), agent({ id: 'a2' }), agent({ id: 'a3', status: 'on_break', status_name: 'On Break' })];

    render(<LiveDashboard />);

    expect(await screen.findByText('2 Available')).toBeInTheDocument();
    expect(await screen.findByText('1 On Break')).toBeInTheDocument();
  });

  it('counts calls in progress off the environment document', async () => {
    liveRows = [environment()];

    render(<LiveDashboard />);

    expect(await screen.findByText('Live calls (3)')).toBeInTheDocument();
    expect(await screen.findByText('Incoming')).toBeInTheDocument();
    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('says "no calls in progress" only when the cable is confirmed', async () => {
    render(<LiveDashboard />);

    expect(await screen.findByText('No calls in progress')).toBeInTheDocument();
    expect(await screen.findByText('No agents in this environment')).toBeInTheDocument();
  });

  it('shows nothing and says so when the cable is not delivering', async () => {
    // An empty table and an unknown one look identical and mean opposite
    // things. With no fallback, "not live" is the only honest thing to paint.
    liveStatus = 'unavailable';

    render(<LiveDashboard />);

    expect(await screen.findAllByText(/Not live — the cable is not delivering/)).toHaveLength(2);
    expect(screen.queryByText('No calls in progress')).not.toBeInTheDocument();
    expect(screen.queryByText('No agents in this environment')).not.toBeInTheDocument();
  });

  // The Calls screen's former "Live now" tab: calls in progress with their
  // actions. Users and accounts alike: the ACL's calls grant decides.
  it('shows the calls-in-progress panel to whoever the ACL lets read calls', async () => {
    liveRows = [agent(), environment()];
    const { unmount } = render(<LiveDashboard />);
    await screen.findByText('20 Noam');
    expect(screen.queryByTestId('live-calls-panel')).not.toBeInTheDocument();
    unmount();

    grants = ['calls:read'];
    localStorage.clear();
    try {
      const { unmount: unmountUser } = render(<LiveDashboard />);
      expect(await screen.findByTestId('live-calls-panel')).toHaveTextContent('calls in progress panel');
      unmountUser();

      portalUser = null;
      accountUuid = 'acct-1';
      selectedEnvironments = [{ uuid: 'env-906', name: '4186 - MATEMATICA' }];
      render(<LiveDashboard />);
      expect(await screen.findByTestId('live-calls-panel')).toBeInTheDocument();
    } finally {
      grants = [];
      portalUser = PORTAL_USER;
      accountUuid = null;
    }
  });

  it('live widgets never call the API: the cable is their only source', async () => {
    liveRows = [agent(), environment()];
    liveStatus = 'unavailable';

    render(<LiveDashboard />);
    await screen.findByText('20 Noam');

    expect(mockApiGet).not.toHaveBeenCalled();
  });

  // The Dashboard's UX, merged in: a board of widgets. First open is today's
  // Live, plus the live data's history from identities.
  it('is a widget board whose first open is today\'s Live plus its history', async () => {
    liveRows = [agent(), environment()];
    render(<LiveDashboard />);

    await screen.findByText('Status summary');
    const grid = screen.getByTestId('widget-grid');
    for (const title of ['Status summary', 'At a glance', 'Calls by direction', 'Agents', 'Activity over time']) {
      expect(within(grid).getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByTestId('add-widget')).toBeInTheDocument();
  });

  it('offers live and history widgets from a menu, and no builder', async () => {
    const user = userEvent.setup();
    render(<LiveDashboard />);
    await screen.findByTestId('widget-grid');

    expect(screen.queryByTestId('build-widget')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('add-widget'));
    expect(screen.getByTestId('widget-preset-liveAgents')).toBeInTheDocument();
    expect(screen.getByTestId('widget-preset-idTopEvents')).toBeInTheDocument();
    expect(screen.queryByTestId('widget-preset-custom')).not.toBeInTheDocument();
    expect(screen.queryByTestId('widget-preset-callsToday')).not.toBeInTheDocument();
  });

  it('reads history from identities for the environments it shows, never Influx', async () => {
    render(<LiveDashboard />);
    await vi.waitFor(() => expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ environmentUuids: ['env-906'] })));
    expect(mockApiGet).not.toHaveBeenCalledWith(expect.stringMatching(/influxdb/), expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });

  it('an account sees every environment selected in the top bar', async () => {
    portalUser = null;
    accountUuid = 'acct-1';
    selectedEnvironments = [{ uuid: 'env-1', name: 'Sales' }, { uuid: 'env-2', name: 'Support' }];
    try {
      render(<LiveDashboard />);
      expect(screen.getByText('Sales')).toBeInTheDocument();
      expect(screen.getByText('Support')).toBeInTheDocument();
      expect(liveAskedFor).toEqual(['env-1', 'env-2']);
      await vi.waitFor(() => expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ environmentUuids: ['env-1', 'env-2'] })));
    } finally {
      portalUser = PORTAL_USER;
      accountUuid = null;
    }
  });

  it('a removed widget stays removed', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<LiveDashboard />);
    await screen.findByText('Activity over time');
    const grid = screen.getByTestId('widget-grid');
    const card = within(grid).getByText('Activity over time').closest('[data-testid^="builder-widget-"]');
    await user.click(within(card).getByRole('button', { name: 'Widget actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete widget' }));
    await vi.waitFor(() => expect(within(grid).queryByText('Activity over time')).not.toBeInTheDocument());
    unmount();

    render(<LiveDashboard />);
    await screen.findByText('Agents');
    expect(screen.queryByText('Activity over time')).not.toBeInTheDocument();
  });

  it('names a history widget\'s range on the widget, so a changed range is never mislabelled', async () => {
    const user = userEvent.setup();
    render(<LiveDashboard />);
    await screen.findByText('Activity over time');
    const card = screen.getByText('Activity over time').closest('[data-testid^="builder-widget-"]');
    expect(within(card).getByText(/Last 24 hours/)).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Widget actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit widget' }));
    await user.click(within(await screen.findByRole('dialog')).getByLabelText('Range'));
    await user.click(screen.getByRole('option', { name: 'Last 30 days' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    const again = (await screen.findByText('Activity over time')).closest('[data-testid^="builder-widget-"]');
    expect(await within(again).findByText(/Last 30 days/)).toBeInTheDocument();
  });

  it('renames a widget without a builder: title and range only', async () => {
    const user = userEvent.setup();
    render(<LiveDashboard />);
    await screen.findByText('Activity over time');
    const grid = screen.getByTestId('widget-grid');
    const card = within(grid).getByText('Activity over time').closest('[data-testid^="builder-widget-"]');
    await user.click(within(card).getByRole('button', { name: 'Widget actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit widget' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/Build an activity report/)).not.toBeInTheDocument();
    const title = within(dialog).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Our week');
    await user.click(within(dialog).getByLabelText('Range'));
    await user.click(screen.getByRole('option', { name: 'Last 7 days' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(grid).findByText('Our week')).toBeInTheDocument();
    await vi.waitFor(() => expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ minutes: 10080 })));
  });

  it('says why the cable is not live instead of leaving the screen to guess', async () => {
    // No session token in a test, so no socket opens: the panel must name
    // that, and open its details by itself because the screen is not live.
    liveStatus = 'unavailable';

    render(<LiveDashboard />);

    expect(screen.getByText('Realtime cable: No session')).toBeInTheDocument();
    expect(screen.getByText('Subscription')).toBeInTheDocument();
  });
});

// The connection between the two: an agent's live row opens that agent's own
// history from identities — same type, same id, same environment.
describe('an agent\'s history, from its live row', () => {
  beforeEach(() => {
    localStorage.clear();
    liveStatus = 'confirmed';
    selectedEnvironments = [];
    mockReport.mockReset();
    mockReport.mockResolvedValue({ rows: [], labels: {} });
    mockCatalog.mockResolvedValue({
      dimensions: [{ key: 'type', label: 'Type' }, { key: 'event', label: 'Event' }],
      measures: [{ key: 'events', label: 'Events', unit: 'count' }, { key: 'incr:call_incoming_count', label: 'Call incoming count', unit: 'count' }],
      buckets: ['5m', '15m', '1h', '1d'],
    });
  });

  // The catalog is cached per environment for five minutes: a test that needs
  // a different one uses its own environment.
  const openNoam = async (user, env = 'env-906') => {
    liveRows = [agent({ environment_uuid: env }), environment()];
    render(<LiveDashboard />);
    await user.click(await screen.findByText('20 Noam'));
    return screen.findByRole('dialog', { name: /20 Noam/ });
  };

  it('opens a panel with the live document and its history filtered to that agent', async () => {
    const user = userEvent.setup();
    const panel = await openNoam(user);
    expect(within(panel).getByText('211')).toBeInTheDocument();
    await vi.waitFor(() => expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: ['user'], identity: ['a1'] }, environmentUuids: ['env-906'], minutes: 1440,
    })));
  });

  it('switches the range for every history view', async () => {
    const user = userEvent.setup();
    const panel = await openNoam(user);
    await user.click(within(panel).getByRole('button', { name: 'Last 7 days' }));
    await vi.waitFor(() => expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: ['user'], identity: ['a1'] }, minutes: 10080,
    })));
  });

  it('charts a counter the catalog discovered, as change per interval', async () => {
    const user = userEvent.setup();
    const panel = await openNoam(user);
    await user.click(await within(panel).findByRole('button', { name: 'Call incoming count' }));
    await vi.waitFor(() => expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({
      measures: ['incr:call_incoming_count'], where: { type: ['user'], identity: ['a1'] },
    })));
    expect(within(panel).getByText(/change per interval/i)).toBeInTheDocument();
  });

  it('keeps the panel\'s "now" live as the cable updates the agent', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LiveDashboard />);
    liveRows = [agent({ environment_uuid: 'env-906' }), environment()];
    rerender(<LiveDashboard />);
    await user.click(await screen.findByText('20 Noam'));
    const panel = await screen.findByRole('dialog', { name: /20 Noam/ });
    expect(within(panel).getByText('Available')).toBeInTheDocument();
    liveRows = [agent({ environment_uuid: 'env-906', status: 'on_break', status_name: 'Lunch' }), environment()];
    rerender(<LiveDashboard />);
    expect(await within(screen.getByRole('dialog', { name: /20 Noam/ })).findByText('Lunch')).toBeInTheDocument();
  });

  it('opens from the keyboard too', async () => {
    const user = userEvent.setup();
    liveRows = [agent({ environment_uuid: 'env-906' }), environment()];
    render(<LiveDashboard />);
    const row = (await screen.findByText('20 Noam')).closest('[tabindex="0"]');
    row.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: /20 Noam/ })).toBeInTheDocument();
  });

  it('does not claim "no counters" when the catalog could not be read', async () => {
    mockCatalog.mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    const panel = await openNoam(user, 'env-down');
    expect(await within(panel).findByText('Counters are not available right now.')).toBeInTheDocument();
    expect(within(panel).queryByText('No counters recorded yet.')).not.toBeInTheDocument();
  });

  it('says so when no counters were recorded yet', async () => {
    mockCatalog.mockResolvedValue({ dimensions: [{ key: 'type', label: 'Type' }], measures: [{ key: 'events', label: 'Events' }] });
    const user = userEvent.setup();
    const panel = await openNoam(user, 'env-quiet');
    expect(await within(panel).findByText('No counters recorded yet.')).toBeInTheDocument();
  });
});

describe('an agent\'s history in Hebrew', () => {
  it('translates the status and state values, as the agents table does', async () => {
    localStorage.clear(); liveStatus = 'confirmed'; selectedEnvironments = [];
    mockReport.mockResolvedValue({ rows: [], labels: {} });
    liveRows = [agent({ environment_uuid: 'env-he', status: 'logged_out', status_name: undefined, state: 'waiting' }), environment()];
    await i18n.changeLanguage('he');
    try {
      const user = userEvent.setup();
      render(<LiveDashboard />);
      await user.click(await screen.findByText('20 Noam'));
      const panel = await screen.findByRole('dialog', { name: /20 Noam/ });
      expect(within(panel).getByText('מנותק')).toBeInTheDocument();
      expect(within(panel).queryByText('logged_out')).not.toBeInTheDocument();
    } finally { await i18n.changeLanguage('en'); }
  });
});

describe('LiveDashboard in Hebrew', () => {
  beforeEach(() => {
    localStorage.clear();
    liveStatus = 'confirmed';
  });

  it("speaks Hebrew, keeping names and the tenant's own status names", async () => {
    liveRows = [agent(), agent({ id: 'a2', user_name: 'Dana', status: 'logged_out', status_name: undefined }), environment()];
    await i18n.changeLanguage('he');
    try {
      render(<LiveDashboard />);
      expect(await screen.findByText('לוח בזמן אמת')).toBeInTheDocument();
      expect(await screen.findByText('1 זמינים')).toBeInTheDocument();
      expect(await screen.findByText('שיחות פעילות (3)')).toBeInTheDocument();
      expect(await screen.findByText('20 Noam')).toBeInTheDocument();
      // The tenant named this status; only a bare status type is translated.
      expect(await screen.findByText('Available')).toBeInTheDocument();
      expect(await screen.findByText('מנותק')).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
