/**
 * Permission constants and role templates
 * Format: resource:action
 *
 * Template skeleton — 3 roles, 3 features (Dashboard, Calls, Reports).
 * Per-customer forks add their own permissions + roles.
 */

export const PERMISSIONS = {
  DASHBOARD_READ: 'dashboard:read',
  CALLS_READ: 'calls:read',
  CALLS_WRITE: 'calls:write',
  REPORTS_READ: 'reports:read',
};

export const ROLE_TEMPLATES = {
  user: [
    'dashboard:read',
    'calls:read',
    'reports:read',
  ],
  admin: ['*'],
  super_admin: ['*'],
};

export const ROUTE_PERMISSIONS = {
  '/dashboard': 'dashboard:read',
  '/status': 'dashboard:read',
  '/event-explorer': 'dashboard:read',
  '/calls': 'calls:read',
  '/reports': 'reports:read',
};

export function getPermissionsForRole(role) {
  return ROLE_TEMPLATES[role] || [];
}
