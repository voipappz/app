import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePermissions } from './usePermissions';
import { getPermittedTopbarItems, TOPBAR_NAV_ITEMS } from '../config/navConfig';

const admin = vi.fn();
const portal = vi.fn();
vi.mock('../context/AuthContext', () => ({ useAuth: () => admin() }));
vi.mock('../context/UserAuthContext', () => ({ useUserAuth: () => portal() }));

// The same ACL shape both sessions land on: screen -> { main: [actions] }.
const aclWith = (...screens) => ({ data: Object.fromEntries(screens.map((s) => [s, { main: ['read', 'write'] }])) });

describe('usePermissions under a portal user session', () => {
  it('answers from the user ACL, not the absent admin one', () => {
    admin.mockReturnValue({ acl: null, isAuthenticated: false });
    portal.mockReturnValue({ acl: aclWith('logs', 'calls'), isAuthenticated: true });

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canAccess('logs')).toBe(true);
    expect(result.current.canAccess('monitors')).toBe(false);
    expect(result.current.can('calls', 'write')).toBe(true);
  });

  it('keeps the top-bar tools to what the user ACL grants', () => {
    const items = getPermittedTopbarItems(aclWith('logs'), { strict: true }).map((i) => i.path);

    expect(items).toEqual(['/events', '/logs']);
    expect(TOPBAR_NAV_ITEMS.map((i) => i.path)).toContain('/monitoring');
  });

  it('prefers the admin ACL while an account is signed in', () => {
    admin.mockReturnValue({ acl: aclWith('monitors'), isAuthenticated: true });
    portal.mockReturnValue({ acl: aclWith('logs'), isAuthenticated: true });

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canAccess('monitors')).toBe(true);
    expect(result.current.canAccess('logs')).toBe(false);
  });
});

// A user's ACL may limit route types (`routes.types`); an account's sets none.
describe('usePermissions route types', () => {
  const asUser = (acl) => {
    admin.mockReturnValue({ acl: null, isAuthenticated: false });
    portal.mockReturnValue({ acl, isAuthenticated: true });
    return renderHook(() => usePermissions()).result.current;
  };

  it('allows only the listed types, and writing only with the routes write grant', () => {
    const perms = asUser({ data: { routes: { main: ['read', 'write'], types: ['src', 'feature:spy'] } } });

    expect(perms.routeTypes).toEqual(['src', 'feature:spy']);
    expect(perms.canRouteType('src', 'write')).toBe(true);
    expect(perms.canRouteType('dst', 'write')).toBe(false);
    expect(perms.canAccess('routes')).toBe(true);
  });

  it('keeps a read-only grant read-only for every type', () => {
    const perms = asUser({ data: { routes: { main: ['read'], types: ['src'] } } });

    expect(perms.canRouteType('src', 'read')).toBe(true);
    expect(perms.canRouteType('src', 'write')).toBe(false);
  });

  it('reads a document that still says dids', () => {
    const perms = asUser({ data: { dids: { main: ['read', 'write'], types: ['dst'] } } });

    expect(perms.canRouteType('dst', 'write')).toBe(true);
    expect(perms.canRouteType('src', 'write')).toBe(false);
  });

  it('sets no limit when the ACL has no type list', () => {
    const perms = asUser(aclWith('routes'));

    expect(perms.routeTypes).toBeNull();
    expect(perms.canRouteType('anything', 'write')).toBe(true);
  });
});
