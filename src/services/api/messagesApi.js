import { apiService } from '../apiService';

/**
 * Messages API Service
 * Handles message history management and search operations
 * Based on callsApi.js patterns
 */

export const messagesApi = {
  /**
   * Get messages segments for advanced search
   * @returns {Promise<Array>} - Available search segments
   */
  getSegments: async () => {
    const url = `/api/messages?action=segments`;
    return apiService.get(url, {}, 'fetching message segments', false);
  },

  /**
   * Get table column definitions
   * @returns {Promise<Array>} - Table column configuration
   */
  getColumns: async () => {
    const url = `/api/messages?action=columns`;
    return apiService.get(url, {}, 'fetching message columns', false);
  },

  /**
   * Get saved search parameters
   * @returns {Promise<Array>} - Saved search parameters
   */
  getParams: async () => {
    const url = `/api/messages?action=params`;
    return apiService.get(url, {}, 'fetching message params', false);
  },

  /**
   * Get messages with filtering and pagination
   * @param {Object} params - Query parameters (page, per_page, search filters, etc.)
   * @returns {Promise<Object>} - Messages list with pagination info
   */
  getMessages: async (params = {}) => {
    if (params.limit) {
      params.per_page = params.limit;
      delete params.limit;
    }

    const queryString = new URLSearchParams(params).toString();
    const url = `/api/messages${queryString ? `?${queryString}` : ''}`;
    return apiService.get(url, {}, 'fetching messages', false);
  },

  /**
   * Get a single message by ID
   * @param {string} messageId - The message ID/UUID
   * @returns {Promise<Object>} - Message object with details
   */
  getMessage: async (messageId) => {
    const url = `/api/messages/${messageId}`;
    return apiService.get(url, {}, `fetching message ${messageId}`, false);
  },

  /**
   * Export messages data to CSV
   * @param {Object} params - Export parameters (columns, filters, etc.)
   * @returns {Promise<Blob>} - CSV file data
   */
  exportMessages: async (params = {}) => {
    const exportParams = { ...params, export: 'csv' };
    const queryString = new URLSearchParams(exportParams).toString();
    const url = `/api/messages?${queryString}`;

    const response = await fetch(`${apiService.getApiBaseUrl()}${url}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        'Accept': 'text/csv,application/csv,*/*'
      }
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }

    return await response.blob();
  }
};
