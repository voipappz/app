// Configuration for API and WebSocket URLs
// Uses relative paths - nginx handles routing to actual backend

// Helper function to safely get API base URL
const getApiBaseUrl = () => {
  try {
    const isDev = import.meta.env?.DEV;
    const apiBaseUrl = import.meta.env?.VITE_API_BASE_URL;

    console.log('dY"\u0015 CONFIG DEBUG:', {
      isDev,
      hasApiBaseUrl: !!apiBaseUrl,
      apiBaseUrl,
      mode: import.meta.env?.MODE
    });

    // Always prefer explicit env var when provided (in any mode)
    if (apiBaseUrl) {
      const trimmed = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
      console.log('CONFIG Using API URL from env:', trimmed);
      return trimmed;
    }
    // Fallback to relative paths (nginx handles routing)
    console.log('CONFIG Using relative API path');
    return '';
  } catch (error) {
    // Fallback for Node.js testing or other environments
    console.log('dY"\u0015 Fallback to relative API path (import.meta.env not available), err:', error);
    return '';
  }
};

// Helper function to safely get WebSocket URL
const getWebSocketUrl = (path) => {
  // Server-side or test fallback
  if (typeof window === 'undefined') {
    return `ws://localhost:4001${path}`;
  }

  try {
    const isDev = import.meta.env?.DEV;
    // Support both env var names used across branches
    const wssBaseUrl = import.meta.env?.VITE_WSS_BASE_URL;
    const apiBaseWS = import.meta.env?.VITE_API_BASE_WS;

    // Prefer explicit WS base URL when defined (trim trailing slash)
    const explicitWsBase = (apiBaseWS || wssBaseUrl) ? (apiBaseWS || wssBaseUrl) : undefined;
    const baseUrl = explicitWsBase?.endsWith('/') ? explicitWsBase.slice(0, -1) : explicitWsBase;

    if (isDev && baseUrl) {
      console.log('dY"\u0015 Using development WebSocket URL:', baseUrl + path);
      return `${baseUrl}${path}`;
    }

    // In production (or dev without env var), use relative paths (nginx handles routing)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}`;
  } catch (error) {
    console.error('Error constructing WebSocket URL:', error);
    return `ws://localhost:4001${path}`;
  }
};

// Brand identity — fully env-driven so the template rebrands per tenant without
// code changes. Defaults to "voipappz" + the bundled logos in public/brand/.
//   VITE_APP_NAME          display name (header, title, alt text, welcome)
//   VITE_BRAND_LOGO        logo URL (light bg: menu, login, favicon)
//   VITE_BRAND_LOGO_WHITE  logo URL (dark bg: login sidebar)
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
export const brand = {
  name: env.VITE_APP_NAME || 'voipappz',
  logo: env.VITE_BRAND_LOGO || '/brand/voipappz-logo.png',
  logoWhite: env.VITE_BRAND_LOGO_WHITE || '/brand/voipappz-logo-white.png',
};

export const config = {
  // Raw base URL (no /api suffix) - use for non-api endpoints
  get baseUrl() {
    return getApiBaseUrl();
  },

  // API base URL with /api suffix (backward compat for existing services)
  get apiBaseUrl() {
    return getApiBaseUrl() + '/api';
  },

  // API endpoints (relative paths)
  api: {
    notifications: '/api/notifications',
    workflows: '/api/workflows',
    rules: '/api/rules',
    environments: '/api/environments',
  },

  // WebSocket endpoints (relative to current host)
  ws: {
    get cable() {
      return "wss://cloud.voipappz.io/ws";//getWebSocketUrl('/ws'); 
    },
    get ws() {
      return getWebSocketUrl('/ws');
    }
  }
};
