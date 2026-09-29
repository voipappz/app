import { useEffect, useState } from 'react';
import { monitoringApi } from '../../services/api/monitoringApi';
import { bucketFor } from './callsWidgets';
import { hasScope as scopeGiven, scopeParams } from './cdrReport';

// The calls widgets' CDR tag → the CDR report's dimension of the same field.
const DIMENSION = { direction: 'direction', disposition: 'status', type: 'type', hangup_disposition: 'hangup' };

// Calls in a window, split by a CDR tag, for the selected scope — read from
// the CDR report (InfluxDB `cdr`, via the API), so these widgets count the
// same calls as the query editor. A customer covers all of its applications,
// an application narrows to itself, and a root admin with neither sees every
// customer (`fleet`). Rows come back as [{ time, <group>: calls }].
export function useCallsVolume({ minutes = 1440, groupBy = 'direction', scope = {}, refreshKey = 0, refreshInterval = 30_000, enabled = true }) {
  const hasScope = scopeGiven(scope);
  const scopeKey = JSON.stringify(scopeParams(scope));
  const [state, setState] = useState({ rows: [], loading: enabled && hasScope, error: false });
  useEffect(() => {
    if (!enabled || !hasScope) { setState({ rows: [], loading: false, error: false }); return undefined; }
    let active = true;
    const { bucket } = bucketFor(minutes);
    const dimension = DIMENSION[groupBy] || 'direction';
    const load = async () => {
      try {
        const res = await monitoringApi.runCdrReport({
          measures: ['calls'], dimensions: [dimension], bucket, minutes, limit: 50, ...JSON.parse(scopeKey),
        });
        const byTime = new Map();
        (res?.rows || []).forEach((row) => {
          const entry = byTime.get(row.time) || { time: row.time };
          const key = String(row[dimension] ?? 'unknown');
          entry[key] = (entry[key] || 0) + (Number(row.calls) || 0);
          byTime.set(row.time, entry);
        });
        const rows = [...byTime.values()].sort((a, b) => String(a.time).localeCompare(String(b.time)));
        if (active) setState({ rows, loading: false, error: false });
      } catch {
        if (active) setState({ rows: [], loading: false, error: true });
      }
    };
    setState((previous) => ({ ...previous, loading: true }));
    load();
    const timer = refreshInterval > 0 ? setInterval(load, refreshInterval) : null;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [enabled, hasScope, scopeKey, minutes, groupBy, refreshKey, refreshInterval]);
  return { ...state, hasScope };
}

export default useCallsVolume;
