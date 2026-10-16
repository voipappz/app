import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import syslogsApi from '../../services/api/syslogsApi';
import { computePeriodRange } from '../../utils/logFormatting';

// What the server can count by (a tag): the list's grouping when it is one,
// else the level. Sessions are a field, not a tag, so a call grouping charts
// by level.
const CHART_GROUP = { severity: 'severity', app: 'app', source: 'app', host: 'host', action: 'action' };
export const chartGroupFor = (groupBy) => CHART_GROUP[groupBy] || 'severity';

// The facets down the side of the explorer: each a server tag, the request
// parameter that filters by it, and how it reads.
export const FACETS = [
  { key: 'severity', param: 'severity', label: 'Level' },
  { key: 'app', param: 'app', label: 'Source' },
  { key: 'host', param: 'host', label: 'Server' },
  { key: 'action', param: 'action', label: 'Type' },
];

// /api/logs/aggregate rows ({ time, <value>: count }) -> [{ value, count }],
// largest first, summed over every bucket.
export const sumAggregate = (rows = []) => {
  const totals = {};
  rows.forEach((row) => Object.entries(row || {}).forEach(([k, v]) => {
    if (k !== 'time' && typeof v === 'number') totals[k] = (totals[k] || 0) + v;
  }));
  return Object.entries(totals).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
};

// Bucket size for the window: minutes up to 6h, hours up to 3 days, else days.
export const chartInterval = (start, end) => {
  const hours = (new Date(end) - new Date(start)) / 3.6e6;
  if (hours <= 6) return 'minute';
  if (hours <= 72) return 'hour';
  return 'day';
};

export const useSystemLogs = ({ customerUuid, initialParams } = {}) => {
  // Log data
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Dropdown data
  const [apps, setApps] = useState([]);
  const [nodes, setNodes] = useState([]);
  // Message types ({ action, count }) seen in the window: the Type filter.
  const [actions, setActions] = useState([]);

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
    // A call is one `session=<id>` across the node's lines and this API's, so
    // ?session=<id> is the link a dialplan refusal or a CDR can carry.
    const session = q.get('session') || '';
    return {
      search: q.get('search') || q.get('inline') || (session ? `session=${session}` : ''),
      action: q.get('action') || q.get('type') || '',
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
  const [selectedAction, setSelectedAction] = useState(initial.action);
  const filterText = useMemo(() => ({
    customerUuid: customerUuid || '',
  }), [customerUuid]);
  const requestFilters = useMemo(() => Object.fromEntries(Object.entries({
    app: selectedApp,
    host: selectedHost,
    severity: selectedSeverity,
    action: selectedAction,
    customer_uuid: filterText.customerUuid,
    inline: searchQuery,
  }).filter(([, value]) => value)), [selectedApp, selectedHost, selectedSeverity, selectedAction, filterText, searchQuery]);
  // What the volume chart is split by: a facet key (severity, app, host, action).
  const [groupBy, setGroupBy] = useState('severity');

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

  // The types offered follow the window: a type nobody logged in it is not
  // offered, and one that stops appearing drops out.
  // Only the newest request may land: a slow answer for the previous window or
  // customer must not replace the current list.
  const actionsSeq = useRef(0);
  const loadActions = useCallback(async () => {
    const seq = ++actionsSeq.current;
    try {
      const params = { customer_uuid: customerUuid || undefined };
      if (dateRange?.start && dateRange?.end) {
        params.from = Math.floor(dateRange.start.getTime() / 1000);
        params.to = Math.floor(dateRange.end.getTime() / 1000);
      }
      const response = await syslogsApi.fetchActions(params);
      if (seq !== actionsSeq.current) return;
      const rows = Array.isArray(response) ? response : response?.data || [];
      setActions(rows.filter((row) => row && row.action));
    } catch (error) {
      if (seq !== actionsSeq.current) return;
      console.error('Failed to load log message types:', error);
      setActions([]);
    }
  }, [customerUuid, dateRange]);

  // Load ONE page of syslogs from the InfluxDB-backed /api/logs endpoint: the
  // server filters, the server counts (`total`), and each page replaces the
  // list. Only the newest request may land, so a slow page from before a
  // filter or page change cannot overwrite the new one.
  const requestSeq = useRef(0);
  const loadLogs = useCallback(async () => {
    const seq = ++requestSeq.current;
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
      setLogs(rows);
      // The server's total, but never fewer than the lines already paged past.
      setTotalCount(Math.max(total, pagination.page * pagination.limit + rows.length));
    } catch (error) {
      if (seq !== requestSeq.current) return;
      console.error('Failed to load logs:', error);
      setLogs([]);
      setTotalCount(0);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [pagination, dateRange, requestFilters]);

  // The volume chart: message counts per time bucket over the WHOLE window
  // (not the page), with the same filters, split by what the list is grouped
  // by when the server can count it.
  const [volume, setVolume] = useState([]);
  const [volumeLoading, setVolumeLoading] = useState(false);
  const volumeSeq = useRef(0);
  const loadVolume = useCallback(async () => {
    const seq = ++volumeSeq.current;
    const params = { ...requestFilters, group_by: chartGroupFor(groupBy) };
    if (dateRange?.start && dateRange?.end) {
      params.from = Math.floor(dateRange.start.getTime() / 1000);
      params.to = Math.floor(dateRange.end.getTime() / 1000);
      params.interval = chartInterval(dateRange.start, dateRange.end);
    }
    setVolumeLoading(true);
    try {
      const response = await syslogsApi.fetchAggregate(params);
      if (seq !== volumeSeq.current) return;
      setVolume(Array.isArray(response) ? response : response?.data || []);
    } catch (error) {
      if (seq !== volumeSeq.current) return;
      console.error('Failed to load log volume:', error);
      setVolume([]);
    } finally {
      if (seq === volumeSeq.current) setVolumeLoading(false);
    }
  }, [requestFilters, dateRange, groupBy]);

  useEffect(() => {
    loadVolume();
  }, [loadVolume]);

  // Facet counts, from the server over the whole window. Each facet is counted
  // with every OTHER filter applied but not its own, so picking one level still
  // shows how many lines the other levels have (and lets you switch).
  const [facets, setFacets] = useState({});
  const [facetsLoading, setFacetsLoading] = useState(false);
  const facetSeq = useRef(0);
  const loadFacets = useCallback(async () => {
    const seq = ++facetSeq.current;
    const range = {};
    if (dateRange?.start && dateRange?.end) {
      range.from = Math.floor(dateRange.start.getTime() / 1000);
      range.to = Math.floor(dateRange.end.getTime() / 1000);
    }
    setFacetsLoading(true);
    const entries = await Promise.all(FACETS.map(async (facet) => {
      const { [facet.param]: _own, ...others } = requestFilters;
      try {
        const response = await syslogsApi.fetchAggregate({ ...others, ...range, group_by: facet.key, interval: 'day' });
        return [facet.key, sumAggregate(Array.isArray(response) ? response : response?.data || [])];
      } catch (error) {
        console.error(`Failed to load the ${facet.label} facet:`, error);
        return [facet.key, []];
      }
    }));
    if (seq !== facetSeq.current) return;
    setFacets(Object.fromEntries(entries));
    setFacetsLoading(false);
  }, [requestFilters, dateRange]);

  useEffect(() => {
    loadFacets();
  }, [loadFacets]);

  // Page controls: a page number (0-based) and a page size.
  const setPage = useCallback((page) => {
    setPagination((current) => (current.page === page ? current : { ...current, page }));
  }, []);
  const setPageSize = useCallback((limit) => setPagination({ page: 0, limit }), []);

  useEffect(() => {
    setPagination((current) => current.page === 0 ? current : { ...current, page: 0 });
  }, [dateRange, selectedApp, selectedHost, selectedSeverity, selectedAction, filterText, searchQuery, pagination.limit]);

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
    if (!(dateRange?.period && dateRange.period !== 'custom')) { loadVolume(); loadFacets(); }
  }, [dateRange?.period, loadLogs, loadVolume, loadFacets, pagination.page]);

  // Derived filter state
  const hasActiveFilters = useMemo(
    () =>
      (searchQuery && searchQuery.trim() !== '') ||
      selectedApp !== '' ||
      selectedHost !== '' ||
      selectedSeverity !== '' ||
      selectedAction !== '',
    [searchQuery, selectedApp, selectedHost, selectedSeverity, selectedAction]
  );

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedApp('');
    setSelectedHost('');
    setSelectedSeverity('');
    setSelectedAction('');
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

  useEffect(() => {
    loadActions();
  }, [loadActions]);

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
    setPage,
    setPageSize,
    volume,
    volumeLoading,
    facets,
    facetsLoading,

    // Dropdown data
    apps,
    nodes,
    actions,

    // Filters
    searchQuery,
    setSearchQuery,
    selectedApp,
    setSelectedApp,
    selectedHost,
    setSelectedHost,
    selectedSeverity,
    setSelectedSeverity,
    selectedAction,
    setSelectedAction,
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
