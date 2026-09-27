import { apiService, toFormData } from '../apiService';

const CLEARABLE_FIELDS = ['replace', 'notes'];

/**
 * DIDs API Service
 * Handles all DID management operations including CRUD, provider management, and routing
 */

// Legacy API bridge type aliases - normalize to canonical names
const BRIDGE_TYPE_ALIASES = {
  'que': 'queue',
};

/**
 * Normalize bridge_type from legacy API values to canonical names
 */
const normalizeDID = (did) => {
  if (!did || !did.bridge_type) return did;
  const alias = BRIDGE_TYPE_ALIASES[did.bridge_type];
  if (alias) {
    return { ...did, bridge_type: alias };
  }
  return did;
};

const normalizeDIDs = (dids) => {
  if (!Array.isArray(dids)) return dids;
  return dids.map(normalizeDID);
};

export const didsApi = {
  /**
   * Get all DIDs with optional filtering
   * @param {Object} params - Query parameters (environment_id, page, per_page, search, provider, status, etc.)
   * @returns {Promise<Object>} - DIDs list with pagination info
   */
  getDIDs: async (params = {}) => {
    // Convert 'limit' to 'per_page' to match API format
    if (params.limit) {
      params.per_page = params.limit;
      delete params.limit;
    }

    // Build query string manually to handle bracket notation properly for legacy API
    // Keys like search[name] must NOT have brackets encoded
    const queryParts = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        // Keep brackets unencoded for legacy API format: search[name]=value
        // Only encode the value, not the key (key already has proper format)
        const encodedValue = encodeURIComponent(value);
        queryParts.push(`${key}=${encodedValue}`);
      }
    }

    const queryString = queryParts.join('&');
    const url = `/api/routes${queryString ? `?${queryString}` : ''}`;
    console.log('Route API URL:', url);
    const response = await apiService.get(url, {}, 'fetching Routes', false);
    // Normalize bridge types from legacy API
    if (Array.isArray(response)) {
      return normalizeDIDs(response);
    } else if (response?.data && Array.isArray(response.data)) {
      return { ...response, data: normalizeDIDs(response.data) };
    }
    return response;
  },

  /**
   * Get a single DID by ID
   * @param {string} didId - The DID ID
   * @returns {Promise<Object>} - DID object
   */
  getDID: async (didId) => {
    const url = `/api/routes/${didId}`;
    const response = await apiService.get(url, {}, `fetching DID ${didId}`, false);
    return normalizeDID(response);
  },

  /**
   * Create a new DID
   * @param {Object} didData - DID data (number, provider, type, etc.)
   * @returns {Promise<Object>} - Created DID object
   */
  createDID: async (didData) => {
    const url = `/api/routes`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Use centralized toFormData helper for proper nested object encoding
    const formData = toFormData(didData);

    return apiService.post(url, formData, headers, 'creating Route', true);
  },

  /**
   * Update an existing DID
   * @param {string} didId - The DID ID
   * @param {Object} didData - Updated DID data
   * @returns {Promise<Object>} - Updated DID object
   */
  updateDID: async (didId, didData) => {
    const url = `/api/routes/${didId}`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Use centralized toFormData helper for proper nested object encoding
    const formData = toFormData(didData);
    // toFormData drops empty strings, so a field cleared in the form would
    // never reach the API and the old value would stay. An empty `replace`
    // is meaningful (strip the prefix), and empty notes clears the notes.
    CLEARABLE_FIELDS.forEach((field) => {
      if (didData?.[field] === '' && !formData.has(field)) formData.append(field, '');
    });

    return apiService.patch(url, formData, headers, `updating DID ${didId}`, true);
  },

  /**
   * Delete a DID
   * @param {string} didId - The DID ID
   * @returns {Promise<Object>} - Deletion confirmation
   */
  deleteDID: async (didId) => {
    const url = `/api/routes/${didId}`;
    return apiService.delete(url, {}, `deleting DID ${didId}`, true);
  },

  /**
   * Check if a DID number already exists in the system
   * @param {string} number - The DID number to check
   * @returns {Promise<boolean>} - True if number exists, false otherwise
   */
  checkNumberExists: async (number) => {
    try {
      const params = {
        page: 1,
        per_page: 1,
        'search[number]': number
      };
      // Build query string manually to handle bracket notation
      const queryParts = [];
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          const encodedValue = encodeURIComponent(value);
          queryParts.push(`${key}=${encodedValue}`);
        }
      }
      const queryString = queryParts.join('&');
      const url = `/api/routes?${queryString}`;
      const response = await apiService.get(url, {}, 'checking Route number', false);

      // Check if any DIDs were returned with this exact number
      const dids = Array.isArray(response) ? response : (response?.data || []);
      return dids.some(did => did.number === number);
    } catch (error) {
      console.error('Error checking Route number:', error);
      return false; // On error, proceed with duplicate attempt (let server validate)
    }
  },

  /**
   * Duplicate a DID
   * Creates a copy of an existing DID with a new number and optional name
   * @param {string} didId - The source DID ID to duplicate
   * @param {string} newNumber - The number for the new DID (required, must be unique)
   * @param {string} newName - Optional name for the new DID (defaults to "Copy of {originalName}")
   * @returns {Promise<Object>} - Created DID object
   */
  duplicateDID: async (didId, newNumber, newName = null) => {
    const url = `/api/routes`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    const formData = new URLSearchParams();
    formData.append('action', 'duplicate');
    formData.append('uuid', didId);
    formData.append('number', newNumber);
    if (newName) {
      formData.append('name', newName);
    }
    // showMessages = false to let component handle success/error display consistently
    return apiService.post(url, formData, headers, 'duplicating Route', false);
  },

  /**
   * Get available DID providers
   * @returns {Promise<Array>} - Array of provider objects
   */
  getProviders: async () => {
    const url = `/api/did-providers`;
    return apiService.get(url, {}, 'fetching Route providers', false);
  },

  /**
   * Get available DID types from action=types endpoint
   * @returns {Promise<Array>} - Array of DID type strings
   */
  getTypes: async () => {
    const url = `/api/routes?action=types`;
    return apiService.get(url, {}, 'fetching Route types', false);
  },

  /**
   * Get available DID statuses
   * @returns {Promise<Array>} - Array of status objects
   */
  getStatuses: async () => {
    const url = `/api/did-statuses`;
    return apiService.get(url, {}, 'fetching Route statuses', false);
  },

  /**
   * Get routing options for DIDs
   * @param {string} environmentId - Environment ID
   * @returns {Promise<Array>} - Array of routing options (extensions, queues, IVRs, etc.)
   */
  getRoutingOptions: async (environmentId) => {
    const url = `/api/applications/${environmentId}/routing-options`;
    return apiService.get(url, {}, 'fetching routing options', false);
  },

  /**
   * Update DID routing
   * @param {string} didId - The DID ID
   * @param {Object} routingData - Routing configuration
   * @returns {Promise<Object>} - Updated DID object
   */
  updateRouting: async (didId, routingData) => {
    const url = `/api/routes/${didId}/routing`;
    return apiService.patch(url, routingData, {}, `updating DID routing`, true);
  },

  /**
   * Bulk create DIDs
   * @param {Array} didsData - Array of DID objects
   * @returns {Promise<Object>} - Bulk creation results
   */
  bulkCreateDIDs: async (didsData) => {
    const url = `/api/routes/bulk`;
    return apiService.post(url, { dids: didsData }, {}, 'bulk creating Routes', true);
  },

  /**
   * Search DIDs by query
   * @param {string} query - Search query (number, description, etc.)
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} - Array of matching DIDs
   */
  searchDIDs: async (query, filters = {}) => {
    const params = { q: query, ...filters };
    const queryString = new URLSearchParams(params).toString();
    const url = `/api/routes/search?${queryString}`;
    return apiService.get(url, {}, 'searching Routes', false);
  },

  /**
   * Get DID usage statistics
   * @param {string} didId - The DID ID
   * @param {Object} timeRange - Time range for statistics
   * @returns {Promise<Object>} - Usage statistics
   */
  getDIDStats: async (didId, timeRange = {}) => {
    const queryString = new URLSearchParams(timeRange).toString();
    const url = `/api/routes/${didId}/stats${queryString ? `?${queryString}` : ''}`;
    return apiService.get(url, {}, `fetching DID statistics`, false);
  },

  /**
   * Test DID connectivity
   * @param {string} didId - The DID ID
   * @returns {Promise<Object>} - Connectivity test results
   */
  testDIDConnectivity: async (didId) => {
    const url = `/api/routes/${didId}/test`;
    return apiService.post(url, {}, {}, `testing DID connectivity`, true);
  },

  /**
   * Import DIDs from CSV file
   * @param {File} file - CSV file to import
   * @param {string} environmentUuid - Environment UUID
   * @returns {Promise<Object>} - Import result
   */
  importCSV: async (file, environmentUuid) => {
    const url = `/api/routes/import`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('environment_uuid', environmentUuid);

    // showMessages = false to let component handle success/error display consistently
    return apiService.fetch(url, {
      method: 'POST',
      body: formData
    }, 'importing Routes from CSV', false);
  }
};

export default didsApi;