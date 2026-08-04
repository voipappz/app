// useRecentCalls — the last few calls from the MOTHERSHIP (/api/calls via
// services/callsApi), for the phone dock's Calls tab.
//
// LAZY ON PURPOSE. The fetch runs the first time `active` is true — i.e. when
// the user opens the dock on the Calls tab — never on mount. Everything under
// `apiList` drops the session on a 401, so a background enrichment request
// firing at boot can sign the user out; we've been bitten by that once already.
//
// Not the deno /dashboard/snapshot cache: that projection is fed by a cable tap
// that isn't configured, so it answers zeros.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCalls } from '../../services/callsApi';

export const RECENT_CALLS_LIMIT = 10;

export function useRecentCalls(active, limit = RECENT_CALLS_LIMIT) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestedRef = useRef(false);   // "we have already asked once"
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { rows } = await getCalls({ page: 1, perPage: limit, orderBy: 'created_at', orderType: 'desc' });
      if (aliveRef.current) setCalls((Array.isArray(rows) ? rows : []).slice(0, limit));
    } catch (err) {
      // A failed list is a quiet empty state in a 300px dock, not a page error.
      if (aliveRef.current) setError(err?.message || 'error');
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [limit]);

  /** Explicit refresh — the only way to re-ask after the first load. */
  const reload = useCallback(() => {
    requestedRef.current = true;
    return load();
  }, [load]);

  useEffect(() => {
    if (!active || requestedRef.current) return;
    requestedRef.current = true;
    void load();
  }, [active, load]);

  return { calls, loading, error, reload };
}

export default useRecentCalls;
