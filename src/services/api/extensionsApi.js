import { apiService, toFormData } from '../apiService';

/**
 * Extensions API Service
 * Handles all extension management operations including CRUD and import
 */

export const extensionsApi = {
  /**
   * Get all extensions with optional filtering
   * @param {Object} params - Query parameters (environment_uuid, page, per_page, search, etc.)
   * @returns {Promise<Object>} - Extensions list with pagination info
   */
  getExtensions: async (params = {}) => {
    // Convert 'limit' to 'per_page' to match API format
    if (params.limit) {
      params.per_page = params.limit;
      delete params.limit;
    }

    const queryParts = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        const encodedValue = encodeURIComponent(value);
        queryParts.push(`${key}=${encodedValue}`);
      }
    }

    const queryString = queryParts.join('&');
    const url = `/api/devices${queryString ? `?${queryString}` : ''}`;
    return apiService.get(url, {}, 'fetching extensions', false);
  },

  /**
   * Get a single extension by ID
   * @param {string} extensionId - The extension ID
   * @returns {Promise<Object>} - Extension object
   */
  getExtension: async (extensionId) => {
    const url = `/api/devices/${extensionId}`;
    return apiService.get(url, {}, `fetching extension ${extensionId}`, false);
  },

  /**
   * Create a new extension
   * @param {Object} extensionData - Extension data
   * @returns {Promise<Object>} - Created extension object
   */
  createExtension: async (extensionData) => {
    const url = `/api/devices`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    const formData = toFormData(extensionData);
    return apiService.post(url, formData, headers, 'creating extension', true);
  },

  /**
   * Update an existing extension
   * @param {string} extensionId - The extension ID
   * @param {Object} extensionData - Updated extension data
   * @returns {Promise<Object>} - Updated extension object
   */
  updateExtension: async (extensionId, extensionData) => {
    const url = `/api/devices/${extensionId}`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    const formData = toFormData(extensionData);
    return apiService.patch(url, formData, headers, `updating extension ${extensionId}`, true);
  },

  /**
   * Delete an extension
   * @param {string} extensionId - The extension ID
   * @returns {Promise<Object>} - Deletion confirmation
   */
  deleteExtension: async (extensionId) => {
    const url = `/api/devices/${extensionId}`;
    return apiService.delete(url, {}, `deleting extension ${extensionId}`, true);
  },

  /**
   * Get live registrations for registration status check
   * Returns array of registered extensions from FreeSwitch
   * @returns {Promise<Array>} - Array of registration objects with reg_user field
   */
  getLiveRegistrations: async () => {
    // skipCircuitBreaker: FreeSwitch 500s are expected when no switch node is configured
    return apiService.get('/api/devices?action=live', {}, 'fetching live registrations', false, true);
  },

  /**
   * Get registration status for a single extension
   * @param {string} extensionId - Extension UUID
   * @returns {Promise<Object>} - Registration details
   */
  getRegistrationStatus: async (extensionId) => {
    return apiService.get(`/api/devices/${extensionId}?action=switch`, {}, 'checking registration status', false, true);
  },

  /**
   * Import extensions from CSV file
   * @param {File} file - CSV file to import
   * @param {string} environmentUuid - Environment UUID
   * @returns {Promise<Object>} - Import result
   */
  importCSV: async (file, environmentUuid) => {
    // POST /api/devices/import adds the devices in the request and answers with
    // what happened to every row: { added, existing, failed: [{ line,
    // username, error }], message }. (The old /api/users/import queued a job
    // that could not find the uploaded file and imported nothing, silently.)
    // Headers: Username,Name,Password,CallerID.
    const url = `/api/devices/import`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('environment_uuid', environmentUuid);

    return apiService.fetch(url, {
      method: 'POST',
      body: formData
    }, 'importing extensions from CSV', true);
  },

  /**
   * Mint a short-lived WebRTC access token for an extension's softphone / QR.
   * The token (TTL ~5 min, single extension) replaces the old static secret so
   * phone access expires. Requires an authenticated, authorized admin.
   * @param {string} extensionUuid
   * @returns {Promise<{token: string, expires_in: number}>}
   */
  getWebrtcToken: async (extensionUuid) => {
    const body = new URLSearchParams({ extension_uuid: extensionUuid });
    return apiService.post('/tasks/webrtc_token', body, {}, 'authorizing phone', false);
  }
};

export default extensionsApi;
