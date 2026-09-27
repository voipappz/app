import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
vi.mock('../../hooks/useLiveEntities', () => ({
  default: (environmentUuid) => ({
    rows: liveRows,
    byScope: (want) => liveRows.filter((r) => r.scope === want),
    connected: liveStatus === 'confirmed',
    rejected: liveStatus === 'rejected',
    status: liveStatus,
    subscription: { status: liveStatus, confirmedAt: null, frames: liveRows.length, lastFrameAt: null, identifier: null, environmentUuid },
  }),
}));

// A portal session: one environment, straight off the user object.
vi.mock('../../context/UserAuthContext', () => ({
  useUserAuth: () => ({
    user: {
      uuid: 'user-1',
      environment: { uuid: 'env-906', name: '4186 - MATEMATICA' },
    },
  }),
}));

vi.mock('../../context/CustomerEnvironmentContext', () => ({
  useCustomerEnvironment: () => ({ selectedEnvironments: [] }),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ accountUuid: null }) }));

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
  });

  it('renders the environment from the session, not from a picker', () => {
    render(<LiveDashboard />);

    expect(screen.getByText('4186 - MATEMATICA')).toBeInTheDocument();
    // `/api/applications` answers 401 for a user token, so the screen must
    // never depend on having fetched a list.
    expect(screen.queryByLabelText('Environment')).not.toBeInTheDocument();
  });

  it('shows agent rows straight off the cable, identity included', () => {
    liveRows = [agent(), agent({ id: 'a2', user_name: 'Dana', extension_username: '212' })];

    render(<LiveDashboard />);

    expect(screen.getByText('20 Noam')).toBeInTheDocument();
    expect(screen.getByText('Dana')).toBeInTheDocument();
    expect(screen.getByText('211')).toBeInTheDocument();
    expect(screen.getByText('212')).toBeInTheDocument();
  });

  it("labels the status chip with the tenant's own status name", () => {
    // `status` is the switch's type and keys the colour; `status_name` is what
    // the tenant called it, and is what an operator recognises.
    liveRows = [agent({ status: 'on_break', status_name: 'Lunch' })];

    render(<LiveDashboard />);

    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('1 On Break')).toBeInTheDocument();
  });

  it('falls back to the status type when the node has no name for it yet', () => {
    liveRows = [agent({ status: 'logged_out', status_name: undefined })];

    render(<LiveDashboard />);

    expect(screen.getByText('logged_out')).toBeInTheDocument();
  });

  it('counts the pills from the rows rather than a second source', () => {
    liveRows = [agent(), agent({ id: 'a2' }), agent({ id: 'a3', status: 'on_break', status_name: 'On Break' })];

    render(<LiveDashboard />);

    expect(screen.getByText('2 Available')).toBeInTheDocument();
    expect(screen.getByText('1 On Break')).toBeInTheDocument();
  });

  it('counts calls in progress off the environment document', () => {
    liveRows = [environment()];

    render(<LiveDashboard />);

    expect(screen.getByText('Live calls (3)')).toBeInTheDocument();
    expect(screen.getByText('Incoming')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('says "no calls in progress" only when the cable is confirmed', () => {
    render(<LiveDashboard />);

    expect(screen.getByText('No calls in progress')).toBeInTheDocument();
    expect(screen.getByText('No agents in this environment')).toBeInTheDocument();
  });

  it('shows nothing and says so when the cable is not delivering', () => {
    // An empty table and an unknown one look identical and mean opposite
    // things. With no fallback, "not live" is the only honest thing to paint.
    liveStatus = 'unavailable';

    render(<LiveDashboard />);

    expect(screen.getAllByText(/Not live — the cable is not delivering/)).toHaveLength(2);
    expect(screen.queryByText('No calls in progress')).not.toBeInTheDocument();
    expect(screen.queryByText('No agents in this environment')).not.toBeInTheDocument();
  });

  it('never calls the API — the cable is the only source', () => {
    liveRows = [agent(), environment()];
    liveStatus = 'unavailable';

    render(<LiveDashboard />);

    expect(mockApiGet).not.toHaveBeenCalled();
  });

  // The board is the one deliberate second source on this screen: saved
  // Influx widgets, and every one of them scoped to the Live environment.
  it('shows the widget board scoped to the live environment', async () => {
    localStorage.setItem('dashboard-definitions:live-metrics:user-1', JSON.stringify({ dashboards: [{ uuid: 'default', name: 'Default' }], widgets: { default: [
      { uuid: 'w1', type: 'counter', title: 'Calls today', measurement: 'cdr', field: 'duration', aggregation: 'count', minutes: 60, position: 0 },
    ] } }));
    mockApiGet.mockResolvedValue({ rows: [] });

    render(<LiveDashboard />);

    expect(await screen.findByText('Calls today')).toBeInTheDocument();
    await vi.waitFor(() => expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/monitoring\/influxdb\/query\?.*environment_uuid=env-906/), expect.anything(), expect.anything(), expect.anything(), expect.anything(),
    ));
  });

  it('says why the cable is not live instead of leaving the screen to guess', () => {
    // No session token in a test, so no socket opens: the panel must name
    // that, and open its details by itself because the screen is not live.
    liveStatus = 'unavailable';

    render(<LiveDashboard />);

    expect(screen.getByText('Realtime cable: No session')).toBeInTheDocument();
    expect(screen.getByText('Subscription')).toBeInTheDocument();
  });
});
