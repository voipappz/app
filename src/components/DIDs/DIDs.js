import { useState, useEffect, useCallback, useRef } from 'react';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { usePermissions } from '../../hooks/usePermissions';
import { didsApi } from '../../services/api/routesApi';
import { voipResourcesApi } from '../../services/api/voipResourcesApi';

/**
 * Custom hook for DIDs management
 * Provides state management and actions for DID operations
 */
export const useDIDs = () => {
  const { canRouteType } = usePermissions();
  const { selectedCustomer, selectedEnvironments } = useCustomerEnvironment();
  
  // State management
  const [dids, setDIDs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDID, setSelectedDID] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [didToDelete, setDIDToDelete] = useState(null);

  // Duplicate state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [didToDuplicate, setDIDToDuplicate] = useState(null);

  // Pagination and sorting
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Filters - based on DID fields from legacy admin
  const [filters, setFilters] = useState({
    name: '',              // Text search on name
    number: '',            // Text search on number
    bridge_type: '',       // Dropdown for bridge type
    type: '',              // Dropdown for DID type (sip, pstn, toll_free)
    enabled: '',           // Dropdown for enabled status
    environment_uuid: ''   // Dropdown for environment
  });

  // VoIP Resources for bridge routing
  const [bridgeTypes, setBridgeTypes] = useState([]);
  const [bridgeResources, setBridgeResources] = useState({});
  const bridgeResourcesRef = useRef(bridgeResources);
  bridgeResourcesRef.current = bridgeResources;
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [didTypes, setDidTypes] = useState([]);

  /**
   * Fetch DIDs from the API
   * @param {Object} overrides - Optional parameter overrides for direct calls (e.g., from sort/page handlers)
   */
  const fetchDIDs = useCallback(async (overrides = null) => {
    // Use overrides when provided (for direct calls from handlers), otherwise use current state
    const effectiveSortBy = overrides?.sortBy ?? sortBy;
    const effectiveSortOrder = overrides?.sortOrder ?? sortOrder;

    setLoading(true);
    setError(null);

    try {
      const effectivePage = overrides?.page ?? page;
      const params = {
        page: effectivePage + 1, // API is 1-indexed; standard server paging like the other screens
        per_page: rowsPerPage,
        order_by: effectiveSortBy,
        order_type: effectiveSortOrder === 'asc' ? 'asc' : 'desc'
      };

      if (selectedEnvironments && selectedEnvironments.length > 0) {
        params.environment_uuid = selectedEnvironments[0].uuid;
      }

      // Apply filters using legacy API format (DID-specific fields)
      if (filters.name) {
        params['search[name]'] = filters.name;
      }
      if (filters.number) {
        params['search[number]'] = filters.number;
      }
      if (filters.bridge_type) {
        params['search[bridge_type]'] = filters.bridge_type;
      }
      if (filters.type) {
        params['search[type]'] = filters.type;
      }
      // Only apply enabled filter if explicitly set
      if (filters.enabled !== '') {
        params['search[enabled]'] = filters.enabled;
      }
      if (filters.environment_uuid) {
        params['search[environment_uuid]'] = filters.environment_uuid;
      }

      // Handle meta tag filters
      if (filters.meta && typeof filters.meta === 'object') {
        Object.entries(filters.meta).forEach(([metaKey, metaValue]) => {
          params[`search[meta][${metaKey}]`] = metaValue;
        });
      }

      const response = await didsApi.getDIDs(params);

      // Handle both array response and paginated response
      if (Array.isArray(response)) {
        setDIDs(response);
        setTotalCount(response.length);
      } else if (response.data && Array.isArray(response.data)) {
        setDIDs(response.data);
        // Use X-Total header value (prioritized) or fallback to other total fields
        const totalFromXTotal = response.total_records || response.total;
        setTotalCount(totalFromXTotal || response.data.length);
      } else {
        setDIDs([]);
        setTotalCount(0);
      }
    } catch (err) {
      console.error('Error fetching Routes:', err);
      setError('Failed to fetch Routes: ' + err.message);
      setDIDs([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer, selectedEnvironments, page, rowsPerPage, sortBy, sortOrder, filters]);

  /**
   * Create or update a DID
   */
  const handleSaveDID = useCallback(async (didData) => {
    setLoading(true);
    try {
      // When editing: use the environment_uuid from the form (preserves DID's original environment)
      // When creating: use the environment_uuid from form if set, otherwise fall back to selected environment
      const didDataWithEnv = {
        ...didData,
        environment_uuid: didData.environment_uuid || selectedEnvironments[0]?.uuid
      };

      let savedDID;
      if (selectedDID) {
        // Update existing DID
        savedDID = await didsApi.updateDID(selectedDID.id || selectedDID.uuid, didDataWithEnv);
        setDIDs(prev => prev.map(did => 
          (did.id || did.uuid) === (selectedDID.id || selectedDID.uuid) ? savedDID : did
        ));
      } else {
        // Create new DID
        savedDID = await didsApi.createDID(didDataWithEnv);
        setDIDs(prev => [...prev, savedDID]);
        setTotalCount(prev => prev + 1);
      }
      
      setDialogOpen(false);
      setSelectedDID(null);
    } catch (err) {
      console.error('Error saving Route:', err);
      setError('Failed to save Route: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDID, selectedEnvironments]);

  /**
   * Delete a DID
   */
  const handleDeleteDID = useCallback(async () => {
    if (!didToDelete) return;

    setLoading(true);
    try {
      await didsApi.deleteDID(didToDelete.id || didToDelete.uuid);

      setDIDs(prev => prev.filter(did => (did.id || did.uuid) !== (didToDelete.id || didToDelete.uuid)));
      setTotalCount(prev => prev - 1);
      setDeleteDialogOpen(false);
      setDIDToDelete(null);
    } catch (err) {
      console.error('Error deleting Route:', err);
      setError('Failed to delete Route: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [didToDelete]);

  /**
   * Handle opening duplicate dialog
   */
  const handleOpenDuplicateDialog = useCallback((did) => {
    setDIDToDuplicate(did);
    setDuplicateDialogOpen(true);
  }, []);

  /**
   * Handle closing duplicate dialog
   */
  const handleCloseDuplicateDialog = useCallback(() => {
    setDuplicateDialogOpen(false);
    setDIDToDuplicate(null);
  }, []);

  /**
   * Handle duplicating DID
   */
  const handleDuplicateDID = useCallback(async (didId, newNumber, newName) => {
    setLoading(true);
    try {
      const duplicatedDID = await didsApi.duplicateDID(didId, newNumber, newName);

      // Add the new DID to the list
      setDIDs(prev => [...prev, duplicatedDID]);
      setTotalCount(prev => prev + 1);
      setDuplicateDialogOpen(false);
      setDIDToDuplicate(null);

      // Refresh list to get accurate data
      fetchDIDs();
    } catch (err) {
      console.error('Error duplicating Route:', err);
      setError('Failed to duplicate Route: ' + err.message);
      throw err; // Re-throw so dialog can show error
    } finally {
      setLoading(false);
    }
  }, [fetchDIDs]);

  // Pagination handlers
  const handlePageChange = useCallback((_event, newPage) => {
    setPage(newPage);
  }, []);

  const handleRowsPerPageChange = useCallback((event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  // Sorting handler - directly triggers fetch with new sort params
  // (follows the pattern from Calls screen: don't rely on useEffect chain)
  const handleSortChange = useCallback((field) => {
    const isAsc = sortBy === field && sortOrder === 'asc';
    const newOrder = isAsc ? 'desc' : 'asc';
    setSortOrder(newOrder);
    setSortBy(field);
    setPage(0); // Reset to first page on sort change
    // The state updates above re-run the fetch effect — a direct call here
    // double-fetched (one request from here + one from the effect).
  }, [sortBy, sortOrder, fetchDIDs]);

  // Filters handler
  const handleFiltersChange = useCallback((newFilters) => {
    setFilters(newFilters);
    setPage(0); // Reset to first page when filters change
  }, []);

  // Fetch bridge types - only load when needed for dialog
  const fetchBridgeTypes = useCallback(async () => {
    if (bridgeTypes.length > 0) return; // Already loaded

    setResourcesLoading(true);
    try {
      const response = await voipResourcesApi.getBridgeTypes();
      // Handle both wrapped and direct array responses
      const types = Array.isArray(response) ? response : (response?.data || []);
      setBridgeTypes(types);
    } catch (err) {
      console.error('Error fetching bridge types:', err);
    } finally {
      setResourcesLoading(false);
    }
  }, [bridgeTypes.length]);

  // Fetch DID types - only load when needed for dialog
  const fetchDIDTypes = useCallback(async () => {
    if (didTypes.length > 0) return; // Already loaded

    try {
      const response = await didsApi.getTypes();
      // Handle both wrapped and direct array responses
      const types = Array.isArray(response) ? response : (response?.data || []);
      setDidTypes(types);
    } catch (err) {
      console.error('Error fetching Route types:', err);
    }
  }, [didTypes.length]);

  // Fetch bridge resources by type for dropdown population - only when user selects bridge type
  // Uses ref to read current cache without depending on bridgeResources state (avoids infinite loop)
  const fetchBridgeResources = useCallback(async (bridgeType, environmentUuid = null, forceRefresh = false) => {
    if (!bridgeType) return [];

    // Skip if resources already loaded for this bridge type (unless force refresh)
    // Check for key existence (not length) — empty array IS a valid cached result
    const cached = bridgeResourcesRef.current[bridgeType];
    if (!forceRefresh && cached !== undefined) {
      return cached;
    }

    setResourcesLoading(true);
    try {
      const params = environmentUuid ? { environment_uuid: environmentUuid } : {};
      const response = await voipResourcesApi.getResourcesByBridgeType(bridgeType, params);

      // Handle both wrapped and direct array responses
      const resources = Array.isArray(response) ? response : (response?.data || []);

      // Store resources by singular bridge type for dialog access
      setBridgeResources(prev => ({
        ...prev,
        [bridgeType]: resources
      }));

      return resources;
    } catch (err) {
      console.error(`Error fetching ${bridgeType} resources:`, err);
      return [];
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  // Dialog handlers - defined after fetch functions to avoid hoisting issues
  /**
   * Handle opening create/edit dialog
   * For edit: fetches individual DID data via GET /api/routes/{uuid}
   * For create: opens empty dialog
   */
  const handleOpenDialog = useCallback(async (did = null) => {
    // Open dialog immediately with list data so the user sees it right away
    setSelectedDID(did || null);
    setDialogOpen(true);

    // Clear bridge resources cache to ensure fresh data (e.g., after creating extension via Appz)
    setBridgeResources({});

    // Fetch bridge types, DID types, and full DID details in background
    // Dialog is already open — these update state when ready
    Promise.all([
      fetchBridgeTypes(),
      fetchDIDTypes()
    ]).catch(err => console.error('Error loading dialog data:', err));

    if (did) {
      const didId = did.id || did.uuid;
      didsApi.getDID(didId)
        .then(fullDIDData => setSelectedDID(fullDIDData))
        .catch(err => console.error('Error loading Route details:', err));
    }
  }, [fetchBridgeTypes, fetchDIDTypes]);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setSelectedDID(null);
  }, []);

  const handleOpenDeleteDialog = useCallback((did) => {
    setDIDToDelete(did);
    setDeleteDialogOpen(true);
  }, []);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setDIDToDelete(null);
  }, []);

  // Fetch DIDs on mount and when dependencies change
  // Note: fetchDIDs already includes all necessary dependencies (page, sortBy, sortOrder, filters, etc.)
  useEffect(() => {
    fetchDIDs();
  }, [fetchDIDs]);

  // Fetch bridge types on mount for filter dropdown
  useEffect(() => {
    fetchBridgeTypes();
  }, [fetchBridgeTypes]);

  return {
    // State
    dids,
    loading,
    error,
    selectedDID,
    dialogOpen,
    deleteDialogOpen,
    didToDelete,
    duplicateDialogOpen,
    didToDuplicate,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    filters,

    // VoIP Resources
    bridgeTypes,
    bridgeResources,
    resourcesLoading,
    // Only the types this session may create or edit (a user's ACL may limit them).
    didTypes: didTypes.filter((type) => canRouteType(type, 'write')),

    // Actions
    handleOpenDialog,
    handleCloseDialog,
    handleSaveDID,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteDID,
    handleOpenDuplicateDialog,
    handleCloseDuplicateDialog,
    handleDuplicateDID,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    fetchDIDs,
    fetchBridgeTypes,
    fetchBridgeResources,
    fetchDIDTypes
  };
};