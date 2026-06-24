import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MOCK_CALLS } from './mock-data';
import { getStoredMockTranscript } from './conversation-mocks';
import { pgGet } from '../../lib/postgrest';

/**
 * useCalls — calls pulled from the Postgres event store via PostgREST.
 *
 * The CALLS LIST is read from PostgREST's `api.calls` view (one row per call,
 * folded from EventCdr legs by va_call_uuid) — no deno-api, no DuckDB. There is
 * no live push (PostgREST can't), so updates are MANUAL: call `refresh()` (the
 * Calls page wires a Refresh button to it).
 *
 * The single deno-api worker still owns custom logic (transcription, recording,
 * transcribe) — those endpoints are reached via `EVENTS_API` below, NOT this
 * hook.
 *
 * Env (all from .env): see src/lib/postgrest.ts (VITE_REST_URL, VITE_EVENTS_*).
 *   VITE_USE_MOCK=1  skip the API, use static MOCK_CALLS.
 */

// HTTP base for the deno-api worker endpoints (transcription / recording /
// transcribe). Kept for the sibling components that still call deno; the calls
// list + event timeline now come from PostgREST. '' = same-origin.
export const EVENTS_API = import.meta.env.VITE_EVENTS_API_URL ?? '';

// WS base for the LiveEvents dashboard widget, which still taps the deno-api
// worker's /ws/events. Same-origin by default so it rides the Vite proxy.
export function eventsWsBase() {
  if (import.meta.env.VITE_EVENTS_WS_URL) return import.meta.env.VITE_EVENTS_WS_URL;
  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/ws/events`;
  }
  return 'ws://localhost:4001/ws/events';
}

export function useCalls() {
  const [callMap, setCallMap] = useState(() => new Map());
  const [source, setSource] = useState('loading');
  const [error, setError] = useState(null);
  const cancelled = useRef(false);

  const useMock = import.meta.env.VITE_USE_MOCK === '1';

  // Pull the folded call rows from PostgREST (api.calls). Re-run on demand via
  // the returned `refresh` — there is no live socket.
  const loadHistory = useCallback(async () => {
    try {
      const rows = await pgGet('/calls?order=started_at.desc&limit=200');
      if (cancelled.current) return;
      // Demo: reflect previously mock-transcribed calls so the list chip stays
      // 'completed' after a reload (transcripts are persisted in localStorage).
      setCallMap(new Map((Array.isArray(rows) ? rows : []).map((c) => [
        c.id,
        getStoredMockTranscript(c.id) ? { ...c, transcription_status: 'completed' } : c,
      ])));
      setSource('events');
      setError(null);
    } catch (err) {
      if (!cancelled.current) setError(String(err));
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;

    if (useMock) {
      setCallMap(new Map(MOCK_CALLS.map((c) => [c.id, c])));
      setSource('mock');
      return () => { cancelled.current = true; };
    }

    loadHistory();
    return () => { cancelled.current = true; };
  }, [useMock, loadHistory]);

  // Optimistically merge a patch into one cached call row (e.g. flip
  // transcription_status as the drawer's transcribe flow progresses). No-op if
  // the id isn't loaded; a later refresh() re-reads authoritative server state.
  const patchCall = useCallback((id, patch) => {
    setCallMap((prev) => {
      const existing = prev.get(id);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(id, { ...existing, ...patch });
      return next;
    });
  }, []);

  const calls = useMemo(
    () => [...callMap.values()].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0)),
    [callMap]
  );

  return { calls, loading: source === 'loading', error, source, refresh: loadHistory, patchCall };
}

/** Pure stats reducer — display KPIs from a call list. */
export function computeCallStats(calls) {
  if (!calls || calls.length === 0) {
    return { total: 0, inbound: 0, outbound: 0, completed: 0, failed: 0, avgDurationSec: 0 };
  }
  let inbound = 0, outbound = 0, completed = 0, failed = 0, totalDuration = 0, durCount = 0;
  for (const c of calls) {
    if (c.direction === 'inbound') inbound++;
    if (c.direction === 'outbound') outbound++;
    if (c.status === 'completed') completed++;
    if (c.status === 'failed' || c.status === 'no_answer' || c.status === 'no-answer' || c.status === 'busy') failed++;
    const d = Number(c.duration_seconds);
    if (!Number.isNaN(d) && d > 0) { totalDuration += d; durCount++; }
  }
  return {
    total: calls.length, inbound, outbound, completed, failed,
    avgDurationSec: durCount ? Math.round(totalDuration / durCount) : 0,
  };
}
