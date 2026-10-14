import { apiService, toFormData } from '../apiService.js';
import { bridgeApi, listFilters } from './bridgeApi.js';

/**
 * Call Conditions API Service
 * API methods for time-based call routing management
 *
 * Based on legacy AngularJS patterns from:
 * - /opt/src/va-voipbox-admin/src/scripts/services/call_conditions/resource.js
 * - /opt/src/va-voipbox-admin/src/scripts/states/call_conditions.js
 *
 * API Endpoints:
 * - GET /api/assets/bridge_types
 * - GET /api/{bridge_type}?search[environment_uuid]=X&per_page=9999
 * - POST /api/call_conditions
 * - PATCH /api/call_conditions/:uuid
 * - DELETE /api/call_conditions/:uuid
 * - GET /api/call_conditions/:uuid
 */

// Re-export from centralized bridgeApi for backwards compatibility
export const getBridgeTypes = bridgeApi.getBridgeTypes;
export const getBridgeResources = bridgeApi.getBridgeResources;

/**
 * Create new call condition
 * @param {object} callConditionData - Call condition data
 * @param {string} callConditionData.name - Condition name
 * @param {boolean} callConditionData.enabled - Enabled status
 * @param {string} callConditionData.environment_uuid - Environment UUID
 * @param {Array} callConditionData.resources - Array of routing resources
 * @param {string} callConditionData.fallback_bridge_type - Fallback bridge type
 * @param {string} callConditionData.fallback_bridge_uuid - Fallback bridge UUID
 * @param {string} callConditionData.notes - Notes
 * @returns {Promise<object>} Created call condition object
 */
export const createCallCondition = async (callConditionData) => {
  // Validate required fields
  if (!callConditionData.name || !callConditionData.environment_uuid) {
    throw new Error('Name and environment are required');
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  // Use centralized toFormData helper for proper nested object encoding
  const formData = toFormData(callConditionData);

  return apiService.post(
    '/api/call_conditions',
    formData,
    headers,
    'creating call condition',
    true
  );
};

/**
 * Get call condition by UUID
 * @param {string} uuid - Call condition UUID
 * @returns {Promise<object>} Call condition object
 */
export const getCallCondition = async (uuid) => {
  if (!uuid) {
    throw new Error('Call condition UUID is required');
  }

  console.log('CallConditions API: Getting call condition with uuid:', uuid);
  const response = await apiService.get(
    `/api/call_conditions/${uuid}`,
    {},
    'fetching call condition',
    false
  );
  console.log('CallConditions API: Response:', response);
  return response;
};

/**
 * Get call condition with debug info
 * @param {string} uuid - Call condition UUID
 * @returns {Promise<object>} Call condition with debug info
 */
export const getCallConditionDebug = async (uuid) => {
  if (!uuid) {
    throw new Error('Call condition UUID is required');
  }

  return apiService.get(
    `/api/call_conditions/${uuid}?debug=true`,
    {},
    'fetching call condition debug info',
    false
  );
};

/**
 * Update existing call condition
 * @param {string} uuid - Call condition UUID
 * @param {object} callConditionData - Updated call condition data
 * @returns {Promise<object>} Updated call condition object
 */
export const updateCallCondition = async (uuid, callConditionData) => {
  if (!uuid) {
    throw new Error('Call condition UUID is required');
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  // Use centralized toFormData helper for proper nested object encoding
  const formData = toFormData(callConditionData);

  return apiService.patch(
    `/api/call_conditions/${uuid}`,
    formData,
    headers,
    'updating call condition',
    true
  );
};

/**
 * Delete call condition
 * @param {string} uuid - Call condition UUID
 * @returns {Promise<object>} Deletion response
 */
export const deleteCallCondition = async (uuid) => {
  if (!uuid) {
    throw new Error('Call condition UUID is required');
  }

  return apiService.delete(
    `/api/call_conditions/${uuid}`,
    {},
    'deleting call condition',
    true
  );
};

/**
 * Get all call conditions with filtering
 * @param {object} options - Query options
 * @param {string} options.environment_uuid - Filter by environment
 * @param {boolean} options.enabled - Filter by enabled status
 * @param {number} options.page - Page number
 * @param {number} options.perPage - Results per page
 * @param {string} options.orderBy - Field to order by
 * @param {string} options.orderKind - Order direction (asc/desc)
 * @returns {Promise<Array>} Array of call condition objects
 */
export const getAllCallConditions = async (options = {}) => {
  // Build query string manually to keep brackets unencoded: search[key]=value
  const queryParts = [];
  queryParts.push(`per_page=${options.perPage || 9999}`);
  queryParts.push(`page=${options.page || 1}`);

  queryParts.push(...listFilters({ environmentUuid: options.environment_uuid, enabled: options.enabled }));

  // Ordering
  if (options.orderBy) {
    queryParts.push(`order_by=${options.orderBy}`);
  }

  if (options.orderKind) {
    queryParts.push(`order_type=${options.orderKind}`);
  }

  const url = `/api/call_conditions?${queryParts.join('&')}`;

  try {
    const response = await apiService.get(url, {}, 'fetching call conditions', false);
    return Array.isArray(response) ? response : [];
  } catch (error) {
    console.error('Error fetching call conditions:', error);
    return [];
  }
};

/**
 * Create a segment record
 * Used to pre-create segments before saving call condition resources
 * @param {object} segmentData - Segment data
 * @param {string} segmentData.name - Segment name
 * @param {string} segmentData.field - Segment field (e.g., 'time.hour', 'time.weekday')
 * @param {string} segmentData.operator - Operator (e.g., 'BETWEEN', 'IN')
 * @param {Array<string>} segmentData.value - Values array
 * @returns {Promise<object>} Created segment with uuid
 */
export const createSegment = async (segmentData) => {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  const formData = toFormData(segmentData);
  return apiService.post('/api/segments', formData, headers, 'creating segment', true);
};

export const callConditionsApi = {
  getBridgeTypes,
  getBridgeResources,
  createCallCondition,
  getCallCondition,
  getCallConditionDebug,
  updateCallCondition,
  deleteCallCondition,
  getAllCallConditions,
  createSegment
};

export default callConditionsApi;
