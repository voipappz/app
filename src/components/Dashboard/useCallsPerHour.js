import { useEffect, useState } from 'react';
import { EVENTS_API } from '../Calls/useCalls';
import { getToken } from '../../lib/auth';

/**
 * Calls-per-hour series from InfluxDB 3, via deno-api `/dashboard/calls-per-hour`
 * (the influxdb3 client runs server-side; the apiv3 token never reaches the
 * browser). Returns `points: [{ bucket, inbound, outbound, total }]` pre-bucketed
 * by InfluxDB (date_bin per hour). `points` is null while loading or when InfluxDB
 * is unavailable — callers fall back to client-side bucketing of PostgREST calls.
 */
export function useCallsPerHour({ minutes = 1440, env = [] } = {}) {
  const [points, setPoints] = useState(null);
  const [error, setError] = useState(null);

  const envKey = env.join(',');
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ minutes: String(minutes) });
    for (const e of env) if (e) params.append('env', e);
    const token = typeof getToken === 'function' ? getToken() : null;

    fetch(`${EVENTS_API}/dashboard/calls-per-hour?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (alive) { setPoints(Array.isArray(d.points) ? d.points : []); setError(null); }
      })
      .catch((e) => { if (alive) { setError(e?.message || 'failed'); setPoints(null); } });

    return () => { alive = false; };
  }, [minutes, envKey]);

  return { points, error };
}
