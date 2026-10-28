import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ivrApi } from '../../../services/api/ivrApi';
import { bridgeApi } from '../../../services/api/bridgeApi';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  destinationChoices, fromIvr, itemLabel, menuHints, sortOptions, toIvrPayload, validateMenu,
} from './ivrMenuModel';

/**
 * The phone menu being edited: loads it (editing), holds the changes, and
 * saves it. What is missing shows only once a save was tried.
 *
 * status: 'loading' | 'ready' | 'loadError'
 */
export function useIvrMenu({ ivr, mode, environmentUuid, onSave }) {
  const uuid = mode === 'edit' ? ivr?.uuid : undefined;
  const [menu, setMenu] = useState(() => fromIvr(uuid ? ivr : null));
  const [status, setStatus] = useState(uuid ? 'loading' : 'ready');
  const [ownEnvironment, setOwnEnvironment] = useState(ivr?.environment_uuid);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  // null: no failed save. Otherwise the server's message, maybe ''.
  const [saveError, setSaveError] = useState(null);

  // The route's list holds only part of a menu: read the whole of it.
  useEffect(() => {
    if (!uuid) return undefined;
    let current = true;
    ivrApi.getIVR(uuid)
      .then((response) => {
        if (!current) return;
        const loaded = response?.data || response;
        setMenu(fromIvr(loaded));
        setOwnEnvironment(loaded?.environment_uuid);
        setStatus('ready');
      })
      .catch(() => { if (current) setStatus('loadError'); });
    return () => { current = false; };
  }, [uuid]);

  const change = useCallback((patch) => setMenu((m) => ({ ...m, ...patch })), []);

  // Adds the option, or replaces the one with its key.
  const putOption = useCallback((option) => setMenu((m) => ({
    ...m, options: sortOptions([...m.options.filter((o) => o.key !== option.key), option]),
  })), []);

  const removeOption = useCallback((key) => setMenu((m) => ({
    ...m, options: m.options.filter((o) => o.key !== key),
  })), []);

  // Changes part of `noKey` or `wrongKey`, on the menu as it is then.
  const setFallback = useCallback((which, patch) => setMenu((m) => ({
    ...m, [which]: { ...m[which], ...patch },
  })), []);

  const menuEnvironment = ownEnvironment || environmentUuid;

  const save = async () => {
    setSubmitted(true);
    if (Object.keys(validateMenu(menu)).length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = toIvrPayload(menu, menuEnvironment);
      const result = uuid ? await ivrApi.updateIVR(uuid, payload) : await ivrApi.createIVR(payload);
      onSave(result?.data || result);
    } catch (error) {
      setSaveError(error?.message || '');
    } finally {
      setSaving(false);
    }
  };

  return {
    menu,
    status,
    errors: submitted ? validateMenu(menu) : {},
    hints: menuHints(menu),
    saving,
    saveError,
    environmentUuid: menuEnvironment,
    change,
    putOption,
    removeOption,
    setFallback,
    save,
  };
}

// status: 'loading' | 'done'. bridgeApi answers [] on a failure.
const NOT_LOADED = { status: 'loading', items: [] };

/**
 * The environment's places of each destination type (queues, devices,
 * menus…), loaded on first use and kept. `load(type, { again: true })`
 * reloads one type after something new was made in it.
 */
export function useBridgeResources(environmentUuid) {
  const [byType, setByType] = useState({});
  const asked = useRef(new Set());

  const load = useCallback(async (type, { again = false } = {}) => {
    if (!type || (asked.current.has(type) && !again)) return;
    asked.current.add(type);
    setByType((prev) => ({ ...prev, [type]: prev[type] && again ? prev[type] : NOT_LOADED }));
    const items = await bridgeApi.getBridgeResources(type, environmentUuid);
    setByType((prev) => ({ ...prev, [type]: { status: 'done', items: Array.isArray(items) ? items : [] } }));
  }, [environmentUuid]);

  const resource = useCallback((type) => byType[type] || NOT_LOADED, [byType]);

  const nameOf = useCallback((type, uuid) => {
    const item = (byType[type]?.items || []).find((i) => i.uuid === uuid);
    return itemLabel(item);
  }, [byType]);

  return { resource, load, nameOf };
}

/**
 * Where this person can send callers: the server's bridge types for their
 * role, as picker choices. null until the server answers.
 */
export function useDestinationChoices() {
  const { canWriteDestinations } = usePermissions();
  const [offered, setOffered] = useState(null);

  useEffect(() => {
    let current = true;
    bridgeApi.getBridgeTypes().then((types) => { if (current) setOffered(Array.isArray(types) ? types : []); });
    return () => { current = false; };
  }, []);

  return useMemo(() => (offered ? destinationChoices(offered, canWriteDestinations) : null), [offered, canWriteDestinations]);
}
