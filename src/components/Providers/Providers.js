import { useState, useEffect, useCallback } from 'react';
import { providersApi } from '../../services/api/providersApi';
import { tariffsApi } from '../../services/api/tariffsApi';
import { useNotification } from '../../context/NotificationContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';

/**
 * Custom hook for Providers management
 * Handles business logic for provider CRUD operations with nested tariffs
 */
export const useProviders = () => {
  // State management
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [tariffs, setTariffs] = useState([]);
  const [tariffsLoading, setTariffsLoading] = useState(false);
  const [tariffsError, setTariffsError] = useState(null);
  const [allTariffs, setAllTariffs] = useState([]);
  const [allTariffsLoading, setAllTariffsLoading] = useState(false);
  const [providerTypes, setProviderTypes] = useState([]);
  const [llmServices, setLlmServices] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    protocol: '',
    enabled: '',
    created_at: '',       // date range: "start_timestamp-end_timestamp"
    updated_at: ''        // date range: "start_timestamp-end_timestamp"
  });

  // Context hooks
  const { showSuccess, showError } = useNotification();
  const { selectedEnvironments, selectedCustomer } = useCustomerEnvironment();


  /**
   * Fetch providers from API with filters, pagination, and sorting
   */
  const fetchProviders = useCallback(async (overrides = null) => {
    const effectiveSortBy = overrides?.sortBy ?? sortBy;
    const effectiveSortOrder = overrides?.sortOrder ?? sortOrder;
    const effectivePage = overrides?.page ?? page;

    try {
      setLoading(true);
      const params = {
        page: effectivePage + 1, // API is 1-indexed
        per_page: rowsPerPage,
        order_by: effectiveSortBy,
        order_type: effectiveSortOrder
      };

      // NOTE: Providers are customer-scoped (not environment-scoped).
      // Do NOT send environment_uuid — the API scopes by customer_uuid automatically.

      // Apply filters using search[field] format (matching legacy AngularJS pattern)
      Object.keys(filters).forEach(key => {
        if (filters[key] !== '') {
          if (key === 'search') {
            params['search[name]'] = filters[key];
          } else {
            params[`search[${key}]`] = filters[key];
          }
        }
      });

      // Handle meta tag filters
      if (filters.meta && typeof filters.meta === 'object') {
        Object.entries(filters.meta).forEach(([metaKey, metaValue]) => {
          params[`search[meta][${metaKey}]`] = metaValue;
        });
      }

      const response = await providersApi.getProviders(params);

      // Handle both array response and paginated response
      if (Array.isArray(response)) {
        setProviders(response);
        setTotalCount(response.length);
      } else if (response.data && Array.isArray(response.data)) {
        setProviders(response.data);
        setTotalCount(response.total_records || response.total || response.data.length);
      } else {
        setProviders([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
      showError('Failed to load providers');
      setProviders([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [selectedEnvironments, page, rowsPerPage, sortBy, sortOrder, filters, showError]);

  /**
   * Fetch provider types from server
   */
  const fetchProviderTypes = useCallback(async () => {
    try {
      const types = await providersApi.getProviderTypes();
      if (Array.isArray(types)) {
        setProviderTypes(types);
      }
    } catch (err) {
      console.error('Failed to fetch provider types:', err);
    }
  }, []);

  /**
   * Fetch LLM service options from server
   */
  const fetchLlmServices = useCallback(async () => {
    try {
      const services = await providersApi.getLLMServices();
      if (Array.isArray(services)) {
        setLlmServices(services);
      }
    } catch (err) {
      console.error('Failed to fetch LLM services:', err);
    }
  }, []);

  /**
   * Fetch all available tariffs for selection
   */
  const fetchAllTariffs = useCallback(async () => {
    setAllTariffsLoading(true);
    try {
      const params = {
        limit: 100 // Get more tariffs for selection (tariffs are global)
      };
      const response = await tariffsApi.getTariffs(params);
      setAllTariffs(response.data || response || []);
    } catch (err) {
      console.error("Failed to fetch all tariffs:", err);
      setAllTariffs([]);
    } finally {
      setAllTariffsLoading(false);
    }
  }, []);

  /**
   * Fetch tariffs for selected provider
   */
  const fetchTariffs = useCallback(async (providerUuid) => {
    if (!providerUuid) {
      setTariffs([]);
      return;
    }

    setTariffsLoading(true);
    setTariffsError(null);
    try {
      const response = await providersApi.getProviderTariffs(providerUuid);
      setTariffs(response.data || response || []);
    } catch (err) {
      console.error("Failed to fetch tariffs:", err);
      setTariffsError("Failed to load tariffs.");
      setTariffs([]);
    } finally {
      setTariffsLoading(false);
    }
  }, []);

  /**
   * Load provider types and LLM services on mount
   */
  useEffect(() => {
    fetchProviderTypes();
    fetchLlmServices();
  }, [fetchProviderTypes, fetchLlmServices]);

  /**
   * Load providers on mount and when filter/pagination dependencies change
   */
  useEffect(() => {
    fetchProviders();
  }, [page, rowsPerPage, sortBy, sortOrder, filters, selectedEnvironments]);

  /**
   * Handle opening create/edit dialog
   * For edit: fetches individual provider data via GET /api/providers/{uuid}
   * For create: opens empty dialog
   * IMPORTANT: Tariffs are ONLY loaded when dialog opens (not on list view)
   */
  const handleOpenDialog = useCallback(async (provider = null) => {
    try {
      // Load all tariffs only when dialog opens (prevents unnecessary API calls on list view)
      fetchAllTariffs();

      if (provider) {
        // EDIT MODE: Fetch individual provider data from API (not from list)
        setDialogLoading(true);
        const providerId = provider.id || provider.uuid;
        try {
          const fullProviderData = await providersApi.getProvider(providerId);
          setSelectedProvider(fullProviderData);
          console.log('Loaded full provider data for editing:', fullProviderData);
        } catch (fetchError) {
          console.error('Error loading provider details:', fetchError);
          // Fallback to using list data if API fails
          setSelectedProvider(provider);
        }
      } else {
        // CREATE MODE: No provider data needed
        setSelectedProvider(null);
      }
      setDialogOpen(true);
    } catch (error) {
      console.error('Error loading provider dialog:', error);
      setSelectedProvider(provider);
      setDialogOpen(true);
    } finally {
      setDialogLoading(false);
    }
  }, [fetchAllTariffs]);

  /**
   * Handle closing create/edit dialog
   */
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setSelectedProvider(null);
  }, []);

  /**
   * Handle saving provider (create or update)
   */
  const handleSaveProvider = useCallback(async (providerData) => {
    try {
      setDialogLoading(true);

      if (selectedProvider) {
        // Update existing provider
        await providersApi.updateProvider(selectedProvider.id || selectedProvider.uuid, providerData);
        showSuccess('Provider updated successfully');
      } else {
        // Create new provider
        const newProviderData = {
          ...providerData,
          environment_uuid: providerData.environment_uuid || (selectedEnvironments && selectedEnvironments.length > 0 ? selectedEnvironments[0].uuid : null)
        };
        const createdProvider = await providersApi.createProvider(newProviderData);
        
        // If there are tariffs to create, create them as independent tariffs
        if (providerData.tariffs && providerData.tariffs.length > 0) {
          const providerId = createdProvider.data?.uuid || createdProvider.uuid || createdProvider.id;
          for (const tariffData of providerData.tariffs) {
            try {
              // Create the tariff first (tariffs are global, not environment-scoped)
              const tariffPayload = {
                ...tariffData,
                provider_uuid: providerId,
                customer_uuid: selectedCustomer?.uuid
              };
              const createdTariff = await tariffsApi.createTariff(tariffPayload);
              
              // If tariff has items, create them
              if (tariffData.items && tariffData.items.length > 0) {
                const tariffId = createdTariff.data?.uuid || createdTariff.uuid || createdTariff.id;
                for (const itemData of tariffData.items) {
                  try {
                    await tariffsApi.createTariffItem(tariffId, itemData);
                  } catch (itemError) {
                    console.error('Error creating tariff item:', itemError);
                    showError(`Failed to create tariff item: ${itemData.name}`);
                  }
                }
              }
            } catch (tariffError) {
              console.error('Error creating tariff:', tariffError);
              showError(`Failed to create tariff: ${tariffData.name}`);
            }
          }
        }
        
        showSuccess('Provider created successfully');
      }

      handleCloseDialog();
      await fetchProviders(); // Refresh the list
    } catch (error) {
      console.error('Error saving provider:', error);
      const errorMessage =
        error.response?.data?.message ||
        (selectedProvider ? 'Failed to update provider' : 'Failed to create provider');
      showError(errorMessage);
      throw error;
    } finally {
      setDialogLoading(false);
    }
  }, [selectedProvider, selectedEnvironments, selectedCustomer, showSuccess, showError, fetchProviders, handleCloseDialog]);

  /**
   * Handle opening delete confirmation dialog
   */
  const handleOpenDeleteDialog = useCallback((provider) => {
    setProviderToDelete(provider);
    setDeleteDialogOpen(true);
  }, []);

  /**
   * Handle closing delete confirmation dialog
   */
  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setProviderToDelete(null);
  }, []);

  /**
   * Handle deleting provider
   */
  const handleDeleteProvider = useCallback(async () => {
    if (!providerToDelete) return;

    try {
      setDialogLoading(true);
      await providersApi.deleteProvider(providerToDelete.id || providerToDelete.uuid);
      showSuccess('Provider deleted successfully');
      handleCloseDeleteDialog();
      await fetchProviders(); // Refresh the list
    } catch (error) {
      console.error('Error deleting provider:', error);
      const errorMessage = error.response?.data?.message || 'Failed to delete provider';
      showError(errorMessage);
    } finally {
      setDialogLoading(false);
    }
  }, [providerToDelete, showSuccess, showError, fetchProviders, handleCloseDeleteDialog]);

  /**
   * Handle filter changes
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
      protocol: '',
      enabled: ''
    });
    setPage(0);
  }, []);

  /**
   * Handle provider connection test
   */
  const handleTestConnection = useCallback(async (provider) => {
    try {
      setLoading(true);
      // This would be implemented based on actual API endpoint
      console.log('Testing connection for provider:', provider.name);
      showSuccess(`Connection test for ${provider.name} completed`);
    } catch (error) {
      console.error('Error testing provider connection:', error);
      showError('Failed to test provider connection');
    } finally {
      setLoading(false);
    }
  }, [showSuccess, showError]);

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
  }, [sortBy, sortOrder, fetchProviders]);

  /**
   * Handle tariff operations
   */
  const handleSaveTariff = useCallback(async (providerUuid, tariffData) => {
    try {
      setTariffsLoading(true);
      if (tariffData.uuid) {
        // Update existing tariff
        await providersApi.updateProviderTariff(providerUuid, tariffData.uuid, tariffData);
        showSuccess('Tariff updated successfully');
      } else {
        // Create new tariff
        await providersApi.createProviderTariff(providerUuid, tariffData);
        showSuccess('Tariff created successfully');
      }
      await fetchTariffs(providerUuid);
    } catch (error) {
      console.error('Error saving tariff:', error);
      showError('Failed to save tariff');
    } finally {
      setTariffsLoading(false);
    }
  }, [showSuccess, showError, fetchTariffs]);

  const handleDeleteTariff = useCallback(async (providerUuid, tariffUuid) => {
    try {
      setTariffsLoading(true);
      await providersApi.deleteProviderTariff(providerUuid, tariffUuid);
      showSuccess('Tariff deleted successfully');
      await fetchTariffs(providerUuid);
    } catch (error) {
      console.error('Error deleting tariff:', error);
      showError('Failed to delete tariff');
    } finally {
      setTariffsLoading(false);
    }
  }, [showSuccess, showError, fetchTariffs]);

  /**
   * Handle inline tariff creation (for default tariff)
   * Note: Tariffs are global, not environment-scoped
   */
  const handleCreateTariff = useCallback(async (tariffData) => {
    try {
      const payload = {
        ...tariffData,
        customer_uuid: selectedCustomer?.uuid
      };
      const createdTariff = await tariffsApi.createTariff(payload);
      showSuccess('Tariff created successfully');
      return createdTariff;
    } catch (error) {
      console.error('Error creating tariff:', error);
      showError('Failed to create tariff');
      throw error;
    }
  }, [selectedCustomer, showSuccess, showError]);

  return {
    // State
    providers,
    loading,
    dialogLoading,
    selectedProvider,
    dialogOpen,
    deleteDialogOpen,
    providerToDelete,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    tariffs,
    tariffsLoading,
    tariffsError,
    allTariffs,
    allTariffsLoading,
    providerTypes,
    llmServices,
    filters,

    // Actions
    handleOpenDialog,
    handleCloseDialog,
    handleSaveProvider,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteProvider,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    handleResetFilters,
    handleTestConnection,
    fetchProviders,
    fetchTariffs,
    fetchAllTariffs,
    handleSaveTariff,
    handleDeleteTariff,
    handleCreateTariff
  };
};

export default useProviders;
