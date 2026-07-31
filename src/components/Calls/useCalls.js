import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MOCK_CALLS } from './mock-data';
import { getStoredMockTranscript } from './conversation-mocks';
import { getCalls } from '../../services/callsApi';

/**
 * useCalls — a page of calls from voipappz-api (GET /api/calls).
 *
 * SERVER-SIDE paging/sort/filter (nimbus-admin's pattern): the API returns one
 * page plus the total in the `X-Total` header, so the UI can reach all rows
 * instead of a truncated fetch. Paging/sort/search state lives here and any
 * change refetches. There is no live push — `refresh()` is the manual re-read
 * (the Calls page wires a Refresh button to it).
 *
 * Env: VITE_MOTHERSHIP_URL (the API base, see lib/clients/api.ts).
 *      VITE_USE_MOCK=1  skip the API, use static MOCK_CALLS.
 */

// UI column → API sort field. Only these are sent as `order_by`; columns absent
// from the map are sorted client-side within the current page (the API's
// sortable fields beyond created_at are unverified on this deployment).
export const SORT_FIELD_MAP = { started_at: 'created_at' };

// HTTP base for the deno-api worker endpoints (transcription / recording).
// Deno is custom-logic only; the calls list comes from voipappz-api. '' = same-origin.
export const EVENTS_API = import.meta.env.VITE_EVENTS_API_URL ?? '';

// WS base for the LiveEvents dashboard widget (deno /ws/events). Same-origin by
// default so it rides the Vite proxy.
export function eventsWsBase() {
  if (import.meta.env.VITE_EVENTS_WS_URL) return import.meta.env.VITE_EVENTS_WS_URL;
  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/ws/events`;
  }
  return 'ws://localhost:4001/ws/events';
}

export function useCalls() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);            // 0-based (MUI TablePagination)
  const [perPage, setPerPage] = useState(20);     // nimbus uses 20
  const [orderBy, setOrderBy] = useState('created_at');
  const [orderType, setOrderType] = useState('desc');
  // Date range plus Nimbus-compatible call search parameters are server-side,
  // so filtering applies across the full history rather than one loaded page.
  const [range, setRange] = useState(null);
  const [search, setSearch] = useState({});
  const [source, setSource] = useState('loading');
  const [error, setError] = useState(null);
  const cancelled = useRef(false);

  const useMock = import.meta.env.VITE_USE_MOCK === '1';
  // Stable dep for the effect — `range` is a fresh object on every change.
  const rangeKey = JSON.stringify(range);
  const searchKey = JSON.stringify(search);

  const load = useCallback(async () => {
    try {
      const { rows: got, total: n } = await getCalls({
        page: page + 1,               // API is 1-based
        perPage,
        orderBy,
        orderType,
        range,
        search,
      });
      if (cancelled.current) return;
      // Demo: reflect previously mock-transcribed calls so the list chip stays
      // 'completed' after a reload (transcripts are persisted in localStorage).
      setRows(got.map((c) => (getStoredMockTranscript(c.id) ? { ...c, transcription_status: 'completed' } : c)));
      setTotal(n);
      setSource('events');
      setError(null);
    } catch (err) {
      if (!cancelled.current) { setError(String(err)); setSource('events'); }
    }
    // `range` is represented by the stable serialized rangeKey dependency.
  }, [page, perPage, orderBy, orderType, rangeKey, searchKey]);

  useEffect(() => {
    cancelled.current = false;

    if (useMock) {
      setRows(MOCK_CALLS);
      setTotal(MOCK_CALLS.length);
      setSource('mock');
      return () => { cancelled.current = true; };
    }

    load();
    return () => { cancelled.current = true; };
  }, [useMock, load]);

  // Sort request from the table. Mapped columns sort on the SERVER (refetch from
  // page 0); unmapped ones return false so the caller sorts the page client-side.
  const handleSortChange = useCallback((uiKey) => {
    const field = SORT_FIELD_MAP[uiKey];
    if (!field) return false;
    setOrderType((prev) => (orderBy === field && prev === 'desc' ? 'asc' : 'desc'));
    setOrderBy(field);
    setPage(0);
    return true;
  }, [orderBy]);

  // Date range changed → back to page 0 and refetch with search[created_at].
  const applyRange = useCallback((next) => {
    setRange(next || null);
    setPage(0);
  }, []);

  const applySearch = useCallback((next) => {
    setSearch(next || {});
    setPage(0);
  }, []);

  // Optimistically merge a patch into one row (e.g. transcription_status as the
  // drawer's transcribe flow progresses). A later refresh() re-reads the server.
  const patchCall = useCallback((id, patch) => {
    setRows((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const calls = useMemo(() => rows, [rows]);

  return {
    calls, total, page, perPage, orderBy, orderType,
    loading: source === 'loading', error, source,
    setPage, setPerPage, handleSortChange, applyRange, applySearch,
    refresh: load, patchCall,
  };
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
