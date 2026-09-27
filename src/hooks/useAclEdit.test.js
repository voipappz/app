import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aclsApi } from '../services/api/aclsApi';
import useAclEdit from './useAclEdit';

vi.mock('../services/api/aclsApi', () => ({ aclsApi: {
  getACL: vi.fn(), updateACL: vi.fn(), getACLTypes: vi.fn(), getACLTypeData: vi.fn(),
  getACLs: vi.fn(), createACL: vi.fn(), deleteACL: vi.fn(),
} }));

beforeEach(() => {
  vi.clearAllMocks();
  aclsApi.getACLTypes.mockResolvedValue(['account', 'user']);
  aclsApi.getACLTypeData.mockResolvedValue({ users: { main: ['read', 'write'] } });
});

describe('useAclEdit', () => {
  it('opens with the full ACL and its type structure', async () => {
    aclsApi.getACL.mockResolvedValue({ uuid: 'acl-1', name: 'Agent', type: 'user', data: { users: { main: ['read'] } } });
    const { result } = renderHook(() => useAclEdit());
    await act(() => result.current.handleAclEdit({ uuid: 'acl-1', name: 'Agent' }));
    expect(result.current.aclDialogOpen).toBe(true);
    await waitFor(() => expect(result.current.aclDialogAcl?.type).toBe('user'));
    expect(aclsApi.getACLTypeData).toHaveBeenCalledWith('user');
    expect(result.current.types).toEqual(['account', 'user']);
  });

  it('falls back to the row when the full ACL cannot be fetched', async () => {
    aclsApi.getACL.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useAclEdit());
    await act(() => result.current.handleAclEdit({ uuid: 'acl-1', name: 'Agent' }));
    expect(result.current.aclDialogAcl).toEqual({ uuid: 'acl-1', name: 'Agent' });
  });

  it('saves with PATCH and closes', async () => {
    aclsApi.getACL.mockResolvedValue({ uuid: 'acl-1', name: 'Agent', type: 'user' });
    aclsApi.updateACL.mockResolvedValue({});
    const { result } = renderHook(() => useAclEdit());
    await act(() => result.current.handleAclEdit({ uuid: 'acl-1' }));
    await act(() => result.current.handleAclSave({ name: 'Agents' }));
    expect(aclsApi.updateACL).toHaveBeenCalledWith('acl-1', { name: 'Agents' });
    expect(result.current.aclDialogOpen).toBe(false);
  });
});
