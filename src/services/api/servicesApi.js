import { apiService, toFormData } from '../apiService';

/**
 * Services API
 * Manages PBX services (webhooks, reports, metrics, etc.)
 */
export const servicesApi = {
  /**
   * List all services with optional filters
   * @param {Object} params - Query parameters (search, type, enabled, page, limit)
   * @returns {Promise<Array>} List of services
   */
  list: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `/api/services${queryString ? `?${queryString}` : ''}`;
    return apiService.get(url, {}, 'fetching services', false);
  },

  /**
   * Get available service types metadata
   * @returns {Promise<Object>} Service types configuration
   */
  getTypes: () => {
    return apiService.get('/api/services?action=types', {}, 'fetching service types', false);
  },

  /**
   * Get available handler types with schemas
   * @returns {Promise<Array>} Handler types: [{ type, label, schema: { fields: [...] } }]
   */
  getHandlerTypes: () => {
    return apiService.get('/api/services?action=handler_types', {}, 'fetching handler types', false);
  },

  /**
   * Get a single service by UUID
   * @param {string} uuid - Service UUID
   * @returns {Promise<Object>} Service details
   */
  get: (uuid) => {
    return apiService.get(`/api/services/${uuid}`, {}, `fetching service ${uuid}`, false);
  },

  /**
   * Create a new service
   * @param {Object} data - Service data
   * @returns {Promise<Object>} Created service
   */
  create: (data) => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Use centralized toFormData helper for proper nested object encoding
    // It handles triggers[], conditions[key], actions[key] formats automatically
    const formData = toFormData(data);

    return apiService.post('/api/services', formData, headers, 'creating service', true);
  },

  /**
   * Update an existing service
   * @param {string} uuid - Service UUID
   * @param {Object} data - Updated service data
   * @returns {Promise<Object>} Updated service
   */
  update: (uuid, data) => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Use centralized toFormData helper for proper nested object encoding
    // It handles triggers[], conditions[key], actions[key] formats automatically
    const formData = toFormData(data);

    // toFormData drops empty objects entirely, so removing the last webhook
    // body field would silently keep the old meta. An explicit empty meta
    // clears the stored body (backend stores '' as empty hstore).
    if (data.meta && typeof data.meta === 'object' && Object.keys(data.meta).length === 0) {
      formData.append('meta', '');
    }

    return apiService.patch(`/api/services/${uuid}`, formData, headers, `updating service ${uuid}`, true);
  },

  /**
   * Delete a service
   * @param {string} uuid - Service UUID
   * @returns {Promise<Object>} Deleted service
   */
  delete: (uuid) => {
    return apiService.delete(`/api/services/${uuid}`, {}, `deleting service ${uuid}`, true);
  },

  /**
   * Get event statistics for a service from EventStore
   * @param {string} uuid - Service UUID
   * @returns {Promise<Object>} Stats: { events_total, webhooks_sent, webhooks_failed, last_activity_at, events_today }
   */
  getStats: (uuid) => {
    return apiService.get(`/api/services/${uuid}/stats`, {}, `fetching service stats ${uuid}`, false, true);
  },

  /**
   * Simulate a test event through the service pipeline
   * @param {string} uuid - Service UUID
   * @param {Object} data - { event_name, event_data, call_uuid, deliver }
   *   call_uuid builds the event from a real call; deliver=true really sends it
   *   (without it the API routes the event and stops before the HTTP request).
   * @returns {Promise<Object>} Simulation results
   */
  simulate: (uuid, data = {}) => {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const formData = new URLSearchParams();
    if (data.event_name) formData.append('event_name', data.event_name);
    if (data.event_data) formData.append('event_data', JSON.stringify(data.event_data));
    if (data.call_uuid) formData.append('call_uuid', data.call_uuid);
    if (data.deliver) formData.append('deliver', 'true');
    return apiService.post(`/api/services/${uuid}/simulate`, formData, headers, `simulating service ${uuid}`, true);
  },

  /**
   * Get recent events for a service (queries event_store_events)
   * @param {string} uuid - Service UUID
   * @param {Object} params - Query params (per_page, page, from, to)
   * @returns {Promise<Object>} Events list
   */
  getEvents: (uuid, params = {}) => {
    const filters = {
      per_page: params.per_page || 10,
      page: params.page || 1,
      subject: 'service',
      subject_uuid: uuid,
      ...params,
    };
    const queryString = new URLSearchParams(filters).toString();
    return apiService.get(`/api/events?${queryString}`, {}, `fetching service events ${uuid}`, false, true);
  },
};
