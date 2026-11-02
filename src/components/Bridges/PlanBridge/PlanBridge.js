import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { plansApi } from '../../../services/api/plansApi';

/**
 * Custom hook for PlanBridge component
 * Provides state management for plan creation/editing with items
 */
export const usePlanBridge = (open, plan = null, mode = 'create') => {
  const { t } = useTranslation('bridges');
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    enabled: true,
    period: 'month',
    interval: 1,
    notes: ''
  });

  // Items state - API requires: name, val
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', val: '' });
  const [editingItem, setEditingItem] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // Periods options
  const PERIODS = ['hour', 'day', 'week', 'month', 'year'];

  // Load items for a plan
  const loadItems = useCallback(async (planId) => {
    if (!planId) return;

    setItemsLoading(true);
    try {
      const response = await plansApi.getItems(planId);
      const itemsData = Array.isArray(response) ? response : (response?.data || []);
      setItems(itemsData);
    } catch (err) {
      console.error('Error loading plan items:', err);
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  // Initialize form data
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && plan) {
        // Edit mode - load plan data
        setFormData({
          name: plan.name || '',
          enabled: plan.enabled !== undefined ? plan.enabled : true,
          period: plan.period || 'month',
          interval: plan.interval || 1,
          notes: plan.notes || ''
        });

        // Load items for existing plan
        loadItems(plan.uuid || plan.id);
      } else {
        // Create mode - reset form
        setFormData({
          name: '',
          enabled: true,
          period: 'month',
          interval: 1,
          notes: ''
        });
        setItems([]);
      }
    }
  }, [open, plan, mode, loadItems]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFormData({
        name: '',
        enabled: true,
        period: 'month',
        interval: 1,
        notes: ''
      });
      setFormErrors({});
      setError(null);
      setItems([]);
      setEditingItem(null);
      setNewItem({ name: '', val: '' });
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
      errors.name = t('plan.errors.nameRequired');
    }

    if (!formData.period) {
      errors.period = t('plan.errors.periodRequired');
    }

    if (!formData.interval || formData.interval < 1) {
      errors.interval = t('plan.errors.intervalMin');
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, t]);

  // Add item (inline) - API requires name, val
  const handleAddItem = useCallback(() => {
    if (!newItem.name?.trim()) {
      setError(t('plan.errors.itemNameRequired'));
      return;
    }
    if (!newItem.val?.trim()) {
      setError(t('plan.errors.valueRequired'));
      return;
    }

    // Add to local state (will be saved when plan is created)
    const item = {
      id: `temp_${Date.now()}`,
      name: newItem.name,
      val: newItem.val
    };

    setItems(prev => [...prev, item]);
    setNewItem({ name: '', val: '' });
    setError(null);
  }, [newItem, t]);

  // Update item (inline)
  const handleUpdateItem = useCallback((itemId, updates) => {
    setItems(prev => prev.map(item =>
      (item.id === itemId || item.uuid === itemId)
        ? { ...item, ...updates }
        : item
    ));
    setEditingItem(null);
  }, []);

  // Delete item (inline)
  const handleDeleteItem = useCallback((itemId) => {
    setItems(prev => prev.filter(item =>
      item.id !== itemId && item.uuid !== itemId
    ));
  }, []);

  // Import items from CSV - API requires name, val
  const handleImportItems = useCallback((csvData) => {
    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      setError(t('plan.errors.noCsvData'));
      return;
    }

    // Map CSV rows to item objects
    const importedItems = csvData
      .filter(row => row.name || row.Name || row.item_name) // Filter empty rows
      .map((row, index) => ({
        id: `temp_import_${Date.now()}_${index}`,
        name: row.name || row.Name || row.item_name || '',
        val: row.val || row.Val || row.value || row.Value || row.key || row.Key || ''
      }));

    if (importedItems.length === 0) {
      setError(t('plan.errors.noValidItems'));
      return;
    }

    setItems(prev => [...prev, ...importedItems]);
    setError(null);
    return importedItems.length;
  }, [t]);

  // Clear all items
  const handleClearItems = useCallback(() => {
    setItems([]);
  }, []);

  // Create plan with items
  const createPlan = useCallback(async () => {
    if (!validateForm()) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Create plan
      const planData = {
        name: formData.name,
        enabled: formData.enabled,
        period: formData.period,
        interval: formData.interval,
        notes: formData.notes
      };

      const result = await plansApi.createPlan(planData);
      const createdPlan = result.data || result;
      const planId = createdPlan.uuid || createdPlan.id;

      // Set all items at once using the batch API (val = tariff uuid).
      if (items.length > 0) {
        const itemsToCreate = items.map(item => ({ name: item.name, val: item.val }));
        try {
          await plansApi.setItems(planId, itemsToCreate);
        } catch (itemsErr) {
          // Plan was created successfully, just items failed — return it anyway.
          console.warn('Could not save plan items:', itemsErr.message);
        }
      }

      return createdPlan;
    } catch (err) {
      console.error('Error creating plan:', err);
      setError(err.message || t('plan.errors.createFailed'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [formData, items, validateForm, t]);

  // Update plan with items
  const updatePlan = useCallback(async (planId) => {
    if (!validateForm()) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Update plan
      const planData = {
        name: formData.name,
        enabled: formData.enabled,
        period: formData.period,
        interval: formData.interval,
        notes: formData.notes
      };

      const result = await plansApi.updatePlan(planId, planData);
      const updatedPlan = result.data || result;

      // setItems REPLACES the plan's items, so send the FULL current list
      // (existing + newly added, minus removed) to reconcile.
      const allItems = items.map(item => ({ name: item.name, val: item.val }));
      try {
        await plansApi.setItems(planId, allItems);
      } catch (itemsErr) {
        console.warn('Could not save plan items:', itemsErr.message);
        // Plan was updated successfully, just items failed — return it anyway.
      }

      return updatedPlan;
    } catch (err) {
      console.error('Error updating plan:', err);
      setError(err.message || t('plan.errors.updateFailed'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [formData, items, validateForm, t]);

  return {
    // Form state
    formData,
    formErrors,
    handleChange,
    validateForm,

    // Periods
    PERIODS,

    // Items
    items,
    setItems,
    itemsLoading,
    newItem,
    setNewItem,
    editingItem,
    setEditingItem,
    handleAddItem,
    handleUpdateItem,
    handleDeleteItem,
    handleImportItems,
    handleClearItems,

    // Actions
    createPlan,
    updatePlan,

    // UI state
    loading,
    error,
    setError
  };
};

export default usePlanBridge;
