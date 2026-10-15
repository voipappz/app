import { apiService, toFormData } from '../apiService';

/**
 * Queues API Service
 * Handles all Queue-related API operations
 */
export const queuesApi = {
  /**
   * Get all Queues for an environment
   */
  getQueues: async (params = {}) => {
    try {
      console.log('Queues API: Getting Queues with params:', params);
      // The params go on the URL. They used to be passed as apiService.get's
      // fetch OPTIONS, so the server never saw page, per_page, order_by,
      // order_type or search[...]: sorting and paging did nothing.
      const queryString = new URLSearchParams(params).toString();
      const url = `/api/queues${queryString ? `?${queryString}` : ''}`;
      const response = await apiService.get(url, {}, 'fetching queues');
      console.log('Queues API: Response:', response);
      return response;
    } catch (error) {
      console.error('Queues API: Error getting queues:', error);
      throw error;
    }
  },

  /**
   * Get single Queue by ID
   */
  getQueue: async (id) => {
    try {
      console.log('Queues API: Getting Queue with id:', id);
      const response = await apiService.get(`/api/queues/${id}`, {}, `fetching queue ${id}`);
      console.log('Queues API: Response:', response);
      return response;
    } catch (error) {
      console.error('Queues API: Error getting queue:', error);
      throw error;
    }
  },

  /**
   * Create new Queue
   */
  createQueue: async (queueData) => {
    try {
      console.log('Queues API: Creating Queue with data:', queueData);
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
      };

      // Use centralized toFormData helper for proper nested object encoding
      const formData = toFormData(queueData);

      const response = await apiService.post('/api/queues', formData, headers, `creating queue ${queueData.name}`, true);
      console.log('Queues API: Response:', response);
      return response;
    } catch (error) {
      console.error('Queues API: Error creating queue:', error);
      throw error;
    }
  },

  /**
   * Update existing Queue
   */
  updateQueue: async (id, queueData) => {
    try {
      console.log('Queues API: Updating Queue with id:', id, 'data:', queueData);
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
      };

      // Use centralized toFormData helper for proper nested object encoding
      const formData = toFormData(queueData);

      const response = await apiService.patch(`/api/queues/${id}`, formData, headers, `updating queue ${queueData.name || id}`, true);
      console.log('Queues API: Response:', response);
      return response;
    } catch (error) {
      console.error('Queues API: Error updating queue:', error);
      throw error;
    }
  },

  /**
   * Delete Queue
   */
  deleteQueue: async (id) => {
    try {
      console.log('Queues API: Deleting Queue with id:', id);
      const response = await apiService.delete(`/api/queues/${id}`, {}, `deleting queue ${id}`);
      console.log('Queues API: Response:', response);
      return response;
    } catch (error) {
      console.error('Queues API: Error deleting queue:', error);
      throw error;
    }
  },

  /**
   * Get queue strategies (for dropdown)
   * Endpoint: /api/assets/queue_strategies (from legacy AngularJS admin)
   */
  getStrategies: async () => {
    try {
      console.log('Queues API: Getting strategies from /api/assets/queue_strategies');
      const response = await apiService.get('/api/assets/queue_strategies', {}, 'fetching queue strategies');
      console.log('Queues API: Strategies response:', response);
      return response;
    } catch (error) {
      console.error('Queues API: Error getting strategies:', error);
      throw error;
    }
  },

  /**
   * Get queue states (for dropdown)
   */
  getStates: async () => {
    try {
      console.log('Queues API: Getting states');
      const response = await apiService.get('/api/queues/states', {}, 'fetching queue states');
      console.log('Queues API: States response:', response);
      return response;
    } catch (error) {
      console.error('Queues API: Error getting states:', error);
      throw error;
    }
  },

  /**
   * Get queue types (for dropdown)
   */
  getTypes: async () => {
    try {
      console.log('Queues API: Getting types');
      const response = await apiService.get('/api/queues/types', {}, 'fetching queue types');
      console.log('Queues API: Types response:', response);
      return response;
    } catch (error) {
      console.error('Queues API: Error getting types:', error);
      throw error;
    }
  },

  /**
   * Set tier level/position for an agent in a queue
   * PATCH /api/users/:user_id with action=tier
   * tier_key: 'level' | 'position'
   * tier_value: numeric string
   */
  setTier: async (userUuid, queueUuid, tierKey, tierValue) => {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams({
      action: 'tier',
      queue_uuid: queueUuid,
      tier_key: tierKey,
      tier_value: String(tierValue)
    });
    return apiService.patch(`/api/users/${userUuid}`, body, headers, `setting tier ${tierKey}=${tierValue}`, true);
  },

  /**
   * Set agent status in the call center
   * PATCH /api/users/:user_id with action=status
   */
  setAgentStatus: async (userUuid, status) => {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams({
      action: 'status',
      status: status
    });
    return apiService.patch(`/api/users/${userUuid}`, body, headers, `setting agent status ${status}`, true);
  }
};