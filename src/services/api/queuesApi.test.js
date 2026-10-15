import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../apiService', () => ({
  apiService: { get: vi.fn() },
  toFormData: vi.fn(),
}));

import { apiService } from '../apiService';
import { queuesApi } from './queuesApi';

describe('queuesApi.getQueues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiService.get.mockResolvedValue({ data: [], total: 0 });
  });

  // The Queues screen's paging and sorting reach the server only through the
  // query string; passed as fetch options they were silently dropped.
  it('puts paging, sorting and search on the URL', async () => {
    await queuesApi.getQueues({ page: 2, per_page: 25, order_by: 'name', order_type: 'asc', 'search[name]': 'sales' });
    const [url, options] = apiService.get.mock.calls[0];
    const query = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/api/queues?')).toBe(true);
    expect(Object.fromEntries(query)).toEqual({ page: '2', per_page: '25', order_by: 'name', order_type: 'asc', 'search[name]': 'sales' });
    expect(options).toEqual({});
  });

  it('asks for the bare list when given nothing', async () => {
    await queuesApi.getQueues();
    expect(apiService.get.mock.calls[0][0]).toBe('/api/queues');
  });
});
