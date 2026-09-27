import { apiService, toFormData } from '../apiService';
import { syslogsApi } from './syslogsApi';

/**
 * Users API Service
 * Handles all user management operations including CRUD, permissions, and environment assignments
 */

export const usersApi = {
  /**
   * Get ACLs filtered for user type
   * @returns {Promise<Array>} - Array of user-type ACL objects
   */
  getAcls: async () => {
    const url = `/api/acls?type=user`;
    return apiService.get(url, {}, 'fetching user ACLs', false);
  },

  getStatuses: async () => {
    const url = `/api/statuses`;
    return apiService.get(url, {}, 'fetching statuses', false);
  },

  getEnvironments: async () => {
    const url = `/api/applications`;
    return apiService.get(url, {}, 'fetching environments', false);
  },

  /**
   * Get all users with optional filtering
   * @param {Object} params - Query parameters (page, per_page, search, role, etc.)
   * @returns {Promise<Object>} - Users list with pagination info
   */
  getUsers: async (params = {}) => {
    // Convert 'limit' to 'per_page' to match API format
    if (params.limit) {
      params.per_page = params.limit;
      delete params.limit;
    }
    
    const queryString = new URLSearchParams(params).toString();
    const url = `/api/users${queryString ? `?${queryString}` : ''}`;
    return apiService.get(url, {}, 'fetching users', false);
  },

  /**
   * Get a single user by ID
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - User object
   */
  getUser: async (userId) => {
    const url = `/api/users/${userId}`;
    return apiService.get(url, {}, `fetching user ${userId}`, false);
  },

  /**
   * Create a new user
   * @param {Object} userData - User data (email, name, role, etc.)
   * @param {Object} extensionData - Extension data (username, password) - optional
   * @returns {Promise<Object>} - Created user object
   */
  createUser: async (userData, extensionData = null) => {
    const url = `/api/users`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Merge extension data into userData if provided
    const dataToSend = { ...userData };

    if (extensionData) {
      dataToSend.username = extensionData.username;
      // Backend uses the same password for both user and extension
      // So we keep the user's password (don't overwrite it)
    }

    // Resources are encoded by toFormData as indexed params: resources[0][type]=xxx
    // Do NOT JSON.stringify - let toFormData handle array of objects

    // Use centralized toFormData helper for proper nested object encoding
    const formData = toFormData(dataToSend);

    return apiService.post(url, formData, headers, 'creating user', true);
  },

  /**
   * Update an existing user
   * @param {string} userId - The user ID
   * @param {Object} userData - Updated user data
   * @returns {Promise<Object>} - Updated user object
   */
  updateUser: async (userId, userData) => {
    const url = `/api/users/${userId}`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Resources are encoded by toFormData as indexed params: resources[0][type]=xxx
    // Do NOT JSON.stringify - let toFormData handle array of objects
    const dataToSend = { ...userData };

    // Use centralized toFormData helper for proper nested object encoding
    const formData = toFormData(dataToSend);

    return apiService.patch(url, formData, headers, `updating user ${userId}`, true);
  },

  /**
   * Delete a user
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - Deletion confirmation
   */
  deleteUser: async (userId) => {
    const url = `/api/users/${userId}`;
    return apiService.delete(url, {}, `deleting user ${userId}`, true);
  },

  /**
   * Check if an email already exists in the system
   * @param {string} email - The email to check
   * @returns {Promise<boolean>} - True if email exists, false otherwise
   */
  checkEmailExists: async (email) => {
    try {
      const params = {
        page: 1,
        per_page: 1,
        'search[email]': email
      };
      const queryString = new URLSearchParams(params).toString();
      const url = `/api/users?${queryString}`;
      const response = await apiService.get(url, {}, 'checking email', false);

      // Check if any users were returned with this exact email
      const users = Array.isArray(response) ? response : (response?.data || []);
      return users.some(user => user.email?.toLowerCase() === email.toLowerCase());
    } catch (error) {
      console.error('Error checking email:', error);
      return false; // On error, proceed with duplicate attempt (let server validate)
    }
  },

  /**
   * Duplicate a user
   * Creates a copy of an existing user with a new email and optional name
   * @param {string} userId - The source user ID to duplicate
   * @param {string} newEmail - The email for the new user (required, must be unique)
   * @param {string} newName - Optional name for the new user (defaults to "Copy of {originalName}")
   * @returns {Promise<Object>} - Created user object
   */
  duplicateUser: async (userId, newEmail, newName = null) => {
    const url = `/api/users`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    const formData = new URLSearchParams();
    formData.append('action', 'duplicate');
    formData.append('uuid', userId);
    formData.append('email', newEmail);
    if (newName) {
      formData.append('name', newName);
    }
    // showMessages = false to let component handle success/error display consistently
    return apiService.post(url, formData, headers, 'duplicating user', false);
  },

  /**
   * A sign-in QR code for this user: a 10-minute, single-use JWT the sign-in
   * page trades for a session (POST /auth/user_qr_login).
   * @param {string} userId - The user UUID
   * @returns {Promise<{token: string, expires_at: number}>}
   */
  createLoginToken: async (userId) => {
    return apiService.post(`/api/users/${userId}/login_token`, new URLSearchParams(), {
      'Content-Type': 'application/x-www-form-urlencoded'
    }, 'creating sign-in code', false);
  },

  /**
   * Get user permissions
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} - Array of permission objects
   */
  getUserPermissions: async (userId) => {
    const url = `/api/users/${userId}/permissions`;
    return apiService.get(url, {}, `fetching permissions for user ${userId}`, false);
  },

  /**
   * Update user permissions
   * @param {string} userId - The user ID
   * @param {Array} permissions - Array of permission strings
   * @returns {Promise<Object>} - Updated permissions
   */
  updateUserPermissions: async (userId, permissions) => {
    const url = `/api/users/${userId}/permissions`;
    return apiService.patch(url, { permissions }, {}, `updating permissions for user ${userId}`, true);
  },

  /**
   * Assign user to an environment
   * @param {string} userId - The user ID
   * @param {string} environmentId - The environment ID
   * @param {string} role - The role in the environment (user, admin, etc.)
   * @returns {Promise<Object>} - Assignment confirmation
   */
  assignUserToEnvironment: async (userId, environmentId, role = 'user') => {
    const url = `/api/users/${userId}/environments`;
    return apiService.post(
      url,
      { environment_id: environmentId, role },
      {},
      `assigning user to environment`,
      true
    );
  },

  /**
   * Remove user from an environment
   * @param {string} userId - The user ID
   * @param {string} environmentId - The environment ID
   * @returns {Promise<Object>} - Removal confirmation
   */
  removeUserFromEnvironment: async (userId, environmentId) => {
    const url = `/api/users/${userId}/environments/${environmentId}`;
    return apiService.delete(url, {}, `removing user from environment`, true);
  },

  /**
   * Get user's environments
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} - Array of environment objects
   */
  getUserEnvironments: async (userId) => {
    const url = `/api/users/${userId}/environments`;
    return apiService.get(url, {}, `fetching environments for user ${userId}`, false);
  },

  /**
   * Update user status (active/inactive)
   * @param {string} userId - The user ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<Object>} - Updated user object
   */
  updateUserStatus: async (userId, isActive) => {
    const url = `/api/users/${userId}/status`;
    return apiService.patch(url, { is_active: isActive }, {}, `updating user status`, true);
  },

  /**
   * Generate random password for user (server generates new password)
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - Object with generated password { password: 'xyz123' }
   */
  generateUserPassword: async (userId) => {
    const url = `/api/users/${userId}?action=reset_password`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    const formData = new URLSearchParams();
    return apiService.patch(url, formData.toString(), headers, `generating new password for user`, true);
  },

  /**
   * Send password reset email to user
   * @param {string} email - User email address
   * @returns {Promise<Object>} - Success confirmation
   */
  sendPasswordResetEmail: async (email) => {
    const url = `/api/users/forgot-password`;
    return apiService.post(url, { email }, {}, `sending password reset email`, true);
  },

  /**
   * Bulk create users
   * @param {Array} usersData - Array of user objects
   * @returns {Promise<Object>} - Bulk creation results
   */
  bulkCreateUsers: async (usersData) => {
    const url = `/api/users/bulk`;
    return apiService.post(url, { users: usersData }, {}, 'bulk creating users', true);
  },

  /**
   * Search users by query
   * @param {string} query - Search query
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} - Array of matching users
   */
  searchUsers: async (query, filters = {}) => {
    const params = { q: query, ...filters };
    const queryString = new URLSearchParams(params).toString();
    const url = `/api/users/search?${queryString}`;
    return apiService.get(url, {}, 'searching users', false);
  },

  /**
   * Import users from CSV file
   * @param {File} file - CSV file to import
   * @param {string} environmentUuid - Environment UUID
   * @returns {Promise<Object>} - Import result
   */
  importCSV: async (file, environmentUuid) => {
    const url = `/api/users/import`;
    const formData = new FormData();
    formData.append('file', file);
    if (environmentUuid) {
      formData.append('environment_uuid', environmentUuid);
    }

    // showMessages = false to let component handle success/error display consistently
    return apiService.fetch(url, {
      method: 'POST',
      body: formData
    }, 'importing users from CSV', false);
  },

  /**
   * "View logs" for one user — what actually happened to them, e.g. why a login
   * failed.
   *
   * Searches the InfluxDB `syslog` measurement, NOT the Postgres event store.
   * `/api/logs/` reads event_store_events, which holds operational events (call
   * state, CDR, the auth rows the lockout counter needs) — not the log stream.
   * The mediators write the readable trail with Pliny.log (app=auth,
   * action=login_failed/otp_issued/…) and every one of those lines carries
   * `user_uuid=<uuid>` in its message, so the uuid is the search needle.
   *
   * @param {string} userId
   * @param {{hours?: number, app?: string, perPage?: number}} [opts]
   * @returns {Promise<{total: number, data: Array}>}
   */
  getUserLogs: async (userId, { hours = 24, app, perPage = 50 } = {}) => {
    const to = Math.floor(Date.now() / 1000);
    return syslogsApi.fetchLogs({
      inline: userId,          // regex match on the log message
      app,                     // the Logs screen filters on `app`; 'auth' for login trouble
      from: to - hours * 3600,
      to,
      page: 1,
      per_page: perPage,
    });
  }
};

export default usersApi;
