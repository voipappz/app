import { apiService } from '../apiService';
import { bridgeApi, listFilters } from './bridgeApi.js';

/**
 * VoIP Resources API Service
 *
 * Provides centralized access to VoIP resources (queues, IVRs, extensions, conferences)
 * based on legacy AngularJS patterns from va-voipbox-admin.
 *
 * Legacy Reference:
 * - ~/va-voipbox-admin/app/scripts/services/queues/resource.js
 * - ~/va-voipbox-admin/app/scripts/services/ivr/resource.js
 * - ~/va-voipbox-admin/app/scripts/services/extensions/resource.js
 * - ~/va-voipbox-admin/app/scripts/services/conferences/resource.js
 */

// Re-export from centralized bridgeApi
export const getBridgeTypes = bridgeApi.getBridgeTypes;

/**
 * Get resources by type for bridge routing
 * Updated to use direct endpoints instead of /bridge_list
 * 
 * @param {string} type - Resource type (extensions, queues, ivrs, conferences, announcements)
 * @param {object} params - Filter parameters (environment_uuid, enabled, search, etc.)
 */
export const getBridgeResourceList = async (type, params = {}) => {
  try {
    // Build query string manually to keep brackets unencoded: search[key]=value
    const queryParts = [];
    queryParts.push(`page=${params.page || 1}`);
    queryParts.push(`per_page=${params.per_page || params.limit || 9999}`);

    // Handle search parameters - brackets must NOT be encoded
    const enabled = params.enabled !== undefined ? params.enabled : true;
    queryParts.push(...listFilters({ environmentUuid: params.environment_uuid, enabled }));

    // Use direct endpoint: /api/announcements, /api/devices, etc.
    const url = `/api/${type}?${queryParts.join('&')}`;

    return await apiService.get(url, {}, `fetching ${type}`, true);
  } catch (error) {
    console.error(`Error fetching ${type}:`, error);
    return [];
  }
};

/**
 * Get extensions list
 * Legacy: extensionsResource.filter() or bridgeList({type: 'extensions'})
 */
export const getExtensions = async (params = {}) => {
  return getBridgeResourceList('devices', params);
};

/**
 * Get queues list
 * Legacy: queuesResource.filter() or bridgeList({type: 'queues'})
 */
export const getQueues = async (params = {}) => {
  return getBridgeResourceList('queues', params);
};

/**
 * Get IVRs list
 * Legacy: ivrResource.filter() or bridgeList({type: 'ivrs'})
 */
export const getIvrs = async (params = {}) => {
  return getBridgeResourceList('ivrs', params);
};

/**
 * Get conferences list
 * Legacy: conferencesResource.filter() or bridgeList({type: 'conferences'})
 */
export const getConferences = async (params = {}) => {
  return getBridgeResourceList('conferences', params);
};

/**
 * Get announcements list
 * Uses direct endpoint: GET /api/announcements
 */
export const getAnnouncements = async (params = {}) => {
  return getBridgeResourceList('announcements', params);
};

/**
 * Get resources by bridge type for dropdowns
 * This mimics the legacy pattern where bridge type selection populates a secondary dropdown
 * 
 * Legacy pattern from DIDs:
 * - User selects bridge_type (e.g., 'extension')
 * - System fetches list of extensions for bridge_uuid dropdown
 * 
 * @param {string} bridgeType - The bridge type selected
 * @param {object} params - Filter parameters (environment_uuid, etc.)
 */
export const getResourcesByBridgeType = async (bridgeType, params = {}) => {
  // Map bridge types to their plural API endpoints
  // Bridge types are fetched from server - this mapping provides endpoints
  const typeMapping = {
    extension: 'devices', // /api/devices
    queue: 'queues',
    que: 'queues',  // Legacy alias for queue
    ivr: 'ivrs',
    number: 'dids',
    call_condition: 'call_conditions',
    vml: 'vmls',
    conference: 'conferences',
    bot: 'bots',
    announcement: 'announcements',
    user_login: 'user_logins'
  };

  const resourceType = typeMapping[bridgeType];
  if (!resourceType) {
    console.warn(`Unknown bridge type: ${bridgeType}`);
    return [];
  }

  return getBridgeResourceList(resourceType, {
    enabled: true, // Only get enabled resources for routing
    ...params
  });
};

/**
 * Get environment-scoped resources
 * Legacy: Many resources are filtered by environment_uuid
 */
export const getEnvironmentResources = async (environmentUuid) => {
  if (!environmentUuid) {
    return {
      extensions: [],
      queues: [],
      ivrs: [],
      conferences: [],
      announcements: []
    };
  }
  
  try {
    const [extensions, queues, ivrs, conferences, announcements] = await Promise.all([
      getExtensions({ environment_uuid: environmentUuid, enabled: true }),
      getQueues({ environment_uuid: environmentUuid, enabled: true }),
      getIvrs({ environment_uuid: environmentUuid, enabled: true }),
      getConferences({ environment_uuid: environmentUuid, enabled: true }),
      getAnnouncements({ environment_uuid: environmentUuid, enabled: true })
    ]);
    
    return {
      extensions: extensions || [],
      queues: queues || [],
      ivrs: ivrs || [],
      conferences: conferences || [],
      announcements: announcements || []
    };
  } catch (error) {
    console.error('Error fetching environment resources:', error);
    return {
      extensions: [],
      queues: [],
      ivrs: [],
      conferences: [],
      announcements: []
    };
  }
};

/**
 * Combined resource service object for easy importing
 * Usage: import { voipResourcesApi } from '../services/api/voipResourcesApi';
 */
export const voipResourcesApi = {
  getBridgeTypes,
  getBridgeResourceList,
  getExtensions,
  getQueues,
  getIvrs,
  getConferences,
  getAnnouncements,
  getResourcesByBridgeType,
  getEnvironmentResources
};

export default voipResourcesApi;