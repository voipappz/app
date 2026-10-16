import { apiService, toFormData } from '../apiService';

/**
 * Environments API Service
 * Handles all environment/application management operations
 */

export const environmentsApi = {
  /**
   * Get all environments
   * @param {Object} params - Query parameters (customer_uuid, type, etc.)
   * @returns {Promise<Array>} - Array of environment objects
   */
  getEnvironments: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `/api/applications${queryString ? `?${queryString}` : ''}`;
    return apiService.get(url, {}, 'fetching environments', false);
  },

  /**
   * Get all environments for a customer (like AngularJS all_environments)
   * @param {string} customerUuid - The customer UUID (required to avoid loading ALL environments)
   * @returns {Promise<Array>} - Array of all environment objects
   */
  getAllEnvironments: async (customerUuid) => {
    // action=all returns [] on the backend — use a high per_page instead
    const params = new URLSearchParams({ page: '1', per_page: '999' });
    if (customerUuid) params.set('customer_uuid', customerUuid);
    const url = `/api/applications?${params.toString()}`;
    return apiService.get(url, {}, 'fetching all environments', false);
  },

  /**
   * Get selected environments for current user (optimized for login)
   * @param {string} customerUuid - The customer UUID
   * @returns {Promise<Array>} - Array of selected environment objects
   */
  getSelectedEnvironments: async (customerUuid) => {
    const params = new URLSearchParams({
      action: 'selected',
      customer_uuid: customerUuid
    });
    const url = `/api/applications?${params.toString()}`;
    return apiService.get(url, {}, 'fetching selected environments', false);
  },

  /**
   * Get a single environment by ID
   * @param {string} environmentId - The environment ID
   * @returns {Promise<Object>} - Environment object
   */
  getEnvironment: async (environmentId) => {
    const url = `/api/applications/${environmentId}`;
    return apiService.get(url, {}, `fetching environment ${environmentId}`, false);
  },

  /**
   * Create a new environment
   * @param {Object} environmentData - Environment data (name, type, customer_uuid, etc.)
   * @returns {Promise<Object>} - Created environment object
   */
  createEnvironment: async (environmentData) => {
    const url = `/api/applications`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Use centralized toFormData helper for proper nested object encoding
    const formData = toFormData(environmentData);

    return apiService.post(url, formData, headers, 'creating environment', true);
  },

  /**
   * Update an existing environment
   * @param {string} environmentId - The environment ID
   * @param {Object} environmentData - Updated environment data
   * @returns {Promise<Object>} - Updated environment object
   */
  updateEnvironment: async (environmentId, environmentData) => {
    const url = `/api/applications/${environmentId}`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Use centralized toFormData helper for proper nested object encoding
    const formData = toFormData(environmentData);

    return apiService.patch(url, formData, headers, `updating environment ${environmentId}`, true);
  },

  /**
   * Delete an environment
   * @param {string} environmentId - The environment ID
   * @returns {Promise<Object>} - Deletion confirmation
   */
  deleteEnvironment: async (environmentId) => {
    const url = `/api/applications/${environmentId}`;
    return apiService.delete(url, {}, `deleting environment ${environmentId}`, true);
  },

  /**
   * Get users assigned to an environment
   * @param {string} environmentId - The environment ID
   * @returns {Promise<Array>} - Array of user objects with roles
   */
  getEnvironmentUsers: async (environmentId) => {
    const url = `/api/applications/${environmentId}/users`;
    return apiService.get(url, {}, `fetching users for environment ${environmentId}`, false);
  },

  /**
   * Get environment settings/configuration
   * @param {string} environmentId - The environment ID
   * @returns {Promise<Object>} - Environment settings object
   */
  getEnvironmentSettings: async (environmentId) => {
    const url = `/api/applications/${environmentId}/settings`;
    return apiService.get(url, {}, `fetching settings for environment ${environmentId}`, false);
  },

  /**
   * Update environment settings
   * @param {string} environmentId - The environment ID
   * @param {Object} settings - Settings object
   * @returns {Promise<Object>} - Updated settings
   */
  updateEnvironmentSettings: async (environmentId, settings) => {
    const url = `/api/applications/${environmentId}/settings`;
    return apiService.patch(url, settings, {}, `updating settings for environment ${environmentId}`, true);
  },

  /**
   * Get environment statistics
   * @param {string} environmentId - The environment ID
   * @returns {Promise<Object>} - Statistics object (users count, resources, etc.)
   */
  getEnvironmentStats: async (environmentId) => {
    const url = `/api/applications/${environmentId}/stats`;
    return apiService.get(url, {}, `fetching stats for environment ${environmentId}`, false);
  },

  /**
   * Clone/duplicate an environment
   * @param {string} environmentId - The source environment ID
   * @param {Object} newEnvironmentData - Data for the new environment
   * @returns {Promise<Object>} - Created environment object
   */
  cloneEnvironment: async (environmentId, newEnvironmentData) => {
    const url = `/api/applications/${environmentId}/clone`;
    return apiService.post(url, newEnvironmentData, {}, `cloning environment ${environmentId}`, true);
  },

  /**
   * Get environment resources (DIDs, extensions, etc.)
   * @param {string} environmentId - The environment ID
   * @param {string} resourceType - Type of resource (dids, extensions, flows, etc.)
   * @returns {Promise<Array>} - Array of resource objects
   */
  getEnvironmentResources: async (environmentId, resourceType) => {
    const url = `/api/applications/${environmentId}/${resourceType}`;
    return apiService.get(url, {}, `fetching ${resourceType} for environment ${environmentId}`, false);
  },

  /**
   * Update environment status (active/suspended)
   * @param {string} environmentId - The environment ID
   * @param {string} status - New status (active, suspended, archived)
   * @returns {Promise<Object>} - Updated environment object
   */
  updateEnvironmentStatus: async (environmentId, status) => {
    const url = `/api/applications/${environmentId}/status`;
    return apiService.patch(url, { status }, {}, `updating environment status`, true);
  },

  /**
   * Get environment audit logs
   * @param {string} environmentId - The environment ID
   * @param {Object} params - Query parameters (page, limit, date_from, date_to)
   * @returns {Promise<Object>} - Audit logs with pagination
   */
  getEnvironmentAuditLogs: async (environmentId, params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `/api/applications/${environmentId}/audit-logs${queryString ? `?${queryString}` : ''}`;
    return apiService.get(url, {}, `fetching audit logs for environment ${environmentId}`, false);
  },

  /**
   * Export environment configuration
   * @param {string} environmentId - The environment ID
   * @returns {Promise<Blob>} - Configuration file blob
   */
  exportEnvironmentConfig: async (environmentId) => {
    const url = `/api/applications/${environmentId}/export`;
    return apiService.get(url, {}, `exporting environment configuration`, true);
  },

  /**
   * Import environment configuration
   * @param {string} environmentId - The environment ID
   * @param {File} configFile - Configuration file
   * @returns {Promise<Object>} - Import results
   */
  importEnvironmentConfig: async (environmentId, configFile) => {
    const formData = new FormData();
    formData.append('config_file', configFile);

    const url = `/api/applications/${environmentId}/import`;
    return apiService.post(url, formData, {}, `importing environment configuration`, true);
  },

  /**
   * Get environments by customer UUID
   * @param {string} customerUuid - The customer UUID
   * @returns {Promise<Array>} - Array of environment objects
   */
  getEnvironmentsByCustomer: async (customerUuid) => {
    return environmentsApi.getEnvironments({ customer_uuid: customerUuid });
  },

  /**
   * Search environments server-side via the standard /environments index.
   *
   * Free-text query is fanned out across the searchable env columns in
   * parallel (name, notes) so the user can find an env by typing any scrap
   * they remember — a partial name, a phrase from notes, etc. Results are
   * merged & deduped by uuid. Tag values stored in meta can be matched
   * explicitly via tagFilters.
   *
   * Only real columns of the environments table are valid here. `domain`
   * lives inside the profile hstore and the backend's generic ILIKE filter
   * 500s on it — don't add it back without server-side support.
   *
   * Backend filters used: search[<col>] (ILIKE %q% per column),
   * search[meta][<key>] (hstore), search[enabled].
   * See voipappz-api/lib/mediators/search/aa_base.rb#search.
   *
   * @param {string} customerUuid
   * @param {{
   *   query?: string,
   *   tagFilters?: Array<{key:string,value?:string}>,
   *   enabled?: boolean | undefined,
   *   page?: number,
   *   perPage?: number,
   *   fields?: string[],
   * }} options
   * @returns {Promise<Array>}
   */
  searchEnvironments: async (customerUuid, options = {}) => {
    if (!customerUuid) return [];
    const {
      query = '',
      tagFilters = [],
      enabled,
      page = 1,
      perPage = 50,
      fields = ['name', 'notes'],
      orderBy = 'updated_at',
      orderKind = 'desc',
    } = options;

    const buildParams = (extra = {}) => {
      const params = new URLSearchParams();
      params.set('customer_uuid', customerUuid);
      params.set('page', String(page));
      params.set('per_page', String(perPage));
      params.set('order_by', orderBy);
      params.set('order_type', orderKind); // the API reads order_type; order_kind was ignored
      if (enabled === true) params.set('search[enabled]', 'true');
      if (enabled === false) params.set('search[enabled]', 'false');
      // NOTE: search[meta][k]=v currently 500s on the backend
      // (Mediators::Search::Environment hstore handler). We DON'T send it on
      // the wire — tag filters are applied client-side on the response below.
      for (const [k, v] of Object.entries(extra)) {
        params.set(k, v);
      }
      return params;
    };

    const trimmed = (query || '').trim();

    let merged;
    if (!trimmed) {
      const url = `/api/applications?${buildParams().toString()}`;
      const res = await apiService.get(url, {}, 'searching environments', false);
      merged = Array.isArray(res) ? res : (res?.data || []);
    } else {
      const requests = fields.map((col) => {
        const params = buildParams({ [`search[${col}]`]: trimmed });
        const url = `/api/applications?${params.toString()}`;
        return apiService
          .get(url, {}, `searching environments by ${col}`, false)
          .catch(() => []);
      });

      const responses = await Promise.all(requests);
      const seen = new Set();
      merged = [];
      for (const res of responses) {
        const list = Array.isArray(res) ? res : (res?.data || []);
        for (const env of list) {
          if (!env?.uuid || seen.has(env.uuid)) continue;
          seen.add(env.uuid);
          merged.push(env);
        }
      }
    }

    // Client-side tag filter (AND semantics) — backend meta search is broken.
    const activeTagFilters = (tagFilters || []).filter(tf => (tf?.key || '').trim());
    if (activeTagFilters.length === 0) return merged;
    return merged.filter((env) => {
      const meta = env?.meta || {};
      if (typeof meta !== 'object' || meta === null) return false;
      return activeTagFilters.every(({ key, value }) => {
        const k = key.trim();
        const v = (value || '').toString().toLowerCase();
        const has = Object.prototype.hasOwnProperty.call(meta, k);
        if (!has) return false;
        if (!v) return true;
        return String(meta[k] ?? '').toLowerCase().includes(v);
      });
    });
  },

};

export default environmentsApi;
