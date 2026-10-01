import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { apiService } from '../../services/apiService';
import { accountsApi } from '../../services/api/accountsApi';
import { customersApi } from '../../services/api/customersApi';

export const useAccount = () => {
  const { user, accountUuid, logout } = useAuth();
  const { selectedEnvironments } = useCustomerEnvironment();

  // UI state
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [detailedAccountData, setDetailedAccountData] = useState(null);
  const [detailedCustomerData, setDetailedCustomerData] = useState(null);

  // Create account state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [environments, setEnvironments] = useState([]);
  const environmentsLoading = false; // the list is the top bar's selection, already in memory
  const [acls, setAcls] = useState([]);
  const [aclsLoading, setAclsLoading] = useState(false);

  // Fetch detailed account data
  const fetchAccountDetails = useCallback(async () => {
    if (!accountUuid) {
      console.warn('No account UUID available for fetching details');
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      console.log('📄 Fetching account details for UUID:', accountUuid);

      const response = await apiService.get(
        `/api/accounts/${accountUuid}`,
        {},
        'fetching account details'
      );

      console.log('✅ Account details fetched:', response);
      setDetailedAccountData(response);

    } catch (error) {
      console.error('❌ Failed to fetch account details:', error);
      setErrors({ fetch: error.message || 'Failed to fetch account details' });

      // Fallback to user data if detailed fetch fails
      setDetailedAccountData(user);
    } finally {
      setLoading(false);
    }
  }, [accountUuid, user]);

  // Fetch customer details from API via GET /api/customers/:uuid
  const fetchCustomerDetails = useCallback(async (customerUuid) => {
    const uuid = customerUuid || user?.customer?.uuid;
    if (!uuid) {
      console.warn('No customer UUID available');
      setDetailedCustomerData(null);
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.get(
        `/api/customers/${uuid}`,
        {},
        'fetching customer details'
      );
      setDetailedCustomerData(response);
    } catch (error) {
      console.error('Failed to fetch customer details:', error);
      // Fallback to JWT data if fetching own customer
      if (!customerUuid) {
        setDetailedCustomerData(user.customer);
      } else {
        setDetailedCustomerData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.customer?.uuid]);

  // Update account information only
  const updateAccountData = async (formData) => {
    setErrors({});
    setSaving(true);

    try {
      const accountFormData = new URLSearchParams();
      accountFormData.append('name', formData.name);

      await apiService.patch(
        `/api/accounts/${accountUuid}`,
        accountFormData.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        },
        'updating account',
        true
      );

      setSuccessMessage('Account updated successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Failed to update account:', error);
      throw new Error(error.message || 'Failed to update account');
    } finally {
      setSaving(false);
    }
  };

  // Update customer via PATCH /api/customers/:uuid
  const updateCustomerData = async (formData, customerUuid) => {
    const uuid = customerUuid || user?.customer?.uuid;
    if (!uuid) {
      throw new Error('No customer to update');
    }

    setErrors({});
    setSaving(true);

    try {
      const customerFormData = new URLSearchParams();
      if (formData.name !== undefined) customerFormData.append('name', formData.name);
      if (formData.enabled !== undefined) customerFormData.append('enabled', formData.enabled ? 'true' : 'false');

      if (formData.notes !== undefined) {
        customerFormData.append('notes', formData.notes);
      }

      if (formData.node_uuid !== undefined) {
        customerFormData.append('node_uuid', formData.node_uuid);
      }

      // Send profile as profile[key]=value pairs — the column is an hstore of
      // strings, not JSON. JSON.stringify sends one opaque blob the API cannot
      // parse into hstore, and it lands as the ":" garbage values described in
      // customersApi. Same encoding as meta below, and as toFormData does.
      if (formData.profile && typeof formData.profile === 'object') {
        Object.entries(formData.profile).forEach(([k, v]) => {
          customerFormData.append(`profile[${k}]`, String(v));
        });
      }

      // Send meta as meta[key]=value pairs
      if (formData.meta && typeof formData.meta === 'object') {
        Object.entries(formData.meta).forEach(([k, v]) => {
          customerFormData.append(`meta[${k}]`, String(v));
        });
      }

      await apiService.patch(
        `/api/customers/${uuid}`,
        customerFormData.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        },
        'updating customer',
        true
      );

      setSuccessMessage('Customer updated successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Failed to update customer:', error);
      throw new Error(error.message || 'Failed to update customer');
    } finally {
      setSaving(false);
    }
  };

  // Create a new customer (root only)
  const createCustomerData = async (formData) => {
    setErrors({});
    setSaving(true);

    try {
      const dataToCreate = {
        name: formData.name,
        enabled: formData.enabled ? 'true' : 'false',
      };

      if (formData.notes !== undefined) {
        dataToCreate.notes = formData.notes;
      }

      // Hand toFormData the object, not a JSON string: it encodes nested
      // objects as profile[key]=value, which is what the hstore column needs.
      // Pre-stringifying defeats that and sends one unparseable blob.
      if (formData.profile && typeof formData.profile === 'object') {
        dataToCreate.profile = formData.profile;
      }

      const result = await customersApi.createCustomer(dataToCreate);

      setSuccessMessage('Customer created successfully');
      setTimeout(() => setSuccessMessage(''), 3000);

      return result;
    } catch (error) {
      console.error('Failed to create customer:', error);
      throw new Error(error.message || 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  };

  // Search environments for the create-account picker.
  //
  // The dialog opens with NO request: it pre-selects from
  // CustomerEnvironmentContext, which is already in memory. Only a user
  // hunting for some other environment needs options, and then one searched
  // page is enough — this used to pull the whole tenant (per_page=9999) to
  // filter it in the browser.
  // Only the applications selected in the top bar are offered; the search
  // narrows that list and never reaches other applications.
  const searchEnvironments = useCallback(async (term = '') => {
    const query = term.trim().toLowerCase();
    const selected = selectedEnvironments || [];
    setEnvironments(query ? selected.filter((e) => String(e.name || '').toLowerCase().includes(query)) : selected);
  }, [selectedEnvironments]);

  // Fetch ACLs for create account dialog
  const fetchAcls = useCallback(async () => {
    setAclsLoading(true);
    try {
      const response = await accountsApi.getAcls();
      const aclList = Array.isArray(response) ? response : response.data || [];
      setAcls(aclList);
    } catch (error) {
      console.error('Failed to fetch ACLs:', error);
      setAcls([]);
    } finally {
      setAclsLoading(false);
    }
  }, []);

  // Open create account dialog
  const handleOpenCreateDialog = useCallback(() => {
    setCreateDialogOpen(true);
    setEnvironments(selectedEnvironments || []);
    fetchAcls();
  }, [selectedEnvironments, fetchAcls]);

  // Close create account dialog
  const handleCloseCreateDialog = useCallback(() => {
    setCreateDialogOpen(false);
  }, []);

  // Create new account
  const createAccount = async (accountData) => {
    setErrors({});
    setSaving(true);

    try {
      console.log('Creating account with data:', accountData);

      // Build the account data with resources array
      const dataToCreate = {
        name: accountData.name,
        email: accountData.email,
        password: accountData.password,
        acl_uuid: accountData.acl_uuid,
        enabled: accountData.enabled ? 'true' : 'false'
      };

      // Add resources array (environments)
      if (accountData.resources && accountData.resources.length > 0) {
        dataToCreate.resources = accountData.resources;
      }

      const result = await accountsApi.createAccount(dataToCreate);

      console.log('Account created successfully:', result);
      setSuccessMessage('Account created successfully');
      setTimeout(() => setSuccessMessage(''), 3000);

      return result;
    } catch (error) {
      console.error('Failed to create account:', error);
      throw new Error(error.message || 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  return {
    // State
    user,
    saving,
    loading,
    errors,
    successMessage,
    detailedAccountData,
    detailedCustomerData,

    // Create account state
    createDialogOpen,
    environments,
    environmentsLoading,
    acls,
    aclsLoading,

    // Actions
    fetchAccountDetails,
    fetchCustomerDetails,
    searchEnvironments,
    fetchAcls,
    updateAccountData,
    updateCustomerData,
    createCustomerData,
    logout,

    // Create account actions
    handleOpenCreateDialog,
    handleCloseCreateDialog,
    createAccount,
  };
};

export default useAccount;
