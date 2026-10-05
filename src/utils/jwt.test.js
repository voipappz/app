import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAccountUuidFromToken,
  isTokenExpired,
  getAccountDataFromToken,
  getTokenExpiry,
  isTokenValid,
  hasPermission,
  getAccessibleScreens,
  canAccessScreen
} from './jwt';

// Mock JWT tokens for testing
// JWT structure: header.payload.signature (base64 encoded)
// We'll create valid-looking tokens with known payloads

// Helper to create a mock JWT token with a given payload
const createMockToken = (payload) => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadBase64 = btoa(JSON.stringify(payload));
  const signature = 'mock_signature';
  return `${header}.${payloadBase64}.${signature}`;
};

describe('JWT Utilities', () => {
  // Store original Date.now
  let originalDateNow;

  beforeEach(() => {
    originalDateNow = Date.now;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Date.now = originalDateNow;
    vi.restoreAllMocks();
  });

  describe('getTokenExpiry', () => {
    it('should return null for null/undefined token', () => {
      expect(getTokenExpiry(null)).toBeNull();
      expect(getTokenExpiry(undefined)).toBeNull();
      expect(getTokenExpiry('')).toBeNull();
    });

    it('should return expiry date from JWT exp claim', () => {
      const expTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const token = createMockToken({ exp: expTimestamp });

      const expiry = getTokenExpiry(token);

      expect(expiry).toBeInstanceOf(Date);
      expect(expiry.getTime()).toBe(expTimestamp * 1000);
    });

    it('should return null for token without exp claim', () => {
      const token = createMockToken({ uuid: 'test-uuid', name: 'Test User' });

      const expiry = getTokenExpiry(token);

      expect(expiry).toBeNull();
    });

    it('should return null for invalid token', () => {
      const expiry = getTokenExpiry('invalid.token.format');

      expect(expiry).toBeNull();
    });
  });

  describe('isTokenValid', () => {
    it('should return false for null/undefined token', () => {
      expect(isTokenValid(null)).toBe(false);
      expect(isTokenValid(undefined)).toBe(false);
      expect(isTokenValid('')).toBe(false);
    });

    it('should return true for token with valid expiry (more than buffer time remaining)', () => {
      // Token expires in 2 hours
      const expTimestamp = Math.floor(Date.now() / 1000) + 7200;
      const token = createMockToken({ exp: expTimestamp });

      // Default buffer is 60 seconds
      expect(isTokenValid(token)).toBe(true);
    });

    it('should return false for expired token', () => {
      // Token expired 1 hour ago
      const expTimestamp = Math.floor(Date.now() / 1000) - 3600;
      const token = createMockToken({ exp: expTimestamp });

      expect(isTokenValid(token)).toBe(false);
    });

    it('should return false for token expiring within buffer time', () => {
      // Token expires in 30 seconds
      const expTimestamp = Math.floor(Date.now() / 1000) + 30;
      const token = createMockToken({ exp: expTimestamp });

      // Default buffer is 60 seconds, so 30 seconds remaining should be invalid
      expect(isTokenValid(token, 60000)).toBe(false);
    });

    it('should use custom buffer time', () => {
      // Token expires in 30 seconds
      const expTimestamp = Math.floor(Date.now() / 1000) + 30;
      const token = createMockToken({ exp: expTimestamp });

      // With 10 second buffer, 30 seconds remaining should be valid
      expect(isTokenValid(token, 10000)).toBe(true);

      // With 60 second buffer, 30 seconds remaining should be invalid
      expect(isTokenValid(token, 60000)).toBe(false);
    });

    it('should return false for token without exp claim', () => {
      const token = createMockToken({ uuid: 'test-uuid' });

      expect(isTokenValid(token)).toBe(false);
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for null/undefined token', () => {
      expect(isTokenExpired(null)).toBe(true);
      expect(isTokenExpired(undefined)).toBe(true);
    });

    it('should return false for valid non-expired token', () => {
      // Token expires in 1 hour
      const expTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({ exp: expTimestamp });

      expect(isTokenExpired(token)).toBe(false);
    });

    it('should return true for expired token', () => {
      // Token expired 1 hour ago
      const expTimestamp = Math.floor(Date.now() / 1000) - 3600;
      const token = createMockToken({ exp: expTimestamp });

      expect(isTokenExpired(token)).toBe(true);
    });
  });

  describe('getAccountUuidFromToken', () => {
    it('should return null for no tokens', () => {
      expect(getAccountUuidFromToken(null)).toBeNull();
      expect(getAccountUuidFromToken(null, null)).toBeNull();
    });

    it('should extract account_uuid from refresh token', () => {
      const accessToken = createMockToken({ uuid: 'access-uuid' });
      const refreshToken = createMockToken({ account_uuid: 'refresh-account-uuid' });

      const result = getAccountUuidFromToken(accessToken, refreshToken);

      expect(result).toBe('refresh-account-uuid');
    });

    it('should fallback to access token uuid if refresh token has no account_uuid', () => {
      const accessToken = createMockToken({ uuid: 'access-uuid' });
      const refreshToken = createMockToken({ something: 'else' });

      const result = getAccountUuidFromToken(accessToken, refreshToken);

      expect(result).toBe('access-uuid');
    });

    it('should use access token if no refresh token provided', () => {
      const accessToken = createMockToken({ uuid: 'access-uuid' });

      const result = getAccountUuidFromToken(accessToken);

      expect(result).toBe('access-uuid');
    });
  });

  describe('getAccountDataFromToken', () => {
    it('should return null for no token', () => {
      expect(getAccountDataFromToken(null)).toBeNull();
      expect(getAccountDataFromToken(undefined)).toBeNull();
    });

    it('should extract customer data from token', () => {
      const token = createMockToken({
        uuid: 'account-uuid',
        name: 'Test Account',
        email: 'test@example.com',
        customer: {
          uuid: 'customer-uuid',
          name: 'Test Customer',
          profile: { language: 'en' }
        },
        root: true
      });

      const result = getAccountDataFromToken(token);

      expect(result.accountUuid).toBe('account-uuid');
      expect(result.accountName).toBe('Test Account');
      expect(result.accountEmail).toBe('test@example.com');
      expect(result.customer.uuid).toBe('customer-uuid');
      expect(result.customer.name).toBe('Test Customer');
      expect(result.isRoot).toBe(true);
    });

    it('should handle the root claim as string "true"', () => {
      const token = createMockToken({
        uuid: 'account-uuid',
        root: 'true'
      });

      const result = getAccountDataFromToken(token);

      expect(result.isRoot).toBe(true);
    });

    // Root is VA_ROOT on the API — meta.root is no longer a source.
    it('should ignore meta.root', () => {
      const token = createMockToken({
        uuid: 'account-uuid',
        meta: { root: 'true' }
      });

      const result = getAccountDataFromToken(token);

      expect(result.isRoot).toBe(false);
    });

    it('should return isRoot false for non-root accounts', () => {
      const token = createMockToken({
        uuid: 'account-uuid',
        root: false
      });

      const result = getAccountDataFromToken(token);

      expect(result.isRoot).toBe(false);
    });

    it('should handle missing customer', () => {
      const token = createMockToken({
        uuid: 'account-uuid',
        name: 'Test Account'
      });

      const result = getAccountDataFromToken(token);

      expect(result.customer).toBeNull();
    });

    it('should extract ACL from token', () => {
      const token = createMockToken({
        uuid: 'account-uuid',
        acl: {
          users: ['read', 'write'],
          accounts: ['read']
        }
      });

      const result = getAccountDataFromToken(token);

      expect(result.acl).toEqual({
        users: ['read', 'write'],
        accounts: ['read']
      });
    });

    it('should return null ACL if not present in token', () => {
      const token = createMockToken({
        uuid: 'account-uuid',
        name: 'Test Account'
      });

      const result = getAccountDataFromToken(token);

      expect(result.acl).toBeNull();
    });
  });

  describe('hasPermission - renamed capabilities', () => {
    // The API aliases routes <-> dids instead of migrating stored ACLs, so an
    // account whose document still says `dids` must reach the Routes screen.
    it('grants routes from a document that says dids', () => {
      const acl = { data: { dids: { main: ['read', 'write'] } } };
      expect(hasPermission(acl, 'routes', 'read')).toBe(true);
      expect(hasPermission(acl, 'routes', 'write')).toBe(true);
      expect(canAccessScreen(acl, 'routes')).toBe(true);
    });

    it('grants dids from a document that says routes', () => {
      const acl = { data: { routes: { main: ['read'] } } };
      expect(hasPermission(acl, 'dids', 'read')).toBe(true);
      expect(hasPermission(acl, 'dids', 'write')).toBe(false);
    });

    it('prefers the exact key when both are present', () => {
      const acl = { data: { routes: { main: ['read'] }, dids: { main: ['read', 'write'] } } };
      expect(hasPermission(acl, 'routes', 'write')).toBe(false);
    });

    it('does not alias anything else', () => {
      const acl = { data: { dids: { main: ['read', 'write'] } } };
      expect(hasPermission(acl, 'users', 'read')).toBe(false);
      expect(canAccessScreen(acl, 'accounts')).toBe(false);
    });
  });

  describe('hasPermission - SECURITY TESTS', () => {
    // CRITICAL: These tests ensure ACL security is properly enforced
    // NOTE: root flag is ONLY for customer/environment selection, NOT for bypassing ACL

    describe('Security: Null ACL handling', () => {
      it('SECURITY: should DENY access when ACL is null', () => {
        // This is the most critical security test - null ACL means NO access
        expect(hasPermission(null, 'users', 'read')).toBe(false);
        expect(hasPermission(null, 'accounts', 'read')).toBe(false);
        expect(hasPermission(null, 'environments', 'read')).toBe(false);
      });

      it('SECURITY: should DENY access when ACL is undefined', () => {
        expect(hasPermission(undefined, 'users', 'read')).toBe(false);
        expect(hasPermission(undefined, 'accounts', 'read')).toBe(false);
      });

      it('SECURITY: should DENY access when ACL is empty object', () => {
        expect(hasPermission({}, 'users', 'read')).toBe(false);
        expect(hasPermission({}, 'accounts', 'read')).toBe(false);
      });

      it('SECURITY: root flag does NOT bypass ACL - null ACL still denies access', () => {
        // Root is only for customer/environment selection, not for bypassing ACL
        // Even root users need ACL permissions to access screens
        expect(hasPermission(null, 'users', 'read')).toBe(false);
        expect(hasPermission(null, 'accounts', 'read')).toBe(false);
      });

      it('SECURITY: root flag does NOT bypass ACL - empty ACL still denies access', () => {
        // Root is only for customer/environment selection, not for bypassing ACL
        expect(hasPermission({}, 'users', 'read')).toBe(false);
        expect(hasPermission({}, 'accounts', 'read')).toBe(false);
      });
    });

    describe('Direct screen mapping (ACL format: { screen: [permissions] })', () => {
      const acl = {
        users: ['read', 'write', 'delete'],
        accounts: ['read'],
        environments: ['read', 'write'],
        dids: ['read']
      };

      it('should grant permission when present in ACL', () => {
        expect(hasPermission(acl, 'users', 'read')).toBe(true);
        expect(hasPermission(acl, 'users', 'write')).toBe(true);
        expect(hasPermission(acl, 'users', 'delete')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'read')).toBe(true);
      });

      it('should deny permission when not present in ACL', () => {
        expect(hasPermission(acl, 'accounts', 'write')).toBe(false);
        expect(hasPermission(acl, 'accounts', 'delete')).toBe(false);
        expect(hasPermission(acl, 'dids', 'write')).toBe(false);
      });

      it('should deny access to screens not in ACL', () => {
        expect(hasPermission(acl, 'providers', 'read')).toBe(false);
        expect(hasPermission(acl, 'services', 'read')).toBe(false);
        expect(hasPermission(acl, 'subscriptions', 'read')).toBe(false);
      });

      it('should use read as default permission type', () => {
        expect(hasPermission(acl, 'users')).toBe(true);
        expect(hasPermission(acl, 'accounts')).toBe(true);
        expect(hasPermission(acl, 'providers')).toBe(false);
      });
    });

    describe('Nested screen mapping (ACL format: { screen: { element: [permissions] } })', () => {
      const acl = {
        users: {
          list: ['read', 'index'],
          detail: ['read', 'write'],
          create: ['write']
        },
        accounts: {
          list: ['read']
        }
      };

      it('should grant permission when any element has the permission', () => {
        expect(hasPermission(acl, 'users', 'read')).toBe(true);
        expect(hasPermission(acl, 'users', 'write')).toBe(true);
        expect(hasPermission(acl, 'users', 'index')).toBe(true);
      });

      it('should deny permission when no element has it', () => {
        expect(hasPermission(acl, 'users', 'delete')).toBe(false);
        expect(hasPermission(acl, 'accounts', 'write')).toBe(false);
      });
    });

    describe('Screens wrapper format (ACL format: { screens: { screen: [permissions] } })', () => {
      const acl = {
        screens: {
          users: ['read', 'write'],
          accounts: ['read']
        }
      };

      it('should check screens wrapper for permissions', () => {
        expect(hasPermission(acl, 'users', 'read')).toBe(true);
        expect(hasPermission(acl, 'users', 'write')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'read')).toBe(true);
      });

      it('should deny when permission not in screens wrapper', () => {
        expect(hasPermission(acl, 'accounts', 'write')).toBe(false);
        expect(hasPermission(acl, 'environments', 'read')).toBe(false);
      });
    });

    describe('Data wrapper format (API format: { data: { screen: { main: [permissions] } } })', () => {
      // This is the actual format returned by the API
      const acl = {
        data: {
          users: { main: ['read', 'write'] },
          accounts: { main: ['read'] },
          dids: { main: ['read', 'write', 'delete'] },
          environments: { main: ['read'] }
        },
        uuid: 'test-acl-uuid'
      };

      it('should check data wrapper for permissions', () => {
        expect(hasPermission(acl, 'users', 'read')).toBe(true);
        expect(hasPermission(acl, 'users', 'write')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'read')).toBe(true);
        expect(hasPermission(acl, 'dids', 'delete')).toBe(true);
      });

      it('should deny when permission not in data wrapper', () => {
        expect(hasPermission(acl, 'accounts', 'write')).toBe(false);
        expect(hasPermission(acl, 'environments', 'write')).toBe(false);
        expect(hasPermission(acl, 'providers', 'read')).toBe(false);
      });

      it('should handle all screen names from API response', () => {
        // Real-world API response structure
        const realAcl = {
          data: {
            accounts: { main: ['read', 'write'] },
            translations: { main: ['read', 'write'] },
            providers: { main: ['read', 'write'] },
            announcements: { main: ['read', 'write'] },
            ivrs: { main: ['read', 'write'] },
            calls: { main: ['read', 'write', 'click2call'] },
            dids: { main: ['read', 'write'] },
            environments: { main: ['read', 'write'] },
            users: { main: ['read', 'write'] },
            queues: { main: ['read', 'write'] },
            services: { main: ['read', 'write'] },
            subscription: { main: ['read', 'write'] }
          }
        };

        // Test various screens
        expect(hasPermission(realAcl, 'users', 'read')).toBe(true);
        expect(hasPermission(realAcl, 'accounts', 'write')).toBe(true);
        expect(hasPermission(realAcl, 'providers', 'read')).toBe(true);
        expect(hasPermission(realAcl, 'dids', 'write')).toBe(true);
        expect(hasPermission(realAcl, 'environments', 'read')).toBe(true);
        expect(hasPermission(realAcl, 'services', 'write')).toBe(true);
        expect(hasPermission(realAcl, 'calls', 'click2call')).toBe(true);

        // Test subscription (singular)
        expect(hasPermission(realAcl, 'subscription', 'read')).toBe(true);
        expect(hasPermission(realAcl, 'subscriptions', 'read')).toBe(true); // Should work with plural too
      });
    });

    describe('Permission type checking', () => {
      const acl = {
        users: ['read', 'write', 'delete', 'index', 'list'],
        accounts: ['read', 'index']
      };

      it('should check for read permission', () => {
        expect(hasPermission(acl, 'users', 'read')).toBe(true);
      });

      it('should check for write permission', () => {
        expect(hasPermission(acl, 'users', 'write')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'write')).toBe(false);
      });

      it('should check for delete permission', () => {
        expect(hasPermission(acl, 'users', 'delete')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'delete')).toBe(false);
      });

      it('should check for index permission', () => {
        expect(hasPermission(acl, 'users', 'index')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'index')).toBe(true);
      });

      it('should check for list permission', () => {
        expect(hasPermission(acl, 'users', 'list')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'list')).toBe(false);
      });
    });

    describe('Root flag behavior (IMPORTANT: root is for customer selection ONLY)', () => {
      // NOTE: root flag is ONLY for customer/environment selection, NOT for bypassing ACL
      // These tests verify that ACL is always enforced regardless of root status

      it('should NOT bypass ACL for root users - null ACL denies access', () => {
        // Root users still need ACL permissions
        expect(hasPermission(null, 'users', 'read')).toBe(false);
        expect(hasPermission(null, 'accounts', 'write')).toBe(false);
      });

      it('should NOT bypass ACL for root users - must have permission in ACL', () => {
        const restrictedAcl = { users: ['read'] };
        // Even root users are limited by their ACL
        expect(hasPermission(restrictedAcl, 'users', 'read')).toBe(true);
        expect(hasPermission(restrictedAcl, 'users', 'write')).toBe(false);
        expect(hasPermission(restrictedAcl, 'users', 'delete')).toBe(false);
      });
    });

    describe('Singular/Plural screen name matching', () => {
      // This is critical for ACL keys that may be singular (e.g., "account")
      // while the menu checks for plural (e.g., "accounts") or vice versa

      it('should match ACL "account" when checking for "accounts" (singular → plural)', () => {
        const acl = { account: ['read', 'write'] };
        expect(hasPermission(acl, 'accounts', 'read')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'write')).toBe(true);
      });

      it('should NOT match ACL "accounts" when checking for "account" (legacy only removes chars, not adds)', () => {
        // Legacy implementation: screen_name.substring(0, screen_name.length-1)
        // This removes the last char (users→user), not adds chars (account→accounts)
        const acl = { accounts: ['read', 'write'] };
        expect(hasPermission(acl, 'account', 'read')).toBe(false);
        expect(hasPermission(acl, 'account', 'write')).toBe(false);
      });

      it('should match ACL "user" when checking for "users"', () => {
        const acl = { user: ['read', 'delete'] };
        expect(hasPermission(acl, 'users', 'read')).toBe(true);
        expect(hasPermission(acl, 'users', 'delete')).toBe(true);
        expect(hasPermission(acl, 'users', 'write')).toBe(false);
      });

      it('should match ACL "environment" when checking for "environments"', () => {
        const acl = { environment: ['read', 'write'] };
        expect(hasPermission(acl, 'environments', 'read')).toBe(true);
        expect(hasPermission(acl, 'environments', 'write')).toBe(true);
      });

      it('should match ACL "provider" when checking for "providers"', () => {
        const acl = { provider: ['read'] };
        expect(hasPermission(acl, 'providers', 'read')).toBe(true);
        expect(hasPermission(acl, 'providers', 'write')).toBe(false);
      });

      it('should match ACL "subscription" when checking for "subscriptions"', () => {
        const acl = { subscription: ['read', 'write', 'delete'] };
        expect(hasPermission(acl, 'subscriptions', 'read')).toBe(true);
        expect(hasPermission(acl, 'subscriptions', 'delete')).toBe(true);
      });

      it('should match singular/plural in screens wrapper format', () => {
        const acl = {
          screens: {
            account: ['read'],
            user: ['read', 'write']
          }
        };
        expect(hasPermission(acl, 'accounts', 'read')).toBe(true);
        expect(hasPermission(acl, 'users', 'read')).toBe(true);
        expect(hasPermission(acl, 'users', 'write')).toBe(true);
      });

      it('should match singular/plural in nested format', () => {
        const acl = {
          account: {
            list: ['read', 'index'],
            detail: ['read', 'write']
          }
        };
        expect(hasPermission(acl, 'accounts', 'read')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'write')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'index')).toBe(true);
      });

      it('should prefer exact match over singular/plural conversion', () => {
        // If both "account" and "accounts" exist, it should still work
        const acl = {
          account: ['read'],
          accounts: ['read', 'write']
        };
        expect(hasPermission(acl, 'accounts', 'read')).toBe(true);
        expect(hasPermission(acl, 'accounts', 'write')).toBe(true);
        expect(hasPermission(acl, 'account', 'read')).toBe(true);
      });

      it('should deny permission when neither singular nor plural has it', () => {
        const acl = { account: ['read'] };
        expect(hasPermission(acl, 'accounts', 'write')).toBe(false);
        expect(hasPermission(acl, 'accounts', 'delete')).toBe(false);
        expect(hasPermission(acl, 'account', 'write')).toBe(false);
      });

      it('should handle MTN-style ACL with singular keys', () => {
        // Real-world test case: MTN server returns ACL with singular keys
        const mtnAcl = {
          account: ['read', 'write'],
          user: ['read'],
          environment: ['read', 'write', 'delete'],
          did: ['read'],
          subscription: ['read', 'write']
        };

        // Menu checks for plural forms
        expect(hasPermission(mtnAcl, 'accounts', 'read')).toBe(true);
        expect(hasPermission(mtnAcl, 'users', 'read')).toBe(true);
        expect(hasPermission(mtnAcl, 'environments', 'read')).toBe(true);
        expect(hasPermission(mtnAcl, 'dids', 'read')).toBe(true);
        expect(hasPermission(mtnAcl, 'subscriptions', 'read')).toBe(true);

        // But should deny write when not in ACL
        expect(hasPermission(mtnAcl, 'users', 'write')).toBe(false);
        expect(hasPermission(mtnAcl, 'dids', 'write')).toBe(false);
      });
    });
  });

  describe('getAccessibleScreens - SECURITY TESTS', () => {
    // NOTE: root flag is ONLY for customer/environment selection, NOT for bypassing ACL

    describe('Security: Null ACL handling', () => {
      it('SECURITY: should return EMPTY array when ACL is null', () => {
        // Critical security test - null ACL means no accessible screens
        const result = getAccessibleScreens(null);
        expect(result).toEqual([]);
      });

      it('SECURITY: should return EMPTY array when ACL is undefined', () => {
        const result = getAccessibleScreens(undefined);
        expect(result).toEqual([]);
      });

      it('SECURITY: root flag does NOT bypass ACL - null ACL returns empty array', () => {
        // Root is only for customer/environment selection, not for bypassing ACL
        const result = getAccessibleScreens(null);
        expect(result).toEqual([]);
      });

      it('SECURITY: root flag does NOT bypass ACL - empty ACL returns empty array', () => {
        // Root is only for customer/environment selection, not for bypassing ACL
        const result = getAccessibleScreens({});
        expect(result).toEqual([]);
      });
    });

    describe('Direct screen mapping', () => {
      const acl = {
        users: ['read', 'write'],
        accounts: ['read'],
        environments: ['write'], // No read - should not be accessible
        dids: ['index'],
        services: ['list']
      };

      it('should return screens with read permission', () => {
        const result = getAccessibleScreens(acl);
        expect(result).toContain('users');
        expect(result).toContain('accounts');
      });

      it('should return screens with index permission', () => {
        const result = getAccessibleScreens(acl);
        expect(result).toContain('dids');
      });

      it('should return screens with list permission', () => {
        const result = getAccessibleScreens(acl);
        expect(result).toContain('services');
      });

      it('should NOT return screens without read/index/list', () => {
        const result = getAccessibleScreens(acl);
        expect(result).not.toContain('environments');
      });
    });

    describe('Nested screen mapping', () => {
      const acl = {
        users: {
          list: ['read'],
          detail: ['write']
        },
        accounts: {
          list: ['index']
        },
        environments: {
          detail: ['write'] // No read/index/list
        }
      };

      it('should return screens where any element has read permission', () => {
        const result = getAccessibleScreens(acl);
        expect(result).toContain('users');
      });

      it('should return screens where any element has index permission', () => {
        const result = getAccessibleScreens(acl);
        expect(result).toContain('accounts');
      });

      it('should NOT return screens without read/index/list in any element', () => {
        const result = getAccessibleScreens(acl);
        expect(result).not.toContain('environments');
      });
    });

    describe('Screens wrapper format', () => {
      const acl = {
        screens: {
          users: ['read', 'write'],
          accounts: ['index'],
          environments: ['write']
        }
      };

      it('should check screens wrapper for accessible screens', () => {
        const result = getAccessibleScreens(acl);
        expect(result).toContain('users');
        expect(result).toContain('accounts');
        expect(result).not.toContain('environments');
      });
    });

    describe('Data wrapper format (API format)', () => {
      const acl = {
        data: {
          users: { main: ['read', 'write'] },
          accounts: { main: ['read'] },
          dids: { main: ['index'] },
          environments: { main: ['write'] }, // No read/index/list
          services: { main: ['list'] }
        },
        uuid: 'test-acl-uuid'
      };

      it('should return screens with read permission in data wrapper', () => {
        const result = getAccessibleScreens(acl);
        expect(result).toContain('users');
        expect(result).toContain('accounts');
      });

      it('should return screens with index permission in data wrapper', () => {
        const result = getAccessibleScreens(acl);
        expect(result).toContain('dids');
      });

      it('should return screens with list permission in data wrapper', () => {
        const result = getAccessibleScreens(acl);
        expect(result).toContain('services');
      });

      it('should NOT return screens without read/index/list in data wrapper', () => {
        const result = getAccessibleScreens(acl);
        expect(result).not.toContain('environments');
      });

      it('should handle real API response structure', () => {
        const realAcl = {
          data: {
            accounts: { main: ['read', 'write'] },
            users: { main: ['read', 'write'] },
            dids: { main: ['read', 'write'] },
            environments: { main: ['read', 'write'] },
            providers: { main: ['read', 'write'] },
            services: { main: ['read', 'write'] },
            subscription: { main: ['read', 'write'] },
            queues: { main: ['read', 'write'] }
          }
        };

        const result = getAccessibleScreens(realAcl);

        // All screens with read permission should be accessible
        expect(result).toContain('accounts');
        expect(result).toContain('users');
        expect(result).toContain('dids');
        expect(result).toContain('environments');
        expect(result).toContain('providers');
        expect(result).toContain('services');
        expect(result).toContain('subscription');
        expect(result).toContain('queues');
      });
    });

    describe('Empty ACL', () => {
      it('should return empty array for empty ACL object', () => {
        const result = getAccessibleScreens({});
        expect(result).toEqual([]);
      });

      it('should return empty array for ACL with empty screens', () => {
        const result = getAccessibleScreens({ screens: {} });
        expect(result).toEqual([]);
      });
    });
  });

  describe('canAccessScreen', () => {
    it('denies access when ACL is missing', () => {
      expect(canAccessScreen(null, 'users')).toBe(false);
      expect(canAccessScreen(undefined, 'users')).toBe(false);
      expect(canAccessScreen({}, 'users')).toBe(false);
    });

    it('grants access with read permission (real API data format)', () => {
      const acl = { data: { accounts: { main: ['read'] } } };
      expect(canAccessScreen(acl, 'accounts')).toBe(true);
    });

    it('grants access with index or list permission', () => {
      expect(canAccessScreen({ data: { users: { main: ['index'] } } }, 'users')).toBe(true);
      expect(canAccessScreen({ data: { users: { main: ['list'] } } }, 'users')).toBe(true);
    });

    it('denies access to a screen not present in the ACL', () => {
      const acl = { data: { accounts: { main: ['read'] } } };
      expect(canAccessScreen(acl, 'dids')).toBe(false);
    });

    it('does not grant access from write-only-style permissions', () => {
      const acl = { data: { users: { main: ['write'] } } };
      expect(canAccessScreen(acl, 'users')).toBe(false);
    });
  });

  // Calls is one read/write permission; `call` (user) and `calls` (account)
  // are the same capability, and a history-only role reads as read (as the API).
  describe('Calls permission', () => {
    it('answers calls for a user role that says call', () => {
      expect(hasPermission({ data: { call: { main: ['read'] } } }, 'calls', 'read')).toBe(true);
    });

    it('answers call for an account role that says calls', () => {
      expect(hasPermission({ data: { calls: { main: 'read,write' } } }, 'call', 'write')).toBe(true);
    });

    it('reads a legacy history-only role as read, never write', () => {
      const acl = { data: { call: { history: ['view', 'filter'] } } };
      expect(hasPermission(acl, 'calls', 'read')).toBe(true);
      expect(hasPermission(acl, 'calls', 'write')).toBe(false);
    });

    it('refuses read when the entry is empty', () => {
      expect(hasPermission({ data: { call: { main: [] } } }, 'calls', 'read')).toBe(false);
    });

    it('does not apply the history rule to other screens', () => {
      expect(hasPermission({ data: { voicemail: { message: ['view'] } } }, 'voicemail', 'read')).toBe(false);
    });
  });
});
