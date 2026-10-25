import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../apiService', () => ({ apiService: { get: vi.fn(), post: vi.fn(), clearCache: vi.fn() },
  toFormData: (data) => new URLSearchParams(data) }));
import { apiService } from '../apiService';
import { providersApi } from './providersApi';

beforeEach(() => vi.clearAllMocks());
describe('provider number requests', () => {
  it('refreshes availability and encodes search inputs', async () => {
    await providersApi.searchNumbers('provider', { country: ' us ', type: 'local', area: '212' });
    const url = '/api/providers/provider?action=numbers&country=US&type=local&area=212';
    expect(apiService.clearCache).toHaveBeenCalledWith(url);
    expect(apiService.get).toHaveBeenCalledWith(url, {}, 'searching available numbers', false);
  });
  it('uses the purchase contract and opts out of network retries', async () => {
    await providersApi.buyNumber({ provider_uuid: 'provider', number: '12125550123', environment_uuid: 'app',
      bridge_type: 'extension', bridge_uuid: 'extension' });
    const [url, body, options] = apiService.post.mock.calls[0];
    expect(url).toBe('/api/routes');
    expect(Object.fromEntries(body)).toEqual({ buy: 'true', provider_uuid: 'provider', number: '12125550123',
      environment_uuid: 'app', bridge_type: 'extension', bridge_uuid: 'extension' });
    expect(options.retryNetworkErrors).toBe(false);
  });
});
