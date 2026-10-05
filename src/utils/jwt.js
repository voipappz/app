import { jwtDecode } from 'jwt-decode';

export const getAccountUuidFromToken = (accessToken, refreshToken = null) => {
  try {
    // Prefer refresh token as it has account_uuid field (matches AngularJS pattern)
    if (refreshToken) {
      const refreshDecoded = jwtDecode(refreshToken);
      if (refreshDecoded.account_uuid) {
        return refreshDecoded.account_uuid;
      }
    }
    
    if (!accessToken) return null;
    
    const decoded = jwtDecode(accessToken);
    // In access token, the account UUID is in 'uuid' field
    return decoded.account_uuid || decoded.uuid || null;
  } catch (error) {
    console.error('Error decoding JWT token:', error);
    return null;
  }
};

export const isTokenExpired = (token) => {
  try {
    if (!token) return true;

    const decoded = jwtDecode(token);
    const currentTime = Date.now() / 1000;

    return decoded.exp < currentTime;
  } catch (error) {
    console.error('Error checking token expiration:', error);
    return true;
  }
};

export const getAccountDataFromToken = (accessToken) => {
  try {
    if (!accessToken) return null;

    const decoded = jwtDecode(accessToken);

    // Extract customer info (account's assigned customer)
    const customer = decoded.customer ? {
      uuid: decoded.customer.uuid,
      name: decoded.customer.name,
      profile: decoded.customer.profile || {}
    } : null;

    // Root flag — the signed top-level `root` claim is the only source. The
    // server derives it from the VA_ROOT deployment variable, so an account
    // meta/profile flag can no longer hand itself cross-tenant access.
    // Accepts boolean true or the string "true".
    const meta = decoded.meta || {};
    const truthy = (v) => v === true || v === 'true';
    const isRoot = truthy(decoded.root);

    // Extract ACL permissions from token
    // ACL structure: { category: { element: ['read', 'write', 'delete'] } }
    const acl = decoded.acl || null;

    return {
      accountUuid: decoded.uuid,
      accountName: decoded.name,
      accountEmail: decoded.email,
      customer,
      meta,
      isRoot,
      acl
    };
  } catch (error) {
    console.error('Error extracting account data from JWT:', error);
    return null;
  }
};

/**
 * Check if user has a specific permission for a screen/element
 * Matches legacy AngularJS admin ACL logic from sidebar.js:324
 *
 * @param {Object} acl - ACL object from JWT token
 * @param {string} screen - Screen name (e.g., 'users', 'accounts', 'environments')
 * @param {string} permission - Permission type: 'read', 'write', 'delete'
 * @returns {boolean} - true if user has the permission
 *
 * Legacy logic: $rootScope.root.acl.data[screen_name] || $rootScope.root.acl.data[screen_name.substring(0, screen_name.length-1)]
 * ACL Structure from API: { data: { dids: { main: ["read", "write"] }, users: { main: ["read"] } }, uuid: "..." }
 * Also supports: { screens: {...} } and direct { dids: {...}, users: {...} } formats
 */
/**
 * Capabilities that were renamed. `dids` became `routes` when /api/dids became
 * /api/routes and the screen was renamed, but the key is DATA: every ACL
 * document written before that says `dids`, and the API aliases the two
 * (Acl::CAPABILITY_ALIASES) rather than migrating rows. Without the same alias
 * here, an account whose ACL says `dids` failed canAccess('routes'), and the
 * Routes screen bounced to /account ("Edit Account") for everyone.
 */
// `call` (user role) and `calls` (account role) are one capability, as in the API.
export const CAPABILITY_ALIASES = Object.freeze({ routes: 'dids', dids: 'routes', calls: 'call', call: 'calls' });

// Calls is one read/write permission. A role saved before that may list only
// `history: [view, ...]` for it, which always meant "may see calls" -- the API
// reads it the same way (Acl#can?).
const legacyCallsRead = (screen, permission, screenPerms) =>
  permission === 'read' && (screen === 'calls' || screen === 'call') &&
  typeof screenPerms === 'object' && screenPerms !== null && !Array.isArray(screenPerms) &&
  Object.entries(screenPerms).some(([key, perms]) =>
    key !== 'main' && (Array.isArray(perms) ? perms.length > 0 : Boolean(perms)));

export const hasPermission = (acl, screen, permission = 'read') => {
  // SECURITY: If no ACL is defined, deny all access
  if (!acl) {
    return false;
  }
  // No screen key -> nothing to check; deny rather than crash on screen.length
  // (nav items without an aclKey are handled BEFORE this is called)
  if (!screen) {
    return false;
  }

  // Support multiple ACL formats:
  // 1. Nested under 'data' property (current API format): { data: { users: {...}, dids: {...} } }
  // 2. Nested under 'screens' property: { screens: { users: {...}, dids: {...} } }
  // 3. Direct format (legacy): { users: {...}, dids: {...} }
  const aclData = acl.data || acl.screens || acl;

  // Permissions can be an array (['read','write']) or a comma-separated string
  // ("read,write"), at the top level or nested under a key like 'main'.
  const hasPerm = (perms) => {
    if (Array.isArray(perms)) return perms.includes(permission);
    if (typeof perms === 'string') {
      return perms.split(',').map(p => p.trim()).includes(permission);
    }
    return false;
  };

  // Helper to check permissions in nested structure (e.g., { main: 'read,write' })
  const checkScreenPerms = (screenPerms) => {
    // Direct array or comma-separated string: ['read','write'] / "read,write"
    if (Array.isArray(screenPerms) || typeof screenPerms === 'string') {
      return hasPerm(screenPerms);
    }

    // Nested structure: { main: ['read','write'] } or { main: "read,write" }
    if (typeof screenPerms === 'object' && screenPerms !== null) {
      for (const [, perms] of Object.entries(screenPerms)) {
        if (hasPerm(perms)) {
          return true;
        }
      }
    }

    return false;
  };

  // Match legacy admin logic: check exact screen name first
  if (aclData[screen]) {
    return checkScreenPerms(aclData[screen]) || legacyCallsRead(screen, permission, aclData[screen]);
  }

  // Then the other spelling of the same capability (routes <-> dids, calls <-> call).
  const alias = CAPABILITY_ALIASES[screen];
  if (alias && aclData[alias]) {
    return checkScreenPerms(aclData[alias]) || legacyCallsRead(screen, permission, aclData[alias]);
  }

  // Then check singular form (screen name minus last character)
  // Legacy: screen_name.substring(0, screen_name.length-1)
  if (screen.length > 1) {
    const singularForm = screen.slice(0, -1);
    if (aclData[singularForm]) {
      return checkScreenPerms(aclData[singularForm]);
    }
  }

  // Screen not found in ACL (silent failure - normal behavior)
  return false;
};

/**
 * Whether the user can access (see) a screen at all.
 * A screen is accessible if the user has any of read / index / list on it.
 * Used by route guards and nav filtering.
 *
 * @param {Object} acl - ACL object from JWT token
 * @param {string} screen - Screen name (e.g., 'users', 'routes')
 * @returns {boolean}
 */
export const canAccessScreen = (acl, screen) =>
  hasPermission(acl, screen, 'read') ||
  hasPermission(acl, screen, 'index') ||
  hasPermission(acl, screen, 'list');

/**
 * Get list of screens user has read access to
 * @param {Object} acl - ACL object from JWT token
 * @returns {string[]} - Array of screen names with read access (empty array if no ACL)
 *
 * NOTE: The 'root' flag is ONLY for customer/environment selection, NOT for bypassing ACL.
 * ACL permissions always apply regardless of root status.
 */
export const getAccessibleScreens = (acl) => {
  // SECURITY: If no ACL is defined, deny all access - return empty array
  // NOTE: root flag does NOT bypass ACL - it's only for customer/environment selection
  if (!acl) return [];

  const screens = [];
  // Support multiple ACL formats (same as hasPermission)
  const aclData = acl.data || acl.screens || acl;

  for (const [screenName, permissions] of Object.entries(aclData)) {
    if (Array.isArray(permissions)) {
      if (permissions.includes('read') || permissions.includes('index') || permissions.includes('list')) {
        screens.push(screenName);
      }
    } else if (typeof permissions === 'object') {
      // Nested structure - check if any element has read permission
      for (const element of Object.values(permissions)) {
        if (Array.isArray(element) && (element.includes('read') || element.includes('index') || element.includes('list'))) {
          screens.push(screenName);
          break;
        }
      }
    }
  }

  return screens;
};

/**
 * Get token expiration time from JWT's exp claim
 * @param {string} token - JWT token
 * @returns {Date|null} - Expiration date or null if invalid
 */
export const getTokenExpiry = (token) => {
  try {
    if (!token) return null;

    const decoded = jwtDecode(token);
    if (decoded.exp) {
      // exp is in seconds, convert to milliseconds
      return new Date(decoded.exp * 1000);
    }
    return null;
  } catch (error) {
    console.error('Error getting token expiry:', error);
    return null;
  }
};

/**
 * Check if token is valid (not expired with optional buffer time)
 * @param {string} token - JWT token
 * @param {number} bufferMs - Buffer time in milliseconds before actual expiry (default 60 seconds)
 * @returns {boolean} - true if token is valid
 */
export const isTokenValid = (token, bufferMs = 60000) => {
  try {
    if (!token) return false;

    const expiry = getTokenExpiry(token);
    if (!expiry) return false;

    const now = Date.now();
    return expiry.getTime() > now + bufferMs;
  } catch (error) {
    console.error('Error checking token validity:', error);
    return false;
  }
};