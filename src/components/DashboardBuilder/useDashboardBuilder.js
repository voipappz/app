import { useCallback, useEffect, useState } from 'react';
import { getWidgets, createWidget, updateWidget, deleteWidget } from '../../services/dashboardsApi';

/**
 * useDashboardBuilder — load + mutate the LOCAL widget definitions (deno-api →
 * DuckDB). Lazy on `open`; mutations refetch the list (the store is the source
 * of truth — no optimistic state to drift). `onChange` lets the dashboard
 * re-read definitions after any successful mutation.
 */
export function useDashboardBuilder(open, onChange) {
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setWidgets(await getWidgets());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const mutate = useCallback(async (action) => {
    setSaving(true);
    try {
      await action();
      await refresh();
      onChange?.();
      setError(null);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setSaving(false);
    }
  }, [refresh, onChange]);

  const addWidget = useCallback((widget) => mutate(() => createWidget(widget)), [mutate]);
  const saveWidget = useCallback((uuid, patch) => mutate(() => updateWidget(uuid, patch)), [mutate]);
  const removeWidget = useCallback((uuid) => mutate(() => deleteWidget(uuid)), [mutate]);

  return { widgets, loading, saving, error, addWidget, saveWidget, removeWidget };
}
