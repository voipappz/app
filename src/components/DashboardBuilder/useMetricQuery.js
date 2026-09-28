import { useCallback, useEffect, useRef, useState } from 'react';
import { monitoringApi } from '../../services/api/monitoringApi';
import { queryReady } from './metricQuery';

// Runs a builder query through the API. `runKey` re-runs on demand; a
// refreshInterval > 0 polls. Only the newest request may land.
export function useMetricQuery(query, { runKey = 0, refreshInterval = 0, minutes: override, environmentUuid = '', enabled = true } = {}) {
  const [state, setState] = useState({ rows: [], influxql: '', loading: false, error: null, tookMs: null });
  const seq = useRef(0);
  const { measurement, field, aggregation, minutes, where, splitBy } = query || {};
  const whereKey = JSON.stringify(where || {});
  const ready = enabled && queryReady(query);
  const run = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    const started = performance.now();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await monitoringApi.runInfluxQuery({
        measurement, field, aggregation: aggregation || 'mean', minutes: override || minutes || 60,
        where: JSON.parse(whereKey), groupBy: splitBy || '', environmentUuid,
      });
      if (mine !== seq.current) return;
      setState({
        rows: Array.isArray(res?.rows) ? res.rows : [], influxql: res?.influxql || '', loading: false,
        error: res?.unavailable ? 'This measurement has no data here.' : null, tookMs: Math.round(performance.now() - started),
      });
    } catch (err) {
      if (mine !== seq.current) return;
      setState((s) => ({ ...s, loading: false, error: err?.message || 'The query failed.' }));
    }
  }, [ready, measurement, field, aggregation, minutes, override, whereKey, splitBy, environmentUuid]);
  useEffect(() => {
    run();
    const timer = refreshInterval > 0 ? setInterval(run, refreshInterval) : null;
    return () => { if (timer) clearInterval(timer); };
  }, [run, runKey, refreshInterval]);
  return state;
}

export default useMetricQuery;
