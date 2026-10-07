import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiService } from '../services/apiService';
import { configService } from '../services/configService';
import { setDynamicApiBaseUrl } from '../config';
import { useNotification } from './NotificationContext';
import { useAuth } from './AuthContext';
import { useUserAuth } from './UserAuthContext';
import { fetchCustomerPortalData, applyCustomerBranding } from '../services/customerService';
import { environmentsApi } from '../services/api/environmentsApi';

const CustomerEnvironmentContext = createContext();

export const CustomerEnvironmentProvider = ({ children }) => {
  // State management
  const [customers, setCustomers] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedEnvironments, setSelectedEnvironments] = useState([]); // Changed to array for multi-select
  const [uncommittedEnvironments, setUncommittedEnvironments] = useState([]); // For Apply button pattern
  const [loading, setLoading] = useState(false);
  const [loadingAllEnvironments, setLoadingAllEnvironments] = useState(false); // Loading state for action=all
  const [applyingEnvironments, setApplyingEnvironments] = useState(false); // Loading state for Apply button
  const [initialized, setInitialized] = useState(false);
  const [allEnvironmentsCache, setAllEnvironmentsCache] = useState({}); // Cache: { customerUuid: { data, timestamp } }

  // Refs to break dependency chain in fetchAllEnvironments
  const selectedEnvironmentsRef = useRef(selectedEnvironments);
  selectedEnvironmentsRef.current = selectedEnvironments;
  const environmentsRef = useRef(environments);
  environmentsRef.current = environments;
  const allEnvironmentsCacheRef = useRef(allEnvironmentsCache);
  allEnvironmentsCacheRef.current = allEnvironmentsCache;
  // Request deduplication — prevent concurrent fetches for the same customer
  const fetchInFlightRef = useRef(null);

  const { showSuccess, showError } = useNotification();
  const { isAuthenticated, user, isRoot, accountCustomer, accountUuid } = useAuth();
  const portalAuth = useUserAuth();

  // Portal-only session (the `/` surface): none of the machinery below runs —
  // every fetch here early-exits on the admin `isAuthenticated` — so a portal
  // user would get an empty scope and silently unscoped API calls. A portal
  // user has exactly one environment, the one on their own account, and no way
  // to switch it. Exposing it through this context is what lets the
  // environment-scoped screens (DIDs, DIDForm, every Bridges/* dialog) work
  // unchanged on both surfaces instead of each branching on the session.
  const isPortalOnly = !isAuthenticated && portalAuth.isAuthenticated;
  const portalEnvironment = portalAuth.user?.environment || null;
  // Memoised: `selectedEnvironments` is a dependency of every screen's fetch
  // effect, so handing out a fresh array each render is an infinite refetch.
  const portalEnvironments = useMemo(() => {
    if (!isPortalOnly || !portalEnvironment?.uuid) return [];
    // The selectors that render this list key off `name`; the login response
    // doesn't guarantee one, and a nameless option reads as a broken dropdown.
    return [{ ...portalEnvironment, name: portalEnvironment.name || 'My application' }];
  }, [isPortalOnly, portalEnvironment]);
  const scopeToPortal = portalEnvironments.length > 0;

  // A portal user cannot widen their own scope: the switcher lives in the admin
  // TopBar and is never rendered for them, but the setters are reachable
  // through this context, so they're stubbed rather than left live.
  const noop = useCallback(() => {}, []);
  const noopAsync = useCallback(async () => {}, []);

  // Fetch customers from API (only for root users) or use accountCustomer from JWT
  const fetchCustomers = useCallback(async () => {
    // Early exit if not authenticated
    if (!isAuthenticated) {
      setCustomers([]);
      return [];
    }

    try {
      setLoading(true);

      // Check if we have an auth token before making the request
      const authData = localStorage.getItem('auth');
      if (!authData) {
        throw new Error('Authentication required');
      }

      const parsed = JSON.parse(authData);
      if (!parsed.access) {
        throw new Error('Authentication required');
      }

      // If user is NOT root, only show their assigned customer from JWT token
      if (!isRoot) {
        if (accountCustomer) {
          const customersList = [accountCustomer];
          setCustomers(customersList);
          setLoading(false); // Stop loading immediately for non-root users
          return customersList;
        } else {
          console.warn('Non-root user has no accountCustomer in JWT');
          setCustomers([]);
          setLoading(false); // Stop loading immediately for non-root users
          return [];
        }
      }

      // Root user: fetch all customers from API
      // Skip circuit breaker - this is essential for app initialization
      const response = await apiService.get('/api/customers', {}, 'fetching customers', false, true);

      if (Array.isArray(response)) {
        setCustomers(response);
        return response;
      } else {
        console.warn('Unexpected customers response format:', response);
        setCustomers([]);
        return [];
      }
    } catch (error) {
      // Don't log or show error for authentication issues - let AuthContext handle it
      if (error.message && error.message.includes('Authentication')) {
        // Silent fail when not authenticated - this is expected behavior
        setCustomers([]);
        return [];
      }

      // In development, don't use mock data - require proper API authentication
      if (configService.isDevelopment()) {
        setCustomers([]);
        return [];
      }

      // Only log and show errors for production API failures
      console.error('Error fetching customers:', error);
      showError('Failed to load customers');

      setCustomers([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [showError, isAuthenticated, isRoot, accountCustomer]);

  // Fetch selected environments for selected customer (fast, for initial load)
  const fetchSelectedEnvironments = useCallback(async (customerUuid) => {
    // Early exit if not authenticated
    if (!isAuthenticated) {
      setEnvironments([]);
      return [];
    }

    if (!customerUuid) {
      setEnvironments([]);
      return [];
    }

    // Cache-first: hydrate the selection from localStorage instantly so the app
    // renders scoped data without waiting on the network, then revalidate below.
    const cacheKey = `selectedEnvironments:${customerUuid}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (Array.isArray(cached) && cached.length > 0) {
        setEnvironments(cached);
        setSelectedEnvironments(cached);
        setUncommittedEnvironments(cached);
      }
    } catch { /* ignore bad cache */ }

    try {
      setLoading(true);

      // Build query string for selected environments only (optimized)
      const params = new URLSearchParams({
        action: 'selected',
        customer_uuid: customerUuid
      });

      // Skip circuit breaker - this is essential for app initialization
      const response = await apiService.get(
        `/api/applications?${params.toString()}`,
        {},
        'fetching selected environments',
        false,
        true
      );

      // Handle both array response and wrapped response { data: [...], total_records: X }
      const envData = Array.isArray(response) ? response : (response?.data || []);

      if (Array.isArray(envData)) {
        // Mark all returned environments as selected (since this is action=selected)
        const selectedEnvs = envData.map(env => ({ ...env, selected: true }));

        // Set environments list to selected ones (will be expanded when dropdown opens with action=all)
        setEnvironments(selectedEnvs);

        // Set selected environments - all of them are selected since this is action=selected
        if (selectedEnvs.length > 0) {
          setSelectedEnvironments(selectedEnvs);
          setUncommittedEnvironments(selectedEnvs);
        } else {
          // No selected environments - clear the selections
          setSelectedEnvironments([]);
          setUncommittedEnvironments([]);
        }

        // Refresh the cache with the authoritative server selection.
        try { localStorage.setItem(cacheKey, JSON.stringify(selectedEnvs)); } catch { /* storage full/unavailable */ }

        return selectedEnvs;
      } else {
        console.warn('Unexpected environments response format:', response);
        setEnvironments([]);
        setSelectedEnvironments([]);
        setUncommittedEnvironments([]);
        return [];
      }
    } catch (error) {
      // Don't log or show error for authentication issues - let AuthContext handle it
      if (error.message && error.message.includes('Authentication')) {
        // Silent fail when not authenticated - this is expected behavior
        setEnvironments([]);
        return [];
      }

      // In development, don't use mock data - require proper API authentication
      if (configService.isDevelopment()) {
        setEnvironments([]);
        return [];
      }

      // Only log and show errors for production API failures
      console.error('Error fetching selected environments:', error);
      showError('Failed to load selected environments');

      setEnvironments([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [showError, isAuthenticated]);

  // Fetch all environments for selected customer (async, runs in background when dropdown opens)
  // Merges with selected environments to mark which ones are selected
  // Includes caching with 5-minute TTL to avoid repeated slow requests
  // Uses refs to avoid dependency chain (selectedEnvironments/environments/cache changes
  // no longer cause this callback to be recreated, preventing cascading re-renders)
  const fetchAllEnvironments = useCallback(async (customerUuid, forceRefresh = false) => {
    if (!isAuthenticated || !customerUuid) {
      return [];
    }

    // Request deduplication — if a fetch for this customer is already in flight, reuse it
    if (fetchInFlightRef.current?.customerUuid === customerUuid && fetchInFlightRef.current?.promise) {
      return fetchInFlightRef.current.promise;
    }

    // Check cache first (5-minute TTL) — read from ref to avoid dependency
    const CACHE_TTL = 5 * 60 * 1000;
    const cached = allEnvironmentsCacheRef.current[customerUuid];
    // Invalidate cache entries missing full data (e.g. meta/enabled fields)
    const cacheHasFullData = cached?.data?.[0] && ('meta' in cached.data[0] || 'enabled' in cached.data[0] || cached.data.length === 0);
    if (!forceRefresh && cached && cacheHasFullData && (Date.now() - cached.timestamp) < CACHE_TTL) {
      const currentSelectedUuids = new Set(selectedEnvironmentsRef.current.map(env => env.uuid));
      const mergedEnvironments = cached.data.map(env => ({
        ...env,
        selected: currentSelectedUuids.has(env.uuid)
      }));
      setEnvironments(mergedEnvironments);
      return mergedEnvironments;
    }

    setLoadingAllEnvironments(true);

    const fetchPromise = (async () => {
      try {
        // NOTE: action=all returns [] on the backend (verified against
        // cloud.voipappz.io) — fetch everything with a high per_page instead.
        const params = new URLSearchParams({
          customer_uuid: customerUuid,
          page: '1',
          per_page: '9999'
        });

        const response = await apiService.get(
          `/api/applications?${params.toString()}`,
          {},
          'fetching all environments',
          false,
          true
        );

        const allEnvData = Array.isArray(response) ? response : (response?.data || []);

        if (Array.isArray(allEnvData)) {
          // Cache the result
          setAllEnvironmentsCache(prev => ({
            ...prev,
            [customerUuid]: { data: allEnvData, timestamp: Date.now() }
          }));

          // Merge with current selections (read from ref for latest value)
          const currentSelectedUuids = new Set(selectedEnvironmentsRef.current.map(env => env.uuid));
          const mergedEnvironments = allEnvData.map(env => ({
            ...env,
            selected: currentSelectedUuids.has(env.uuid)
          }));

          setEnvironments(mergedEnvironments);
          return mergedEnvironments;
        } else {
          return environmentsRef.current;
        }
      } catch (error) {
        if (error.message?.includes('Authentication')) {
          return [];
        }
        if (error.message?.includes('Circuit breaker') || error.message?.includes('500')) {
          return environmentsRef.current;
        }
        if (configService.isDevelopment()) {
          return [];
        }
        console.error('Error fetching all environments:', error);
        showError('Failed to load environments. Please try again.');
        return environmentsRef.current;
      } finally {
        setLoadingAllEnvironments(false);
        fetchInFlightRef.current = null;
      }
    })();

    // Store in-flight promise for deduplication
    fetchInFlightRef.current = { customerUuid, promise: fetchPromise };
    return fetchPromise;
  }, [isAuthenticated, showError]);

  // Server-side environment search. Returns matching envs without mutating
  // context state — callers (the popover) keep results in their own local
  // state. This is the on-demand path that replaces the eager action=all
  // fetch for the selector dropdown.
  const searchEnvironments = useCallback(async (customerUuid, options = {}) => {
    if (!isAuthenticated || !customerUuid) return [];
    try {
      const res = await environmentsApi.searchEnvironments(customerUuid, options);
      if (Array.isArray(res)) return res;
      return Array.isArray(res?.data) ? res.data : [];
    } catch (error) {
      if (error?.message?.includes('Authentication')) return [];
      console.error('Error searching environments:', error);
      return [];
    }
  }, [isAuthenticated]);

  // Handle customer selection
  const selectCustomer = useCallback(async (customer) => {
    if (!customer) {
      setSelectedCustomer(null);
      setSelectedEnvironments([]);
      setUncommittedEnvironments([]);
      setEnvironments([]);
      return;
    }

    // Set the current customer server-side first; if this fails, change nothing.
    try {
      // Skip circuit breaker - customer selection is essential
      await apiService.patch(
        `/api/accounts/accounts_console/customer/${customer.uuid}`,
        {},
        {},
        `setting current customer to ${customer.name}`,
        false,
        true
      );
    } catch (error) {
      console.error('Error setting current customer:', error);
      showError(`Failed to set customer: ${customer.name}`);
      return;
    }

    // Customer is set on the server — commit locally and persist so the choice
    // survives the reload below (initialize() restores it on the next load).
    setSelectedCustomer(customer);
    try { localStorage.setItem('selectedCustomer', customer.uuid); } catch { /* storage unavailable */ }
    // Stash a one-shot notice so we can confirm the switch AFTER the reload
    // (a toast shown now would be wiped by the reload).
    try { sessionStorage.setItem('customerSwitchedNotice', customer.name); } catch { /* storage unavailable */ }
    setSelectedEnvironments([]); // Clear environments when customer changes
    setUncommittedEnvironments([]); // Clear uncommitted selections
    setEnvironments([]); // Clear environment list immediately (security: prevent showing previous customer's envs)
    setAllEnvironmentsCache({}); // Invalidate cache so stale data is never shown
    // SECURITY: drop the previous customer's node base URL immediately so no
    // API call can land on the old customer's server before a new env is applied.
    setDynamicApiBaseUrl(null);
    // Notify other contexts (RecentPages, GlobalSearch) to clear their data
    window.dispatchEvent(new CustomEvent('nimbus:customerSwitched'));

    // A customer is never entered without an application: keep the one(s) it
    // had selected, otherwise select its first enabled one.
    // BOUNDED with a timeout — an unbounded await on a slow/stuck environments API
    // is what previously left the reload from firing, so the switch silently
    // required a manual page refresh. The reload must always happen.
    const withTimeout = (p, ms) => Promise.race([
      Promise.resolve(p).catch(() => undefined),
      new Promise((resolve) => setTimeout(() => resolve(undefined), ms)),
    ]);
    try {
      let envs = (await withTimeout(fetchSelectedEnvironments(customer.uuid), 4000)) || [];
      if (envs.length === 0) {
        const all = (await withTimeout(fetchAllEnvironments(customer.uuid, true), 4000)) || [];
        const first = all.find((e) => e.enabled !== false) || all[0];
        if (first) {
          envs = [{ ...first, selected: true }];
          setSelectedEnvironments(envs);
          setUncommittedEnvironments(envs);
          try { localStorage.setItem(`selectedEnvironments:${customer.uuid}`, JSON.stringify(envs)); } catch { /* storage unavailable */ }
        }
      }
      if (envs.length === 1) {
        if (envs[0]?.server) setDynamicApiBaseUrl(envs[0].server);
        // Pass customer directly to avoid stale closure (selectedCustomer may not be updated yet)
        await withTimeout(applyEnvironmentSelectionsAPI([envs[0]], customer), 4000);
      }
    } catch (e) {
      console.error('Environment preselect failed (non-fatal):', e);
    }

    // Branding is cosmetic — never block the switch on it.
    fetchCustomerPortalData()
      .then(applyCustomerBranding)
      .catch((e) => console.error('Failed to refresh portal branding:', e));

    // React screens subscribe to selectedCustomer/selectedEnvironments and
    // refetch their scoped data from the new customer. A full reload here
    // duplicated notifications, stats, health, and environment requests and
    // made switching look hung on slow API responses.
    window.dispatchEvent(new CustomEvent('customerChanged', {
      detail: { customer }
    }));
  }, [fetchSelectedEnvironments, fetchAllEnvironments, showError]);

  // Toggle environment in uncommitted selection (for multi-select)
  const toggleEnvironment = useCallback((environment) => {
    setUncommittedEnvironments(prev => {
      const exists = prev.find(e => e.uuid === environment.uuid);
      if (exists) {
        // Remove from selection
        return prev.filter(e => e.uuid !== environment.uuid);
      } else {
        // Add to selection
        return [...prev, environment];
      }
    });
  }, []);

  // Direct setter for uncommitted environments (for Autocomplete multi-select)
  const setUncommittedEnvironmentsDirect = useCallback((environments) => {
    setUncommittedEnvironments(environments);
  }, []);

  // Select all environments
  const selectAllEnvironments = useCallback(() => {
    setUncommittedEnvironments(environments);
  }, [environments]);

  // Clear all environment selections
  const clearEnvironmentSelections = useCallback(() => {
    setUncommittedEnvironments([]);
  }, []);

  // Apply environment selections to API (internal helper)
  // customerOverride allows callers (e.g. selectCustomer) to pass the customer directly
  // to avoid stale closure issues where selectedCustomer hasn't updated yet
  const applyEnvironmentSelectionsAPI = useCallback(async (environmentsToApply, customerOverride) => {

    if (!selectedCustomer && !customerOverride) {
      showError('Please select a customer first');
      return false;
    }

    try {
      // Call PATCH API to set multiple environments (mimicking va-voipbox-admin behavior)
      // Legacy: $.param({environment_uuids: environment_uuids})
      const formData = new URLSearchParams();
      
      // Build environment UUIDs array exactly like legacy
      const environmentUuids = environmentsToApply.map(env => env.uuid);
      
      if (environmentUuids.length === 0) {
        // When clearing all environments, send empty array
        // This matches legacy $.param({environment_uuids: []}) behavior
        formData.append('environment_uuids[]', '');
      } else {
        // Legacy sends multiple environment_uuids[] parameters, one for each UUID
        environmentUuids.forEach(uuid => {
          formData.append('environment_uuids[]', uuid);
        });
      }

      // Use the account UUID extracted from JWT token (following AngularJS pattern)
      // AngularJS uses: {id: $rootScope.root.uuid} where root = account
      // First try to get from auth context (accountUuid is at root level, not inside user)
      let currentAccountUuid = accountUuid;

      // Fallback: try to get from localStorage auth data
      if (!currentAccountUuid) {
        try {
          const authData = localStorage.getItem('auth');
          if (authData) {
            const parsed = JSON.parse(authData);
            currentAccountUuid = parsed.accountUuid || parsed.user?.uuid || parsed.uuid || parsed.account?.uuid;
          }
        } catch (e) {
          console.error('Error parsing auth data:', e);
        }
      }

      if (!currentAccountUuid) {
        console.error('No account UUID found. User object:', user);
        console.error('AccountUuid from context:', accountUuid);
        console.error('Auth data keys present:', Object.keys(JSON.parse(localStorage.getItem('auth') || '{}')));
        throw new Error('No account UUID found. Please log in again.');
      }


      await apiService.patch(
        `/api/accounts/${currentAccountUuid}?action=add_environment_selected`,
        formData,
        {},
        `setting ${environmentsToApply.length} environment(s)`,
        false
      );
      

      return true;
    } catch (error) {
      console.error('Error setting environments:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      showError(`Failed to set environments: ${error.message}`);
      return false;
    }
  }, [selectedCustomer, showError, user, accountUuid]);

  // Apply environment selections (commit uncommitted to selected).
  // Accepts an optional envOverride so callers can bypass the uncommitted state
  // (e.g. immediate chip-delete from the topbar).
  const applyEnvironmentSelections = useCallback(async (envOverride) => {
    setApplyingEnvironments(true); // Show loading state

    // Safety timeout - clear loading after 30 seconds max
    const timeoutId = setTimeout(() => {
      setApplyingEnvironments(false);
      showError('Request timed out. Please try again.');
    }, 30000);

    const envsToApply = envOverride !== undefined ? envOverride : uncommittedEnvironments;

    try {
      setSelectedEnvironments(envsToApply);

      const count = envsToApply.length;

      // Update dynamic API base URL based on selected environment(s)
      if (count === 1 && envsToApply[0].server) {
        setDynamicApiBaseUrl(envsToApply[0].server);
      } else if (count === 0) {
        setDynamicApiBaseUrl(null);
      }

      const success = await applyEnvironmentSelectionsAPI(envsToApply);

      if (!success) {
        return;
      }

      if (count === 0) {
        showSuccess('Cleared environment selections');
      } else if (count === 1) {
        showSuccess(`Selected environment: ${envsToApply[0].name}`);
      } else {
        showSuccess(`Selected ${count} environments`);
      }


      // Screens subscribe to selectedEnvironments and re-fetch their scoped
      // data. Keep the app mounted so a selection does not replay every global
      // request in the application shell.
      window.dispatchEvent(new CustomEvent('environmentChanged', {
        detail: { environments: envsToApply }
      }));
    } finally {
      clearTimeout(timeoutId);
      setApplyingEnvironments(false);
    }
  }, [uncommittedEnvironments, showSuccess, showError, applyEnvironmentSelectionsAPI]);

  // Clear all selections
  const clearSelections = useCallback(() => {
    setSelectedCustomer(null);
    setSelectedEnvironments([]);
    setUncommittedEnvironments([]);
    setEnvironments([]);
    setDynamicApiBaseUrl(null); // Clear dynamic API URL
    try { localStorage.removeItem('selectedCustomer'); } catch { /* storage unavailable */ }
  }, []);

  // Initialize and fetch fresh data from API (no localStorage caching)
  const initialize = useCallback(async () => {
    if (initialized || !isAuthenticated) {
      return;
    }

    // Double-check auth token exists before initializing
    const authData = localStorage.getItem('auth');
    if (!authData) {
      return;
    }

    try {
      // For non-root users, immediately set their assigned customer from JWT
      if (!isRoot && accountCustomer) {
        setSelectedCustomer(accountCustomer);
        setCustomers([accountCustomer]);

        // Fetch only selected environments for this customer (optimized for performance)
        await fetchSelectedEnvironments(accountCustomer.uuid);
        setInitialized(true);
        return;
      }

      // Load customers first (for root users or fallback)
      const customersList = await fetchCustomers();

      // Auto-select customer based on user type (no localStorage restoration)
      if (customersList.length > 0) {
        let defaultCustomer = null;

        // Highest priority: the customer the user explicitly switched to. selectCustomer
        // persists it before forcing a security reload, so restoring it here is what makes
        // a customer switch actually stick (otherwise it reverts to the JWT's accountCustomer).
        let persistedCustomerUuid = null;
        try { persistedCustomerUuid = localStorage.getItem('selectedCustomer'); } catch { /* storage unavailable */ }
        if (persistedCustomerUuid) {
          defaultCustomer = customersList.find(c => c.uuid === persistedCustomerUuid) || null;
        }

        if (!defaultCustomer) {
          if (!isRoot && accountCustomer) {
            // Non-root user: use accountCustomer from JWT
            defaultCustomer = customersList.find(c => c.uuid === accountCustomer.uuid) || accountCustomer;
          } else if (accountCustomer) {
            // Root user: also prefer accountCustomer from JWT if available
            defaultCustomer = customersList.find(c => c.uuid === accountCustomer.uuid);
          } else if (user?.customerUuid) {
            // Fallback: Root user with customerUuid in user object
            defaultCustomer = customersList.find(c => c.uuid === user.customerUuid);
          }
        }

        if (defaultCustomer) {
          setSelectedCustomer(defaultCustomer);
          // Fetch only selected environments (optimized for performance)
          await fetchSelectedEnvironments(defaultCustomer.uuid);
        }
      }

      setInitialized(true);
    } catch (error) {
      console.error('Error initializing customer/environment context:', error);
      setInitialized(true);
    }
  }, [initialized, isAuthenticated, fetchCustomers, fetchSelectedEnvironments, user, isRoot, accountCustomer]);

  // Initialize on mount and when authentication changes
  useEffect(() => {
    if (isAuthenticated) {

      // Immediately show accountCustomer while initializing — unless the user explicitly
      // switched to a different customer (persisted), so we don't flash the old customer
      // and then snap to the chosen one.
      let persistedSelection = null;
      try { persistedSelection = localStorage.getItem('selectedCustomer'); } catch { /* storage unavailable */ }
      if (accountCustomer && !selectedCustomer && (!persistedSelection || persistedSelection === accountCustomer.uuid)) {
        setSelectedCustomer(accountCustomer);
        setCustomers([accountCustomer]);
      }

      // Reset initialized flag to force re-initialization on auth change
      setInitialized(false);
      // Small delay to ensure initialized flag is updated before calling initialize
      setTimeout(() => initialize(), 0);
    } else {
      // Clear data when not authenticated
      setCustomers([]);
      setEnvironments([]);
      setSelectedCustomer(null);
      setSelectedEnvironments([]);
      setUncommittedEnvironments([]);
      setInitialized(false);
      setDynamicApiBaseUrl(null);
    }
  }, [isAuthenticated]);

  // Re-initialize when isRoot changes (e.g., restored from localStorage after init)
  useEffect(() => {
    if (isAuthenticated && initialized && isRoot) {
      // Root status confirmed after init — re-fetch all customers
      setInitialized(false);
      setTimeout(() => initialize(), 0);
    }
  }, [isRoot]);

  // After a customer switch reloads the page, confirm it to the user. The notice
  // is stashed in sessionStorage by selectCustomer just before the reload.
  useEffect(() => {
    let notice = null;
    try { notice = sessionStorage.getItem('customerSwitchedNotice'); } catch { /* storage unavailable */ }
    if (notice) {
      try { sessionStorage.removeItem('customerSwitchedNotice'); } catch { /* storage unavailable */ }
      showSuccess(`Switched to ${notice}`);
    }
  }, [showSuccess]);

  // Computed values
  const hasSelection = selectedCustomer && selectedEnvironments.length > 0;
  const canSelectEnvironment = !!selectedCustomer;
  const hasUncommittedChanges = JSON.stringify(selectedEnvironments) !== JSON.stringify(uncommittedEnvironments);

  const contextValue = useMemo(() => ({
    // State
    customers,
    environments: scopeToPortal ? portalEnvironments : environments,
    selectedCustomer,
    selectedEnvironments: scopeToPortal ? portalEnvironments : selectedEnvironments, // Array of selected environments
    uncommittedEnvironments: scopeToPortal ? portalEnvironments : uncommittedEnvironments, // Array of uncommitted selections (for Apply button)
    loading: scopeToPortal ? false : loading,
    loadingAllEnvironments, // Loading state for action=all environments fetch
    applyingEnvironments, // Loading state for Apply button
    initialized: scopeToPortal ? true : initialized,
    isRoot, // Whether current user can select multiple customers

    // Computed
    hasSelection: scopeToPortal ? true : hasSelection,
    canSelectEnvironment: scopeToPortal ? false : canSelectEnvironment,
    hasUncommittedChanges: scopeToPortal ? false : hasUncommittedChanges,

    // Actions
    fetchCustomers,
    fetchSelectedEnvironments,
    fetchAllEnvironments,
    searchEnvironments,
    selectCustomer: scopeToPortal ? noopAsync : selectCustomer,
    toggleEnvironment: scopeToPortal ? noop : toggleEnvironment,
    setUncommittedEnvironments: scopeToPortal ? noop : setUncommittedEnvironmentsDirect,
    selectAllEnvironments: scopeToPortal ? noop : selectAllEnvironments,
    clearEnvironmentSelections: scopeToPortal ? noop : clearEnvironmentSelections,
    applyEnvironmentSelections: scopeToPortal ? noopAsync : applyEnvironmentSelections,
    clearSelections: scopeToPortal ? noop : clearSelections,
    initialize
  }), [
    customers,
    environments,
    selectedCustomer,
    selectedEnvironments,
    uncommittedEnvironments,
    loading,
    loadingAllEnvironments,
    applyingEnvironments,
    initialized,
    isRoot,
    hasSelection,
    canSelectEnvironment,
    hasUncommittedChanges,
    fetchCustomers,
    fetchSelectedEnvironments,
    fetchAllEnvironments,
    searchEnvironments,
    selectCustomer,
    toggleEnvironment,
    setUncommittedEnvironmentsDirect,
    selectAllEnvironments,
    clearEnvironmentSelections,
    applyEnvironmentSelections,
    clearSelections,
    initialize,
    scopeToPortal,
    portalEnvironments,
    noop,
    noopAsync
  ]);

  return (
    <CustomerEnvironmentContext.Provider value={contextValue}>
      {children}
    </CustomerEnvironmentContext.Provider>
  );
};

export const useCustomerEnvironment = () => {
  const context = useContext(CustomerEnvironmentContext);
  if (!context) {
    throw new Error('useCustomerEnvironment must be used within a CustomerEnvironmentProvider');
  }
  return context;
};

export default CustomerEnvironmentContext;
