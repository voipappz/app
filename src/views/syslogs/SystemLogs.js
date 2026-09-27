import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import syslogsApi from '../../services/api/syslogsApi';
import { computePeriodRange } from '../../utils/logFormatting';

export const useSystemLogs = ({ customerUuid, initialParams } = {}) => {
  // Log data
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Dropdown data
  const [apps, setApps] = useState([]);
  const [nodes, setNodes] = useState([]);

  // Pagination
  const [pagination, setPagination] = useState({
    page: 0,
    limit: 100,
  });

  // Filters — seeded from `initialParams` when a caller embeds the viewer, and
  // from the URL when it is the page itself (/logs?search=<uuid>&app=auth&period=24h
  // still works as a link). The login mediators put user_uuid= in the log
  // message for exactly that: the uuid is the search needle
  // against the InfluxDB `syslog` message field.
  const initial = useMemo(() => {
    // `!= null` on purpose: the general Syslog view passes '' to mean "no
    // filters at all". Treating '' as absent would fall through to the host
    // page's query string and silently inherit its ?search=, turning the
    // whole-stream view into a filtered one.
    const q = new URLSearchParams(initialParams != null ? initialParams : window.location.search);
    return {
      search: q.get('search') || q.get('inline') || '',
      app: q.get('app') || '',
      host: q.get('host') || '',
      severity: ({ error: 'err', warn: 'warning' })[q.get('severity')] || q.get('severity') || '',
      period: q.get('period') || '1h',
    };
  }, [initialParams]);

  const [searchQuery, setSearchQuery] = useState(initial.search);
  const [selectedApp, setSelectedApp] = useState(initial.app);
  const [selectedHost, setSelectedHost] = useState(initial.host);
  const [selectedSeverity, setSelectedSeverity] = useState(initial.severity);
  const filterText = useMemo(() => ({
    customerUuid: customerUuid || '',
  }), [customerUuid]);
  const requestFilters = useMemo(() => Object.fromEntries(Object.entries({
    app: selectedApp,
    host: selectedHost,
    severity: selectedSeverity,
    customer_uuid: filterText.customerUuid,
    inline: searchQuery,
  }).filter(([, value]) => value)), [selectedApp, selectedHost, selectedSeverity, filterText, searchQuery]);
  const [groupBy, setGroupBy] = useState('source');

  // Date range with period tracking (Events-style shape)
  const [dateRange, setDateRange] = useState(() => computePeriodRange(initial.period));

  // Auto-refresh: 0 = off, 10/30/60 seconds
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);

  // Load apps (no loading flash on the main table)
  const loadApps = useCallback(async () => {
    try {
      const response = await syslogsApi.fetchApps(customerUuid || null);
      setApps(Array.isArray(response) ? response : response?.data || []);
    } catch (error) {
      console.error('Failed to load apps:', error);
      setApps([]);
    }
  }, [customerUuid]);

  // Load nodes for host filtering
  const loadNodes = useCallback(async () => {
    try {
      const response = await syslogsApi.fetchNodes();
      setNodes(Array.isArray(response) ? response : response?.data || []);
    } catch (error) {
      console.error('Failed to load nodes:', error);
      setNodes([]);
    }
  }, []);

  // Load syslogs from the InfluxDB-backed /api/logs endpoint. Page 1 replaces
  // the list; every later page (scrolling down) is appended to it. Only the
  // newest request may land, so a slow page from before a filter change
  // cannot append to the new list.
  const requestSeq = useRef(0);
  // A short page means there is nothing older, whatever the total says.
  const [reachedEnd, setReachedEnd] = useState(false);
  const loadLogs = useCallback(async () => {
    const seq = ++requestSeq.current;
    const append = pagination.page > 0;
    try {
      setLoading(true);

      const params = {
        page: pagination.page + 1,
        per_page: pagination.limit,
        ...requestFilters,
      };

      if (dateRange?.start && dateRange?.end) {
        params.from = Math.floor(dateRange.start.getTime() / 1000);
        params.to = Math.floor(dateRange.end.getTime() / 1000);
      }

      const response = await syslogsApi.fetchLogs(params);
      if (seq !== requestSeq.current) return;

      let rows = [];
      let total = 0;
      if (Array.isArray(response)) {
        rows = response;
        total = response.length;
      } else if (response?.data && Array.isArray(response.data)) {
        rows = response.data;
        total = response.total || response.total_records || response.data.length;
      }
      setLogs((current) => (append ? [...current, ...rows] : rows));
      setTotalCount(total);
      setReachedEnd(rows.length < pagination.limit);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      console.error('Failed to load logs:', error);
      if (!append) {
        setLogs([]);
        setTotalCount(0);
      }
      setReachedEnd(true);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [pagination, dateRange, requestFilters]);

  // Scrolling to the bottom asks for the next page.
  const hasMore = !reachedEnd && logs.length < totalCount;
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    setPagination((current) => ({ ...current, page: current.page + 1 }));
  }, [loading, hasMore]);

  useEffect(() => {
    setPagination((current) => current.page === 0 ? current : { ...current, page: 0 });
  }, [dateRange, selectedApp, selectedHost, selectedSeverity, filterText, searchQuery, pagination.limit]);

  // Period quick-select handler
  const handlePeriodSelect = useCallback((period) => {
    setDateRange(computePeriodRange(period));
  }, []);

  // Refresh — period-aware: slides the window if a quick-select is active
  const refreshLogs = useCallback(() => {
    if (dateRange?.period && dateRange.period !== 'custom') {
      setDateRange(computePeriodRange(dateRange.period));
    } else if (pagination.page > 0) {
      // Back to the newest lines; the page change reloads.
      setPagination((current) => ({ ...current, page: 0 }));
    } else {
      loadLogs();
    }
  }, [dateRange?.period, loadLogs, pagination.page]);

  // Derived filter state
  const hasActiveFilters = useMemo(
    () =>
      (searchQuery && searchQuery.trim() !== '') ||
      selectedApp !== '' ||
      selectedHost !== '' ||
      selectedSeverity !== '',
    [searchQuery, selectedApp, selectedHost, selectedSeverity]
  );

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedApp('');
    setSelectedHost('');
    setSelectedSeverity('');
  }, []);

  // Enable trace (for live syslog streaming)
  const enableTrace = useCallback(async () => {
    try {
      await syslogsApi.enableTrace();
      return true;
    } catch (error) {
      console.error('Failed to enable trace:', error);
      return false;
    }
  }, []);

  // Disable trace
  const disableTrace = useCallback(async () => {
    try {
      await syslogsApi.disableTrace();
      return true;
    } catch (error) {
      console.error('Failed to disable trace:', error);
      return false;
    }
  }, []);

  // Get trace status
  const getTraceStatus = useCallback(async () => {
    try {
      const response = await syslogsApi.getTraceStatus();
      return response?.enabled || response?.data?.enabled || false;
    } catch (error) {
      console.error('Failed to get trace status:', error);
      return false;
    }
  }, []);

  // Console mode (console! — live log output + error capture to syslog)
  const enableConsole = useCallback(async () => {
    try {
      await syslogsApi.enableConsole();
      return true;
    } catch (error) {
      console.error('Failed to enable console mode:', error);
      return false;
    }
  }, []);

  const disableConsole = useCallback(async () => {
    try {
      await syslogsApi.disableConsole();
      return true;
    } catch (error) {
      console.error('Failed to disable console mode:', error);
      return false;
    }
  }, []);

  const getConsoleStatus = useCallback(async () => {
    try {
      const response = await syslogsApi.getConsoleStatus();
      return response?.enabled || response?.data?.enabled || false;
    } catch (error) {
      console.error('Failed to get console mode status:', error);
      return false;
    }
  }, []);

  // Load dropdown data on mount
  useEffect(() => {
    loadApps();
    loadNodes();
  }, [loadApps, loadNodes]);

  // A source only has meaning inside its customer scope. Do not retain a
  // source selected under the previous customer while the new source list is
  // loading; that produced an empty, confusing log table after a scope switch.
  useEffect(() => {
    setSelectedApp('');
  }, [customerUuid]);

  // Load logs when filters change
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Auto-refresh interval (independent from Trace)
  const autoRefreshRef = useRef(null);
  useEffect(() => {
    if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }
    if (autoRefreshInterval > 0) {
      autoRefreshRef.current = setInterval(() => {
        refreshLogs();
      }, autoRefreshInterval * 1000);
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [autoRefreshInterval, refreshLogs]);

  return {
    // Log data
    logs,
    loading,
    totalCount,
    pagination,
    setPagination,
    hasMore,
    loadMore,

    // Dropdown data
    apps,
    nodes,

    // Filters
    searchQuery,
    setSearchQuery,
    selectedApp,
    setSelectedApp,
    selectedHost,
    setSelectedHost,
    selectedSeverity,
    setSelectedSeverity,
    groupBy,
    setGroupBy,

    // Date range
    dateRange,
    setDateRange,
    handlePeriodSelect,

    // Auto-refresh
    autoRefreshInterval,
    setAutoRefreshInterval,

    // Actions
    refreshLogs,
    clearFilters,
    hasActiveFilters,

    // Trace (live streaming)
    enableTrace,
    disableTrace,
    getTraceStatus,

    // Console mode (console! — live output + error capture to syslog)
    enableConsole,
    disableConsole,
    getConsoleStatus,
  };
};
