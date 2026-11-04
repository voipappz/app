import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monitoringApi } from '../../services/api/monitoringApi';
import { identityReportApi as identitiesApi } from '../../services/api/identityReportApi';
import CdrEditor from './CdrEditor';
import WidgetBoard from './WidgetBoard';
import { useCdrReport } from './useCdrReport';
import { reportSource } from './reportSources';
import { useCdrCatalog } from './CdrEditor';
import { applyTemplate, displayTitle } from './widgetTemplates';
import i18n from '../../i18n';
import { setDynamicApiBaseUrl } from '../../config';

vi.mock('../../services/api/monitoringApi', () => ({ monitoringApi: {
  runCdrReport: vi.fn(), getCdrCatalog: vi.fn(), runCdrSql: vi.fn(), getInfluxRows: vi.fn(), runInfluxQuery: vi.fn(), getInfluxSchema: vi.fn(),
} }));
vi.mock('../../services/api/identityReportApi', () => ({ identityReportApi: { getCatalog: vi.fn(), runReport: vi.fn() } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isRoot: true }) }));
vi.mock('react-grid-layout', async (importOriginal) => ({
  ...(await importOriginal()),
  useContainerWidth: () => ({ width: 1280, containerRef: { current: null }, mounted: true }),
}));
vi.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return { ResponsiveContainer: Pass, LineChart: Pass, BarChart: Pass, PieChart: Pass, Line: () => null, Bar: () => null,
    Pie: () => null, Cell: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null };
});

const CATALOG = {
  dimensions: [{ key: 'type', label: 'Type' }, { key: 'event', label: 'Event' }, { key: 'field:state', label: 'State' }],
  measures: [{ key: 'events', label: 'Events', unit: 'count' }, { key: 'identities', label: 'Identities', unit: 'count' },
    { key: 'incr:answer_count', label: 'Answer count', unit: 'count' }],
  buckets: ['5m', '15m', '1h', '1d'],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  identitiesApi.getCatalog.mockResolvedValue(CATALOG);
  identitiesApi.runReport.mockResolvedValue({ rows: [{ type: 'queue', events: 3, identities: 2 }], labels: {}, sql: 'SELECT … FROM identities' });
  monitoringApi.getInfluxRows.mockResolvedValue({ rows: [] });
});

describe('report sources', () => {
  it('an identity widget runs against /api/identities, a cdr widget against the CDR report', async () => {
    const scope = { customerUuid: 'c-1' };
    renderHook(() => useCdrReport({ type: 'identity', measures: ['events'], dimensions: ['type'] }, { scope }));
    await waitFor(() => expect(identitiesApi.runReport).toHaveBeenCalledWith(expect.objectContaining({
      measures: ['events'], dimensions: ['type'], customerUuid: 'c-1',
    })));
    expect(monitoringApi.runCdrReport).not.toHaveBeenCalled();
    expect(reportSource('identity').type).toBe('identity');
    expect(reportSource('cdr').type).toBe('cdr');
    expect(reportSource('anything').type).toBe('cdr');
  });
});

describe('the identities catalog cache', () => {
  it('asks again for another API server: each one discovers its own fields', async () => {
    renderHook(() => useCdrCatalog('identity', { customerUuid: 'c-server' }));
    await waitFor(() => expect(identitiesApi.getCatalog).toHaveBeenCalledTimes(1));
    setDynamicApiBaseUrl('https://other.example');
    try {
      renderHook(() => useCdrCatalog('identity', { customerUuid: 'c-server' }));
      await waitFor(() => expect(identitiesApi.getCatalog).toHaveBeenCalledTimes(2));
    } finally { setDynamicApiBaseUrl(null); }
  });

  it('asks again after five minutes, as the API rediscovers new counters', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      renderHook(() => useCdrCatalog('identity', { customerUuid: 'c-ttl' }));
      await waitFor(() => expect(identitiesApi.getCatalog).toHaveBeenCalledTimes(1));
      renderHook(() => useCdrCatalog('identity', { customerUuid: 'c-ttl' }));
      await new Promise((r) => setTimeout(r, 0));
      expect(identitiesApi.getCatalog).toHaveBeenCalledTimes(1);
      now.mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);
      renderHook(() => useCdrCatalog('identity', { customerUuid: 'c-ttl' }));
      await waitFor(() => expect(identitiesApi.getCatalog).toHaveBeenCalledTimes(2));
    } finally { now.mockRestore(); }
  });
});

describe('template titles', () => {
  it('follow the language until renamed, whichever editor renamed it', async () => {
    const made = applyTemplate('idOverTime');
    expect(displayTitle(made)).toBe('Activity over time');
    await i18n.changeLanguage('he');
    try { expect(displayTitle(made)).not.toBe('Activity over time'); } finally { await i18n.changeLanguage('en'); }
    // Monitoring's editors save a new title without a customTitle flag.
    expect(displayTitle({ ...made, title: 'Queue traffic' })).toBe('Queue traffic');
  });
});

describe('the identities catalog with no environments', () => {
  it('is not asked for at all: no scope must never mean every environment', async () => {
    renderHook(() => useCdrCatalog('identity', { environmentUuids: [] }));
    await new Promise((r) => setTimeout(r, 20));
    expect(identitiesApi.getCatalog).not.toHaveBeenCalled();
  });
});

describe('CdrEditor on the identities source', () => {
  it('lists the measures the API discovered, runs the identities report and saves an identity widget', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CdrEditor source="identity" scope={{ customerUuid: 'c-1' }} onSave={onSave} />);
    expect(screen.getByText('Build an activity report')).toBeInTheDocument();
    await screen.findByText('Answer count');
    expect(within(screen.getByTestId('cdr-measures')).getByText('Events')).toBeInTheDocument();
    await waitFor(() => expect(identitiesApi.runReport).toHaveBeenCalled());
    expect(monitoringApi.runCdrReport).not.toHaveBeenCalled();
    expect(await screen.findByText('queue')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Widget title'), 'Activity');
    await user.click(screen.getByRole('button', { name: 'Save as widget' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: 'identity', title: 'Activity', measures: ['events', 'identities'] }));
  });

  it('shows the SQL the API ran but offers no SQL runner, even to root', async () => {
    const user = userEvent.setup();
    render(<CdrEditor source="identity" scope={{ customerUuid: 'c-1' }} />);
    await waitFor(() => expect(identitiesApi.runReport).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'SQL' }));
    expect(await screen.findByTestId('cdr-sql')).toHaveTextContent('FROM identities');
    expect(screen.queryByRole('button', { name: 'Run SQL' })).not.toBeInTheDocument();
  });
});

describe('WidgetBoard modes', () => {
  it('the live board builds history from identities, with live and history templates', async () => {
    const user = userEvent.setup();
    render(<WidgetBoard storageScope="live-test" mode="live" callsScope={{ environmentUuids: ['e-1'] }} renderLive={() => null} />);
    await user.click(screen.getByTestId('build-widget'));
    expect(await screen.findByText('Build an activity report')).toBeInTheDocument();
    await waitFor(() => expect(identitiesApi.runReport).toHaveBeenCalledWith(expect.objectContaining({ environmentUuids: ['e-1'] })));
    expect(screen.queryByRole('menuitem', { name: /Call report/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByTestId('add-widget'));
    expect(screen.getByText('Live now')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.queryByText('Call reports')).not.toBeInTheDocument();
    expect(screen.queryByTestId('widget-preset-custom')).not.toBeInTheDocument();
  });

  it('a live board opens empty: no InfluxDB starter widgets', async () => {
    render(<WidgetBoard storageScope="live-empty" mode="live" renderLive={() => null} />);
    expect(await screen.findByText('Add a widget to start your dashboard.')).toBeInTheDocument();
    expect(monitoringApi.runInfluxQuery).not.toHaveBeenCalled();
  });

  it('the monitoring board keeps the call report and the metric builder', async () => {
    const user = userEvent.setup();
    render(<WidgetBoard storageScope="mon" callsScope={{ customerUuid: 'c-1' }} />);
    await user.click(screen.getByTestId('build-widget'));
    expect(screen.getByRole('menuitem', { name: /Call report/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^Metric/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Activity report/ })).not.toBeInTheDocument();
  });
});
