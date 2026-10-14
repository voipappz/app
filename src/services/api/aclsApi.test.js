import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  toFormData: vi.fn(),
}));

import { apiService } from '../apiService';
import { aclsApi } from './aclsApi';

describe('ACL permission arrays', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads legacy strings as arrays without mutating the response', async () => {
    const acl = { uuid: 'role-1', data: { calls: { main: 'read,write,click2call' } } };
    apiService.get.mockResolvedValue(acl);
    expect((await aclsApi.getACL('role-1')).data.calls.main).toEqual(['read', 'write', 'click2call']);
    expect(acl.data.calls.main).toBe('read,write,click2call');
  });

  it('creates using a JSON object with permission arrays', async () => {
    const acl = { name: 'Role', type: 'account', data: { calls: { main: ['read', 'write'] } } };
    await aclsApi.createACL(acl);
    expect(apiService.post).toHaveBeenCalledWith('/api/acls', acl, {}, 'creating ACL', true);
  });

  it('saves arrays including revoked permissions and empty notes', async () => {
    const acl = { notes: '', data: { calls: { main: ['read'] }, users: { main: [] } } };
    await aclsApi.updateACL('role-1', acl);
    expect(apiService.patch).toHaveBeenCalledWith('/api/acls/role-1', acl, {}, 'updating ACL role-1', true);
  });

  it('preserves clear-all and converts legacy values on save', async () => {
    await aclsApi.updateACL('role-1', { data: {} });
    expect(apiService.patch.mock.calls[0][1]).toEqual({ data: {} });
    await aclsApi.updateACL('role-1', { data: { calls: { main: 'read,write' } } });
    expect(apiService.patch.mock.calls[1][1].data.calls.main).toEqual(['read', 'write']);
  });
});
