import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiService', () => ({ apiService: { get: vi.fn() }, toFormData: vi.fn() }));
import { apiService } from '../apiService';
import { providersApi, getCreatableProviderTypes } from './providersApi';

beforeEach(() => vi.clearAllMocks());

describe('server-provided provider types', () => {
  it('includes DID even when the detailed catalog only documents SIP', async () => {
    const fields = [{ key: 'address', label: 'Address', required: true }];
    apiService.get.mockResolvedValueOnce({ sip: { label: 'SIP carrier', fields } })
      .mockResolvedValueOnce(['sip', 'did']);
    const types = await providersApi.getProviderTypes();
    expect(apiService.get.mock.calls.map(([url]) => url)).toEqual([
      '/api/providers?action=types', '/api/providers?action=type_names',
    ]);
    expect(types).toEqual([
      expect.objectContaining({ value: 'sip', label: 'SIP carrier', fields }),
      expect.objectContaining({ value: 'did', label: 'DID' }),
    ]);
  });

  it('accepts older servers that return type names directly', async () => {
    apiService.get.mockResolvedValueOnce(['sip', 'did']);
    expect(await providersApi.getProviderTypes()).toEqual([
      { value: 'sip', label: 'SIP' }, { value: 'did', label: 'DID' },
    ]);
    expect(apiService.get).toHaveBeenCalledTimes(1);
  });

  it('excludes Webhook only from creation without changing the catalog', () => {
    const types = [{ value: 'sip' }, { value: 'did' }, { value: 'webhook' }];
    expect(getCreatableProviderTypes(types)).toEqual([{ value: 'sip' }, { value: 'did' }]);
    expect(types).toHaveLength(3);
  });

  it('does not invent types if the server request fails', async () => {
    apiService.get.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(providersApi.getProviderTypes()).rejects.toThrow('Unavailable');
  });
});
