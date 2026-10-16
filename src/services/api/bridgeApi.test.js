import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBridgeResources, listFilters } from './bridgeApi';
import { apiService } from '../apiService';

vi.mock('../apiService', () => ({ apiService: { get: vi.fn() }, toFormData: vi.fn() }));

beforeEach(() => { apiService.get.mockReset(); apiService.get.mockResolvedValue([]); });
afterEach(() => localStorage.clear());

const askedUrl = () => decodeURIComponent(apiService.get.mock.calls[0][0]);

describe('getBridgeResources', () => {
  it("filters an account's list by the environment it picked", async () => {
    localStorage.setItem('auth', JSON.stringify({ access: 'account-token' }));
    await getBridgeResources('announcement', 'env-1', { enabled: true });
    expect(askedUrl()).toBe('/api/announcements?per_page=9999&page=1&search[environment_uuid]=env-1&search[enabled]=true');
  });

  it("sends no search for a user: the API forces the user's environment, and reads a search as a name", async () => {
    localStorage.setItem('user_auth', JSON.stringify({ token: 'user-token' }));
    await getBridgeResources('queue', 'env-1', { enabled: true });
    expect(askedUrl()).toBe('/api/queues?per_page=9999&page=1');
  });
});

describe('listFilters', () => {
  it("filters an account's list by environment and enabled", () => {
    localStorage.setItem('auth', JSON.stringify({ access: 'account-token' }));
    expect(listFilters({ environmentUuid: 'env 1', enabled: true }))
      .toEqual(['search[environment_uuid]=env%201', 'search[enabled]=true']);
    expect(listFilters({ enabled: false })).toEqual(['search[enabled]=false']);
    expect(listFilters({ enabled: 'true' })).toEqual(['search[enabled]=true']);
    expect(listFilters({ enabled: '' })).toEqual([]);
    expect(listFilters({})).toEqual([]);
  });

  it("sends none for a user: the API forces the user's environment, and reads a search as a name", () => {
    localStorage.setItem('user_auth', JSON.stringify({ token: 'user-token' }));
    expect(listFilters({ environmentUuid: 'env-1', enabled: true })).toEqual([]);
  });
});
