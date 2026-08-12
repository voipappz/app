import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet } from '../lib/clients/api';
import {
  getReportParams,
  listReports,
  normalizeReports,
  runReport,
  savedDateRange,
} from './reportsApi';

vi.mock('../lib/clients/api', () => ({ apiGet: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('reports API', () => {
  it('loads and normalizes the simple report list', async () => {
    apiGet.mockResolvedValue([{ uuid: 'r1', name: 'Calls' }, { name: 'missing id' }]);
    await expect(listReports()).resolves.toEqual([{ uuid: 'r1', name: 'Calls' }]);
    expect(apiGet).toHaveBeenCalledWith('/api/reports');
    expect(normalizeReports({ reports: [{ uuid: 'r2' }] })).toEqual([{ uuid: 'r2' }]);
  });

  it('loads saved parameters for one encoded report id', async () => {
    apiGet.mockResolvedValue({ params: [{ field: 'call.created_at', value: ['1', '2'] }] });
    await expect(getReportParams('report/1')).resolves.toHaveLength(1);
    expect(apiGet).toHaveBeenCalledWith('/api/reports/report%2F1?action=params');
  });

  it('runs one report with full-day dates, grouping, and pagination', async () => {
    apiGet.mockResolvedValue({ table: { data: [] } });
    await runReport('r1', {
      startDate: '2026-08-01', endDate: '2026-08-02', groupBy: 'week', limit: 50, offset: 100,
    });

    const path = apiGet.mock.calls[0][0];
    const query = new URLSearchParams(path.split('?')[1]);
    expect(path.startsWith('/api/reports/r1?')).toBe(true);
    expect(Object.fromEntries(query)).toMatchObject({
      action: 'run', group_by: 'week', limit: '50', offset: '100',
    });

    const start = new Date(2026, 7, 1, 0, 0, 0, 0);
    const end = new Date(2026, 7, 2, 23, 59, 59, 999);
    expect(query.get('start_date')).toBe(String(Math.floor(start.getTime() / 1000)));
    expect(query.get('end_date')).toBe(String(Math.floor(end.getTime() / 1000)));
  });

  it('reads saved date ranges in array and legacy string form', () => {
    const start = Math.floor(new Date(2026, 7, 1, 12).getTime() / 1000);
    const end = Math.floor(new Date(2026, 7, 2, 12).getTime() / 1000);
    const expected = { startDate: '2026-08-01', endDate: '2026-08-02' };
    expect(savedDateRange([{ field: 'call.created_at', value: [String(start), String(end)] }])).toEqual(expected);
    expect(savedDateRange([{ field: 'call.created_at', value: `${start} - ${end}` }])).toEqual(expected);
    expect(savedDateRange([])).toBeNull();
  });
});
