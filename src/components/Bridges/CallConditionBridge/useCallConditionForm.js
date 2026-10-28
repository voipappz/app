import { useCallback, useEffect, useRef, useState } from 'react';
import { bridgeApi } from '../../../services/api/bridgeApi';
import { createCallCondition, getCallCondition, updateCallCondition } from '../../../services/api/callConditionsApi';
import { createSegment, deleteSegment } from '../../../services/api/segmentsApi';
import { conditionToForm, emptyForm, formToRules, RULE_TARGET_TYPES, savedSegmentIndex, segmentKey } from './callConditionSchedule';

const unwrap = (response) => (response?.data?.uuid ? response.data : response);
const sameType = (type) => (type === 'que' ? 'queue' : type);

/**
 * The page's state: the form, and the condition as the API last returned it.
 * Editing always starts from the full condition (a list row has no rules).
 */
export function useCallConditionForm({ open, mode, callCondition }) {
  const [form, setForm] = useState(emptyForm);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const uuid = mode === 'edit' ? callCondition?.uuid : null;

  useEffect(() => {
    if (!open) return undefined;
    setLoadFailed(false);
    if (!uuid) {
      setSaved(null);
      setForm(emptyForm());
      return undefined;
    }
    let live = true;
    setLoading(true);
    getCallCondition(uuid)
      .then((response) => {
        if (!live) return;
        const condition = unwrap(response);
        setSaved(condition);
        setForm(conditionToForm(condition));
      })
      .catch(() => { if (live) setLoadFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, uuid]);

  return { form, setForm, saved, setSaved, loading, loadFailed };
}

/**
 * Saves the form. Segments are created only now, on Save -- never while
 * typing -- and a condition that is unchanged is sent back by its saved uuid.
 * The API deletes the segments no rule uses any more. The one thing this page
 * deletes is what this save created, when the save then fails: no rule names
 * those segments, and the API never will. Returns the condition as the API
 * holds it after saving.
 */
export async function saveCallCondition({ form, saved, environmentUuid }) {
  const created = [];
  try {
    return await saveRules({ form, saved, environmentUuid, created });
  } catch (err) {
    await Promise.all(created.map((uuid) => deleteSegment(uuid).catch(() => {})));
    throw err;
  }
}

async function saveRules({ form, saved, environmentUuid, created }) {
  const known = savedSegmentIndex(saved);
  const resources = [];
  for (const rule of formToRules(form)) {
    let segmentUuids = rule.segment_uuids;
    if (!segmentUuids) {
      segmentUuids = [];
      for (const segment of rule.segments) {
        const key = segmentKey(segment);
        if (!known.has(key)) {
          const segmentRow = unwrap(await createSegment({ name: `${form.name}_${rule.name}`, ...segment }));
          created.push(segmentRow.uuid);
          known.set(key, segmentRow.uuid);
        }
        segmentUuids.push(known.get(key));
      }
    }
    resources.push({
      name: rule.name,
      bridge_type: rule.bridge_type,
      bridge_uuid: rule.bridge_uuid,
      segment_uuids: segmentUuids,
    });
  }

  const payload = {
    name: form.name,
    notes: form.notes,
    // Routing never reads it; the page has no switch for it.
    enabled: true,
    fallback_bridge_type: form.otherwise.type,
    fallback_bridge_uuid: form.otherwise.uuid,
    resources,
    ...(environmentUuid ? { environment_uuid: environmentUuid } : {}),
  };
  const result = unwrap(saved?.uuid
    ? await updateCallCondition(saved.uuid, payload)
    : await createCallCondition(payload));
  // Read it back: what the API kept is what the page shows next.
  const uuid = result?.uuid || saved?.uuid;
  return uuid ? unwrap(await getCallCondition(uuid)) : result;
}

/**
 * Where calls can go: the types this session may use, and each type's list
 * (fetched once per type). The fallback offers every type the API lists for
 * this session; a rule only those a rule accepts.
 */
export function useDestinations(environmentUuid) {
  const [types, setTypes] = useState([]);
  const [lists, setLists] = useState({});

  useEffect(() => {
    let live = true;
    bridgeApi.getBridgeTypes().then((list) => {
      if (live) setTypes([...new Set((list || []).map(sameType))]);
    });
    return () => { live = false; };
  }, []);

  // Types already asked for, so each list is fetched once (force refetches,
  // e.g. after creating a new destination).
  const requested = useRef(new Set());
  useEffect(() => { requested.current = new Set(); setLists({}); }, [environmentUuid]);

  const load = useCallback(async (type, force = false) => {
    if (!type || !environmentUuid) return;
    if (!force && requested.current.has(type)) return;
    requested.current.add(type);
    const list = await bridgeApi.getBridgeResources(type, environmentUuid).catch(() => []);
    setLists((prev) => ({ ...prev, [type]: Array.isArray(list) ? list : [] }));
  }, [environmentUuid]);

  const nameOf = useCallback((target) => {
    if (!target?.type) return '';
    if (target.label) return target.label;
    const found = (lists[target.type] || []).find((item) => item.uuid === target.uuid);
    return found ? (found.name || found.number || '') : '';
  }, [lists]);

  return {
    fallbackTypes: types,
    ruleTypes: types.filter((type) => RULE_TARGET_TYPES.includes(type)),
    lists,
    load,
    nameOf,
  };
}
