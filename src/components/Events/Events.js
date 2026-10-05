import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import eventsApi from '../../services/api/eventsApi';

export const useEvents = (initialParams) => {
  const { selectedEnvironments } = useCustomerEnvironment();

  // Event data
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  // Server-side sort (DataGrid sortModel: [{ field, sort }])
  const [sortModel, setSortModel] = useState([]);

  // Chart aggregation data
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartGroupBy, setChartGroupBy] = useState('event_type');

  // Stats summary
  const [stats, setStats] = useState(null);

  // Event types for filter dropdown
  const [eventTypes, setEventTypes] = useState([]);

  // Subject filtering — seed from initial params so deep links like
  // `/events?subject=subscription&subject_uuid=<uuid>` (route) or the Events
  // modal (opened with the same query string) open pre-filtered.
  // `initialParams` (string or URLSearchParams) takes precedence; otherwise
  // fall back to the page URL so the standalone /events route keeps working.
  const initialUrlParams = initialParams
    ? (typeof initialParams === 'string' ? new URLSearchParams(initialParams) : initialParams)
    : ((typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : new URLSearchParams());
  const [subjectTypes, setSubjectTypes] = useState([]);
  const [selectedSubjectType, setSelectedSubjectType] = useState(
    () => initialUrlParams.get('subject') || ''
  );
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectUuid, setSelectedSubjectUuid] = useState(
    () => initialUrlParams.get('subject_uuid') || ''
  );

  // Call filter (set by the "filter by call" button in the detail panel)
  const [selectedCallUuid, setSelectedCallUuid] = useState(
    () => initialUrlParams.get('call_uuid') || ''
  );

  // Author/actor filter (set by clicking AUTHOR cell)
  // Seeded from `actor=` so an Accounts row can open on what that account did.
  const [selectedActor, setSelectedActor] = useState(
    () => initialUrlParams.get('actor') || ''
  );

  // Level multi-select (Set of active levels; empty = show all)
  const [selectedLevels, setSelectedLevels] = useState(new Set());

  // Auto-refresh: 0 = off, 10/30/60 seconds
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);

  // Detail panel: index of expanded row (-1 = none)
  const [expandedEventIndex, setExpandedEventIndex] = useState(-1);

  // Pagination
  const [pagination, setPagination] = useState({
    page: 0,
    limit: 50,
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventType, setSelectedEventType] = useState('');

  // Date range with period tracking. Default = ALL events (no from/to sent) —
  // the user narrows with the period selector when they want a window.
  const [dateRange, setDateRange] = useState({ start: null, end: null, period: 'all' });

  // Time interval for chart bucketing
  const [timeInterval, setTimeInterval] = useState('minute');

  // Determine appropriate chart interval from date range
  const autoInterval = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return 'hour';
    const diffMs = dateRange.end.getTime() - dateRange.start.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours <= 3) return 'minute';
    if (diffHours <= 48) return 'hour';
    return 'day';
  }, [dateRange]);

  // Toggle a level in the selectedLevels set
  const toggleLevel = useCallback((level) => {
    setSelectedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedEventType('');
    setSelectedLevels(new Set());
    setSelectedSubjectType('');
    setSelectedSubjectUuid('');
    setSelectedCallUuid('');
    setSelectedActor('');
    setSubjects([]);
  }, []);

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return searchQuery.trim() !== '' ||
      selectedEventType !== '' ||
      selectedLevels.size > 0 ||
      selectedSubjectType !== '' ||
      selectedSubjectUuid !== '' ||
      selectedCallUuid !== '' ||
      selectedActor !== '';
  }, [searchQuery, selectedEventType, selectedLevels, selectedSubjectType, selectedSubjectUuid, selectedCallUuid, selectedActor]);

  // Load event types on mount
  const loadEventTypes = useCallback(async () => {
    try {
      const response = await eventsApi.fetchEventTypes();
      setEventTypes(Array.isArray(response) ? response : response?.data || []);
    } catch (err) {
      console.error('Failed to load event types:', err);
      setEventTypes([]);
    }
  }, []);

  // Load subject types
  const loadSubjectTypes = useCallback(async () => {
    try {
      const response = await eventsApi.fetchSubjectTypes();
      setSubjectTypes(Array.isArray(response) ? response : response?.data || []);
    } catch (err) {
      console.error('Failed to load subject types:', err);
      setSubjectTypes([]);
    }
  }, []);

  // Load subjects for a given type
  const loadSubjects = useCallback(async (type) => {
    if (!type) {
      setSubjects([]);
      return;
    }
    try {
      const response = await eventsApi.fetchSubjects(type);
      setSubjects(Array.isArray(response) ? response : response?.data || []);
    } catch (err) {
      console.error('Failed to load subjects:', err);
      setSubjects([]);
    }
  }, []);

  // Load stats summary
  const loadStats = useCallback(async () => {
    try {
      const params = {};
      if (dateRange.start && dateRange.end) {
        params.from = Math.floor(dateRange.start.getTime() / 1000);
        params.to = Math.floor(dateRange.end.getTime() / 1000);
      }
      const response = await eventsApi.fetchStats(params);
      setStats(response);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, [dateRange]);

  // Load chart aggregation data
  const loadChartData = useCallback(async () => {
    try {
      setChartLoading(true);

      const params = {
        group_by: chartGroupBy,
        interval: autoInterval,
      };

      if (dateRange.start && dateRange.end) {
        params.from = Math.floor(dateRange.start.getTime() / 1000);
        params.to = Math.floor(dateRange.end.getTime() / 1000);
      }

      const response = await eventsApi.fetchAggregate(params);
      setChartData(Array.isArray(response) ? response : response?.data || []);
    } catch (err) {
      console.error('Failed to load chart data:', err);
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, [chartGroupBy, dateRange, autoInterval]);

  // Load events
  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: pagination.page + 1,
        per_page: pagination.limit,
      };

      // Server-side sort (column-header clicks send a request; the grid is
      // paginated so client sorting would only reorder the loaded page)
      if (sortModel.length > 0) {
        // grid's 'time' column is the created_at timestamp server-side
        params.order_by = sortModel[0].field === 'time' ? 'created_at' : sortModel[0].field;
        params.order_type = sortModel[0].sort || 'desc';
      }

      // Time range
      if (dateRange.start && dateRange.end) {
        params.from = Math.floor(dateRange.start.getTime() / 1000);
        params.to = Math.floor(dateRange.end.getTime() / 1000);
      }

      // Filters
      if (selectedEventType) {
        params.event_type = selectedEventType;
      }
      // Level: join selected levels with comma (empty = all)
      if (selectedLevels.size > 0) {
        params.level = [...selectedLevels].join(',');
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      // Subject filtering
      if (selectedSubjectType) {
        params.subject = selectedSubjectType;
      }
      if (selectedSubjectUuid) {
        params.subject_uuid = selectedSubjectUuid;
      }
      // Call filter (the call's full event timeline)
      if (selectedCallUuid) {
        params.call_uuid = selectedCallUuid;
      }
      // Author/actor filter
      if (selectedActor) {
        params.actor = selectedActor;
      }

      const response = await eventsApi.fetchLogs(params);

      let eventsData = [];
      let totalRecords = 0;

      if (Array.isArray(response)) {
        eventsData = response;
        totalRecords = response.length;
      } else if (response?.data && Array.isArray(response.data)) {
        eventsData = response.data;
        totalRecords = response.total_records || response.total || response.data.length;
      } else if (response?.events) {
        eventsData = response.events;
        totalRecords = response.total_records || response.total || response.events.length;
      } else {
        eventsData = [];
        totalRecords = 0;
      }

      setEvents(eventsData);
      setTotalCount(totalRecords);
    } catch (err) {
      console.error('Failed to load events:', err);
      setError('Failed to load events');
      setEvents([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [selectedEnvironments, pagination, dateRange, selectedEventType, selectedLevels, searchQuery, selectedSubjectType, selectedSubjectUuid, selectedActor, sortModel]);

  // Period quick-select handler
  const handlePeriodSelect = useCallback((period) => {
    const now = new Date();
    let start;
    switch (period) {
      case '15m':
        start = new Date(now.getTime() - (15 * 60 * 1000));
        break;
      case '1h':
        start = new Date(now.getTime() - (60 * 60 * 1000));
        break;
      case '3h':
        start = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        break;
      case '6h':
        start = new Date(now.getTime() - (6 * 60 * 60 * 1000));
        break;
      case '24h':
        start = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        break;
      case '7d':
        start = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        break;
      case '30d':
        start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        break;
      default:
        start = new Date(now.getTime() - (60 * 60 * 1000));
    }
    setDateRange({ start, end: now, period });
  }, []);

  // Refresh all data
  const refreshEvents = useCallback(() => {
    // If a quick-select period is active, slide the window to now
    if (dateRange.period && dateRange.period !== 'custom') {
      handlePeriodSelect(dateRange.period);
    } else {
      loadEvents();
      loadChartData();
      loadStats();
    }
  }, [dateRange.period, handlePeriodSelect, loadEvents, loadChartData, loadStats]);

  // Get unique levels from current events (for chips display)
  const uniqueLevels = useMemo(() => {
    return [...new Set(events.map(evt => evt.level).filter(Boolean))].sort();
  }, [events]);

  // All known levels for chip display
  const allLevels = useMemo(() => {
    return ['crit', 'error', 'warn', 'info', 'debug', 'trace'];
  }, []);

  // Load initial data
  useEffect(() => {
    loadEventTypes();
    loadSubjectTypes();
  }, [loadEventTypes, loadSubjectTypes]);

  // Load subjects when subject type changes.
  // Skip the initial render so that a URL-provided `subject_uuid` is not
  // clobbered by the "clear uuid on subject type change" behavior.
  const didMountSubjectTypeRef = useRef(false);
  useEffect(() => {
    if (!didMountSubjectTypeRef.current) {
      didMountSubjectTypeRef.current = true;
      loadSubjects(selectedSubjectType);
      return;
    }
    setSelectedSubjectUuid('');
    loadSubjects(selectedSubjectType);
  }, [selectedSubjectType, loadSubjects]);

  // Load events when filters change
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Load chart data and stats when relevant params change
  useEffect(() => {
    loadChartData();
    loadStats();
  }, [loadChartData, loadStats]);

  // Auto-refresh interval
  const autoRefreshRef = useRef(null);
  useEffect(() => {
    if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }
    if (autoRefreshInterval > 0) {
      autoRefreshRef.current = setInterval(() => {
        refreshEvents();
      }, autoRefreshInterval * 1000);
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [autoRefreshInterval, refreshEvents]);

  return {
    // Event data
    events,
    loading,
    error,
    totalCount,
    sortModel,
    setSortModel,
    pagination,
    setPagination,

    // Chart
    chartData,
    chartLoading,
    chartGroupBy,
    setChartGroupBy,

    // Stats
    stats,

    // Filters
    eventTypes,
    searchQuery,
    setSearchQuery,
    selectedEventType,
    setSelectedEventType,
    selectedLevels,
    toggleLevel,
    allLevels,
    uniqueLevels,

    // Subject filtering
    subjectTypes,
    selectedSubjectType,
    setSelectedSubjectType,
    subjects,
    selectedSubjectUuid,
    setSelectedSubjectUuid,

    // Call filtering
    selectedCallUuid,
    setSelectedCallUuid,

    // Author/actor filter
    selectedActor,
    setSelectedActor,

    // Date range
    dateRange,
    setDateRange,
    timeInterval,
    setTimeInterval,
    handlePeriodSelect,

    // Auto-refresh
    autoRefreshInterval,
    setAutoRefreshInterval,

    // Detail panel
    expandedEventIndex,
    setExpandedEventIndex,

    // Actions
    refreshEvents,
    clearFilters,
    hasActiveFilters,
  };
};
