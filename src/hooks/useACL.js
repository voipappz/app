import { useAuth } from '../context/AuthContext';

/**
 * Custom hook to access ACL service and check permissions
 * Uses the ACL service instance from AuthContext
 */
export function useACL() {
  const { aclService } = useAuth();

  /**
   * Check if user has a specific permission
   * @param {string} action - Permission to check (e.g., 'orders:read')
   * @returns {boolean}
   */
  const can = (action) => {
    if (!aclService) return false;
    return aclService.can(action);
  };

  /**
   * Check if user has ANY of the specified permissions
   * @param {string[]} actions - Array of permissions
   * @returns {boolean}
   */
  const canAny = (actions) => {
    if (!aclService) return false;
    return aclService.canAny(actions);
  };

  /**
   * Check if user has ALL of the specified permissions
   * @param {string[]} actions - Array of permissions
   * @returns {boolean}
   */
  const canAll = (actions) => {
    if (!aclService) return false;
    return aclService.canAll(actions);
  };

  /**
   * Check permission with wildcard support
   * @param {string} action - Permission to check
   * @returns {boolean}
   */
  const canWithWildcard = (action) => {
    if (!aclService) return false;
    return aclService.canWithWildcard(action);
  };

  /**
   * Get all permissions (for debugging)
   * @returns {any}
   */
  const getPermissions = () => {
    if (!aclService) return null;
    return aclService.getPermissions();
  };

  return {
    can,
    canAny,
    canAll,
    canWithWildcard,
    getPermissions
  };
}
