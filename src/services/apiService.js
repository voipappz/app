import { configService } from './configService.js';
import { config } from '../config.js';

// Global API service with centralized error handling
class ApiService {
  // Shared in-flight GET map for request dedup (see get()).
  static _inflightGets = new Map();

  constructor() {
    this.authContextLogout = null; // Will be set by AuthContext
    this.refreshHandler = null;    // Will be set by AuthContext (attemptTokenRefresh)
    this.refreshInFlight = null;   // Single-flight: N concurrent 401s share ONE refresh
    this.authInitializing = true; // Tracks if auth is still initializing
    this.successHandler = null; // Will be set for global success messages
    this.errorHandler = null; // Will be set for global error messages
    this.isOnline = navigator.onLine;

    // Request deduplication cache - prevents duplicate API calls
    this.pendingRequests = new Map(); // key: request signature, value: promise
    // Endpoints that still returned 401 after a successful token refresh,
    // since the last 2xx. Two distinct ones means the session is dead;
    // one means that endpoint is. See the 401 branch in #fetch.
    this.postRefreshRejections = new Set();

    // Response caching system - caches GET requests for performance
    this.responseCache = new Map(); // key: cache signature, value: { data, timestamp, ttl }
    this.cacheTTLs = {
      '/api/acls': 300000,        // 5 minutes for ACLs
      '/api/statuses': 300000,    // 5 minutes for statuses
      '/api/customers': 60000,    // 1 minute for customers
      '/api/applications': 60000, // 1 minute for environments
      'default': 30000            // 30 seconds default
    };

    // DISABLED: No retries to protect server from being overwhelmed
    this.retryConfig = {
      maxRetries: 0, // NO RETRIES - fail immediately
      retryDelay: 1000,
      retryMultiplier: 2
    };

    // Enhanced rate limiting configuration for server protection
    this.rateLimitConfig = {
      minRequestInterval: 500, // 500ms between requests
      rateLimitBackoff: 5000,  // Wait time after 429 error
      serverErrorBackoff: 30000, // Wait 30s after 500/502 errors (increased from 10s)
      isRateLimited: false,
      rateLimitUntil: 0,
      serverErrorUntil: 0,
      consecutiveErrors: 0,
      maxConsecutiveErrors: 1 // Trip immediately on first error
    };
    this.lastRequestTime = 0;

    // Circuit breaker to prevent request flooding on server errors
    // Trips after consecutive failures to protect server while allowing recovery
    this.circuitBreaker = {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      failureThreshold: 3, // Open circuit after 3 consecutive failures (less aggressive)
      resetTimeout: 15000, // Stay open for 15s (reduced from 30s for faster recovery)
      openedAt: 0,
      lastFailure: 0
    };

    // Initialize configuration logging in development
    if (configService.isDevelopment()) {
      configService.logConfig();
    }

    // Listen for network changes
    this.setupNetworkListeners();
  }

  // Get current API base URL (supports dynamic environment-based URLs)
  getApiBaseUrl() {
    return config.apiBaseUrl || '';
  }

  setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      if (this.successHandler) {
        this.successHandler('🌐 Network connection restored');
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      if (this.errorHandler) {
        this.errorHandler('🌐 Network connection lost. Some features may not work.');
      }
    });
  }

  // Method to set the logout function from AuthContext
  setLogoutHandler(logoutFn) {
    this.authContextLogout = logoutFn;
  }

  // Method to set the token-refresh function from AuthContext.
  // Without one, a 401 logs out immediately -- the pre-existing behaviour.
  setRefreshHandler(refreshFn) {
    this.refreshHandler = refreshFn;
  }

  // Refresh the access token at most once for any number of concurrent 401s.
  // A dashboard fires ~8 requests at load; without single-flight an expired
  // token means 8 refresh POSTs racing, and each loser overwrites the winner's
  // fresh token with a stale one.
  async refreshOnce() {
    if (!this.refreshHandler) return false;
    if (!this.refreshInFlight) {
      this.refreshInFlight = Promise.resolve()
        .then(() => this.refreshHandler())
        .then((result) => result !== false)
        .catch(() => false)
        .finally(() => { this.refreshInFlight = null; });
    }
    return this.refreshInFlight;
  }

  // Method to update auth initialization state
  setAuthInitializing(initializing) {
    this.authInitializing = initializing;
  }

  // Method to set global success/error message handlers
  setMessageHandlers(successFn, errorFn) {
    this.successHandler = successFn;
    this.errorHandler = errorFn;
  }

  // A success toast is for an action the user took that changed something
  // (create / update / delete). Loading data never announces itself: a GET (or
  // HEAD/OPTIONS) is a read, and so is any request whose context says it is
  // fetching or loading. Errors are reported either way.
  static announcesSuccess(method, context) {
    const verb = String(method || 'GET').toUpperCase();
    if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return false;
    return !/^\s*(fetching|loading)\b/i.test(context || '');
  }

  // Centralized API response handler. `method` decides whether a success is
  // worth a toast (see announcesSuccess); it defaults to a read.
  async handleResponse(response, context = '', showMessages = true, method = 'GET') {
    if (response.status === 401) {
      console.error(`Authentication failed for ${context}`);

      // Don't trigger logout during initialization - auth might not be restored yet
      if (this.authInitializing) {
        console.warn('[ApiService] 401 received during auth initialization, ignoring logout trigger');
        throw new Error('Authentication required. Please wait for auth to initialize.');
      }

      // Deliberately does NOT log out or toast here. A 401 usually means the
      // 1-hour access token expired while a 7-day refresh token is still valid
      // in localStorage -- AuthContext refreshes 5 minutes before expiry, but a
      // setTimeout does not survive a backgrounded or suspended tab, so a user
      // coming back to an open dashboard found every panel 401'ing at once and
      // was thrown to the login screen with a perfectly good refresh token
      // unused.
      //
      // #fetch owns the recovery: refresh once, retry, and log out only if the
      // refresh itself fails. Callers that invoke handleResponse directly still
      // get a 401 error, just without the side effects.
      const authError = new Error('Authentication failed. Please log in again.');
      authError.status = 401;
      authError.canRetryAfterRefresh = true;
      throw authError;
    }

    // Handle rate limiting (429) - do NOT retry
    if (response.status === 429) {
      this.rateLimitConfig.isRateLimited = true;
      this.rateLimitConfig.rateLimitUntil = Date.now() + this.rateLimitConfig.rateLimitBackoff;

      const errorMessage = 'API rate limit exceeded. Please wait a moment before trying again.';
      console.warn(`Rate limited for ${context}`);

      if (this.errorHandler && showMessages) {
        this.errorHandler(`⚠️ ${errorMessage}`);
      }

      const error = new Error(errorMessage);
      error.status = 429;
      error.isRateLimited = true;
      throw error;
    }

    // Handle 406 Not Acceptable - extract actual error message from server
    if (response.status === 406) {
      let serverErrorMessage = 'Request not acceptable. Please check your input.';

      // Try to extract the actual error message from the server response
      try {
        const errorBody = await response.json();
        // The server may return { message: "..." } or { error: "..." } or { id: "...", message: "..." }
        if (errorBody.message) {
          serverErrorMessage = errorBody.message;
        } else if (errorBody.error) {
          serverErrorMessage = errorBody.error;
        } else if (typeof errorBody === 'string') {
          serverErrorMessage = errorBody;
        }
      } catch {
        // If JSON parsing fails, try text
        try {
          const textBody = await response.text();
          if (textBody && textBody.length > 0 && textBody.length < 500) {
            serverErrorMessage = textBody;
          }
        } catch {
          // Keep default error message
        }
      }

      console.error(`406 Not Acceptable for ${context}: ${serverErrorMessage}`);

      if (this.errorHandler && showMessages) {
        this.errorHandler(`❌ ${serverErrorMessage}`);
      }

      const error = new Error(serverErrorMessage);
      error.status = 406;
      error.response = { data: { message: serverErrorMessage } };
      throw error;
    }

    // Handle 502 Bad Gateway - implement aggressive backoff
    if (response.status === 502) {
      this.rateLimitConfig.consecutiveErrors++;
      const backoffTime = this.rateLimitConfig.serverErrorBackoff * Math.pow(2, Math.min(this.rateLimitConfig.consecutiveErrors - 1, 3));
      this.rateLimitConfig.serverErrorUntil = Date.now() + backoffTime;
      
      const errorMessage = `Server error (502). Backing off for ${backoffTime/1000}s. (Error ${this.rateLimitConfig.consecutiveErrors})`;
      console.error(`502 Bad Gateway for ${context} - implementing ${backoffTime}ms backoff`);

      if (this.errorHandler && showMessages) {
        this.errorHandler(`🚫 ${errorMessage}`);
      }

      const error = new Error(errorMessage);
      error.status = 502;
      error.isServerError = true;
      error.backoffTime = backoffTime;
      throw error;
    }

    // Handle 500 Internal Server Error - let circuit breaker threshold handle it
    if (response.status === 500) {
      const errorMessage = `Internal server error (500) for ${context}.`;
      console.error(`🚨 500 Internal Server Error for ${context}`);

      if (this.errorHandler && showMessages) {
        this.errorHandler(`🚫 ${errorMessage}`);
      }

      const error = new Error(errorMessage);
      error.status = 500;
      error.isServerError = true;
      throw error;
    }

    // Handle 503 Service Unavailable - show global error, do NOT retry
    if (response.status === 503) {
      const errorMessage = 'Service temporarily unavailable. Please try again later.';
      console.error(`503 Service Unavailable for ${context}`);

      if (this.errorHandler && showMessages) {
        this.errorHandler(`🔧 ${errorMessage}`);
      }

      const error = new Error(errorMessage);
      error.status = 503;
      error.isServiceUnavailable = true;
      throw error;
    }

    if (response.status >= 200 && response.status < 300) {
      // Reset consecutive error counter on successful response
      this.rateLimitConfig.consecutiveErrors = 0;
      
      // Show a success message for a change the user made -- never for a load.
      if (this.successHandler && showMessages && context
          && ApiService.announcesSuccess(method, context)) {
        this.successHandler(`✅ Successfully completed: ${context}`);
      }

      // Consider all 2xx status codes as success
      try {
        const jsonData = await response.json();
        
        // Extract X-Total header for pagination support (following AngularJS legacy pattern)
        const xTotal = response.headers.get('X-Total');
        if (xTotal && Array.isArray(jsonData)) {
          // Only wrap with pagination info if response is an array (list endpoints)
          const totalCount = parseInt(xTotal, 10);
          if (!isNaN(totalCount)) {
            return {
              data: jsonData,
              total_records: totalCount,
              total: totalCount, // Alternative property name for compatibility
              headers: {
                'x-total': xTotal
              }
            };
          }
        }
        
        // Return original JSON if no X-Total header
        return jsonData;
      } catch {
        // Return empty object if no JSON response
        return {};
      }
    }

    // For other error status codes
    let errorData;
    try {
      errorData = await response.text();
    } catch {
      errorData = 'Unknown error';
    }

    const errorMessage = `Failed ${context}: HTTP ${response.status}: ${errorData}`;

    // Show global error message
    if (this.errorHandler && showMessages) {
      this.errorHandler(errorMessage);
    }

    // Stamp the status. Callers that fall back to a legacy endpoint need to
    // tell "this API is too old to have that route" (404/405) apart from
    // "your token is no good" (401) — retrying the latter just fires a second
    // logout. Every other throw in this method already carries .status.
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  // Sleep helper for retry logic
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Circuit breaker methods
  checkCircuitState() {
    const now = Date.now();

    if (this.circuitBreaker.state === 'OPEN') {
      // Check if enough time has passed to try half-open state
      if (now - this.circuitBreaker.openedAt > this.circuitBreaker.resetTimeout) {
        console.log('[ApiService] Circuit breaker entering HALF_OPEN state');
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.failureCount = 0;
      } else {
        const waitTime = Math.ceil((this.circuitBreaker.openedAt + this.circuitBreaker.resetTimeout - now) / 1000);
        throw new Error(`Circuit breaker is OPEN. Service unavailable. Retry in ${waitTime}s.`);
      }
    }
  }

  recordSuccess() {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      console.log('[ApiService] Circuit breaker closing - service recovered');
      this.circuitBreaker.state = 'CLOSED';
    }
    this.circuitBreaker.failureCount = 0;
  }

  recordFailure(error, notify = true) {
    // Only count server errors (5xx) and network errors as circuit breaker failures
    const isServerError = error.status >= 500 || error.message.includes('HTTP 5') ||
                         error.message.includes('network') || error.message.includes('fetch');

    if (!isServerError) {
      console.log(`[ApiService] Ignoring client error for circuit breaker: ${error.status} - ${error.message}`);
      return; // Don't count client errors (4xx) towards circuit breaker
    }

    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailure = Date.now();

    console.warn(`[ApiService] Circuit breaker failure count: ${this.circuitBreaker.failureCount}/${this.circuitBreaker.failureThreshold} - Error: ${error.message}`);

    if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      this.circuitBreaker.openedAt = Date.now();
      console.error(`[ApiService] Circuit breaker OPENED - too many failures (${this.circuitBreaker.failureCount}). Blocking all requests for ${this.circuitBreaker.resetTimeout/1000}s`);
      console.error(`[ApiService] Last error that triggered circuit breaker:`, error);

      if (notify && this.errorHandler) {
        this.errorHandler(`🚨 Service temporarily unavailable due to multiple errors. Will retry in ${this.circuitBreaker.resetTimeout/1000}s.`);
      }
    }
  }

  // Manual circuit breaker reset (for debugging/emergency use)
  resetCircuitBreaker() {
    console.log('[ApiService] Circuit breaker manually reset');
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.openedAt = 0;
    this.circuitBreaker.lastFailure = 0;
  }

  // Generate unique request signature for deduplication
  getRequestSignature(url, method = 'GET', body = null) {
    // Create a unique key based on identity, method, URL, and body: a request
    // in flight for one session must never be handed to another.
    const urlStr = typeof url === 'string' ? url : String(url);
    let signature = `${this.identityKey()}:${method}:${urlStr}`;

    // Include body in signature for POST/PATCH/PUT requests
    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      if (body instanceof FormData || body instanceof URLSearchParams) {
        signature += `:${body.toString()}`;
      } else {
        signature += `:${JSON.stringify(body)}`;
      }
    }

    return signature;
  }

  // Get cache TTL for a specific URL
  getCacheTTL(url) {
    // Extract base path without query params
    const urlObj = new URL(url, 'http://dummy'); // Use dummy base for relative URLs
    const basePath = urlObj.pathname;

    // Check for exact match first
    if (this.cacheTTLs[basePath]) {
      return this.cacheTTLs[basePath];
    }

    // Check for pattern match
    for (const [pattern, ttl] of Object.entries(this.cacheTTLs)) {
      if (pattern !== 'default' && basePath.includes(pattern)) {
        return ttl;
      }
    }

    return this.cacheTTLs.default;
  }

  // Whose request this is. Every cached or shared response is keyed by it, so
  // one identity is never served another's: the cache used to be keyed by URL
  // alone and outlive sign-out, and a portal user signing in on a tab an
  // account had used got the ACCOUNT's responses (see resetSession).
  identityKey() {
    return this.getToken() || 'anonymous';
  }

  // Forget every cached and in-flight response. Called whenever a session
  // starts or ends (services/sessionIsolation.js forgetPerson).
  resetSession() {
    this.responseCache.clear();
    this.pendingRequests.clear();
    this.postRefreshRejections.clear();
    ApiService._inflightGets.clear();
  }

  // Generate cache signature (only for GET requests)
  getCacheSignature(url) {
    return `CACHE:${this.identityKey()}:${url}`;
  }

  // Get data from cache if valid
  getFromCache(url) {
    const cacheKey = this.getCacheSignature(url);
    const cached = this.responseCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    const age = now - cached.timestamp;

    // Check if cache is still valid
    if (age < cached.ttl) {
      console.log(`[ApiService] 💾 Cache HIT for ${url} (age: ${Math.round(age/1000)}s, ttl: ${cached.ttl/1000}s)`);
      return cached.data;
    }

    // Cache expired, remove it
    console.log(`[ApiService] 🕒 Cache EXPIRED for ${url} (age: ${Math.round(age/1000)}s, ttl: ${cached.ttl/1000}s)`);
    this.responseCache.delete(cacheKey);
    return null;
  }

  // Store data in cache
  setCache(url, data) {
    const cacheKey = this.getCacheSignature(url);
    const ttl = this.getCacheTTL(url);

    this.responseCache.set(cacheKey, {
      data: data,
      timestamp: Date.now(),
      ttl: ttl
    });

    console.log(`[ApiService] 💾 Cache SET for ${url} (ttl: ${ttl/1000}s)`);
  }

  // Clear cache for specific URL or pattern
  clearCache(urlPattern = null) {
    if (!urlPattern) {
      // Clear all cache
      this.responseCache.clear();
      console.log('[ApiService] 🗑️ Cache CLEARED (all)');
      return;
    }

    // Clear matching URLs
    let cleared = 0;
    for (const [key] of this.responseCache.entries()) {
      if (key.includes(urlPattern)) {
        this.responseCache.delete(key);
        cleared++;
      }
    }

    console.log(`[ApiService] 🗑️ Cache CLEARED (${cleared} entries matching "${urlPattern}")`);
  }

  // Enhanced logging
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();

    console[level](`[ApiService] ${timestamp}: ${message}`, data);

    // In production, could send to logging service
    if (process.env.NODE_ENV === 'production' && level === 'error') {
      // Example: this.sendToLoggingService({ timestamp, level, message, ...data });
    }
  }

  // Generic fetch wrapper with retry logic and enhanced error handling
  // skipCircuitBreaker: if true, this request won't be affected by circuit breaker state
  //                     and failures won't trigger the circuit breaker (useful for health checks)
  async fetch(url, options = {}, context = '', showMessages = true, retries = 0, skipCircuitBreaker = false) {
    // Generate request signature for deduplication
    const method = options.method || 'GET';
    const requestSignature = this.getRequestSignature(url, method, options.body);

    // Convert relative URLs to absolute using base URL
    let finalUrl = url;
    const baseUrl = this.getApiBaseUrl();
    if (baseUrl && (url.startsWith('/api/') || url.startsWith('/tasks/'))) {
      finalUrl = `${baseUrl}${url}`;
    }

    // Check cache FIRST for GET requests only
    if (method === 'GET') {
      const cachedData = this.getFromCache(finalUrl);
      if (cachedData !== null) {
        return cachedData;
      }
    }

    // Check if this exact request is already pending (deduplication)
    if (this.pendingRequests.has(requestSignature)) {
      console.log(`[ApiService] ⚡ Deduplicating request: ${method} ${finalUrl}`);
      return this.pendingRequests.get(requestSignature);
    }

    // Check circuit breaker state FIRST - prevents request flooding
    // Skip for health checks and other non-critical requests
    if (!skipCircuitBreaker) {
      try {
        this.checkCircuitState();
      } catch (error) {
        // Circuit is open - reject immediately without making request
        if (showMessages && this.errorHandler) {
          this.errorHandler(`🚨 ${error.message}`);
        }
        throw error;
      }
    }

    // Check network connectivity
    if (!this.isOnline && showMessages && this.errorHandler) {
      this.errorHandler('🌐 No network connection. Please check your internet.');
      throw new Error('Network unavailable');
    }

    // Check if we're still rate limited or in server error backoff
    const now = Date.now();
    if (this.rateLimitConfig.isRateLimited) {
      if (now < this.rateLimitConfig.rateLimitUntil) {
        const waitTime = Math.ceil((this.rateLimitConfig.rateLimitUntil - now) / 1000);
        const errorMessage = `Rate limited. Please wait ${waitTime} seconds.`;
        if (this.errorHandler && showMessages) {
          this.errorHandler(`⚠️ ${errorMessage}`);
        }
        throw new Error(errorMessage);
      } else {
        // Rate limit period has passed
        this.rateLimitConfig.isRateLimited = false;
      }
    }
    
    // Check if we're in server error backoff period
    if (now < this.rateLimitConfig.serverErrorUntil) {
      const waitTime = Math.ceil((this.rateLimitConfig.serverErrorUntil - now) / 1000);
      const errorMessage = `Server error backoff. Please wait ${waitTime} seconds.`;
      if (this.errorHandler && showMessages) {
        this.errorHandler(`🚫 ${errorMessage}`);
      }
      throw new Error(errorMessage);
    }

    // Throttle requests - ensure minimum interval between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitConfig.minRequestInterval) {
      await this.sleep(this.rateLimitConfig.minRequestInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();

    const token = this.getToken();
    const optionHeaders = { ...(options.headers || {}) };
    const suppliedAuthorization = optionHeaders.Authorization || optionHeaders.authorization;
    delete optionHeaders.Authorization;
    delete optionHeaders.authorization;

    // A number of older callers build Authorization from React auth state. On
    // the first render after login (and for one render after refresh), that
    // state can still be empty while localStorage already contains the valid
    // token. Never let `Authorization: ''` overwrite that stored token.
    const authorization = suppliedAuthorization || (token ? `Bearer ${token}` : null);
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...optionHeaders,
      ...(authorization ? { Authorization: authorization } : {})
    };

    const defaultOptions = {
      headers: defaultHeaders,
      timeout: configService.get('api.timeout', 60000)
    };

    // Remove Content-Type for FormData
    if (options.body instanceof FormData) {
      delete defaultOptions.headers['Content-Type'];
    }

    const finalOptions = {
      ...defaultOptions,
      ...options,
      // Use the sanitized headers above. Re-spreading options.headers here
      // would reintroduce the blank Authorization value we just rejected.
      headers: defaultHeaders
    };
    // Internal flag (see the 401 handler below) -- not a RequestInit member.
    delete finalOptions.alreadyRefreshed;

    this.log('info', `API Request: ${finalOptions.method || 'GET'} ${finalUrl}`, {
      context,
      retries,
      hasToken: !!token,
      originalUrl: url,
      resolvedUrl: finalUrl
    });

    // Create the request promise and store it for deduplication
    const requestPromise = (async () => {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), finalOptions.timeout);

      try {
        const response = await fetch(finalUrl, {
          ...finalOptions,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        this.log('info', `API Response: ${response.status} for ${context}`, {
          status: response.status,
          url: finalUrl,
          context
        });

        const result = await this.handleResponse(response, context, showMessages, finalOptions.method || 'GET');

        // Any 2xx proves the access token is good, so nothing outstanding is a
        // session failure any more. See the post-refresh 401 branch below.
        this.postRefreshRejections.clear();

        // Record success for circuit breaker (skip for health checks)
        if (!skipCircuitBreaker) {
          this.recordSuccess();
        }

        // Cache successful GET responses - unless the server said not to
        // (Cache-Control: no-store, e.g. a device read carrying its SIP
        // password). Cache-Control is CORS-safelisted, so it is readable here.
        const noStore = /no-store/i.test(response.headers?.get?.('Cache-Control') || '');
        if (method === 'GET' && !noStore) {
          this.setCache(finalUrl, result);
        }

        // Clear cache for mutation operations (POST/PATCH/PUT/DELETE)
        // This ensures subsequent GET requests fetch fresh data
        if (method !== 'GET') {
          // Extract base path to clear related caches
          const urlObj = new URL(finalUrl, 'http://dummy');
          const basePath = urlObj.pathname.split('/').slice(0, -1).join('/'); // Remove ID from path
          this.clearCache(basePath);
        }

        return result;

      } catch (error) {
        clearTimeout(timeoutId);

        this.log('error', `API Error for ${context}`, {
          error: error.message,
          url: finalUrl,
          retries,
          stack: error.stack
        });

        // Record failure for circuit breaker (skip for health checks)
        if (!skipCircuitBreaker) {
          this.recordFailure(error, showMessages);
        }

        // Handle specific error types
        if (error.name === 'AbortError') {
          const timeoutError = new Error(`Request timeout for ${context}`);
          if (showMessages && this.errorHandler) {
            this.errorHandler(`⏰ Request timed out: ${context}`);
          }
          throw timeoutError;
        }

        // An expired access token is recoverable: refresh once, then replay the
        // request. `alreadyRefreshed` stops a loop when the refreshed token is
        // ALSO rejected -- that is a real auth failure, and only then do we log
        // the user out. The logout lives here, once per failed recovery, rather
        // than in handleResponse where every concurrent 401 fired its own.
        if (error.status === 401 && error.canRetryAfterRefresh && !options.alreadyRefreshed) {
          const refreshed = await this.refreshOnce();

          if (refreshed) {
            this.log('info', `Token refreshed after 401, replaying ${context}`);
            // We are inside the original request's promise and its signature is
            // still in pendingRequests until the finally below. Leaving it there
            // makes the replay hit the dedup branch and return THIS failing
            // promise, so the refresh would silently change nothing.
            this.pendingRequests.delete(requestSignature);
            return this.fetch(
              url,
              { ...options, alreadyRefreshed: true },
              context,
              showMessages,
              retries,
              skipCircuitBreaker
            );
          }

          if (showMessages && this.errorHandler) {
            this.errorHandler('Authentication failed. Please log in again.');
          }
          if (this.authContextLogout) {
            this.authContextLogout();
          }
          throw error;
        }

        // A 401 that survived a refresh, or that had no refresh handler wired.
        //
        // These are NOT the same thing, and treating them alike is what made the
        // token "disappear". If `alreadyRefreshed` is set we just refreshed the
        // access token successfully and the server still said 401 -- so the
        // SESSION is demonstrably fine and this one endpoint is refusing for its
        // own reason (route gone, ACL denial, a 401 that is really a 404 behind
        // auth). Logging out there means a single misbehaving panel -- the Nodes
        // panel polling /tasks/nodes, say -- wipes localStorage for the whole
        // app, over and over.
        //
        // Only tear the session down when we never had a way to recover it.
        if (error.status === 401) {
          if (showMessages && this.errorHandler) {
            this.errorHandler('Authentication failed. Please log in again.');
          }
          // We refreshed the access token successfully and the server still said
          // 401. Two different things look like this, and treating them alike is
          // what made the token "disappear":
          //
          //   - the SESSION is dead      -> every endpoint refuses
          //   - ONE endpoint refuses     -> route gone, ACL denial, a 404 behind
          //                                 auth (the Nodes panel and
          //                                 /tasks/nodes, for one)
          //
          // Logging out on the second kind means one polling panel wipes
          // localStorage for the whole app, on a loop. So require corroboration:
          // tear the session down only once a SECOND distinct endpoint has also
          // been refused since the last successful response.
          if (this.authContextLogout) {
            this.postRefreshRejections.add(url);
            if (this.postRefreshRejections.size >= 2) {
              this.postRefreshRejections.clear();
              this.authContextLogout();
            }
          }
          throw error;
        }

        // Handle network errors with retry logic
        if (this.shouldRetry(error, retries)) {
          const delay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.retryMultiplier, retries);

          this.log('warn', `Retrying ${context} in ${delay}ms (attempt ${retries + 1}/${this.retryConfig.maxRetries + 1})`);

          if (showMessages && this.errorHandler) {
            this.errorHandler(`🔄 Retrying ${context}... (${retries + 1}/${this.retryConfig.maxRetries + 1})`);
          }

          await this.sleep(delay);
          return this.fetch(url, options, context, showMessages, retries + 1);
        }

        // Final error handling
        // HTTP failures were already presented by handleResponse. Only network
        // failures reach this point without a message; otherwise one failed
        // request produces two toasts (the 503 plus "context failed").
        if (showMessages && this.errorHandler && !error.status) {
          this.errorHandler(`❌ ${context} failed: ${error.message}`);
        }

        throw error;
      } finally {
        // Always clean up pending request from cache
        this.pendingRequests.delete(requestSignature);
      }
    })();

    // Store the promise in pending requests for deduplication
    this.pendingRequests.set(requestSignature, requestPromise);

    return requestPromise;
  }

  // Determine if we should retry based on error type and retry count
  // CRITICAL: Be very conservative with retries to prevent infinite loops
  shouldRetry(error, retries) {
    // Only allow 1 retry (reduced from maxRetries to prevent flooding)
    if (retries >= 1) {
      console.log(`[ApiService] Max retries (1) reached, not retrying`);
      return false;
    }

    // Don't retry on certain error types
    if (error.name === 'AbortError') {
      console.log(`[ApiService] AbortError, not retrying`);
      return false;
    }

    // NEVER retry on ANY 4xx or 5xx errors - let circuit breaker handle it
    const status = error.status;
    if (status && status >= 400) {
      console.log(`[ApiService] HTTP ${status}, not retrying`);
      return false;
    }

    // NEVER retry if error has specific flags
    if (error.isRateLimited || error.isServerError || error.isServiceUnavailable) {
      console.log(`[ApiService] Flagged error, not retrying`);
      return false;
    }

    // Check error message for known non-retryable patterns
    const errorMessage = error.message || '';
    const noRetryPatterns = [
      'HTTP 4', 'HTTP 5', 'rate limit', 'Server error', 'Service temporarily',
      'Circuit breaker', 'Authentication', 'Internal server', 'Bad Gateway'
    ];

    if (noRetryPatterns.some(pattern => errorMessage.includes(pattern))) {
      console.log(`[ApiService] Pattern match, not retrying: ${errorMessage.substring(0, 50)}`);
      return false;
    }

    // Only retry on pure network errors (connection refused, DNS failure)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.log(`[ApiService] Network error, will retry once`);
      return true;
    }

    // Don't retry anything else
    console.log(`[ApiService] Unknown error type, not retrying`);
    return false;
  }

  // Get current auth token. Checks the admin session first (the vast
  // majority of screens/callers are admin-only), then falls back to the
  // portal-user session (UserAuthContext's 'user_auth' key) — Dashboard,
  // Phone and their supporting API calls (callsApi, monitoringApi) are
  // reachable from either surface, and voipappz-api's own endpoints dispatch
  // on the JWT shape the same way (see auth_type in its base endpoint). Only
  // one session exists at a time: signing in on either door ends the other
  // (services/sessionIsolation.js), so this order can never hand a portal
  // screen the admin token.
  getToken() {
    try {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        if (parsed.access) return parsed.access;
      }
    } catch {
      // Ignore parsing errors
    }
    try {
      const userAuthData = localStorage.getItem('user_auth');
      if (userAuthData) {
        const parsed = JSON.parse(userAuthData);
        if (parsed.token) return parsed.token;
      }
    } catch {
      // Ignore parsing errors
    }
    return null;
  }

  // Convenience methods for different HTTP verbs
  // skipCircuitBreaker: if true, request won't affect/be affected by circuit breaker (for health checks)
  //
  // In-flight GET coalescing (NOT a cache): while a GET for a URL is still in
  // the air, an identical GET shares that request's promise instead of hitting
  // the network again. Nothing is stored after the response lands. This kills
  // the duplicate fetches screens suffer from (StrictMode double effects, sort
  // handlers firing alongside their useEffect) without touching screen code.
  async get(url, options = {}, context = '', showMessages = true, skipCircuitBreaker = false) {
    const key = `${this.identityKey()}:${url}`;
    const inflight = ApiService._inflightGets.get(key);
    if (inflight) return inflight;
    const promise = this.fetch(url, { method: 'GET', ...options }, context, showMessages, 0, skipCircuitBreaker)
      .finally(() => {
        if (ApiService._inflightGets.get(key) === promise) ApiService._inflightGets.delete(key);
      });
    ApiService._inflightGets.set(key, promise);
    return promise;
  }

  // Fetch a non-JSON endpoint (e.g. application/yaml config) and return the raw
  // text body. Bypasses the JSON handleResponse path; reuses base URL + token.
  async getText(url, context = '') {
    const baseUrl = this.getApiBaseUrl();
    const finalUrl = (baseUrl && (url.startsWith('/api/') || url.startsWith('/tasks/'))) ? `${baseUrl}${url}` : url;
    const token = this.getToken();
    const response = await fetch(finalUrl, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const err = new Error(`Failed to fetch ${context || url} (HTTP ${response.status})`);
      err.status = response.status;
      throw err;
    }
    return response.text();
  }

  async post(url, data = null, options = {}, context = '', showMessages = true, skipCircuitBreaker = false) {
    let body;
    let contentType;

    if (data instanceof FormData) {
      body = data;
      // FormData sets its own Content-Type with boundary
    } else if (data instanceof URLSearchParams) {
      body = data.toString();
      contentType = 'application/x-www-form-urlencoded';
    } else if (typeof data === 'string') {
      // An already-encoded body (callers pass `params.toString()`) goes as
      // is. JSON.stringify wrapped it in quotes, so `name=demo` arrived as
      // `"name=demo"`: the first key became `"name` and the last value gained
      // a trailing quote. A form body unless the caller says otherwise.
      body = data;
      contentType = 'application/x-www-form-urlencoded';
    } else {
      body = JSON.stringify(data);
      contentType = 'application/json';
    }

    const headers = contentType ? { 'Content-Type': contentType, ...options.headers } : options.headers;
    return this.fetch(url, { method: 'POST', body, ...options, headers }, context, showMessages, 0, skipCircuitBreaker);
  }

  async patch(url, data = null, options = {}, context = '', showMessages = true, skipCircuitBreaker = false) {
    let body;
    let contentType;

    if (data instanceof FormData) {
      body = data;
      // FormData sets its own Content-Type with boundary
    } else if (data instanceof URLSearchParams) {
      body = data.toString();
      contentType = 'application/x-www-form-urlencoded';
    } else if (typeof data === 'string') {
      // An already-encoded body (callers pass `params.toString()`) goes as
      // is. JSON.stringify wrapped it in quotes, so `name=demo` arrived as
      // `"name=demo"`: the first key became `"name` and the last value gained
      // a trailing quote. A form body unless the caller says otherwise.
      body = data;
      contentType = 'application/x-www-form-urlencoded';
    } else {
      body = JSON.stringify(data);
      contentType = 'application/json';
    }

    const headers = contentType ? { 'Content-Type': contentType, ...options.headers } : options.headers;
    return this.fetch(url, { method: 'PATCH', body, ...options, headers }, context, showMessages, 0, skipCircuitBreaker);
  }

  async put(url, data = null, options = {}, context = '', showMessages = true, skipCircuitBreaker = false) {
    const body = data instanceof FormData || typeof data === 'string' ? data : JSON.stringify(data);
    return this.fetch(url, { method: 'PUT', body, ...options }, context, showMessages, 0, skipCircuitBreaker);
  }

  async delete(url, options = {}, context = '', showMessages = true, skipCircuitBreaker = false) {
    return this.fetch(url, { method: 'DELETE', ...options }, context, showMessages, 0, skipCircuitBreaker);
  }
}

// Create and export a singleton instance
export const apiService = new ApiService();

/**
 * Convert data object to URLSearchParams with proper nested object handling
 * Nested objects are encoded as key[nestedKey]=value (form URL encoded format)
 * Arrays are encoded as key[]=value1&key[]=value2
 *
 * @param {Object} data - The data object to convert
 * @returns {URLSearchParams} - Form URL encoded params
 */
export const toFormData = (data) => {
  const formData = new URLSearchParams();

  const appendValue = (key, value) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      // Arrays with objects use indexed bracket notation: key[0][nestedKey]=value
      // Rack parses key[0][nestedKey] as Hash of Hashes — backend uses .map{|k,v| v} to extract values
      // Arrays with primitives use: key[]=value1&key[]=value2
      value.forEach((item, index) => {
        if (item !== undefined && item !== null && item !== '') {
          if (typeof item === 'object') {
            Object.keys(item).forEach(nestedKey => {
              const nestedValue = item[nestedKey];
              if (nestedValue !== undefined && nestedValue !== null) {
                if (Array.isArray(nestedValue)) {
                  nestedValue.forEach(arrItem => {
                    if (arrItem !== undefined && arrItem !== null) {
                      formData.append(`${key}[${index}][${nestedKey}][]`, arrItem);
                    }
                  });
                } else {
                  formData.append(`${key}[${index}][${nestedKey}]`, nestedValue);
                }
              }
            });
          } else {
            // Flat array values: key[]=value
            formData.append(`${key}[]`, item);
          }
        }
      });
    } else if (typeof value === 'object') {
      // Nested objects are encoded as key[nestedKey]=value
      Object.keys(value).forEach(nestedKey => {
        const nestedValue = value[nestedKey];
        if (nestedValue !== undefined && nestedValue !== null && nestedValue !== '') {
          if (typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
            // Deep nested objects - recurse
            Object.keys(nestedValue).forEach(deepKey => {
              if (nestedValue[deepKey] !== undefined && nestedValue[deepKey] !== null && nestedValue[deepKey] !== '') {
                formData.append(`${key}[${nestedKey}][${deepKey}]`, nestedValue[deepKey]);
              }
            });
          } else if (Array.isArray(nestedValue)) {
            nestedValue.forEach(item => {
              if (item !== undefined && item !== null && item !== '') {
                formData.append(`${key}[${nestedKey}][]`, item);
              }
            });
          } else {
            formData.append(`${key}[${nestedKey}]`, nestedValue);
          }
        }
      });
    } else if (typeof value === 'boolean') {
      formData.append(key, value.toString());
    } else {
      formData.append(key, value);
    }
  };

  Object.keys(data).forEach(key => {
    appendValue(key, data[key]);
  });

  return formData;
};

// Export default for easy imports
export default apiService;

// Debug helpers - development only (not exposed in production)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.resetCircuitBreaker = () => {
    apiService.resetCircuitBreaker();
    console.log('✅ Circuit breaker has been reset. API requests will resume.');
  };

  window.getCircuitBreakerStatus = () => {
    const { state, failureCount, failureThreshold, openedAt, resetTimeout } = apiService.circuitBreaker;
    const now = Date.now();
    const timeUntilReset = openedAt > 0 ? Math.ceil((openedAt + resetTimeout - now) / 1000) : 0;

    console.log('📊 Circuit Breaker Status:');
    console.log(`  State: ${state}`);
    console.log(`  Failure Count: ${failureCount}/${failureThreshold}`);
    if (state === 'OPEN') {
      console.log(`  Time until auto-reset: ${timeUntilReset}s`);
    }

    return { state, failureCount, failureThreshold, timeUntilReset };
  };

  // Cache management helpers
  window.clearApiCache = (pattern = null) => {
    apiService.clearCache(pattern);
    if (pattern) {
      console.log(`✅ API cache cleared for pattern: ${pattern}`);
    } else {
      console.log('✅ API cache cleared (all entries)');
    }
  };

  window.getApiCacheStats = () => {
    const cacheSize = apiService.responseCache.size;
    const cacheEntries = [];

    for (const [key, value] of apiService.responseCache.entries()) {
      const age = Math.round((Date.now() - value.timestamp) / 1000);
      const ttl = Math.round(value.ttl / 1000);
      cacheEntries.push({
        url: key.replace('CACHE:', ''),
        age: `${age}s`,
        ttl: `${ttl}s`,
        valid: age < ttl
      });
    }

    console.log('📊 API Cache Statistics:');
    console.log(`  Total entries: ${cacheSize}`);
    console.table(cacheEntries);

    return { size: cacheSize, entries: cacheEntries };
  };
}
