import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { tariffsApi } from '../../../services/api/tariffsApi';

/**
 * Custom hook for TariffBridge component
 * Provides state management for tariff creation/editing with rates
 */
export const useTariffBridge = (open, tariff = null, mode = 'create') => {
  const { t } = useTranslation('bridges');
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    enabled: true,
    notes: '',
    scheme: 'flat'
  });

  // Metadata state
  const [schemes, setSchemes] = useState([]);
  const [schemesLoading, setSchemesLoading] = useState(false);

  // Rates state
  const [rates, setRates] = useState([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [editingRate, setEditingRate] = useState(null);
  const [newRate, setNewRate] = useState({ name: '', price: '', val: '' });

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // The scheme vocabulary. There is NO schemes endpoint: `action=schemes` is
  // not a recognised action on /api/tariffs (only types, rates and rate are),
  // so the request fell through to the ordinary list and answered with tariff
  // RECORDS. Normalizing those with `s.scheme` produced one dropdown entry per
  // existing tariff — duplicated, and missing any scheme not currently in use.
  const DEFAULT_SCHEMES = ['flat', 'tiered', 'usage', 'prepaid', 'postpaid'];

  // Offer the known vocabulary plus whatever this tariff already uses, so a
  // value the list doesn't know about (production data has `volume`) still
  // shows instead of silently resetting the field.
  const loadSchemes = useCallback((currentScheme) => {
    const merged = [...DEFAULT_SCHEMES];
    if (currentScheme && !merged.includes(currentScheme)) merged.push(currentScheme);
    setSchemes(merged);
    setSchemesLoading(false);
  }, []);

  // Load rates for a tariff
  const loadRates = useCallback(async (tariffId) => {
    if (!tariffId) return;

    setRatesLoading(true);
    try {
      const response = await tariffsApi.getRates(tariffId);
      const ratesData = Array.isArray(response) ? response : (response?.data || []);
      setRates(ratesData);
    } catch (err) {
      console.error('Error loading tariff rates:', err);
      setRates([]);
    } finally {
      setRatesLoading(false);
    }
  }, []);

  // Initialize form data
  useEffect(() => {
    if (open) {
      // Pass the tariff's own scheme so an unrecognised value stays selectable
      // instead of the Select falling back and silently changing it on save.
      loadSchemes(mode === 'edit' ? tariff?.scheme : null);

      if (mode === 'edit' && tariff) {
        // Edit mode - load tariff data
        setFormData({
          name: tariff.name || '',
          enabled: tariff.enabled !== undefined ? tariff.enabled : true,
          notes: tariff.notes || '',
          scheme: tariff.scheme || 'flat'
        });

        // Load rates for existing tariff
        loadRates(tariff.uuid || tariff.id);
      } else {
        // Create mode - reset form
        setFormData({
          name: '',
          enabled: true,
          notes: '',
          scheme: 'flat'
        });
        setRates([]);
      }
    }
  }, [open, tariff, mode, loadSchemes, loadRates]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFormData({
        name: '',
        enabled: true,
        notes: '',
        scheme: 'flat'
      });
      setFormErrors({});
      setError(null);
      setRates([]);
      setEditingRate(null);
      setNewRate({ name: '', price: '', val: '' });
    }
  }, [open]);

  // Handle form field change
  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: null }));
    }
  }, [formErrors]);

  // Validate form
  const validateForm = useCallback(() => {
    const errors = {};

    if (!formData.name?.trim()) {
      errors.name = t('tariff.errors.nameRequired');
    }

    if (!formData.scheme) {
      errors.scheme = t('tariff.errors.schemeRequired');
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, t]);

  // Add rate (inline)
  const handleAddRate = useCallback(() => {
    if (!newRate.name?.trim()) {
      setError(t('tariff.errors.rateNameRequired'));
      return;
    }

    // Add to local state (will be saved when tariff is created)
    const rate = {
      id: `temp_${Date.now()}`,
      name: newRate.name,
      price: newRate.price || '0',
      val: newRate.val || ''
    };

    setRates(prev => [...prev, rate]);
    setNewRate({ name: '', price: '', val: '' });
    setError(null);
  }, [newRate, t]);

  // Update rate (inline)
  const handleUpdateRate = useCallback((rateId, updates) => {
    setRates(prev => prev.map(rate =>
      (rate.id === rateId || rate.uuid === rateId)
        ? { ...rate, ...updates }
        : rate
    ));
    setEditingRate(null);
  }, []);

  // Delete rate (inline)
  const handleDeleteRate = useCallback((rateId) => {
    setRates(prev => prev.filter(rate =>
      rate.id !== rateId && rate.uuid !== rateId
    ));
  }, []);

  // Import rates from CSV
  const handleImportRates = useCallback((csvData) => {
    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      setError(t('tariff.errors.noCsvData'));
      return;
    }

    // Map CSV rows to rate objects
    const importedRates = csvData
      .filter(row => row.name || row.Name || row.rate_name) // Filter empty rows
      .map((row, index) => ({
        id: `temp_import_${Date.now()}_${index}`,
        name: row.name || row.Name || row.rate_name || '',
        price: row.price || row.Price || row.rate || row.Rate || '0',
        val: row.val || row.Val || row.value || row.Value || row.destination || row.Destination || ''
      }));

    if (importedRates.length === 0) {
      setError(t('tariff.errors.noValidRates'));
      return;
    }

    setRates(prev => [...prev, ...importedRates]);
    setError(null);
    return importedRates.length;
  }, [t]);

  // Clear all rates
  const handleClearRates = useCallback(() => {
    setRates([]);
  }, []);

  // Create tariff with rates
  const createTariff = useCallback(async () => {
    if (!validateForm()) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Create tariff
      const tariffData = {
        name: formData.name,
        enabled: formData.enabled,
        notes: formData.notes,
        scheme: formData.scheme
      };

      const result = await tariffsApi.createTariff(tariffData);
      const createdTariff = result.data || result;
      const tariffId = createdTariff.uuid || createdTariff.id;

      // Set all rates at once using the batch API
      if (rates.length > 0) {
        const ratesToCreate = rates
          .filter(rate => rate.id?.startsWith('temp_'))
          .map(rate => ({
            name: rate.name,
            price: rate.price,
            val: rate.val
          }));

        if (ratesToCreate.length > 0) {
          await tariffsApi.setRates(tariffId, ratesToCreate);
        }
      }

      return createdTariff;
    } catch (err) {
      console.error('Error creating tariff:', err);
      setError(err.message || t('tariff.errors.createFailed'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [formData, rates, validateForm, t]);

  // Update tariff with rates
  const updateTariff = useCallback(async (tariffId) => {
    if (!validateForm()) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Update tariff
      const tariffData = {
        name: formData.name,
        enabled: formData.enabled,
        notes: formData.notes,
        scheme: formData.scheme
      };

      const result = await tariffsApi.updateTariff(tariffId, tariffData);
      const updatedTariff = result.data || result;

      // Handle rates:
      // - For new rates (temp_ prefix), add to batch
      // - For existing rates that were modified, update individually
      const newRates = rates
        .filter(rate => rate.id?.startsWith('temp_'))
        .map(rate => ({
          name: rate.name,
          price: rate.price,
          val: rate.val
        }));

      // Batch add new rates
      if (newRates.length > 0) {
        await tariffsApi.setRates(tariffId, newRates);
      }

      // Update existing modified rates individually
      for (const rate of rates) {
        if (rate.uuid && rate._modified) {
          await tariffsApi.updateRate(rate.uuid, {
            name: rate.name,
            price: rate.price,
            val: rate.val
          });
        }
      }

      return updatedTariff;
    } catch (err) {
      console.error('Error updating tariff:', err);
      setError(err.message || t('tariff.errors.updateFailed'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [formData, rates, validateForm, t]);

  return {
    // Form state
    formData,
    formErrors,
    handleChange,
    validateForm,

    // Metadata
    schemes,
    schemesLoading,

    // Rates
    rates,
    setRates,
    ratesLoading,
    newRate,
    setNewRate,
    editingRate,
    setEditingRate,
    handleAddRate,
    handleUpdateRate,
    handleDeleteRate,
    handleImportRates,
    handleClearRates,

    // Actions
    createTariff,
    updateTariff,

    // UI state
    loading,
    error,
    setError
  };
};

export default useTariffBridge;
