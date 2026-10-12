import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { vmlsApi } from '../../../services/api/vmlsApi.js';

/**
 * useVML Hook
 * Custom hook for VML creation and editing
 *
 * Based on legacy AngularJS patterns from:
 * - /opt/src/va-voipbox-admin/src/scripts/controllers/vmls/edit.js
 * - /opt/src/va-voipbox-admin/src/scripts/controllers/vmls/new.js
 *
 * Features:
 * - VML type selection
 * - Code editor state management
 * - Meta properties management
 * - Template variable insertion
 */
export const useVML = () => {
  // VML types
  const { t } = useTranslation('bridges');
  const [vmlTypes, setVMLTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);

  // VML content
  const [vmlContent, setVMLContent] = useState('');

  // Meta properties (key-value pairs)
  const [metaFields, setMetaFields] = useState([]);

  // FreeSWitch session variables — inserted as session:getVariable() calls
  const [availableVariables] = useState([
    { label: 'caller_id_number', insert: 'session:getVariable("caller_id_number")' },
    { label: 'caller_id_name', insert: 'session:getVariable("caller_id_name")' },
    { label: 'destination_number', insert: 'session:getVariable("destination_number")' },
    { label: 'uuid', insert: 'session:getVariable("uuid")' },
    { label: 'va_call_uuid', insert: 'session:getVariable("va_call_uuid")' },
    { label: 'va_leg', insert: 'session:getVariable("va_leg")' },
    { label: 'va_campaign_uuid', insert: 'session:getVariable("va_campaign_uuid")' },
    { label: 'va_campaign_number_uuid', insert: 'session:getVariable("va_campaign_number_uuid")' },
    { label: 'accountcode', insert: 'session:getVariable("accountcode")' },
    { label: 'sip_from_user', insert: 'session:getVariable("sip_from_user")' },
    { label: 'domain_name', insert: 'session:getVariable("domain_name")' },
    { label: 'network_addr', insert: 'session:getVariable("network_addr")' },
    { label: 'cc_agent_uuid', insert: 'session:getVariable("cc_agent_uuid")' },
    { label: 'transfer_history', insert: 'session:getVariable("transfer_history")' },
    { label: 'va_user_bridged', insert: 'session:getVariable("va_user_bridged")' },
    { label: 'sip_h_X-VA-Call-Uuid', insert: 'session:getVariable("sip_h_X-VA-Call-Uuid")' }
  ]);

  // General state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch VML types on mount
  useEffect(() => {
    fetchVMLTypes();
  }, []);

  /**
   * Fetch available VML types from API
   */
  const fetchVMLTypes = async () => {
    setLoadingTypes(true);
    try {
      const types = await vmlsApi.getVMLTypes();
      setVMLTypes(types);
    } catch (err) {
      console.error('Error fetching VML types:', err);
      setError(t('vml.errors.typesFailed'));
    } finally {
      setLoadingTypes(false);
    }
  };

  /**
   * Add meta field
   */
  const addMetaField = useCallback(() => {
    setMetaFields(prev => [...prev, { key: '', value: '' }]);
  }, []);

  /**
   * Remove meta field
   */
  const removeMetaField = useCallback((index) => {
    setMetaFields(prev => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Update meta field
   */
  const updateMetaField = useCallback((index, field, value) => {
    setMetaFields(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  }, []);

  /**
   * Insert variable at cursor position
   * For simple implementation, appends to content
   * TODO: For cursor position insertion, need editor ref
   */
  const insertVariable = useCallback((variable) => {
    setVMLContent(prev => prev + variable);
  }, []);

  /**
   * Validate duplicate meta keys
   */
  const validateMetaFields = useCallback(() => {
    const keys = metaFields.map(f => f.key).filter(k => k.trim());
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    return duplicates.length === 0;
  }, [metaFields]);

  /**
   * Save VML
   */
  const saveVML = useCallback(async (formData) => {
    setLoading(true);
    setError(null);

    try {
      // Validate meta fields
      if (!validateMetaFields()) {
        throw new Error(t('meta.duplicateKeys'));
      }

      // Convert meta fields array to object
      const meta = {};
      metaFields.forEach(field => {
        if (field.key.trim() && field.value.trim()) {
          meta[field.key] = field.value;
        }
      });

      // Prepare VML data
      const vmlData = {
        ...formData,
        data: vmlContent,
        meta: Object.keys(meta).length > 0 ? meta : undefined
      };

      // Create VML
      const result = await vmlsApi.createVML(vmlData);
      return result;
    } catch (err) {
      console.error('Error saving VML:', err);
      setError(err.message || t('vml.errors.saveFailedShort'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [vmlContent, metaFields, validateMetaFields, t]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setVMLContent('');
    setMetaFields([]);
    setError(null);
    setLoading(false);
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // VML types
    vmlTypes,
    loadingTypes,
    fetchVMLTypes,

    // VML content
    vmlContent,
    setVMLContent,

    // Meta properties
    metaFields,
    setMetaFields,
    addMetaField,
    removeMetaField,
    updateMetaField,
    validateMetaFields,

    // Template variables
    availableVariables,
    insertVariable,

    // General
    loading,
    error,
    clearError,
    saveVML,
    reset
  };
};

export default useVML;
