import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLiveEnvironments } from './useLiveEnvironment';

let portalUser = null;
let env = {};
vi.mock('../../context/UserAuthContext', () => ({ useUserAuth: () => ({ user: portalUser }) }));
vi.mock('../../context/CustomerEnvironmentContext', () => ({ useCustomerEnvironment: () => env }));

const sales = { uuid: 'env-1', name: 'Sales' };
const support = { uuid: 'env-2', name: 'Support' };

beforeEach(() => {
  portalUser = null;
  env = { selectedCustomer: { uuid: 'cust-1' }, selectedEnvironments: [sales, support] };
});

// Live has no picker: the signed-in identity says which environments it shows.
describe('the environments Live shows', () => {
  it("is a portal user's one environment", () => {
    portalUser = { environment: { uuid: 'env-9', name: 'Mine' } };
    const { result } = renderHook(() => useLiveEnvironments());
    expect(result.current).toMatchObject({ uuids: ['env-9'], environments: [{ uuid: 'env-9', name: 'Mine' }], own: true });
  });

  it("is every environment an account selected in the top bar", () => {
    const { result } = renderHook(() => useLiveEnvironments());
    expect(result.current).toMatchObject({ uuids: ['env-1', 'env-2'], environments: [sales, support], own: false });
  });

  it('is none when the account has nothing selected', () => {
    env.selectedEnvironments = [];
    const { result } = renderHook(() => useLiveEnvironments());
    expect(result.current.uuids).toEqual([]);
  });

  it('keeps the same list between renders, so the live subscriptions stay put', () => {
    const { result, rerender } = renderHook(() => useLiveEnvironments());
    const first = result.current.uuids;
    rerender();
    expect(result.current.uuids).toBe(first);
  });
});
