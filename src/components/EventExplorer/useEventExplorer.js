import { useCallback, useEffect, useState } from 'react';
import { getDuckdbEvents } from '../../services/duckdbEventsApi';

const EMPTY_FILTERS = { q: '', eventType: '', action: '', callId: '' };

export function useEventExplorer() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [filters, setFiltersState] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getDuckdbEvents({ page, perPage, ...filters });
      setRows(result.rows);
      setTotal(result.total);
      setDisabled(result.disabled);
      setError(null);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [page, perPage, filters]);

  useEffect(() => { void load(); }, [load]);

  const setFilters = (next) => {
    setPage(0);
    setFiltersState({ ...EMPTY_FILTERS, ...next });
  };

  return {
    rows, total, page, perPage, filters, loading, error, disabled,
    setPage,
    setPerPage: (value) => { setPage(0); setPerPage(value); },
    setFilters,
    refresh: load,
  };
}
