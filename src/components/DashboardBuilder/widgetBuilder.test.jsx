import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monitoringApi } from '../../services/api/monitoringApi';
import WidgetBuilder from './WidgetBuilder';
import { pivot, summarize } from './metricQuery';

vi.mock('../../services/api/monitoringApi', () => ({ monitoringApi: {
  getInfluxSchema: vi.fn(), runInfluxQuery: vi.fn(), getInfluxTagValues: vi.fn(),
} }));
vi.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return { ResponsiveContainer: Pass, LineChart: Pass, BarChart: Pass, Line: () => null, Bar: () => null,
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null };
});

beforeEach(() => {
  vi.clearAllMocks();
  monitoringApi.getInfluxSchema.mockResolvedValue([
    { measurement: 'cdr', tags: ['direction'], fields: [{ name: 'duration', type: 'float' }] },
  ]);
  monitoringApi.getInfluxTagValues.mockResolvedValue(['inbound', 'outbound']);
  monitoringApi.runInfluxQuery.mockResolvedValue({
    influxql: 'SELECT count("duration") AS value FROM "cdr"',
    rows: [
      { time: '2026-09-28T10:00:00Z', value: 3, direction: 'inbound' },
      { time: '2026-09-28T10:00:00Z', value: 1, direction: 'outbound' },
    ],
  });
});

describe('metric query helpers', () => {
  it('pivots rows into one column per split value', () => {
    const { data, series } = pivot([
      { time: 't1', value: 3, direction: 'inbound' }, { time: 't1', value: 1, direction: 'outbound' },
    ], 'direction');
    expect(series).toEqual(['inbound', 'outbound']);
    expect(data).toEqual([{ time: 't1', inbound: 3, outbound: 1 }]);
  });

  it('adds up counts for the number view', () => {
    expect(summarize([{ time: 't1', value: 3 }, { time: 't2', value: 4 }], 'count')).toBe(7);
  });
});

describe('WidgetBuilder', () => {
  it('builds a query from the schema, with a filter and a split, and saves it as a widget', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WidgetBuilder open onClose={vi.fn()} onSave={onSave} />);

    await user.click(await screen.findByRole('button', { name: 'Measurement cdr' }));
    await user.click(screen.getByRole('button', { name: 'Field cdr.duration' }));
    await user.click(screen.getByRole('button', { name: 'Show values of direction' }));
    await user.click(await screen.findByRole('button', { name: 'Filter direction = inbound' }));
    await user.click(within(screen.getByTestId('schema-browser')).getByRole('button', { name: 'Split' }));

    await waitFor(() => expect(monitoringApi.runInfluxQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      measurement: 'cdr', field: 'duration', where: { direction: 'inbound' }, groupBy: 'direction',
    })));
    expect(screen.getByTestId('builder-filters')).toHaveTextContent('direction = inbound');
    expect(await screen.findByTestId('builder-influxql')).toHaveTextContent('FROM "cdr"');

    await user.click(screen.getByRole('button', { name: 'Save as widget' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      type: 'query', measurement: 'cdr', field: 'duration', where: { direction: 'inbound' }, splitBy: 'direction', title: 'cdr · duration',
    }));
  });
});
