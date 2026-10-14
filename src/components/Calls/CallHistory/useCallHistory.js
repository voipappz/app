import { useEffect, useState } from 'react';
import { callsApi } from '../../../services/api/callsApi';

// status: 'loading' | 'done' | 'error'
const LOADING = { status: 'loading', calls: [] };

/**
 * The other calls with this call's number, as the server picks them. Opening
 * another call reloads; an answer for a call no longer shown is dropped.
 */
export function useCallHistory(uuid) {
  const [history, setHistory] = useState(LOADING);

  useEffect(() => {
    if (!uuid) return undefined;
    let current = true;
    setHistory(LOADING);
    callsApi.getCallHistory(uuid)
      .then((calls) => { if (current) setHistory({ status: 'done', calls: calls.filter((c) => c.uuid !== uuid) }); })
      .catch(() => { if (current) setHistory({ status: 'error', calls: [] }); });
    return () => { current = false; };
  }, [uuid]);

  return history;
}
