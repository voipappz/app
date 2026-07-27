// Hook for PostgrestTable — server-side paging + sorting over one PostgREST
// table/view, via the optional /rest/v1 plane (lib/clients/postgrest).
import { useEffect, useState } from 'react';
import { pgrstList } from '../../lib/clients/postgrest';

export function usePostgrestTable(table, { perPage: initialPerPage = 20, select = '*', order: initialOrder = '' } = {}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(initialPerPage);
  const [order, setOrder] = useState(initialOrder);   // "col.asc" | "col.desc" | ""
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const p = new URLSearchParams({ select, limit: String(perPage), offset: String(page * perPage) });
    if (order) p.set('order', order);
    pgrstList(`/${table}?${p}`)
      .then(({ rows, total }) => { if (alive) { setRows(rows); setTotal(total); setError(null); } })
      .catch((err) => { if (alive) { setRows([]); setTotal(0); setError(err); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [table, select, page, perPage, order]);

  return { rows, total, page, setPage, perPage, setPerPage, order, setOrder, loading, error };
}
