/**
 * Centralized theme configuration for the application
 * Note: Direction (RTL/LTR) is now managed by DirectionContext
 */

export const APP_THEME = {
  // Sidebar
  sidebarWidth: '72px',

  // Color scheme
  colors: {
    primary: '#1976d2',
    primaryDark: '#115293',
    primaryLight: '#42a5f5',
    accent: '#fce4ec',
    accentBorder: '#f8bbd0',
    textPrimary: '#dc143c',
    textSecondary: '#666',
    success: '#4CAF50',
    warning: '#FF9800',
    info: '#2196F3',
    error: '#f44336',
    grey: '#9E9E9E',
  },

  // Header styles — clean white bar, dark text, teal accents
  header: {
    height: '64px',
    backgroundColor: '#ffffff',
    color: '#0f172a',
  },

  // Welcome card styles
  welcomeCard: {
    backgroundColor: '#fe4f5b29',//'#e3f2fd',
    borderColor: '#ff2b80',//'#bbdefb',
    textColor: '#fe030a',//'#1565c0',
  },
};

/**
 * Get user role display name
 * @param {Object} user - User object from auth context
 * @returns {string} Role display name
 */
export const getUserRoleName = (user) => {
  return user?.role || 'משתמש';
};
