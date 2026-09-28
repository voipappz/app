import { useEffect, useState } from 'react';
import { monitoringApi } from '../../services/api/monitoringApi';
import { bucketFor } from './callsWidgets';

// Calls in a window, split by a CDR tag, for the selected scope. A customer
// covers all of its applications (no environment), an application narrows to
// itself, and a root admin with neither sees every customer (`fleet`).
export function useCallsVolume({ minutes = 1440, groupBy = 'direction', scope = {}, refreshKey = 0, refreshInterval = 30_000, enabled = true }) {
  const { customerUuid = null, environmentUuid = null, fleet = false } = scope;
  const hasScope = Boolean(fleet || customerUuid || environmentUuid);
  const [state, setState] = useState({ rows: [], loading: enabled && hasScope, error: false });
  useEffect(() => {
    if (!enabled || !hasScope) { setState({ rows: [], loading: false, error: false }); return undefined; }
    let active = true;
    const { bucket } = bucketFor(minutes);
    const load = async () => {
      try {
        const rows = await monitoringApi.getCallsVolumeChart(customerUuid ? null : environmentUuid, minutes, bucket, customerUuid, groupBy);
        if (active) setState({ rows: Array.isArray(rows) ? rows : [], loading: false, error: false });
      } catch {
        if (active) setState({ rows: [], loading: false, error: true });
      }
    };
    setState((previous) => ({ ...previous, loading: true }));
    load();
    const timer = refreshInterval > 0 ? setInterval(load, refreshInterval) : null;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [enabled, hasScope, customerUuid, environmentUuid, minutes, groupBy, refreshKey, refreshInterval]);
  return { ...state, hasScope };
}

export default useCallsVolume;
