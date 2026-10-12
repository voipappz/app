import { apiService, toFormData } from '../apiService.js';

/**
 * VMls API Service
 * API methods for VML (VoIP Markup Language) management
 *
 * Based on legacy AngularJS patterns from:
 * - /opt/src/va-voipbox-admin/src/scripts/services/vmls/resource.js
 * - /opt/src/va-voipbox-admin/src/scripts/states/vmls.js
 *
 * API Endpoints:
 * - GET /api/vmls?action=types
 * - POST /api/vmls
 * - PATCH /api/vmls/:uuid
 * - DELETE /api/vmls/:uuid
 * - GET /api/vmls/:uuid
 */

/**
 * Get VML types
 * @returns {Promise<Array>} Array of VML types
 */
export const getVMLTypes = async () => {
  try {
    const response = await apiService.get(
      '/api/vmls?action=types',
      {},
      'fetching VML types',
      false
    );
    return Array.isArray(response) ? response : [];
  } catch (error) {
    console.error('Error fetching VML types:', error);
    return [];
  }
};

/**
 * Create new VML
 * @param {object} vmlData - VML data
 * @param {string} vmlData.name - VML name
 * @param {string} vmlData.type - VML type
 * @param {string} vmlData.data - VML content (HTML/XML)
 * @param {object} vmlData.meta - Meta properties (key-value pairs)
 * @param {string} vmlData.notes - Notes
 * @param {boolean} vmlData.enabled - Enabled status
 * @returns {Promise<object>} Created VML object
 */
export const createVML = async (vmlData) => {
  // Validate required fields
  if (!vmlData.name || !vmlData.type || !vmlData.data) {
    throw new Error('Name, type, and data are required');
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  // Use centralized toFormData helper for proper nested object encoding
  const formData = toFormData(vmlData);

  return apiService.post(
    '/api/vmls',
    formData,
    headers,
    'creating VML',
    true
  );
};

/**
 * Get VML by UUID
 * @param {string} uuid - VML UUID
 * @returns {Promise<object>} VML object
 */
export const getVML = async (uuid) => {
  if (!uuid) {
    throw new Error('VML UUID is required');
  }

  const response = await apiService.get(
    `/api/vmls/${uuid}`,
    {},
    'fetching VML',
    false
  );
  return response;
};

/**
 * Update existing VML
 * @param {string} uuid - VML UUID
 * @param {object} vmlData - Updated VML data
 * @returns {Promise<object>} Updated VML object
 */
export const updateVML = async (uuid, vmlData) => {
  if (!uuid) {
    throw new Error('VML UUID is required');
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  // Use centralized toFormData helper for proper nested object encoding
  const formData = toFormData(vmlData);

  return apiService.patch(
    `/api/vmls/${uuid}`,
    formData,
    headers,
    'updating VML',
    true
  );
};

/**
 * Delete VML
 * @param {string} uuid - VML UUID
 * @returns {Promise<object>} Deletion response
 */
export const deleteVML = async (uuid) => {
  if (!uuid) {
    throw new Error('VML UUID is required');
  }

  return apiService.delete(
    `/api/vmls/${uuid}`,
    {},
    'deleting VML',
    true
  );
};

/**
 * Get all VMls with filtering
 * @param {object} options - Query options
 * @param {string} options.environment_uuid - Filter by environment
 * @param {boolean} options.enabled - Filter by enabled status
 * @param {number} options.page - Page number
 * @param {number} options.perPage - Results per page
 * @param {string} options.orderBy - Field to order by
 * @param {string} options.orderKind - Order direction (asc/desc)
 * @returns {Promise<Array>} Array of VML objects
 */
export const getAllVMLs = async (options = {}) => {
  // Build query string manually to keep brackets unencoded: search[key]=value
  const queryParts = [];
  queryParts.push(`per_page=${options.perPage || 9999}`);
  queryParts.push(`page=${options.page || 1}`);

  if (options.environment_uuid) {
    queryParts.push(`search[environment_uuid]=${encodeURIComponent(options.environment_uuid)}`);
  }

  if (options.enabled !== undefined && options.enabled !== '') {
    queryParts.push(`search[enabled]=${options.enabled}`);
  }

  if (options.name) {
    queryParts.push(`search[name]=${encodeURIComponent(options.name)}`);
  }

  if (options.type) {
    queryParts.push(`search[type]=${encodeURIComponent(options.type)}`);
  }

  // Ordering
  if (options.orderBy) {
    queryParts.push(`order_by=${options.orderBy}`);
  }

  if (options.orderKind) {
    queryParts.push(`order_type=${options.orderKind}`);
  }

  const url = `/api/vmls?${queryParts.join('&')}`;

  try {
    const response = await apiService.get(url, {}, 'fetching VMls', false);
    return Array.isArray(response) ? response : [];
  } catch {
    return [];
  }
};

/**
 * Duplicate VML
 * @param {string} uuid - VML UUID to duplicate
 * @returns {Promise<object>} Duplicated VML object
 */
export const duplicateVML = async (uuid) => {
  if (!uuid) {
    throw new Error('VML UUID is required');
  }

  return apiService.post(
    `/api/vmls/${uuid}/duplicate`,
    {},
    {},
    'duplicating VML',
    true
  );
};

// ── VML AI Chat (EventStore-backed, same pattern as AIChat) ──

// The active session's token: an account's, else a portal user's (reading
// only `auth` sent a user's requests with no token).
const getAuthToken = () => apiService.getToken();

/**
 * Get VML chat sessions
 * @returns {Promise<Array>} Array of session objects { session_id, session_name, created_at }
 */
export const getVMLSessions = async () => {
  const response = await apiService.get('/api/vmls/sessions', {}, 'fetching VML sessions', false);
  return Array.isArray(response) ? response : (response?.sessions || response?.data || []);
};

/**
 * Load VML chat session messages
 * @param {string} sessionId - Session UUID
 * @returns {Promise<object>} { messages: Array<{ message, response }> }
 */
export const loadVMLSession = async (sessionId) => {
  return apiService.get(`/api/vmls/sessions/${sessionId}`, {}, 'loading VML session', false);
};

/**
 * Delete VML chat session
 * @param {string} sessionId - Session UUID
 */
export const deleteVMLSession = async (sessionId) => {
  return apiService.delete(`/api/vmls/sessions/${sessionId}`, {}, 'deleting VML session', false);
};

/**
 * Send message to VML AI chat (streaming)
 * Uses same RunStarted/RunContent/RunCompleted protocol as AI chat.
 *
 * @param {object} opts
 * @param {string} opts.message - User prompt
 * @param {string} [opts.sessionId] - Existing session ID (null for new)
 * @param {string} [opts.model] - Optional model override
 * @param {Function} opts.onChunk - Called with parsed event objects
 * @param {AbortSignal} [opts.signal] - Optional AbortSignal
 */
export const sendVMLMessage = async ({ message, sessionId, model, onChunk, signal }) => {
  const token = getAuthToken();

  const response = await fetch('/api/vmls/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      message,
      session_id: sessionId || undefined,
      model: model || undefined
    }),
    signal
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Unknown error');
    throw new Error(`VML generate failed (${response.status}): ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse newline-delimited JSON
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (onChunk) onChunk(event);
      } catch {
        // incomplete JSON, skip
      }
    }
  }

  // Parse any remaining buffer
  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer);
      if (onChunk) onChunk(event);
    } catch { /* ignore */ }
  }
};

export const vmlsApi = {
  getVMLTypes,
  createVML,
  getVML,
  updateVML,
  deleteVML,
  getAllVMLs,
  duplicateVML,
  getVMLSessions,
  loadVMLSession,
  deleteVMLSession,
  sendVMLMessage
};

export default vmlsApi;
