import { useEffect, useState } from 'react';
import { EVENTS_API } from '../Calls/useCalls';
import { getToken } from '../../lib/auth';

const EMPTY = {
  stats: { total: 0, answered: 0, failed: 0, inbound: 0, outbound: 0, avg_duration_sec: 0 },
  calls_per_hour: [],
  recent_calls: [],
};

/** Dashboard-only DuckDB projection. Calls and Reports never use this hook. */
export function useDashboardSnapshot({ from, to }) {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const fromEpoch = Math.floor(from.getTime() / 1000);
  const toEpoch = Math.floor(to.getTime() / 1000);

  useEffect(() => {
    let alive = true;
    let timer;
    const load = async () => {
      try {
        const token = typeof getToken === 'function' ? getToken() : null;
        const params = new URLSearchParams({ from: String(fromEpoch), to: String(toEpoch) });
        const response = await fetch(`${EVENTS_API}/dashboard/snapshot?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (alive) { setSnapshot(body); setStatus('live'); setError(null); }
      } catch (reason) {
        if (alive) { setStatus('error'); setError(reason?.message || 'failed'); }
      }
    };
    load();
    timer = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(timer); };
  }, [fromEpoch, toEpoch]);

  return { snapshot, status, error };
}
