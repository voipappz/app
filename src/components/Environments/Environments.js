import { useState, useEffect, useCallback } from 'react';
import { environmentsApi } from '../../services/api/environmentsApi';
import { useNotification } from '../../context/NotificationContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';

/**
 * Custom hook for Environments management
 * Handles business logic for environment CRUD operations
 */
export const useEnvironments = () => {
  // State management
  const [environments, setEnvironments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEnvironment, setSelectedEnvironment] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [environmentToDelete, setEnvironmentToDelete] = useState(null);


  // Pagination and sorting
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Filters - matching legacy AngularJS search[field] format
  const [filters, setFilters] = useState({
    search: '',           // name search
    enabled: '',          // enabled filter
    created_at: '',       // date range: "start_timestamp-end_timestamp"
    updated_at: ''        // date range: "start_timestamp-end_timestamp"
  });

  // Context hooks
  const { showSuccess, showError } = useNotification();
  const {
    selectedCustomer,
    fetchEnvironments: refreshGlobalEnvironments
  } = useCustomerEnvironment();


  /**
   * Fetch environments from API with filters, pagination, and sorting
   * Optimized to request only list-view fields to reduce payload size
   */
  const fetchEnvironments = useCallback(async (overrides = null) => {
    // Don't fetch if no customer selected - prevents loading all environments
    if (!selectedCustomer || !selectedCustomer.uuid) {
      setEnvironments([]);
      setTotalCount(0);
      return;
    }

    const effectiveSortBy = overrides?.sortBy ?? sortBy;
    const effectiveSortOrder = overrides?.sortOrder ?? sortOrder;
    const effectivePage = overrides?.page ?? page;

    try {
      setLoading(true);
      const params = {
        page: effectivePage + 1, // API is 1-indexed
        per_page: rowsPerPage,
        order_by: effectiveSortBy,
        order_type: effectiveSortOrder,
        customer_uuid: selectedCustomer.uuid,
        // Only request fields needed for list view to reduce payload
        fields: 'uuid,id,name,enabled,created_at,updated_at,customer_uuid,notes'
      };

      // Apply filters using search[field] format (matching legacy AngularJS pattern)
      Object.keys(filters).forEach(key => {
        if (filters[key] !== '') {
          switch (key) {
            case 'search':
              params['search[name]'] = filters[key];
              break;
            case 'enabled':
              params['search[enabled]'] = filters[key];
              break;
            case 'created_at':
              params['search[created_at]'] = filters[key]; // format: "start_timestamp-end_timestamp"
              break;
            case 'updated_at':
              params['search[updated_at]'] = filters[key]; // format: "start_timestamp-end_timestamp"
              break;
            default:
              break;
          }
        }
      });

      // Handle meta tag filters
      if (filters.meta && typeof filters.meta === 'object') {
        Object.entries(filters.meta).forEach(([metaKey, metaValue]) => {
          params[`search[meta][${metaKey}]`] = metaValue;
        });
      }

      const response = await environmentsApi.getEnvironments(params);

      // Handle both array response and paginated response
      if (Array.isArray(response)) {
        setEnvironments(response);
        setTotalCount(response.length);
      } else if (response.data && Array.isArray(response.data)) {
        setEnvironments(response.data);
        setTotalCount(response.total_records || response.total || response.data.length);
      } else {
        setEnvironments([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('Error fetching environments:', error);
      showError('Failed to load environments');
      setEnvironments([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomer, page, rowsPerPage, sortBy, sortOrder, filters, showError]);

  /**
   * Load environments on component mount and when dependencies change
   */
  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  /**
   * Handle opening create/edit dialog
   * For edit: fetches individual environment data via GET /api/applications/{uuid}
   * For create: opens empty dialog
   */
  const handleOpenDialog = useCallback(async (environment = null) => {
    // For edit: fetch full environment details (includes profile, all settings)
    if (environment) {
      const environmentId = environment.id || environment.uuid;
      setLoading(true);
      try {
        const fullEnvironmentData = await environmentsApi.getEnvironment(environmentId);
        console.log('✅ Loaded full environment data for edit:', fullEnvironmentData);
        setSelectedEnvironment(fullEnvironmentData);
        setDialogOpen(true);
      } catch (err) {
        console.error('❌ Error loading environment details:', err);
        // Fallback to partial data from list
        setSelectedEnvironment(environment);
        setDialogOpen(true);
      } finally {
        setLoading(false);
      }
    } else {
      // For create: open with empty data
      setSelectedEnvironment(null);
      setDialogOpen(true);
    }
  }, []);

  /**
   * Handle closing create/edit dialog
   */
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setSelectedEnvironment(null);
  }, []);

  /**
   * Handle saving environment (create or update)
   */
  const handleSaveEnvironment = useCallback(async (environmentData) => {
    try {
      setLoading(true);

      if (selectedEnvironment) {
        // Update existing environment
        await environmentsApi.updateEnvironment(selectedEnvironment.id || selectedEnvironment.uuid, environmentData);
        showSuccess('Application updated successfully');
      } else {
        // Create new environment
        const newEnvironmentData = {
          ...environmentData,
          customer_uuid: environmentData.customer_uuid || (selectedCustomer && selectedCustomer.uuid ? selectedCustomer.uuid : null)
        };
        await environmentsApi.createEnvironment(newEnvironmentData);
        showSuccess('Application created successfully');
      }

      handleCloseDialog();
      await fetchEnvironments(); // Refresh the local list

      // Refresh global context environments (for dropdowns across the app)
      if (refreshGlobalEnvironments && selectedCustomer) {
        console.log('Refreshing global environments after save');
        await refreshGlobalEnvironments(selectedCustomer.uuid);
      }
    } catch (error) {
      console.error('Error saving environment:', error);
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        (selectedEnvironment ? 'Failed to update environment' : 'Failed to create environment');
      showError(errorMessage);
      // Re-throw so the dialog can show the error too
      throw new Error(errorMessage, { cause: error });
    } finally {
      setLoading(false);
    }
  }, [selectedEnvironment, selectedCustomer, showSuccess, showError, fetchEnvironments, handleCloseDialog, refreshGlobalEnvironments]);

  /**
   * Handle opening delete confirmation dialog
   */
  const handleOpenDeleteDialog = useCallback((environment) => {
    setEnvironmentToDelete(environment);
    setDeleteDialogOpen(true);
  }, []);

  /**
   * Handle closing delete confirmation dialog
   */
  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setEnvironmentToDelete(null);
  }, []);

  /**
   * Handle deleting environment
   */
  const handleDeleteEnvironment = useCallback(async () => {
    if (!environmentToDelete) return;

    try {
      setLoading(true);
      await environmentsApi.deleteEnvironment(environmentToDelete.id || environmentToDelete.uuid);
      showSuccess('Application deleted successfully');
      handleCloseDeleteDialog();
      await fetchEnvironments(); // Refresh the list

      // Refresh global context environments (for dropdowns across the app)
      if (refreshGlobalEnvironments && selectedCustomer) {
        console.log('Refreshing global environments after delete');
        await refreshGlobalEnvironments(selectedCustomer.uuid);
      }
    } catch (error) {
      console.error('Error deleting environment:', error);
      const errorMessage = error.response?.data?.message || 'Failed to delete environment';
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [environmentToDelete, showSuccess, showError, fetchEnvironments, handleCloseDeleteDialog, refreshGlobalEnvironments, selectedCustomer]);

  /**
   * Handle filters change
   */
  const handleFiltersChange = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPage(0); // Reset to first page on filter change
  }, []);

  /**
   * Reset all filters
   */
  const handleResetFilters = useCallback(() => {
    setFilters({
      search: '',
      enabled: ''
    });
    setPage(0);
  }, []);

  /**
   * Handle page change
   */
  const handlePageChange = useCallback((event, newPage) => {
    setPage(newPage);
  }, []);

  /**
   * Handle rows per page change
   */
  const handleRowsPerPageChange = useCallback((event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  /**
   * Handle sort change
   */
  const handleSortChange = useCallback((field) => {
    const newOrder = sortBy === field ? (sortOrder === 'asc' ? 'desc' : 'asc') : 'asc';
    setSortBy(field);
    setSortOrder(newOrder);
    setPage(0);
    // State updates re-run the fetch effect — a direct call here double-fetched.
  }, [sortBy, sortOrder, fetchEnvironments]);

  /**
   * Handle environment status change
   */
  const handleStatusChange = useCallback(async (environment, newStatus) => {
    try {
      setLoading(true);
      await environmentsApi.updateEnvironmentStatus(environment.id || environment.uuid, newStatus);
      showSuccess(`Environment ${newStatus} successfully`);
      await fetchEnvironments(); // Refresh the list
    } catch (error) {
      console.error('Error updating environment status:', error);
      showError('Failed to update environment status');
    } finally {
      setLoading(false);
    }
  }, [showSuccess, showError, fetchEnvironments]);

  return {
    // State
    environments,
    loading,
    selectedEnvironment,
    dialogOpen,
    deleteDialogOpen,
    environmentToDelete,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    filters,

    // Actions
    handleOpenDialog,
    handleCloseDialog,
    handleSaveEnvironment,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteEnvironment,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    handleResetFilters,
    handleStatusChange,
    fetchEnvironments
  };
};

export default useEnvironments;
