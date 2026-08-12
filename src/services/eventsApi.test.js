import { describe, expect, it, vi } from 'vitest';
import { apiGet } from '../lib/clients/api';
import { getApiCdrEvents, normalizeApiEventPage } from './eventsApi';

vi.mock('../lib/clients/api', () => ({ apiGet: vi.fn() }));

describe('API CDR events', () => {
  it('normalizes the mothership event page without changing its rows', () => {
    const event = { event_id: 'cdr-1', event_type: 'EventCdr', data: { va_call_uuid: 'call-1' } };
    expect(normalizeApiEventPage({ data: [event], total_records: 12 })).toEqual({ rows: [event], total: 12 });
    expect(normalizeApiEventPage({})).toEqual({ rows: [], total: 0 });
  });

  it('requests only EventCdr rows from the tenant-scoped API', async () => {
    apiGet.mockResolvedValue({ data: [], total_records: 0 });
    await expect(getApiCdrEvents({ page: 2, perPage: 10 })).resolves.toEqual({ rows: [], total: 0 });
    const path = apiGet.mock.calls[0][0];
    const query = new URLSearchParams(path.split('?')[1]);
    expect(path.startsWith('/api/events?')).toBe(true);
    expect(Object.fromEntries(query)).toMatchObject({
      event_type: 'EventCdr', page: '2', per_page: '10', order_by: 'created_at', order_type: 'desc',
    });
  });
});
