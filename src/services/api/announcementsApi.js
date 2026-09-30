import { apiService, toFormData } from '../apiService.js';

/**
 * Announcements API Service
 * API methods for announcement management (file upload and TTS)
 *
 * Based on legacy AngularJS patterns from:
 * - /opt/src/va-voipbox-admin/src/scripts/services/announcements/resource.js
 * - /opt/src/va-voipbox-admin/src/scripts/controllers/announcements/new.js
 *
 * API Endpoints:
 * - POST /api/announcements (multipart FormData for file upload)
 * - POST /api/tts?text=...&language=... (generate TTS audio)
 * - GET /api/announcements/:uuid
 * - PATCH /api/announcements/:uuid
 * - DELETE /api/announcements/:uuid
 */

/**
 * Get auth token from localStorage
 * @returns {string|null} Auth token
 */
const getToken = () => {
  try {
    const authData = localStorage.getItem('auth');
    if (authData) {
      const parsed = JSON.parse(authData);
      return parsed.access;
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
};

/**
 * Upload announcement file with progress tracking
 * Uses XMLHttpRequest for progress tracking (fetch doesn't support upload progress)
 *
 * @param {object} formData - Announcement form data
 * @param {File} file - Audio file to upload
 * @param {Function} onProgress - Progress callback (receives percentage 0-100)
 * @returns {Promise<object>} Created announcement object
 */
export const uploadFile = async (formData, file, onProgress) => {
  const data = new FormData();
  data.append('name', formData.name);
  data.append('environment_uuid', formData.environment_uuid);
  data.append('enabled', formData.enabled !== undefined ? formData.enabled : true);
  data.append('type', 'file');
  data.append('file', file); // Use 'file' alias as in legacy (not 'files')
  if (formData.notes) {
    data.append('notes', formData.notes);
  }

  const token = getToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Upload progress tracking
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        onProgress(percentComplete);
      }
    });

    // Success handler
    xhr.addEventListener('load', () => {
      // Clear announcement cache after upload (XHR bypasses apiService)
      apiService.clearCache('/api/announcements');

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.response);
          resolve(response);
        } catch {
          resolve({});
        }
      } else {
        const error = new Error(`Upload failed: HTTP ${xhr.status}`);
        error.response = xhr.response;
        reject(error);
      }
    });

    // Error handler
    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed: Network error'));
    });

    // Abort handler
    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    xhr.open('POST', '/api/announcements');

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.send(data);
  });
};

/**
 * Create announcement from text-to-speech
 * Uses the path from a previously generated TTS audio file
 *
 * @param {object} formDataInput - Announcement form data
 * @param {string} formDataInput.name - Announcement name
 * @param {string} formDataInput.environment_uuid - Environment UUID
 * @param {boolean} formDataInput.enabled - Enabled state
 * @param {string} formDataInput.notes - Optional notes
 * @param {string} formDataInput.path - Path to generated TTS audio file (from generateTTS response)
 * @param {object} ttsConfig - TTS configuration (for reference/logging)
 * @returns {Promise<object>} Created announcement object
 */
export const createFromTTS = async (formDataInput) => {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const data = {
    name: formDataInput.name,
    environment_uuid: formDataInput.environment_uuid,
    enabled: formDataInput.enabled !== undefined ? formDataInput.enabled : true,
    notes: formDataInput.notes || ''
  };

  // If path is provided (from TTS generation), use it
  // The API will read the audio file from this path
  if (formDataInput.path) {
    data.path = formDataInput.path;
  }

  // Use centralized toFormData helper for proper nested object encoding
  const formData = toFormData(data);

  return apiService.post(
    '/api/announcements',
    formData,
    headers,
    'creating announcement from TTS',
    true
  );
};

/**
 * Generate TTS audio preview
 * Calls POST /api/announcements/tts with text, language, and provider_uuid
 *
 * @param {string} text - Text to convert to speech
 * @param {string} language - Language code (e.g., 'en', 'he', 'es', 'fr')
 * @param {string} providerUuid - TTS provider UUID (required - must be a provider with type='tts')
 * @returns {Promise<object>} TTS generation response with path to audio file
 */
export const generateTTS = async (text, language, providerUuid) => {
  if (!text) {
    throw new Error('Text is required for TTS generation');
  }
  if (!providerUuid) {
    throw new Error('TTS Provider is required - please select a TTS provider');
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const data = {
    text: text.trim(),
    language: language || 'en',
    provider_uuid: providerUuid
  };

  // Use form data for the POST request
  const formData = toFormData(data);

  return apiService.post(
    '/api/announcements/tts',
    formData,
    headers,
    'generating TTS audio',
    true
  );
};

/**
 * Get announcement by UUID
 * @param {string} uuid - Announcement UUID
 * @returns {Promise<object>} Announcement object
 */
export const getAnnouncement = async (uuid) => {
  if (!uuid) {
    throw new Error('Announcement UUID is required');
  }

  console.log('Announcements API: Getting announcement with uuid:', uuid);
  const response = await apiService.get(
    `/api/announcements/${uuid}`,
    {},
    'fetching announcement',
    false
  );
  console.log('Announcements API: Response:', response);
  return response;
};

/**
 * Update existing announcement
 * Sends all fields (name, enabled, environment_uuid, notes) matching the legacy admin pattern.
 * The API PATCH endpoint only accepts these 4 fields.
 *
 * @param {string} uuid - Announcement UUID
 * @param {object} announcementData - Updated announcement data
 * @returns {Promise<object>} Updated announcement object
 */
export const updateAnnouncement = async (uuid, announcementData) => {
  if (!uuid) {
    throw new Error('Announcement UUID is required');
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  // Always send all 4 fields the API accepts (same as legacy admin)
  // Build URLSearchParams directly to ensure empty strings are sent (toFormData skips them)
  // Use explicit fallbacks to prevent undefined/null being stringified as "undefined"/"null"
  const name = announcementData.name || '';
  const enabled = announcementData.enabled !== undefined && announcementData.enabled !== null ? announcementData.enabled : true;
  const envUuid = announcementData.environment_uuid || '';
  const notes = announcementData.notes && announcementData.notes !== 'undefined' ? announcementData.notes : '';

  const formData = new URLSearchParams();
  formData.append('name', name);
  formData.append('enabled', String(enabled));
  formData.append('environment_uuid', envUuid);
  formData.append('notes', notes);

  const result = await apiService.patch(
    `/api/announcements/${uuid}`,
    formData,
    headers,
    'updating announcement',
    true
  );

  // Clear announcement cache to ensure fresh data on next fetch
  apiService.clearCache('/api/announcements');

  return result;
};

/**
 * Update announcement with file and metadata in a single PATCH (same as legacy admin)
 * Sends multipart/form-data with file + name + environment_uuid + notes + enabled
 *
 * @param {string} uuid - Announcement UUID
 * @param {File} file - New audio file
 * @param {object} metadata - Announcement metadata (name, enabled, environment_uuid, notes)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<object>} Updated announcement object
 */
export const updateFile = async (uuid, file, metadata = {}, onProgress) => {
  const data = new FormData();
  // Use 'files' alias matching legacy admin's FileUploader alias
  data.append('files', file);
  // Include all metadata fields in the same request (same as legacy admin)
  if (metadata.name) data.append('name', metadata.name);
  if (metadata.environment_uuid) data.append('environment_uuid', metadata.environment_uuid);
  data.append('enabled', metadata.enabled !== undefined && metadata.enabled !== null ? String(metadata.enabled) : 'true');
  data.append('notes', metadata.notes && metadata.notes !== 'undefined' ? metadata.notes : '');

  const token = getToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        onProgress(percentComplete);
      }
    });

    xhr.addEventListener('load', () => {
      // Clear announcement cache after file upload (XHR bypasses apiService)
      apiService.clearCache('/api/announcements');

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.response);
          resolve(response);
        } catch {
          resolve({});
        }
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed: Network error'));
    });

    xhr.open('PATCH', `/api/announcements/${uuid}`);

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.send(data);
  });
};

/**
 * Delete announcement
 * @param {string} uuid - Announcement UUID
 * @returns {Promise<object>} Deletion response
 */
export const deleteAnnouncement = async (uuid) => {
  if (!uuid) {
    throw new Error('Announcement UUID is required');
  }

  return apiService.delete(
    `/api/announcements/${uuid}`,
    {},
    'deleting announcement',
    true
  );
};

/**
 * Get all announcements for an environment
 * @param {string} environmentUuid - Environment UUID
 * @param {object} options - Additional query options
 * @returns {Promise<Array>} Array of announcement objects
 */
export const getAllAnnouncements = async (environmentUuid, options = {}) => {
  // Build query string manually to keep brackets unencoded: search[key]=value
  const queryParts = [];
  queryParts.push(`per_page=${options.perPage || 9999}`);
  queryParts.push(`page=${options.page || 1}`);

  if (environmentUuid) {
    queryParts.push(`search[environment_uuid]=${encodeURIComponent(environmentUuid)}`);
  }

  if (options.enabled !== undefined) {
    queryParts.push(`search[enabled]=${options.enabled}`);
  }

  const url = `/api/announcements?${queryParts.join('&')}`;

  try {
    const response = await apiService.get(url, {}, 'fetching announcements', false);
    return Array.isArray(response) ? response : [];
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return [];
  }
};

/**
 * Duplicate announcement
 * @param {string} uuid - Announcement UUID to duplicate
 * @returns {Promise<object>} Duplicated announcement object
 */
export const duplicateAnnouncement = async (uuid) => {
  if (!uuid) {
    throw new Error('Announcement UUID is required');
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  // Use centralized toFormData helper for proper nested object encoding
  const formData = toFormData({ duplicate_from: uuid });

  return apiService.post(
    '/api/announcements',
    formData,
    headers,
    'duplicating announcement',
    true
  );
};

/**
 * Get audio URL for an announcement (with auth token for direct playback)
 * @param {string} uuid - Announcement UUID
 * @returns {string} Audio URL with auth token
 */
export const getAudioUrl = (uuid) => {
  if (!uuid) return null;

  const token = getToken();
  const baseUrl = `/api/announcements/${uuid}/audio`;

  // Add token as query param for audio element to use
  if (token) {
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }

  return baseUrl;
};

/**
 * Fetch audio blob for an announcement (for custom playback)
 * @param {string} uuid - Announcement UUID
 * @returns {Promise<Blob>} Audio blob
 */
export const fetchAudioBlob = async (uuid) => {
  if (!uuid) {
    throw new Error('Announcement UUID is required');
  }

  const token = getToken();
  const response = await fetch(`/api/announcements/${uuid}/audio`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch audio: HTTP ${response.status}`);
  }

  return response.blob();
};

/**
 * Get available TTS providers
 * Fetches providers with type='tts' for the current customer
 *
 * @returns {Promise<Array>} Array of TTS provider objects
 */
export const getTTSProviders = async () => {
  try {
    // Fetch providers with type=tts filter
    const queryParts = [];
    queryParts.push('per_page=100');
    queryParts.push('search[type]=tts');

    const url = `/api/providers?${queryParts.join('&')}`;
    const response = await apiService.get(url, {}, 'fetching TTS providers', false);

    return Array.isArray(response) ? response : (response?.data || []);
  } catch (error) {
    console.error('Error fetching TTS providers:', error);
    return [];
  }
};

/**
 * Built-in announcements the API plays from local files: MOH (music on hold),
 * RINGING and SILENCE. GET /api/announcements?action=builtins -> [{name, label}].
 * Falls back to the same three if the API is older than the action.
 */
export const BUILTIN_FALLBACK = [
  { name: 'MOH', label: 'Music on hold' },
  { name: 'RINGING', label: 'Ringing' },
  { name: 'SILENCE', label: 'Silence' },
];

export const getBuiltins = async () => {
  try {
    const response = await apiService.get('/api/announcements?action=builtins', {}, 'fetching built-in announcements', false);
    return Array.isArray(response) && response.length ? response : BUILTIN_FALLBACK;
  } catch {
    return BUILTIN_FALLBACK;
  }
};

/**
 * Create a built-in announcement: POST its name with no file. The API plays
 * the local file for that name, so there is nothing to upload.
 */
export const createBuiltin = async (formDataInput) => {
  const { path: _ignored, ...data } = formDataInput;
  return createFromTTS(data);
};

export const announcementsApi = {
  uploadFile,
  createFromTTS,
  createBuiltin,
  getBuiltins,
  generateTTS,
  getTTSProviders,
  getAnnouncement,
  updateAnnouncement,
  updateFile,
  deleteAnnouncement,
  getAllAnnouncements,
  duplicateAnnouncement,
  getAudioUrl,
  fetchAudioBlob
};

export default announcementsApi;
