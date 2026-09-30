import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monitoringApi } from '../../services/api/monitoringApi';
import CdrEditor from './CdrEditor';
import { formatMeasure, formatSeconds, scopeParams, timeSeries } from './cdrReport';
import { REPORT_UNAVAILABLE, reportError } from './useCdrReport';

vi.mock('../../services/api/monitoringApi', () => ({ monitoringApi: {
  runCdrReport: vi.fn(), getCdrCatalog: vi.fn(), runCdrSql: vi.fn(),
} }));
const auth = vi.fn(() => ({ isRoot: false }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth() }));
vi.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return { ResponsiveContainer: Pass, LineChart: Pass, BarChart: Pass, PieChart: Pass, Line: () => null, Bar: () => null,
    Pie: () => null, Cell: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null };
});

const SQL = "SELECT environment_uuid AS d0, COUNT(*) AS a_calls FROM cdr WHERE environment_uuid IN ('env-1')";

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReturnValue({ isRoot: false });
  monitoringApi.getCdrCatalog.mockResolvedValue(null);
  monitoringApi.runCdrReport.mockImplementation(async ({ dimensions = [] }) => ({
    rows: dimensions[0] === 'environment'
      ? [{ environment: 'env-1', calls: 40, answer_rate: 75, billsec: 3725, avg_talk: 85 }]
      : [{ [dimensions[0] || 'x']: 'answer', calls: 30, answer_rate: 100, billsec: 900, avg_talk: 30 }],
    labels: { environment: { 'env-1': 'Main office' } },
    sql: SQL,
  }));
});

describe('CDR report helpers', () => {
  it('formats durations, rates and money the way a call centre reads them', () => {
    expect(formatSeconds(3725)).toBe('1h 2m');
    expect(formatSeconds(85)).toBe('1m 25s');
    expect(formatMeasure('percent', 75)).toBe('75%');
    expect(formatMeasure('money', 1.5)).toBe('1.50');
    expect(formatMeasure('count', null)).toBe('—');
  });

  it('turns bucketed rows into one column per group', () => {
    const { data, series } = timeSeries([
      { time: 't1', status: 'answer', calls: 3 }, { time: 't1', status: 'busy', calls: 1 }, { time: 't2', status: 'answer', calls: 2 },
    ], { dimensions: ['status'], measures: ['calls'] });
    expect(series).toEqual(['answer', 'busy']);
    expect(data).toEqual([{ time: 't1', answer: 3, busy: 1 }, { time: 't2', answer: 2 }]);
  });

  it('explains a failed report in words', () => {
    expect(reportError({ status: 404, message: 'Failed running CDR report: HTTP 404: {}' })).toBe(REPORT_UNAVAILABLE);
    expect(reportError({ status: 422, message: 'Failed running CDR report: HTTP 422: {"error":"Too much data for this time range"}' }))
      .toBe('Too much data for this time range');
  });

  it('scopes to the customer, else to the picked applications', () => {
    expect(scopeParams({ customerUuid: 'c-1', environmentUuids: ['e-1'] })).toEqual({ customerUuid: 'c-1' });
    expect(scopeParams({ environmentUuids: ['e-1', 'e-2'] })).toEqual({ environmentUuids: ['e-1', 'e-2'] });
    expect(scopeParams({ fleet: true })).toEqual({ environmentUuids: [] });
  });
});

describe('CdrEditor', () => {
  it('runs the default report per environment, shows names and the SQL', async () => {
    const user = userEvent.setup();
    render(<CdrEditor scope={{ customerUuid: 'c-1' }} />);

    const table = await screen.findByTestId('cdr-table');
    expect(within(table).getByText('Main office')).toBeInTheDocument();
    expect(within(table).getByText('75%')).toBeInTheDocument();
    expect(within(table).getByText('1h 2m')).toBeInTheDocument();
    expect(monitoringApi.runCdrReport).toHaveBeenCalledWith(expect.objectContaining({
      dimensions: ['environment'], measures: ['calls', 'answer_rate', 'billsec', 'avg_talk'], customerUuid: 'c-1',
    }));

    await user.click(screen.getByRole('button', { name: 'SQL' }));
    expect(screen.getByTestId('cdr-sql')).toHaveTextContent('FROM cdr');
    expect(screen.queryByRole('button', { name: 'Run SQL' })).not.toBeInTheDocument();
  });

  it('drills into a group: filters to it and stops grouping by it', async () => {
    const user = userEvent.setup();
    render(<CdrEditor scope={{ customerUuid: 'c-1' }} />);

    await user.click(await screen.findByRole('button', { name: 'Filter Environment = Main office' }));
    await waitFor(() => expect(monitoringApi.runCdrReport).toHaveBeenLastCalledWith(expect.objectContaining({
      dimensions: [], where: { environment: 'env-1' },
    })));
    expect(screen.getByTestId('cdr-filters')).toHaveTextContent('Environment = Main office');
  });

  it('adds a measure and saves the query as a widget', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<CdrEditor scope={{ customerUuid: 'c-1' }} onSave={onSave} />);

    await user.click(within(screen.getByTestId('cdr-measures')).getByLabelText('Service level'));
    await waitFor(() => expect(monitoringApi.runCdrReport).toHaveBeenLastCalledWith(expect.objectContaining({
      measures: ['calls', 'answer_rate', 'billsec', 'avg_talk', 'service_level'],
    })));
    await user.type(screen.getByLabelText('Widget title'), 'Service by site');
    await user.click(screen.getByRole('button', { name: 'Save as widget' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      type: 'cdr', title: 'Service by site', dimensions: ['environment'], measures: expect.arrayContaining(['service_level']),
    }));
  });

  it('lets a root account edit and run the SQL', async () => {
    auth.mockReturnValue({ isRoot: true });
    monitoringApi.runCdrSql.mockResolvedValue({ rows: [{ c: 7 }], columns: ['c'] });
    const user = userEvent.setup();
    render(<CdrEditor scope={{ fleet: true }} />);
    await screen.findByTestId('cdr-table');

    await user.click(screen.getByRole('button', { name: 'SQL' }));
    const box = screen.getByLabelText('SQL');
    expect(box).toHaveValue(SQL);
    await user.clear(box);
    await user.type(box, 'SELECT COUNT(*) AS c FROM cdr');
    await user.click(screen.getByRole('button', { name: 'Run SQL' }));
    expect(monitoringApi.runCdrSql).toHaveBeenCalledWith('SELECT COUNT(*) AS c FROM cdr');
    expect(await screen.findByTestId('sql-result')).toHaveTextContent('7');
  });

  it('asks for a scope instead of querying without one', () => {
    render(<CdrEditor scope={{}} />);
    expect(screen.getByText('Select a customer or application in the top bar.')).toBeInTheDocument();
    expect(monitoringApi.runCdrReport).not.toHaveBeenCalled();
  });
});
