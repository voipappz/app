import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monitoringApi } from '../../services/api/monitoringApi';
import { useWidgetValue } from './useWidgetValue';
import { formatWidgetValue } from './widgetPresentation';
import MetricChart from './MetricChart';
import WidgetEditor from './WidgetEditor';
import WidgetBoard from './WidgetBoard';

vi.mock('../../services/api/monitoringApi', () => ({ monitoringApi: {
  runInfluxQuery: vi.fn(), getInfluxSchema: vi.fn(), getInfluxRows: vi.fn(),
} }));

// Geometry belongs to Recharts. Assert our selected chart and data contract.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div data-testid="line-renderer">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-renderer">{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-renderer">{children}</div>,
  Line: () => null, Bar: () => null, Pie: () => null, Cell: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
}));

const widget = { title: 'Call count', type: 'counter', measurement: 'cdr', field: 'duration', aggregation: 'count', minutes: 60 };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  monitoringApi.getInfluxRows.mockResolvedValue({ rows: [] });
  monitoringApi.getInfluxSchema.mockResolvedValue([{ measurement: 'cdr', fields: [{ name: 'duration', type: 'float' }] }]);
  monitoringApi.runInfluxQuery.mockResolvedValue({ rows: [{ time: '2026-09-27T10:00:00Z', value: 2 }, { time: '2026-09-27T11:00:00Z', value: 3 }] });
});

describe('dashboard widget UX', () => {
  it('restores saved widgets and opens CDR details', async () => {
    const user = userEvent.setup();
    localStorage.setItem('dashboard-definitions:test-board', JSON.stringify({ dashboards: [{ uuid: 'default', name: 'Default' }], widgets: { default: [
      { ...widget, uuid: 'saved-counter', title: 'Saved call counter', position: 0 },
      { uuid: 'saved-table', type: 'table', title: 'Saved records', position: 1 },
    ] } }));
    monitoringApi.getInfluxRows.mockResolvedValue({ rows: [{ call_uuid: 'call-1', caller: '100', callee: '200', disposition: 'ANSWER', time: '2026-09-27T10:00:00Z' }] });
    render(<WidgetBoard storageScope="test-board" />);
    expect(await screen.findByText('Saved call counter')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Open call call-1' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('call-1');
    expect(screen.getByRole('dialog')).toHaveTextContent('ANSWER');
  });
  it.each(['line', 'bar', 'pie'])('uses the %s renderer', (type) => {
    render(<MetricChart type={type} series={[{ time: 'now', value: 4 }]} />);
    expect(screen.getByTestId(`${type}-renderer`)).toBeInTheDocument();
  });

  it('does not turn missing data into zero', async () => {
    monitoringApi.runInfluxQuery.mockResolvedValue({ rows: [] });
    const { result } = renderHook(() => useWidgetValue(widget, { refreshInterval: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.value).toBeNull();
    expect(formatWidgetValue(widget, result.current.value)).toBe('—');
    expect(formatWidgetValue(widget, 0)).toBe('0');
  });

  it('sums count buckets and displays a count rather than a duration', async () => {
    const { result } = renderHook(() => useWidgetValue(widget, { refreshInterval: 0 }));
    await waitFor(() => expect(result.current.value).toBe(5));
    expect(formatWidgetValue(widget, result.current.value)).toBe('5');
    expect(formatWidgetValue({ field: 'duration', aggregation: 'mean' }, 65)).toBe('01:05');
  });

  it('ignores the old request after changing metrics', async () => {
    let resolveOld;
    monitoringApi.runInfluxQuery.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(({ field }) => useWidgetValue({ ...widget, field }, { refreshInterval: 0 }), { initialProps: { field: 'duration' } });
    rerender({ field: 'talk_duration' });
    await waitFor(() => expect(result.current.value).toBe(5));
    await act(async () => resolveOld({ rows: [{ value: 999 }] }));
    expect(result.current.value).toBe(5);
  });

  it('keeps query failures distinct from empty data', async () => {
    monitoringApi.runInfluxQuery.mockRejectedValue(new Error('Database unavailable'));
    const { result } = renderHook(() => useWidgetValue(widget, { refreshInterval: 0 }));
    await waitFor(() => expect(result.current.error).toBe('Database unavailable'));
    expect(result.current.value).toBeNull();
  });

  it('uses the shared time range and refreshes on demand', async () => {
    const { result, rerender } = renderHook(({ refreshKey }) => useWidgetValue(widget, { refreshInterval: 0, minutes: 1440, refreshKey }), { initialProps: { refreshKey: 0 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(monitoringApi.runInfluxQuery).toHaveBeenCalledWith(expect.objectContaining({ minutes: 1440 }));
    rerender({ refreshKey: 1 });
    await waitFor(() => expect(monitoringApi.runInfluxQuery).toHaveBeenCalledTimes(2));
  });

  it('previews only when requested and preserves the draft until save', async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(<WidgetEditor open initialDraft={widget} onSave={save} onClose={vi.fn()} />);
    await screen.findByRole('button', { name: 'Run preview' });
    expect(monitoringApi.runInfluxQuery).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Run preview' }));
    expect(await screen.findByRole('table', { name: 'Preview data' })).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Run preview' }));
    await waitFor(() => expect(monitoringApi.runInfluxQuery).toHaveBeenCalledTimes(2));
    await user.type(screen.getByLabelText('Title'), ' updated');
    expect(screen.getByText(/Settings changed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Call count updated' }));
  });
});
