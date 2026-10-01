import { useState, useEffect, useCallback, useRef } from 'react';
import { accountsApi } from '../../services/api/accountsApi';
import { useNotification } from '../../context/NotificationContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';

/**
 * Custom hook for Accounts management
 * Handles business logic for account CRUD operations with table pattern and filters
 */
export const useAccounts = () => {
  // State management
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState(null);

  // Reference data
  const [environments, setEnvironments] = useState([]);
  const [acls, setAcls] = useState([]);
  const [referenceDataLoading, setReferenceDataLoading] = useState(false);

  // Pagination and sorting
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Filters - matching legacy AngularJS search[field] format
  const [filters, setFilters] = useState({
    search: '',
    email: '',
    enabled: '',
    customer_uuid: '',
    acl_uuid: '',
    created_at: '',
    updated_at: ''
  });

  // Context hooks
  const { showSuccess, showError } = useNotification();
  const { selectedEnvironments, selectedCustomer, searchEnvironments } = useCustomerEnvironment();

  // Refs to prevent duplicate API calls and store stable notification functions
  const referenceDataLoadedRef = useRef(false);
  const showErrorRef = useRef(showError);

  // Update showError ref when it changes (without triggering effects)
  useEffect(() => {
    showErrorRef.current = showError;
  }, [showError]);

  /**
   * Load reference data for dropdowns (ACLs only)
   * Environments come from selectedEnvironments context (top selector)
   * Customers are NOT loaded - accounts automatically scoped to current customer via API
   * Only called once on component mount using ref to prevent duplicates
   */
  const loadReferenceData = useCallback(async () => {
    // Prevent duplicate calls
    if (referenceDataLoadedRef.current) {
      console.log('⏭️ Reference data already loaded, skipping');
      return;
    }

    try {
      referenceDataLoadedRef.current = true;
      setReferenceDataLoading(true);

      console.log('📡 Loading reference data (ACLs)...');

      const aclsResponse = await accountsApi.getAcls();

      // Load ALL of the customer's environments (not just the ones currently
      // selected in the top selector) so the account dialog can both resolve an
      // account's already-assigned environments and offer the full pick list.
      // Falls back to the selected ones if the fetch fails.
      let allEnvs = [];
      try {
        if (selectedCustomer?.uuid) {
          const res = await searchEnvironments(selectedCustomer.uuid, { page: 1, perPage: 500 });
          allEnvs = Array.isArray(res) ? res : (res?.data || []);
        }
      } catch (envErr) {
        console.error('Failed to load environments for account dialog:', envErr);
      }
      setEnvironments(allEnvs.length ? allEnvs : (selectedEnvironments || []));
      setAcls(Array.isArray(aclsResponse) ? aclsResponse : (aclsResponse?.data || []));

      // No customers list needed - CustomerEnvironmentContext handles customer scoping

      console.log('✅ Reference data loaded successfully');
    } catch (error) {
      console.error('❌ Error loading reference data:', error);
      showErrorRef.current('Failed to load form data');
      referenceDataLoadedRef.current = false; // Allow retry on error
    } finally {
      setReferenceDataLoading(false);
    }
  }, [selectedEnvironments, selectedCustomer, searchEnvironments]);

  /**
   * Fetch accounts from API with filters, pagination, and sorting
   */
  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: page + 1, // API is 1-indexed
        per_page: rowsPerPage,
        order_by: sortBy,
        order_type: sortOrder
      };

      // Apply filters using search[field] format (matching legacy AngularJS pattern)
      Object.keys(filters).forEach(key => {
        if (filters[key] !== '') {
          switch (key) {
            case 'search':
              params['search[name]'] = filters[key];
              break;
            case 'email':
              params['search[email]'] = filters[key];
              break;
            case 'enabled':
              params['search[enabled]'] = filters[key];
              break;
            case 'customer_uuid':
              params['search[customer_uuid]'] = filters[key];
              break;
            case 'acl_uuid':
              params['search[acl_uuid]'] = filters[key];
              break;
            case 'created_at':
              params['search[created_at]'] = filters[key];
              break;
            case 'updated_at':
              params['search[updated_at]'] = filters[key];
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

      const response = await accountsApi.getAccounts(params);

      // Handle both array response and paginated response
      if (Array.isArray(response)) {
        setAccounts(response);
        setTotalCount(response.length);
      } else if (response.data && Array.isArray(response.data)) {
        const totalFromXTotal = response.total_records || response.total;
        setAccounts(response.data);
        setTotalCount(totalFromXTotal || response.data.length);
      } else {
        setAccounts([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      showErrorRef.current('Failed to load accounts');
      setAccounts([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, sortBy, sortOrder, filters]); // No showError - uses ref

  /**
   * Load reference data only once on component mount
   */
  useEffect(() => {
    loadReferenceData();
  }, []); // Empty dependency array - only run once on mount

  /**
   * Load accounts when pagination, sorting, or filters change
   */
  useEffect(() => {
    console.log('🔄 Accounts params changed, fetching accounts...');
    fetchAccounts();
  }, [page, rowsPerPage, sortBy, sortOrder, filters, fetchAccounts]); // fetchAccounts is now stable

  /**
   * Handle opening create/edit dialog
   */
  const handleOpenDialog = useCallback(async (account = null) => {
    try {
      if (account) {
        // EDIT MODE: Fetch individual account data from API
        setDialogLoading(true);
        const accountId = account.id || account.uuid;
        console.log(`📡 Fetching account details for: ${accountId}`);
        const fullAccountData = await accountsApi.getAccount(accountId);
        setSelectedAccount(fullAccountData);
        console.log(`✅ Account data loaded for ${fullAccountData.name || fullAccountData.email}`);
      } else {
        // CREATE MODE: No account data needed
        setSelectedAccount(null);
        console.log('📝 Opening dialog for new account creation');
      }
      setDialogOpen(true);
    } catch (error) {
      console.error('❌ Error loading account details:', error);
      showErrorRef.current('Failed to load account details for editing');
      // Fallback to using list data if API fails
      setSelectedAccount(account);
      setDialogOpen(true);
    } finally {
      setDialogLoading(false);
    }
  }, []); // No dependencies - uses refs

  /**
   * Handle closing create/edit dialog
   */
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setSelectedAccount(null);
  }, []);

  /**
   * Handle saving account (create or update)
   */
  const handleSaveAccount = useCallback(async (accountData) => {
    try {
      setDialogLoading(true);

      if (selectedAccount) {
        // Update existing account
        await accountsApi.updateAccount(
          selectedAccount.id || selectedAccount.uuid,
          accountData
        );
        showSuccess('Account updated successfully');
      } else {
        // Create new account
        await accountsApi.createAccount(accountData);
        showSuccess('Account created successfully');
      }

      handleCloseDialog();
      await fetchAccounts(); // Refresh the list
    } catch (error) {
      console.error('Error saving account:', error);
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        (selectedAccount ? 'Failed to update account' : 'Failed to create account');
      showError(errorMessage);
      throw error;
    } finally {
      setDialogLoading(false);
    }
  }, [selectedAccount, showSuccess, showError, fetchAccounts, handleCloseDialog]);

  /**
   * Handle opening delete confirmation dialog
   */
  const handleOpenDeleteDialog = useCallback((account) => {
    setAccountToDelete(account);
    setDeleteDialogOpen(true);
  }, []);

  /**
   * Handle closing delete confirmation dialog
   */
  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setAccountToDelete(null);
  }, []);

  /**
   * Handle deleting account
   */
  const handleDeleteAccount = useCallback(async () => {
    if (!accountToDelete) return;

    try {
      setDialogLoading(true);
      await accountsApi.deleteAccount(accountToDelete.id || accountToDelete.uuid);
      showSuccess('Account deleted successfully');
      handleCloseDeleteDialog();
      await fetchAccounts(); // Refresh the list
    } catch (error) {
      console.error('Error deleting account:', error);
      const errorMessage = error.response?.data?.message || 'Failed to delete account';
      showError(errorMessage);
    } finally {
      setDialogLoading(false);
    }
  }, [accountToDelete, showSuccess, showError, fetchAccounts, handleCloseDeleteDialog]);

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
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  }, [sortBy, sortOrder]);

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
      email: '',
      enabled: '',
      customer_uuid: '',
      acl_uuid: '',
      created_at: '',
      updated_at: ''
    });
    setPage(0);
  }, []);

  /**
   * Handle direct password reset (admin action)
   */
  const handleResetPassword = useCallback(async (accountId, newPassword) => {
    if (!accountId || !newPassword) return;

    try {
      await accountsApi.resetAccountPassword(accountId, newPassword);
      showSuccess('Password reset successfully');
    } catch (error) {
      console.error('Error resetting password:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to reset password';
      showError(errorMessage);
      throw error;
    }
  }, [showSuccess, showError]);

  return {
    // State
    accounts,
    loading,
    dialogLoading,
    selectedAccount,
    dialogOpen,
    deleteDialogOpen,
    accountToDelete,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    filters,

    // Reference data
    environments,
    // What the account dialog offers: the applications selected in the top
    // bar. `environments` (all of the customer's) only resolves the names of
    // applications an account already has.
    selectableEnvironments: selectedEnvironments || [],
    acls,
    referenceDataLoading,

    // Actions
    handleOpenDialog,
    handleCloseDialog,
    handleSaveAccount,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteAccount,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    handleResetFilters,
    handleResetPassword,
    fetchAccounts,
    loadReferenceData
  };
};

export default useAccounts;
