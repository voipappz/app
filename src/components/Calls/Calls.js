import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';
import { useIsUserSession } from '../../hooks/useIsUserSession';
import { USER_CALL_COLUMNS } from './userCallColumns';

const API_BASE_URL = '/api';

// A phone has no period picker: its list reaches back to the first call, newest
// first, and scrolling loads older ones (the API returns only today without a range).
export const allTimeRange = () => [new Date(2000, 0, 1), new Date()];

export const todayRange = () => {
  const now = new Date();
  return [
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  ];
};

const useCalls = ({ allTime = false } = {}) => {
  // The active session's token: an account's, or a portal user's (the same
  // screen serves both; the API scopes a user token to its own environment).
  const { access: accountToken } = useAuth();
  const { token: userToken } = useUserAuth();
  const userSession = useIsUserSession();
  const access = userSession ? userToken : accountToken;
  
  const [columns, setColumns] = useState([]);
  const [calls, setCalls] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loadingColumns, setLoadingColumns] = useState(true);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorColumns, setErrorColumns] = useState(null);
  const [errorCalls, setErrorCalls] = useState(null);
  // Initialize with today's date range
  const [dateRange, setDateRange] = useState(() => (allTime ? allTimeRange() : todayRange()));
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage] = useState(100); // Page size — larger now the list font is compact
  const [lastSearchParams, setLastSearchParams] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [sortModel, setSortModel] = useState([]);
  const [sortParams, setSortParams] = useState({ order_by: null, order_type: null });
  // Server-side time-bucketed aggregates for the CounterTimeline histogram.
  // Fetched with the SAME search params as the list (full filtered set, not the
  // loaded page), grouped two ways so counter clicks switch series instantly.
  const [aggregate, setAggregate] = useState({ cause: [], direction: [] });
  const [aggregateLoading, setAggregateLoading] = useState(false);
  // A failed aggregate request must not look like "no calls" — the summary
  // counters read this to render "—" instead of a confident 0.
  const [aggregateError, setAggregateError] = useState(false);

  // Segments for filter sidebar
  const [segments, setSegments] = useState([]);
  const [loadingSegments, setLoadingSegments] = useState(false);

  const commonHeaders = useMemo(() => ({
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,he-IL;q=0.8,he;q=0.7',
    'Authorization': access ? `Bearer ${access}` : '',
  }), [access]);

  // Fetch columns configuration
  useEffect(() => {

    const fetchColumns = async () => {
      // action=columns is served to an ACCOUNT only: a user gets the fields
      // its :portal_list rows carry.
      if (userSession) {
        setColumns(USER_CALL_COLUMNS);
        setErrorColumns(null);
        setLoadingColumns(false);
        return;
      }
      setLoadingColumns(true);
      setErrorColumns(null);
      try {
        const response = await fetch(`${API_BASE_URL}/calls?action=columns`, {
          method: 'GET',
          headers: commonHeaders,
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setColumns(data || []);
      } catch (error) {
        console.error("Failed to fetch columns:", error);
        setErrorColumns(error.message);
        setColumns([]);
      } finally {
        setLoadingColumns(false);
      }
    };

    if (access || commonHeaders.Authorization) {
      fetchColumns();
    }
  }, [commonHeaders, access, userSession]);

  // Fetch segments for filter sidebar
  useEffect(() => {
    const fetchSegments = async () => {
      setLoadingSegments(true);
      try {
        const response = await fetch(`${API_BASE_URL}/calls?action=segments`, {
          method: 'GET',
          headers: commonHeaders,
        });
        if (response.ok) {
          const data = await response.json();
          const apiSegments = data || [];
          // Append meta tag filter segment
          setSegments([...apiSegments, { name: 'meta', label: 'Tag', type: 'tag', url: '/api/calls?action=meta_keys' }]);
        }
      } catch (error) {
        console.error("Failed to fetch segments:", error);
        setSegments([]);
      } finally {
        setLoadingSegments(false);
      }
    };

    if (access || commonHeaders.Authorization) {
      fetchSegments();
    }
  }, [commonHeaders, access]);

  // Helper function to build search query parameters
  const buildSearchQueryParams = useCallback((range, searchParams) => {
    const searchQueryParams = {};
    const [startDate, endDate] = range;

    if (startDate && endDate) {
      // Convert dates to timestamps (Unix timestamps in seconds)
      const startTimestamp = Math.floor(new Date(startDate).setHours(0, 0, 0, 0) / 1000);
      const endTimestamp = Math.floor(new Date(endDate).setHours(23, 59, 59, 999) / 1000);
      
      // Add date filter
      searchQueryParams[`search[created_at]`] = `${startTimestamp} - ${endTimestamp}`;
    } else {
      // Default to today if no date range specified
      const now = new Date();
      const startTimestamp = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime() / 1000);
      
      searchQueryParams[`search[created_at]`] = `${startTimestamp} - ${endTimestamp}`;
    }
    
    // Add search parameters if provided
    if (searchParams && typeof searchParams === 'object') {
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          // Handle meta tag filters passed as nested object
          if (key === 'meta' && typeof value === 'object' && !Array.isArray(value)) {
            Object.entries(value).forEach(([metaKey, metaValue]) => {
              searchQueryParams[`search[meta][${metaKey}]`] = metaValue;
            });
            return;
          }
          // Handle array values (like multiple environments)
          if (Array.isArray(value)) {
            value.forEach(item => {
              if (item !== null && item !== undefined && item !== '') {
                searchQueryParams[key] = searchQueryParams[key] || [];
                if (Array.isArray(searchQueryParams[key])) {
                  searchQueryParams[key].push(item);
                } else {
                  searchQueryParams[key] = [searchQueryParams[key], item];
                }
              }
            });
          } else {
            searchQueryParams[key] = value;
          }
        }
      });
    }
    
    // Add sorting parameters (check searchParams first, then fallback to sortParams state)
    const orderBy = searchParams?.order_by || sortParams.order_by;
    const orderType = searchParams?.order_type || sortParams.order_type;
    
    if (orderBy && orderType) {
      searchQueryParams['order_by'] = orderBy;
      searchQueryParams['order_type'] = orderType;
    }
    
    return searchQueryParams;
  }, [sortParams]);

  // Fetch the histogram aggregates for the CURRENT filter set. Reuses
  // buildSearchQueryParams so the graph's query is identical to the table's —
  // it charts the full filtered result, never just the loaded page.
  const fetchAggregate = useCallback(async (range, searchParams, intervalOverride = null, extraGroups = []) => {
    setAggregateLoading(true);
    try {
      const searchQueryParams = buildSearchQueryParams(range, searchParams);
      delete searchQueryParams['order_by'];
      delete searchQueryParams['order_type'];

      // Pick bucket size from the range span — or take the user's explicit
      // date grouping (Hour/Day chips on the stats strip).
      const [startDate, endDate] = range || [];
      const spanSeconds = startDate && endDate
        ? (new Date(endDate).getTime() - new Date(startDate).getTime()) / 1000
        : 24 * 3600;
      const interval = intervalOverride
        || (spanSeconds > 3 * 24 * 3600 ? 'day' : spanSeconds > 6 * 3600 ? 'hour' : 'minute');

      const buildUrl = (groupBy) => {
        const qp = new URLSearchParams();
        Object.entries(searchQueryParams).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            const finalKey = key.endsWith('[]') ? key : `${key}[]`;
            value.forEach((item) => qp.append(finalKey, item));
          } else {
            qp.append(key, value);
          }
        });
        qp.append('interval', interval);
        qp.append('group_by', groupBy);
        return `${API_BASE_URL}/calls/aggregate?${qp.toString()}`;
      };

      // Always keep cause+direction warm; extraGroups adds any other
      // server-side grouping (disposition/queue/ivr/... — see CallAggregate).
      const groups = [...new Set(['cause', 'direction', ...extraGroups])];
      let failed = false;
      const results = await Promise.all(
        groups.map((g) =>
          fetch(buildUrl(g), { method: 'GET', headers: commonHeaders })
            .then((r) => { if (!r.ok) { failed = true; return []; } return r.json(); })
            .catch(() => { failed = true; return []; })
        )
      );
      const next = {};
      groups.forEach((g, i) => { next[g] = Array.isArray(results[i]) ? results[i] : []; });
      setAggregate(next);
      setAggregateError(failed);
    } finally {
      setAggregateLoading(false);
    }
  }, [buildSearchQueryParams, commonHeaders]);

  // Summary counters, derived from the aggregate the chart already fetches.
  //
  // They used to come from `useCallCounters` → POST /api/reports/run with a
  // hand-written InfluxQL query over a `cdr` measurement. That endpoint went
  // Postgres-only (voipappz-api 69814fed0), `cdr` does not exist there, and the
  // endpoint answers a failed query with HTTP 200 + {rows: [], meta: {error}} —
  // so every counter silently read 0 while the chart beside it drew 16 calls.
  //
  // /calls/aggregate runs the LIST's own filter pipeline unpaginated
  // (Mediators::Search::CallAggregate < Search::Call), so deriving from it means
  // the numbers cannot disagree with the chart or the table, and they follow the
  // active filters — which the old counters never did.
  //
  // Shape: { cause: [{time, answer: 2, no_answer: 1}, ...], direction: [...] }
  // null (not 0) whenever the number is unknown, so "—" renders instead.
  const summaryCounts = useMemo(() => {
    const UNKNOWN = { total: null, answered: null, noAnswer: null, incoming: null, outgoing: null };
    if (aggregateError) return UNKNOWN;

    const sumKeys = (buckets, keys) => (buckets || []).reduce((acc, bucket) => (
      acc + Object.entries(bucket || {}).reduce((sub, [k, v]) => (
        k !== 'time' && (keys === null || keys.includes(k)) ? sub + (Number(v) || 0) : sub
      ), 0)
    ), 0);

    const cause = aggregate?.cause;
    const direction = aggregate?.direction;
    // Before the first response both are []; that is "unknown", not "zero".
    if (!Array.isArray(cause) || !Array.isArray(direction)) return UNKNOWN;
    if (aggregateLoading && cause.length === 0 && direction.length === 0) return UNKNOWN;

    const total = sumKeys(cause, null);
    const answered = sumKeys(cause, ['answer']);
    return {
      total,
      answered,
      noAnswer: Math.max(total - answered, 0),
      outgoing: sumKeys(direction, ['outgoing']),
      incoming: sumKeys(direction, ['incoming']),
    };
  }, [aggregate, aggregateLoading, aggregateError]);

  // Fetch calls data with pagination support
  const fetchCalls = useCallback(async (range = dateRange, searchParams = null, resetData = true, pageOverride = null) => {
    // pageOverride is always used when provided; resetData always starts at page 1
    const pageToFetch = pageOverride || 1;

    if (resetData) {
      setLoadingCalls(true);
      setErrorCalls(null);
      setAllRows([]);
      setHasNextPage(true);
      setLastSearchParams(searchParams);
      // Keep the histogram in lockstep with every new list query
      fetchAggregate(range, searchParams);
    }

    setCurrentPage(pageToFetch);

    const searchQueryParams = buildSearchQueryParams(range, searchParams);

    // Construct final URL with all search parameters
    const queryParams = new URLSearchParams();
    queryParams.append('page', pageToFetch);
    queryParams.append('per_page', perPage);

    // Handle search parameters, including arrays
    Object.entries(searchQueryParams).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        const finalKey = key.endsWith('[]') ? key : `${key}[]`;
        value.forEach(item => {
          queryParams.append(finalKey, item);
        });
      } else {
        queryParams.append(key, value);
      }
    });

    const url = `${API_BASE_URL}/calls?${queryParams.toString()}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: commonHeaders,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }

      // Read x-total header (total records count)
      // Try multiple header name cases for compatibility
      const xTotalRaw = response.headers.get('x-total')
        || response.headers.get('X-Total')
        || response.headers.get('X-TOTAL');
      const totalRecordsFromHeader = parseInt(xTotalRaw || '0', 10);
      setTotalRecords(totalRecordsFromHeader);
      const calculatedTotalPages = totalRecordsFromHeader > 0 ? Math.ceil(totalRecordsFromHeader / perPage) : 0;
      setTotalPages(calculatedTotalPages);

      // Debug: log all response headers to help troubleshoot
      if (totalRecordsFromHeader === 0) {
        console.warn('[Pagination] x-total header not found or 0. Available headers:');
        response.headers.forEach((value, key) => {
          console.warn(`  ${key}: ${value}`);
        });
      }

      const data = await response.json();

      // Handle both direct array and paginated response structures
      let actualData = data;
      if (!Array.isArray(data)) {
        if (data.data && Array.isArray(data.data)) {
          actualData = data.data;
        } else if (data.results && Array.isArray(data.results)) {
          actualData = data.results;
        } else if (data.items && Array.isArray(data.items)) {
          actualData = data.items;
        } else {
          actualData = [];
        }
      }

      // Determine if more pages exist
      const morePages = calculatedTotalPages > 0
        ? pageToFetch < calculatedTotalPages
        : actualData.length === perPage;

      if (resetData) {
        setCalls(data);
        if (Array.isArray(actualData)) {
          setAllRows(actualData);
          setHasNextPage(morePages);
        } else {
          setAllRows([]);
          setHasNextPage(false);
        }
      } else {
        // Append new data for infinite scroll with deduplication
        if (Array.isArray(actualData)) {
          setAllRows(prev => {
            const existingIds = new Set(prev.map(row => row.uuid));
            const newRows = actualData.filter(row => !existingIds.has(row.uuid));
            return [...prev, ...newRows];
          });
          setHasNextPage(morePages);
        } else {
          setHasNextPage(false);
        }
      }
    } catch (error) {
      console.error("Failed to fetch calls:", error);
      setErrorCalls(error.message);
    } finally {
      setLoadingCalls(false);
      setLoadingMore(false);
    }
  }, [dateRange, commonHeaders, perPage, buildSearchQueryParams, fetchAggregate]);

  // Use a ref to always have the latest currentPage without re-creating callbacks
  const currentPageRef = useRef(currentPage);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // Load more calls for infinite scroll
  const loadMoreCalls = useCallback(async (range = dateRange, searchParams = null) => {
    if (!hasNextPage || loadingMore) return;

    const nextPage = currentPageRef.current + 1;
    setLoadingMore(true);

    const paramsToUse = searchParams || lastSearchParams;

    try {
      await fetchCalls(range, paramsToUse, false, nextPage);
    } catch (error) {
      console.error("Failed to load more calls:", error);
      setErrorCalls(error.message);
      setLoadingMore(false);
    }
  }, [dateRange, hasNextPage, loadingMore, lastSearchParams, fetchCalls]);

  // Navigate to a specific page
  const goToPage = useCallback(async (page, range = dateRange) => {
    if (page < 1 || (totalPages > 0 && page > totalPages)) return;
    if (loadingCalls) return;
    await fetchCalls(range, lastSearchParams, true, page);
  }, [dateRange, totalPages, lastSearchParams, fetchCalls, loadingCalls]);

  // Handle sort model changes
  const handleSortModelChange = useCallback((newSortModel) => {
    setSortModel(newSortModel);

    let newSortParams;
    if (newSortModel.length > 0) {
      const { field, sort } = newSortModel[0];

      // Map frontend field names to API field names
      const fieldMapping = {
        'environment': 'environment_name',
        'caller': 'profile.caller',
        'callee': 'profile.callee',
        'direction': 'profile.direction',
        'talk_duration': 'profile.talk_duration',
        'cause': 'profile.cause',
        'cid': 'profile.cid'
      };

      const apiField = fieldMapping[field] || field;

      newSortParams = {
        order_by: apiField,
        order_type: sort
      };
      setSortParams(newSortParams);
    } else {
      newSortParams = { order_by: null, order_type: null };
      setSortParams(newSortParams);
    }

    // Create updated search params with new sorting
    const updatedSearchParams = { ...lastSearchParams };
    if (newSortParams.order_by && newSortParams.order_type) {
      updatedSearchParams.order_by = newSortParams.order_by;
      updatedSearchParams.order_type = newSortParams.order_type;
    } else {
      delete updatedSearchParams.order_by;
      delete updatedSearchParams.order_type;
    }

    // Trigger data refetch with new sorting
    fetchCalls(dateRange, updatedSearchParams, true);
  }, [dateRange, lastSearchParams, fetchCalls]);

  // Track if initial fetch has been performed
  const initialFetchRef = useRef(false);

  // Auto-fetch calls when columns are loaded (optimized)
  useEffect(() => {
    // Only fetch calls if columns are loaded and we haven't loaded calls yet
    // Don't auto-fetch if there are active search parameters (to avoid overriding search results)
    if (!loadingColumns && !initialFetchRef.current && allRows.length === 0 && !lastSearchParams) {

      initialFetchRef.current = true;
      fetchCalls(dateRange);
    } else if (lastSearchParams) {
      // Search params are active, don't override with initial fetch
    }
  }, [loadingColumns, dateRange, lastSearchParams, allRows.length, fetchCalls]);

  return {
    columns,
    calls,
    allRows,
    hasNextPage,
    currentPage,
    totalPages,
    totalRecords,
    loadingColumns,
    loadingCalls,
    loadingMore,
    errorColumns,
    errorCalls,
    fetchCalls,
    loadMoreCalls,
    goToPage,
    dateRange,
    setDateRange,
    sortModel,
    handleSortModelChange,
    segments,
    loadingSegments,
    buildSearchQueryParams,
    aggregate,
    aggregateLoading,
    fetchAggregate,
    summaryCounts,
  };
};

export default useCalls;