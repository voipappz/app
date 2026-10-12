import { apiService, toFormData } from '../apiService';

// Existing webhook providers remain editable, but are not offered for creation.
export const getCreatableProviderTypes = (types = []) => types.filter(
  (type) => (typeof type === 'string' ? type : type.value) !== 'webhook'
);

/**
 * Provider API service
 * Handles all provider-related API operations including nested tariffs
 */
export const providersApi = {
  /**
   * Get all providers
   * @param {Object} params - Query parameters (customer_uuid, protocol, etc.)
   * @returns {Promise<Array>} - Array of provider objects
   */
  getProviders: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `/api/providers${queryString ? `?${queryString}` : ''}`;
    return apiService.get(url, {}, 'fetching providers', false);
  },

  /**
   * Provider types, as an ARRAY of { value, label, description, fields, services,
   * service_field, profile_fields }.
   *
   * The detailed catalog omits some supported types (including DID). Merge
   * the server's complete type_names list with its catalog metadata so those
   * types remain selectable without maintaining another list in the client.
   */
  getProviderTypes: async () => {
    const catalog = await apiService.get('/api/providers?action=types', {}, 'fetching provider types', false);
    if (Array.isArray(catalog)) {
      // Older servers still answer with a bare array of type names.
      return catalog.map(t => (typeof t === 'string' ? { value: t, label: t.toUpperCase() } : t));
    }
    if (!catalog || typeof catalog !== 'object') return [];
    const names = await apiService.get('/api/providers?action=type_names', {}, 'fetching supported provider types', false);
    if (!Array.isArray(names)) throw new Error('Invalid provider type list from server');
    return names.map((value) => {
      const spec = catalog[value];
      return {
        value,
        label: spec?.label || value.toUpperCase(),
        description: spec?.description || '',
        fields: spec?.fields || [],
        services: spec?.services || null,
        service_field: spec?.service_field || null,
        profile_fields: spec?.profile_fields || [],
      };
    });
  },

  /**
   * Get LLM service options from server
   * @returns {Promise<Array>} - Array of { service, label, default_model }
   */
  getLLMServices: async () => {
    return apiService.get('/api/providers?action=llm_services', {}, 'fetching LLM services', false);
  },

  /**
   * Get provider by ID
   * @param {string} providerId - The provider ID
   * @returns {Promise<Object>} - Provider object
   */
  getProvider: async (providerId) => {
    const url = `/api/providers/${providerId}`;
    return apiService.get(url, {}, `fetching provider ${providerId}`, false);
  },

  /**
   * Reveal one or more encrypted profile secrets in the clear.
   *
   * Secrets (profile.yml `input: 'encrypted'`) are stored AES-256-GCM under the
   * customer's derived key and normally serialize as ****last4, so the browser
   * never sees them. This is the deliberate exception: the API decrypts only the
   * requested keys straight from the persisted ciphertext, and every call
   * publishes a `provider.profile.reveal` audit event recording which keys, on
   * which provider, by which account. Read that trail back with action=audit.
   *
   * @param {string} providerId
   * @param {string|string[]} keys - profile key(s), e.g. 'password'
   * @returns {Promise<Object>} - { <key>: <plaintext> }
   */
  revealProviderSecret: async (providerId, keys) => {
    const key = Array.isArray(keys) ? keys.join(',') : keys;
    const url = `/api/providers/${providerId}?action=reveal&key=${encodeURIComponent(key)}`;
    return apiService.get(url, {}, `revealing ${key}`, false);
  },

  /**
   * Create new provider
   * @param {Object} providerData - Provider data (name, hostname, port, etc.)
   * @returns {Promise<Object>} - Created provider object
   */
  createProvider: async (providerData) => {
    const url = `/api/providers`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Use centralized toFormData helper for proper nested object encoding
    const formData = toFormData(providerData);

    return apiService.post(url, formData, headers, 'creating provider', true);
  },

  /**
   * Update provider
   * @param {string} providerId - The provider ID
   * @param {Object} providerData - Updated provider data
   * @returns {Promise<Object>} - Updated provider object
   */
  updateProvider: async (providerId, providerData) => {
    const url = `/api/providers/${providerId}`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Use centralized toFormData helper for proper nested object encoding
    const formData = toFormData(providerData);

    return apiService.patch(url, formData, headers, `updating provider ${providerId}`, true);
  },

  /**
   * Delete provider
   * @param {string} providerId - The provider ID
   * @returns {Promise<Object>} - Deletion confirmation
   */
  deleteProvider: async (providerId) => {
    const url = `/api/providers/${providerId}`;
    return apiService.delete(url, {}, `deleting provider ${providerId}`, true);
  },

  /**
   * Get provider protocols
   * @returns {Promise<Array>} - Array of protocol options
   */
  getProviderProtocols: async () => {
    const url = `/api/providers/protocols`;
    return apiService.get(url, {}, 'fetching provider protocols', false);
  },

  /**
   * Get tariffs for a specific provider
   */
  getProviderTariffs: async (providerUuid) => {
    return await apiService.get(`/api/providers/${providerUuid}/tariffs`);
  },

  /**
   * Create tariff for a provider
   */
  createProviderTariff: async (providerUuid, tariffData) => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Use centralized toFormData helper for proper nested object encoding
    const formData = toFormData(tariffData);

    return await apiService.post(`/api/providers/${providerUuid}/tariffs`, formData, headers, 'creating provider tariff', true);
  },

  /**
   * Update tariff for a provider
   */
  updateProviderTariff: async (providerUuid, tariffUuid, tariffData) => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Use centralized toFormData helper for proper nested object encoding
    const formData = toFormData(tariffData);

    return await apiService.patch(`/api/providers/${providerUuid}/tariffs/${tariffUuid}`, formData, headers, `updating provider tariff ${tariffUuid}`, true);
  },

  /**
   * Delete tariff for a provider
   */
  deleteProviderTariff: async (providerUuid, tariffUuid) => {
    return await apiService.delete(`/api/providers/${providerUuid}/tariffs/${tariffUuid}`);
  },

  /**
   * Get DIDs linked to a provider
   * @param {string} providerUuid - The provider UUID
   * @returns {Promise<Array>} - Array of DID objects
   */
  getProviderDids: async (providerUuid) => {
    return apiService.get(`/api/providers/${providerUuid}?action=dids`, {}, 'fetching provider Routes', false);
  },

  /**
   * Get available rates/prices from a provider's tariff
   * @param {string} providerUuid - The provider UUID
   * @returns {Promise<Array>} - Array of tariff rate objects
   */
  getProviderRates: async (providerUuid) => {
    return apiService.get(`/api/providers/${providerUuid}?action=available_dids`, {}, 'fetching provider rates', false);
  }
};
