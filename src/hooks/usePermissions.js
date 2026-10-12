import { useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserAuth } from '../context/UserAuthContext';
import { hasPermission, canAccessScreen, allowedRouteTypes } from '../utils/jwt';

/**
 * Encapsulated permission API for components.
 *
 * Components should NEVER read the raw `acl` object or call `hasPermission`
 * directly — they ask this hook instead. All ACL-structure knowledge lives in
 * `utils/jwt.js`; this hook is a thin, logic-free binding of `acl` from auth
 * state to those pure functions.
 *
 * Binds whichever session is actually active. The two surfaces carry unrelated
 * JWTs (see UserAuthContext.jsx) but land on the SAME acl shape — the admin's
 * from its token's claims, the portal's from `user.acl.data` in the login
 * response body — so both feed the same pure functions below. Without this
 * fallback every screen shared with the portal (DIDs, PBXRouting) reads an
 * admin `acl` of null under a portal session and silently renders read-only.
 *
 * Usage:
 *   const { can } = usePermissions();
 *   {can('accounts', 'write') && <EditButton/>}
 *   if (!canAccess('routes')) return <Redirect/>;
 *
 * Route types: a user's ACL may limit them (`routes.types`).
 *   routeTypes                  -> the allowed list, or null for no limit
 *   canRouteType('src','write') -> the `routes` grant AND the type allowed
 *
 * @returns {{ can: (screen: string, action?: string) => boolean,
 *            canAccess: (screen: string) => boolean,
 *            routeTypes: string[] | null,
 *            canRouteType: (type: string, action?: string) => boolean }}
 */
export function usePermissions() {
  const { acl: adminAcl, isAuthenticated: adminAuthenticated } = useAuth();
  const { acl: portalAcl, isAuthenticated: portalAuthenticated } = useUserAuth();

  // Admin wins when both are live: an admin browsing a dual-surface screen is
  // acting as an admin, and its ACL is the one the admin routes were gated on.
  const acl = adminAuthenticated ? adminAcl : (portalAuthenticated ? portalAcl : null);

  const can = useCallback(
    (screen, action = 'read') => hasPermission(acl, screen, action),
    [acl]
  );

  const canAccess = useCallback(
    (screen) => canAccessScreen(acl, screen),
    [acl]
  );

  const routeTypes = useMemo(() => allowedRouteTypes(acl), [acl]);

  const canRouteType = useCallback(
    (type, action = 'read') => hasPermission(acl, 'routes', action) && (!routeTypes || routeTypes.includes(type)),
    [acl, routeTypes]
  );

  return useMemo(() => ({ can, canAccess, routeTypes, canRouteType }), [can, canAccess, routeTypes, canRouteType]);
}
