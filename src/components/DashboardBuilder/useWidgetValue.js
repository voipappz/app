import { useEffect, useState } from 'react';
import { monitoringApi } from '../../services/api/monitoringApi';

// A request belongs to one effect, so old responses cannot replace a new metric.
export function useWidgetValue(widget, { refreshInterval = 30_000, refreshKey = 0, minutes: windowMinutes } = {}) {
  const { measurement, field, aggregation, minutes } = widget || {};
  const [state, setState] = useState({ value: null, series: [], loading: true, error: null, updatedAt: null });
  useEffect(() => {
    let active = true;
    let pending = false;
    setState({ value: null, series: [], loading: Boolean(measurement && field), error: null, updatedAt: null });
    const load = async () => {
      if (!measurement || !field || pending) return;
      pending = true;
      try {
        const result = await monitoringApi.runInfluxQuery({ measurement, field, aggregation: aggregation || 'mean', minutes: windowMinutes || minutes || 60 });
        if (!active) return;
        const series = Array.isArray(result?.rows) ? result.rows : [];
        const last = series[series.length - 1]?.value;
        const numbers = series.map((row) => row.value).filter((value) => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite);
        const value = numbers.length && ['count', 'sum'].includes(aggregation)
          ? numbers.reduce((total, number) => total + number, 0)
          : numbers.length && aggregation === 'max' ? Math.max(...numbers)
          : numbers.length && aggregation === 'min' ? Math.min(...numbers)
          : last === null || last === undefined || last === '' ? null : Number(last);
        setState({ series, value: Number.isFinite(value) ? value : null, loading: false,
          error: result?.unavailable ? 'This measurement is unavailable.' : null, updatedAt: Date.now(), influxql: result?.influxql });
      } catch (err) {
        if (active) setState((previous) => ({ ...previous, loading: false, error: err?.message || 'Query failed' }));
      } finally { pending = false; }
    };
    load();
    const timer = refreshInterval > 0 ? setInterval(load, refreshInterval) : null;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [measurement, field, aggregation, minutes, windowMinutes, refreshInterval, refreshKey]);
  return state;
}

export default useWidgetValue;
