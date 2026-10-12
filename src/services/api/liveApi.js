import { apiService } from '../apiService';

/**
 * Live Data API Service
 * Handles all live data operations (calls, registrations, agents)
 * Matches backend endpoints in voipappz-api
 */

export const liveApi = {
  /**
   * ========================================
   * LIVE CALLS / SESSIONS
   * GET /api/calls?action=live  → returns array of active calls from FreeSwitch
   * GET /api/calls?action=live_fields → returns flat array of field names
   * ========================================
   */
  getLiveCalls: async (params = {}) => {
    const queryParams = {
      action: 'live',
      ...params
    };
    const queryString = new URLSearchParams(queryParams).toString();
    // skipCircuitBreaker: FreeSwitch 500s are expected when no switch node is configured
    return apiService.get(`/api/calls?${queryString}`, {}, 'fetching live calls', false, true);
  },

  getLiveCallsFields: async () => {
    return apiService.get('/api/calls?action=live_fields', {}, 'fetching live calls fields', false, true);
  },

  /**
   * ========================================
   * LIVE AGENTS
   * GET /api/users?action=agents&search[environment_uuid]=UUID → returns agents with status
   * GET /api/users?action=states → returns available agent states
   * ========================================
   */
  getLiveAgents: async (environmentUuid) => {
    if (!environmentUuid) {
      return [];
    }
    const params = new URLSearchParams({
      action: 'agents',
      'search[environment_uuid]': environmentUuid
    });
    // skipCircuitBreaker: live endpoints should not affect other API calls
    return apiService.get(`/api/users?${params.toString()}`, {}, 'fetching live agents', true, true);
  },

  getAgentStates: async () => {
    return apiService.get('/api/users?action=states', {}, 'fetching agent states', true, true);
  },

  /**
   * ========================================
   * SIP REGISTRATIONS (LIVE DEVICES)
   * GET /api/devices?action=live → returns SIP registrations from FreeSwitch
   * GET /api/devices?action=live_fields → returns {field: {method: field}} hash
   * ========================================
   */
  getLiveRegistrations: async (params = {}) => {
    const queryParams = {
      action: 'live',
      ...params
    };
    const queryString = new URLSearchParams(queryParams).toString();
    // skipCircuitBreaker: FreeSwitch 500s are expected when no switch node is configured
    return apiService.get(`/api/devices?${queryString}`, {}, 'fetching live registrations', true, true);
  },

  getLiveRegistrationsFields: async () => {
    return apiService.get('/api/devices?action=live_fields', {}, 'fetching live registrations fields', true, true);
  },

  /**
   * ========================================
   * CALL CONTROL ACTIONS
   * Backend: voipappz-api/lib/endpoints/calls.rb
   * ========================================
   */

  /** Hangup/kill a live call: DELETE /api/calls/:uuid */
  hangupCall: async (callUuid) => {
    return apiService.delete(`/api/calls/${callUuid}`, {}, `hanging up call ${callUuid}`, true, true);
  },

  /**
   * Call action: PATCH /api/calls/:uuid
   * Supported actions: mute, unmute, hold, unhold, bug, vml, blacklist_add, blacklist_remove
   */
  callAction: async (callUuid, action, extraParams = {}) => {
    const formData = new URLSearchParams({ action, ...extraParams });
    return apiService.patch(
      `/api/calls/${callUuid}`,
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      `${action} call ${callUuid}`,
      true,
      true
    );
  },

  /**
   * Spy on a call: POST /api/calls with action=spy
   * Types: listen (silent), whisper (agent-only), barge (3-way)
   */
  spyCall: async (callUuid, spyType = 'listen') => {
    const formData = new URLSearchParams({
      action: 'spy',
      type: spyType,
      call_uuid: callUuid
    });
    return apiService.post(
      '/api/calls',
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      `spy ${spyType} on call ${callUuid}`,
      true,
      true
    );
  }
};

export default liveApi;
