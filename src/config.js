// Configuration for API and WebSocket URLs
// Uses relative paths - nginx handles routing to actual backend

// Dynamic API base URL storage (set by CustomerEnvironmentContext)
let dynamicApiBaseUrl = null;

// Function to set dynamic API base URL (called when environment changes)
export const setDynamicApiBaseUrl = (url) => {
  dynamicApiBaseUrl = url;
  console.log('🌍 Dynamic API Base URL set to:', url);
};

// Helper function to safely get API base URL
const getApiBaseUrl = () => {
  try {
    // Priority 1: Check for dynamically set environment-specific API URL
    if (dynamicApiBaseUrl) {
      const trimmed = dynamicApiBaseUrl.endsWith('/') ? dynamicApiBaseUrl.slice(0, -1) : dynamicApiBaseUrl;
      console.log('🌍 CONFIG Using environment-specific API URL:', trimmed);
      return trimmed;
    }

    // Simple logic: development uses env var, production uses relative paths
    const isDev = import.meta.env?.DEV;
    const apiBaseUrl = import.meta.env?.VITE_API_BASE_URL;

    if (isDev && apiBaseUrl) {
      // Development: use full env URL (e.g., http://localhost:3000/api)
      const trimmed = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
      console.log('CONFIG Using development API URL:', trimmed);
      return trimmed;
    }
    
    // Production: use relative paths (nginx handles routing)
    console.log('CONFIG Using relative API path');
    return '';
  } catch {
    // Fallback for testing environments
    console.log('CONFIG Fallback to relative API path');
    return '';
  }
};

// Helper function to safely get WebSocket URL
const getWebSocketUrl = (path) => {
  // Server-side or test fallback - use env var
  if (typeof window === 'undefined') {
    const wsUrl = import.meta.env?.VITE_WS_URL;
    if (wsUrl) {
      return `${wsUrl}${path}`;
    }
    // Derive from API base URL if WS URL not set
    const apiUrl = import.meta.env?.VITE_API_BASE_URL;
    if (apiUrl) {
      const wsBase = apiUrl.replace(/^https?:\/\//, 'wss://');
      return `${wsBase}${path}`;
    }
    return path;
  }

  try {
    const isDev = import.meta.env?.DEV;
    // Support both env var names used across branches
    const wssBaseUrl = import.meta.env?.VITE_WSS_BASE_URL;
    const apiBaseWS = import.meta.env?.VITE_API_BASE_WS;
    const wsUrl = import.meta.env?.VITE_WS_URL;

    // Prefer explicit WS base URL when defined (trim trailing slash)
    const explicitWsBase = (wsUrl || apiBaseWS || wssBaseUrl) ? (wsUrl || apiBaseWS || wssBaseUrl) : undefined;
    const baseUrl = explicitWsBase?.endsWith('/') ? explicitWsBase.slice(0, -1) : explicitWsBase;

    if (isDev && baseUrl) {
      // A base that already names a path is used AS THE URL: a dev browser
      // talks to a node directly, and VITE_WS_URL may already end in /cable —
      // appending the path again would 404. One variable (VITE_WS_URL) does
      // both jobs instead of a second one that could disagree with it.
      const hasPath = /^[a-z]+:\/\/[^/]+\/.+/i.test(baseUrl);
      const resolved = hasPath ? baseUrl : `${baseUrl}${path}`;
      console.log('Using development WebSocket URL:', resolved);
      return resolved;
    }

    // In production (or dev without env var), use relative paths (nginx handles routing)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}`;
  } catch (error) {
    console.error('Error constructing WebSocket URL:', error);
    // Fallback to relative path
    const protocol = window.location?.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location?.host || 'localhost'}${path}`;
  }
};

export const config = {
  // API base URL (handles dev vs production)
  get apiBaseUrl() {
    return getApiBaseUrl();
  },

  // Alias for services that use baseUrl (e.g. customerService)
  get baseUrl() {
    return getApiBaseUrl();
  },

  // API endpoints (relative paths)
  api: {
    notifications: '/api/notifications',
    workflows: '/api/workflows',
    rules: '/api/rules',
    environments: '/api/applications',
  },

  // WebSocket endpoints (relative to current host)
  ws: {
    // The live socket: Kong routes /cable to the node the API names
    // (voipappz/mothership#49); in dev VITE_WS_URL points at a node directly.
    get cable() {
      return getWebSocketUrl('/cable');
    }
  }
};
