/**
 * ACL Service - Handles permission checking
 * Instance is created per logged-in user in AuthContext
 *
 * Permission format: resource:action (e.g., 'orders:read', 'companies:write')
 */
export class ACLService {
  constructor(permissions = []) {
    this.permissions = Array.isArray(permissions) ? permissions : [];
  }

  /**
   * Check if user has a specific permission
   * Supports:
   * - Wildcards: '*' (all) and 'resource:*' (all actions on resource)
   * - CRUD hierarchy: write/delete imply read (safety net)
   * @param {string} permission - Permission to check (e.g., 'orders:read')
   * @returns {boolean}
   */
  can(permission) {
    if (!this.permissions || this.permissions.length === 0) return false;

    // Admin wildcard - has all permissions
    if (this.permissions.includes('*')) return true;

    // Exact match
    if (this.permissions.includes(permission)) return true;

    // Resource wildcard (e.g., 'orders:*' covers 'orders:read')
    const [resource, action] = permission.split(':');
    if (this.permissions.includes(`${resource}:*`)) return true;

    // CRUD hierarchy: write/delete imply read (safety net)
    // This ensures users with write/delete can always view the resource
    if (action === 'read') {
      if (this.permissions.includes(`${resource}:write`)) return true;
      if (this.permissions.includes(`${resource}:delete`)) return true;
    }

    return false;
  }

  /**
   * Check if user has ANY of the specified permissions
   * @param {string[]} actions - Array of permissions
   * @returns {boolean}
   */
  canAny(actions) {
    return actions.some(action => this.can(action));
  }

  /**
   * Check if user has ALL of the specified permissions
   * @param {string[]} actions - Array of permissions
   * @returns {boolean}
   */
  canAll(actions) {
    return actions.every(action => this.can(action));
  }

  /**
   * Get all permissions for debugging
   * @returns {any}
   */
  getPermissions() {
    return this.permissions;
  }

  /**
   * Check if user has wildcard permission (e.g., 'admin:*' grants all admin permissions)
   * @param {string} action - Permission to check
   * @returns {boolean}
   */
  hasWildcard(action) {
    if (!Array.isArray(this.permissions)) return false;

    // Extract namespace (e.g., 'orders' from 'orders:read')
    const [namespace] = action.split(':');
    const wildcardPermission = `${namespace}:*`;

    return this.permissions.includes(wildcardPermission) || this.permissions.includes('*');
  }

  /**
   * Enhanced can method with wildcard support
   * @param {string} action - Permission to check
   * @returns {boolean}
   */
  canWithWildcard(action) {
    return this.can(action) || this.hasWildcard(action);
  }
}
