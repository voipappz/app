import { useCallback, useEffect, useRef, useState } from 'react';
import { monitoringApi } from '../../services/api/monitoringApi';
import { cdrQueryReady, hasScope, scopeParams } from './cdrReport';

// Runs a CDR report through the API for the top bar's scope. `runKey` re-runs
// on demand, refreshInterval > 0 polls, `minutes` overrides the query's own
// window. Only the newest request may land.
export function useCdrReport(query, { scope = {}, runKey = 0, refreshInterval = 0, minutes: override, enabled = true } = {}) {
  const [state, setState] = useState({ rows: [], labels: {}, sql: '', loading: false, error: null, tookMs: null });
  const seq = useRef(0);
  const key = JSON.stringify({
    measures: query?.measures, dimensions: query?.dimensions, bucket: query?.bucket, where: query?.where,
    order: query?.order, limit: query?.limit, minutes: override || query?.minutes, scope: scopeParams(scope),
  });
  const ready = enabled && cdrQueryReady(query) && hasScope(scope);
  const run = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    const started = performance.now();
    const q = JSON.parse(key);
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await monitoringApi.runCdrReport({
        measures: q.measures, dimensions: q.dimensions || [], bucket: q.bucket || '', minutes: q.minutes || 1440,
        where: q.where || {}, order: q.order || '', limit: q.limit || 100, ...q.scope,
      });
      if (mine !== seq.current) return;
      setState({
        rows: Array.isArray(res?.rows) ? res.rows : [], labels: res?.labels || {}, sql: res?.sql || '',
        loading: false, error: null, tookMs: Math.round(performance.now() - started),
      });
    } catch (err) {
      if (mine !== seq.current) return;
      setState((s) => ({ ...s, rows: [], loading: false, error: err?.message || 'The report failed.' }));
    }
  }, [ready, key]);
  useEffect(() => {
    run();
    const timer = refreshInterval > 0 ? setInterval(run, refreshInterval) : null;
    return () => { if (timer) clearInterval(timer); };
  }, [run, runKey, refreshInterval]);
  return { ...state, hasScope: hasScope(scope) };
}

export default useCdrReport;
