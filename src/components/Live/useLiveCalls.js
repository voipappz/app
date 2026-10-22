import { useState, useEffect, useCallback, useRef } from 'react';
import { liveApi } from '../../services/api/liveApi';
import i18n from '../../i18n';

// This hook's own words (live.json liveCalls); the API's field names stay as sent.
const say = (key) => i18n.t(`live:liveCalls.${key}`);

/**
 * Custom hook for Live Calls/Sessions management
 *
 * Backend returns:
 *   GET /api/calls?action=live_fields → flat array: ["direction", "created", "cid_num", ...]
 *   GET /api/calls?action=live → array of objects with those field names as keys
 *
 * @param {boolean} enabled - Only fetch data when this tab is active
 */
export const useLiveCalls = (enabled = false) => {
  const [calls, setCalls] = useState([]);
  const [columns, setColumns] = useState(getDefaultColumns());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isNodeError, setIsNodeError] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const fetchTimeoutRef = useRef(null);
  const lastFetchTimeRef = useRef(0);
  const THROTTLE_DELAY = 2000;

  /**
   * Build DataGrid columns from the live_fields response.
   * Backend returns a flat array of field name strings.
   */
  const fetchColumns = useCallback(async () => {
    if (!enabled) return;

    try {
      const response = await liveApi.getLiveCallsFields();

      if (Array.isArray(response) && response.length > 0) {
        // Backend returns: ["direction", "created", "cid_num", ...]
        const gridColumns = response.map(fieldName => ({
          field: fieldName,
          headerName: humanize(fieldName),
          width: getColumnWidth(fieldName),
          editable: false
        }));
        setColumns(gridColumns);
      } else {
        setColumns(getDefaultColumns());
      }
    } catch (err) {
      console.error('Error fetching live calls columns:', err);
      setColumns(getDefaultColumns());
    }
  }, [enabled]);

  /**
   * Fetch live calls data from API with throttling
   */
  const fetchLiveCalls = useCallback(async () => {
    if (!enabled) return;

    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }

    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTimeRef.current;

    if (timeSinceLastFetch < THROTTLE_DELAY) {
      fetchTimeoutRef.current = setTimeout(() => {
        fetchLiveCalls();
      }, THROTTLE_DELAY - timeSinceLastFetch);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setIsNodeError(false);
      lastFetchTimeRef.current = now;

      const response = await liveApi.getLiveCalls({});

      let rawData = [];
      if (Array.isArray(response)) {
        rawData = response;
      } else if (response && typeof response === 'object') {
        rawData = response.data || response.calls || response.items || [];
      }

      // Add unique id to each row for DataGrid
      const withIds = rawData.map((call, index) => ({
        ...call,
        id: call.uuid || call.call_uuid || `call-${index}`
      }));

      setCalls(withIds);
      setTotalCount(withIds.length);
    } catch (err) {
      console.error('Error fetching live calls:', err);
      const status = err.status || err.statusCode || err.response?.status;
      const responseMsg = err.response?.data?.message || err.response?.data?.error || err.message || '';
      if (status === 500 && (responseMsg.toLowerCase().includes('node') || responseMsg.toLowerCase().includes('switch') || responseMsg === '')) {
        // Server returns 500 when no FreeSwitch node is assigned — treat as configuration info, not error
        setIsNodeError(true);
        setError(say('noNodeConfigured'));
      } else {
        setError(err.message || say('loadFailed'));
      }
      setCalls([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      fetchColumns();
      fetchLiveCalls();
    }
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
    };
  }, [enabled, fetchColumns, fetchLiveCalls]);

  const refresh = useCallback(() => {
    fetchLiveCalls();
  }, [fetchLiveCalls]);

  return {
    calls,
    columns,
    loading,
    error,
    isNodeError,
    totalCount,
    refresh
  };
};

/**
 * Convert field_name to Human Readable
 */
const humanize = (str) => {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/^B /, 'B-Leg '); // b_cid_name → B-Leg Cid Name
};

/**
 * Assign sensible widths based on field name
 */
const getColumnWidth = (field) => {
  if (field.includes('uuid')) return 200;
  if (field.includes('name') || field.includes('application')) return 160;
  if (field.includes('epoch') || field.includes('created')) return 150;
  if (field.includes('ip_addr') || field.includes('hostname')) return 140;
  return 130;
};

/**
 * Default columns (used when live_fields API fails)
 */
const DEFAULT_COLUMN_WIDTHS = {
  direction: 100, cid_name: 140, cid_num: 130, dest: 130, state: 100,
  callstate: 110, application: 130, ip_addr: 130, created: 150, accountcode: 130,
};
const getDefaultColumns = () => Object.entries(DEFAULT_COLUMN_WIDTHS).map(([field, width]) => ({
  field, width, headerName: say(`fallbackColumns.${field}`),
}));

export default useLiveCalls;
