import { useCallback, useEffect, useState } from 'react';
import {
  createDashboard, createWidget, deleteDashboard, deleteWidget, getDashboards,
  getWidgets, renameDashboard, updateWidget,
} from '../../services/dashboardsApi';

/**
 * useDashboardBuilder — load + mutate the LOCAL widget definitions (deno-api →
 * DuckDB). Lazy on `open`; mutations refetch the list (the store is the source
 * of truth — no optimistic state to drift). `onChange` lets the dashboard
 * re-read definitions after any successful mutation.
 */
export function useDashboardBuilder(open, onChange, selectedDashboardId = 'default', onSelectDashboard) {
  const [dashboards, setDashboards] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const refreshDashboards = useCallback(async () => {
    const next = await getDashboards();
    setDashboards(next);
    if (next.length && !next.some((dashboard) => dashboard.uuid === selectedDashboardId)) {
      onSelectDashboard?.(next[0].uuid);
    }
    return next;
  }, [onSelectDashboard, selectedDashboardId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [, nextWidgets] = await Promise.all([
        refreshDashboards(), getWidgets(selectedDashboardId),
      ]);
      setWidgets(nextWidgets);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [refreshDashboards, selectedDashboardId]);

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

  const addWidget = useCallback(
    (widget) => mutate(() => createWidget(widget, selectedDashboardId)),
    [mutate, selectedDashboardId],
  );
  const saveWidget = useCallback(
    (uuid, patch) => mutate(() => updateWidget(uuid, patch, selectedDashboardId)),
    [mutate, selectedDashboardId],
  );
  const removeWidget = useCallback((uuid) => mutate(() => deleteWidget(uuid)), [mutate]);

  // Import: create the drafts in order (the store assigns uuids). One refetch
  // at the end via `mutate`, so the drawer doesn't flicker per widget.
  const importWidgets = useCallback((drafts) => mutate(async () => {
    for (const draft of drafts) await createWidget(draft, selectedDashboardId);
  }), [mutate, selectedDashboardId]);

  const addDashboard = useCallback(async (name) => {
    setSaving(true);
    try {
      const created = await createDashboard(name);
      await refreshDashboards();
      onSelectDashboard?.(created.uuid);
      setError(null);
      return created;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setSaving(false);
    }
  }, [onSelectDashboard, refreshDashboards]);

  const saveDashboardName = useCallback(async (uuid, name) => {
    setSaving(true);
    try {
      await renameDashboard(uuid, name);
      await refreshDashboards();
      setError(null);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setSaving(false);
    }
  }, [refreshDashboards]);

  const removeDashboard = useCallback(async (uuid) => {
    setSaving(true);
    try {
      await deleteDashboard(uuid);
      const next = await refreshDashboards();
      onSelectDashboard?.(next[0]?.uuid || 'default');
      onChange?.();
      setError(null);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setSaving(false);
    }
  }, [onChange, onSelectDashboard, refreshDashboards]);

  return {
    dashboards, widgets, loading, saving, error,
    addDashboard, saveDashboardName, removeDashboard,
    addWidget, saveWidget, removeWidget, importWidgets, refresh,
  };
}
