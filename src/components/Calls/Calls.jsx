import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import LtrIsland from '../../i18n/LtrIsland';
import './Calls.css'; // Styles
import './CellWithHover/CellWithHover.css'; // Cell hover styles
import useCalls from './Calls.js'; // Custom hook
import useRecordingHandlers from './RecordingHandlers/useRecordingHandlers.js';
import useColumnHandlers from './ColumnHandlers/useColumnHandlers.jsx';
import useFilterHandlers from './FilterHandlers/FilterHandlers.js';
import useRowHandlers from './RowHandlers/useRowHandlers.js';
import useUrlSync from './UrlSync/useUrlSync.js';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';
import { useIsUserSession } from '../../hooks/useIsUserSession';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import { useNavigateToEvents } from '../../hooks/useNavigateToLogs';
import { formatDuration } from '../../utils/phoneUtils';

// Components
import RecordingDialog from './RecordingDialog/RecordingDialog.jsx';
import CustomFooter from './CustomFooter/CustomFooter.jsx';
import ColumnSelector from './ColumnSelector/ColumnSelector.jsx';
import FilterEditDialog from './FilterEditDialog/FilterEditDialog.jsx';
import CallActions from './CallActions/CallActions.jsx';
import CallMobileView from './CallMobileView/CallMobileView.jsx';
import CallDetailPanel from './CallDetailPanel/CallDetailPanel.jsx';
import CallConversationPanel from './CallDetailPanel/CallConversationPanel.jsx';
import CallLogsPanel from './CallDetailPanel/CallLogsPanel.jsx';
import StatCounter from '../common/StatCounter/StatCounter.jsx';
import { DirectionIcon, CauseIcon, RecordingControls } from './CallIcons.jsx';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import LiveDrawer from '../Live/LiveDrawer.jsx';
import LiveCallsPanel from '../Live/panels/LiveCallsPanel.jsx';
import TimeHistogram from '../../views/syslogs/TimeHistogram';
import { convertAggregateToHistogramFormat } from '../../utils/logFormatting';
import LogTabs from '../shared/LogTabs/LogTabs.jsx';
import ReportsPanel from '../Reports/ReportsPanel/ReportsPanel.jsx';
import LiveChartStrip from '../Live/LiveChartStrip.jsx';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { useLiveCalls } from '../Live/useLiveCalls';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';

// MUI Components
import {
  Box, Typography, IconButton, TextField, InputAdornment, Paper, useTheme, useMediaQuery,
  Chip, CircularProgress, Select, MenuItem, Tooltip, Button, ButtonGroup,
} from '@mui/material';
import { useNotification } from '../../context/NotificationContext';

// Server-side groupings for the calls-over-time chart (CallAggregate GROUP_KEYS).
// Older APIs fall back to Cause for keys they don't know — safe to offer all.
// Names come from calls.json; a label the API sends with a segment wins.
const GROUP_BY_OPTIONS = [
  { key: 'cause', labelKey: 'groupBy.cause' },
  { key: 'direction', labelKey: 'groupBy.direction' },
  { key: 'disposition', labelKey: 'groupBy.disposition' },
  { key: 'hangup_disposition', labelKey: 'groupBy.hangup' },
  { key: 'queue', labelKey: 'groupBy.queue' },
  { key: 'did', labelKey: 'groupBy.route' },
  { key: 'environment', labelKey: 'groupBy.application' },
  { key: 'user', labelKey: 'groupBy.user' },
];

// The group keys the aggregate endpoint actually supports (CallAggregate
// GROUP_KEYS). Options offered to the user are the API's own segment fields
// intersected with this set, so every option really groups (no silent
// fall-back to Cause) while the labels/coverage come from the API fields.
const SERVER_GROUP_KEYS = new Set([
  'cause', 'direction', 'disposition', 'hangup_disposition',
  'queue', 'did', 'environment', 'user',
]);
const GROUPABLE_SEGMENT_TYPES = new Set(['select', 'multi_select', 'select2_ajax', 'auto_complete_ajax']);
// Map a segment field name to its aggregate group key (strip the _uuid/_name
// suffixes the filter fields use — e.g. environment_uuid → environment).
const segmentGroupKey = (name) => (name || '').replace(/_(uuid|name)$/, '');
const CALL_GROUP_FILTER_FIELDS = {
  cause: 'call.cause',
  direction: 'call.direction',
  disposition: 'call.disposition',
  hangup_disposition: 'call.hangup_disposition',
  queue: 'call.queue_name',
  did: 'call.did_name',
  environment: 'call.environment_name',
  user: 'call.user_name',
};
import BarChartIcon from '@mui/icons-material/BarChart';
import { DataGrid } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { saveExportResponse } from '../../utils/downloadExport';

// Server segment names (see Segment.calls) — the four fields people actually
// filter calls by. The other nine stay behind the ⚙ panel.
const INLINE_FILTER_FIELDS = ['call.cause', 'call.direction', 'call.caller', 'call.callee'];

const Calls = () => {
  const { t } = useTranslation('calls');
  const [quickSearchText, setQuickSearchText] = React.useState('');
  const [selectedCall, setSelectedCall] = React.useState(null);
  const [panelMode, setPanelMode] = useState('details'); // 'details' | 'conversation' | 'logs'
  const [liveDrawerOpen, setLiveDrawerOpen] = useState(false);
  const [chartMode, setChartMode] = useState('timeline'); // 'timeline' | 'live' — Live replaces the chart
  // Live call count for the "Live now" toggle (real-time from the switch node).
  // action=live is served to an account only; a portal user has no live count.
  const userSession = useIsUserSession();
  const { totalCount: liveCallsTotal, refresh: refreshLiveCalls } = useLiveCalls(!userSession);
  // useLiveCalls fetches once on mount and never again, so the count next to a
  // control labelled "Live" was frozen at whatever the switch reported when the
  // screen opened. Poll only while the live view is actually on screen — a
  // stale live number is worse than no number.
  useEffect(() => {
    if (chartMode !== 'live') return undefined;
    const id = setInterval(refreshLiveCalls, 10000);
    return () => clearInterval(id);
  }, [chartMode, refreshLiveCalls]);
  // The call detail panel's "Events" button: the Postgres event store for this
  // call. It used to be wired to the per-record logs modal, which is gone --
  // logs are read on the Logs screen (/logs) only.
  const goToEvents = useNavigateToEvents();

  // Get authentication context. `access` is the ACCOUNT token: saved searches
  // (action=params/save_params) are an account's, so they stay off for a user.
  // `sessionToken` is whichever session is signed in, for the export.
  const { access } = useAuth();
  const { token: userToken } = useUserAuth();
  const sessionToken = userSession ? userToken : access;
  const { showNotification } = useNotification();
  const { registerScreen, unregisterScreen } = useGlobalSearch();

  // Responsive breakpoints
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // Data and API calls
  const {
    columns: apiColumns,
    allRows,
    hasNextPage,
    currentPage,
    totalPages,
    totalRecords,
    loadingCalls,
    loadingMore,
    errorCalls,
    fetchCalls,
    loadMoreCalls,
    goToPage,
    dateRange,
    setDateRange,
    sortModel,
    handleSortModelChange,
    segments,
    buildSearchQueryParams,
    aggregate,
    aggregateLoading,
    fetchAggregate,
    summaryCounts,
  } = useCalls();

  // URL synchronization
  const { currentSearchParams, setCurrentSearchParams, syncUrl } = useUrlSync(fetchCalls, dateRange);

  // Recording dialog handlers
  const {
    recordingDialogOpen,
    selectedRecording,
    analysisLoading,
    analysisResult,
    analysisError,
    handleOpenRecording,
    handleCloseRecording,
    handleAnalyzeRecording
  } = useRecordingHandlers();

  // Filter handlers
  const {
    filteredRows,
    isClientFiltered,
    editingFilter,
    editDialogOpen,
    editValue,
    editOperator,
    handleSearch,
    handleClearAllFilters,
    handleSaveEditedFilter,
    handleCancelEdit,
    setEditValue,
    setEditOperator,
  } = useFilterHandlers(allRows, setCurrentSearchParams, syncUrl, fetchCalls, dateRange, userSession ? null : access);

  // Column visibility handlers - pass API columns for dynamic column loading
  const {
    visibleColumns,
    columnSelectorAnchorEl,
    availableColumns,
    handleColumnSelectorOpen,
    handleColumnSelectorClose,
    handleToggleColumnVisibility,
    handleSelectAllColumns,
    handleDeselectAllColumns,
    handleResetColumns,
    createGridColumns
  } = useColumnHandlers(handleOpenRecording, handleSearch, currentSearchParams, apiColumns, segments, setSelectedCall);

  // Row handlers with infinite scroll
  const {
    rows,
    handleRowsScrollEnd,
    scrollContainerRef,
  } = useRowHandlers(allRows, filteredRows, isClientFiltered, hasNextPage, loadingMore, loadMoreCalls, dateRange);


  // Register call segments with GlobalSearchContext
  useEffect(() => {
    if (segments && segments.length > 0) {
      registerScreen('calls', segments, {
        onSearch: (params) => {
          handleSearch(params, false);
        },
        onClear: () => {
          handleClearAllFilters(setCurrentSearchParams);
        },
      });
    }
    return () => unregisterScreen();
  }, [segments, registerScreen, unregisterScreen]);

  // Handle date range changes
  const handleDateRangeChange = (newRange) => {
    setDateRange(newRange);
    // Preserve existing search parameters when changing date range
    fetchCalls(newRange, currentSearchParams);
  };

  // Manual refresh with current filters and date range
  const handleRefresh = () => {
    fetchCalls(dateRange, currentSearchParams);
  };

  // Handle quick search
  const handleQuickSearch = (e) => {
    if (e.key === 'Enter') {
      if (quickSearchText.trim()) {
        const searchParams = { 'search[inline]': quickSearchText.trim() };
        handleSearch(searchParams, false);
      } else {
        // Clear search when text is empty
        handleClearAllFilters(setCurrentSearchParams);
      }
    }
  };

  const handleClearQuickSearch = () => {
    setQuickSearchText('');
    handleClearAllFilters(setCurrentSearchParams);
  };

  // Handle quick search text changes with debounce
  const handleQuickSearchChange = (value) => {
    setQuickSearchText(value);
    
    // If text is cleared, immediately clear the search
    if (value === '') {
      handleClearAllFilters(setCurrentSearchParams);
    }
  };

  // Handle sort model changes with URL sync
  const handleSortModelChangeWithSync = (newSortModel) => {
    handleSortModelChange(newSortModel);
    
    // Update URL with sorting parameters
    const updatedParams = { ...currentSearchParams };
    
    if (newSortModel.length > 0) {
      const { field, sort } = newSortModel[0];
      updatedParams.order_by = field;
      updatedParams.order_type = sort;
    } else {
      delete updatedParams.order_by;
      delete updatedParams.order_type;
    }
    
    setCurrentSearchParams(updatedParams);
    syncUrl(updatedParams);
  };


  // Handle export to CSV
  const handleExport = async () => {
    try {
      // Reuse the exact same params the calls list/search already builds
      // (date range, search filters, meta tags, sorting) so the export matches
      // what is currently shown on screen.
      const searchQueryParams = buildSearchQueryParams(dateRange, currentSearchParams);

      const queryParams = new URLSearchParams();
      // Match legacy admin: ask the backend to generate the report file.
      queryParams.append('export', 'csv');
      queryParams.append('per_page', '1000');

      // Match the old admin exactly: it sends the selected columns' `field`
      // values as a `columns[]` array (export_params + $.param array serialization).
      const exportColumns = (visibleColumns || [])
        .map(col => col.field || col.prop)
        .filter(Boolean);
      exportColumns.forEach(field => queryParams.append('columns[]', field));

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

      // Use the same proxied relative path as the working calls list ('/api'),
      // so the request is same-origin and the `x-report` header is readable.
      const exportUrl = `/api/calls?${queryParams.toString()}`;

      const response = await fetch(exportUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': sessionToken ? `Bearer ${sessionToken}` : '',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Export failed:', response.status, errorText);
        showNotification('Export failed. Please try again.', 'error');
        return;
      }

      // Saves the streamed CSV body, or fetches a legacy x-report URL WITH the
      // token. Returns false when neither worked, so we build the CSV below.
      if (await saveExportResponse(response, { access })) {
        showNotification('Export ready — your download has started.', 'success');
        return;
      }

      // Fallback: no report URL header — build the CSV on the client from JSON.
      {
        const data = await response.json();

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

        const flattenObject = (obj, prefix = '') => {
          const flattened = {};
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              const value = obj[key];
              const newKey = prefix ? `${prefix}.${key}` : key;
              if (value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(flattened, flattenObject(value, newKey));
              } else {
                flattened[newKey] = value;
              }
            }
          }
          return flattened;
        };

        const allKeys = new Set();
        actualData.forEach(item => {
          Object.keys(flattenObject(item)).forEach(key => allKeys.add(key));
        });

        const keyArray = Array.from(allKeys).sort();
        const headers = keyArray.join(',');
        const csvRows = actualData.map(item => {
          const flattened = flattenObject(item);
          return keyArray.map(key => {
            let value = flattened[key];
            if (key.endsWith('_duration') && value !== null && value !== undefined && value !== '') {
              value = formatDuration(parseInt(value));
            }
            const stringValue = value === null || value === undefined ? '' : String(value);
            return stringValue.includes(',') || stringValue.includes('"')
              ? `"${stringValue.replace(/"/g, '""')}"`
              : stringValue;
          }).join(',');
        });

        const csvContent = [headers, ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `calls-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export error:', error);
      showNotification('Export failed. Please try again.', 'error');
    }
  };


  // Update quick search text when parameters are loaded (for text search restoration)
  React.useEffect(() => {
    const text = currentSearchParams['search[inline]'] || currentSearchParams['search[text]'];
    if (text) {
      setQuickSearchText(text);
    } else if (Object.keys(currentSearchParams).length === 0) {
      // Clear quick search text when all filters are cleared
      setQuickSearchText('');
    }
  }, [currentSearchParams]);


  // Function to handle adding notes to calls
  const handleAddNote = (callId, note) => {
    console.log(`Adding note to call ${callId}:`, note);
    // This would typically save to an API or local storage
    showNotification('Note added successfully', 'success');
  };

  // Switch to conversation panel view
  const handleViewConversation = () => {
    setPanelMode('conversation');
  };

  // Switch to logs panel view
  const handleViewLogs = () => {
    setPanelMode('logs');
  };

  // Create grid columns with icons and actions
  const gridColumns = useMemo(() =>
    createGridColumns(visibleColumns, DirectionIcon, CauseIcon, RecordingControls, CallActions, handleAddNote),
    [visibleColumns, createGridColumns]
  );

  // Answered/No-Answer/Outgoing/Incoming are REAL search filters now — each maps
  // to a search[call.*] param that becomes part of the query (server-side), not
  // client-side row hiding. Clicking toggles it into currentSearchParams and
  // re-runs the search, so it also shows as a filter chip in the search bar.
  const QUICK_FILTERS = useMemo(() => ({
    answered: { key: 'search[call.cause][IS]',     value: ['answer'],   field: 'cause' },
    noAnswer: { key: 'search[call.cause][NOT]',    value: ['answer'],   field: 'cause' },
    outgoing: { key: 'search[call.direction][IS]', value: ['outgoing'], field: 'direction' },
    incoming: { key: 'search[call.direction][IS]', value: ['incoming'], field: 'direction' },
  }), []);

  const isQuickActive = useCallback((fk) => {
    const def = QUICK_FILTERS[fk];
    if (!def) return false;
    // Tolerant of how the value is held (array or URL-round-tripped string):
    // the param is active when its key holds every expected value.
    const cur = currentSearchParams?.[def.key];
    if (cur === undefined || cur === null || cur === '') return false;
    const curStr = Array.isArray(cur) ? cur.join(',') : String(cur);
    return def.value.every((v) => curStr.split(',').includes(v));
  }, [QUICK_FILTERS, currentSearchParams]);

  const anyQuickActive = ['answered', 'noAnswer', 'outgoing', 'incoming'].some(isQuickActive);

  const handleQuickFilterToggle = useCallback((fk) => {
    const def = QUICK_FILTERS[fk];
    if (!def) return;
    const active = isQuickActive(fk);
    const next = { ...currentSearchParams };
    // One filter per field (cause | direction) — clear the sibling first so
    // Answered↔No-Answer and Outgoing↔Incoming are mutually exclusive.
    Object.values(QUICK_FILTERS).forEach((d) => { if (d.field === def.field) delete next[d.key]; });
    if (!active) next[def.key] = def.value;
    handleSearch(next, false);
  }, [QUICK_FILTERS, isQuickActive, currentSearchParams, handleSearch]);

  const clearQuickFilters = useCallback(() => {
    const next = { ...currentSearchParams };
    Object.values(QUICK_FILTERS).forEach((d) => { delete next[d.key]; });
    handleSearch(next, false);
  }, [QUICK_FILTERS, currentSearchParams, handleSearch]);

  // Environment scoping goes through the search (the environment segment /
  // selected-environments), not a client-side chip — so the grid shows the
  // fetched rows directly.
  const displayRows = rows;

  // Call statistics strip — ONE upper chart for the whole screen. Chips swap
  // what it shows: the filtered histogram (Cause | Direction), the live-calls
  // charts (Live — the list moved behind a button), or any calls-category
  // report. The screen's filters + date range drive the histogram; the same
  // date range scopes the report runs. Period chips (Today/7d/30d) and a date
  // grouping (Auto/Hour/Day) sit inline, syslog-style.
  const [groupBy, setGroupBy] = useState('cause');        // timeline grouping (server-side key)

  // Group-by options sourced from the API's own fields (segments) rather than a
  // hardcoded list — a segment is offered as a group only if its key is one the
  // aggregate endpoint supports, so every option really groups. Labels come from
  // the API; falls back to the static list before segments load.
  const groupByOptions = useMemo(() => {
    const fromApi = (segments || [])
      .filter((s) => GROUPABLE_SEGMENT_TYPES.has(s.type))
      .map((s) => ({ key: segmentGroupKey(s.name), label: s.label || s.name }))
      .filter((o) => SERVER_GROUP_KEYS.has(o.key));
    // De-dupe by key, then fill in any server-supported keys the segments didn't
    // cover from the static labels, so the list is always complete.
    const staticOptions = GROUP_BY_OPTIONS.map((o) => ({ key: o.key, label: t(o.labelKey) }));
    const byKey = new Map();
    fromApi.forEach((o) => { if (!byKey.has(o.key)) byKey.set(o.key, o); });
    staticOptions.forEach((o) => { if (!byKey.has(o.key)) byKey.set(o.key, o); });
    const list = [...byKey.values()];
    return list.length ? list : staticOptions;
  }, [segments, t]);
  const [aggGrouping, setAggGrouping] = useState(null);   // null=auto | 'hour' | 'day' | 'week'
  const [stripCollapsed, setStripCollapsed] = useState(() => {
    try { return localStorage.getItem('reportsStrip:calls:collapsed') === '1'; } catch { return false; }
  });
  const toggleStripCollapsed = () => setStripCollapsed((c) => {
    try { localStorage.setItem('reportsStrip:calls:collapsed', c ? '0' : '1'); } catch { /* storage unavailable */ }
    return !c;
  });
  const [reportsDrawerOpen, setReportsDrawerOpen] = useState(false);
  const histogramData = useMemo(
    () => convertAggregateToHistogramFormat(aggregate[groupBy] || []),
    [aggregate, groupBy]
  );

  // The strip chart belongs to THIS screen (calls over time) and is no longer
  // fed by the reports engine — reports live in the full reports drawer.

  // Date grouping + quick periods act on the shared range/aggregate.
  const handleGroupingChange = (g) => {
    setAggGrouping(g);
    fetchAggregate(dateRange, currentSearchParams, g, [groupBy]);
  };
  const handleGroupByChange = (g) => {
    setGroupBy(g);
    if (!aggregate[g]) fetchAggregate(dateRange, currentSearchParams, aggGrouping, [g]);
  };
  const handleChartBarClick = useCallback((value) => {
    const field = CALL_GROUP_FILTER_FIELDS[groupBy];
    if (!field || !value || value === 'unknown') return;
    handleSearch({ ...currentSearchParams, [`search[${field}][IS]`]: [value] }, false);
  }, [groupBy, currentSearchParams, handleSearch]);


  return (
    <Box sx={{
      px: { xs: 0.5, sm: 1.5 },
      py: { xs: 0.5, sm: 1 },
      height: '100%',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <LogTabs />
      {/* Search + the four filters worth keeping on screen. The other nine
          segments stay behind the ⚙ panel, which is where a 13-field grid
          belongs. */}
      {!isMobile && (
        <CentralizedSearch
          inlineFilters={INLINE_FILTER_FIELDS}
          segments={segments}
          currentSearchParams={currentSearchParams}
          onFilterChange={handleSearch}
          onQuickSearch={handleQuickSearch}
          onClearAllFilters={() => handleClearAllFilters(setCurrentSearchParams)}
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
          onRefresh={handleRefresh}
          onExport={handleExport}
          onColumnSelectorOpen={handleColumnSelectorOpen}
          quickSearchText={quickSearchText}
          onQuickSearchChange={handleQuickSearchChange}
          placeholder={t('search.placeholder')}
          textParam="search[inline]"
          showExclude={true}
        />
      )}

      {/* Mobile Search Bar (fallback) */}
      {isMobile && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 0.5,
        }}>
          <TextField
            placeholder={t('search.quick')}
            value={quickSearchText}
            onChange={(e) => handleQuickSearchChange(e.target.value)}
            onKeyPress={handleQuickSearch}
            size="small"
            sx={{
              flexGrow: 1,
              minWidth: 150,
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'var(--theme-bg-secondary)',
                borderRadius: '20px',
                fontSize: '0.85rem',
                color: 'var(--theme-text-primary)',
                '& input': { color: 'var(--theme-text-primary)' },
                '& input::placeholder': { color: 'var(--theme-text-secondary)', opacity: 1 },
                '& fieldset': { borderColor: 'var(--theme-border)' },
                '&:hover': {
                  boxShadow: 'var(--shadow-accent-hover)',
                  '& fieldset': { borderColor: 'var(--accent-primary)' },
                },
                '&.Mui-focused': {
                  boxShadow: 'var(--shadow-focus)',
                  '& fieldset': { borderColor: 'var(--accent-primary)' },
                }
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'var(--text-tertiary)', fontSize: '1.1rem' }} />
                </InputAdornment>
              ),
              endAdornment: quickSearchText && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={handleClearQuickSearch}
                    sx={{ p: 0.5, mr: 0.5 }}
                  >
                    <ClearIcon sx={{ fontSize: '0.9rem', color: 'var(--text-tertiary)' }} />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </Box>
      )}
      {/* The headline of the screen: the numbers you came for, at the size that
          says so. Clicking one writes the same search[call.*] param the filter
          pills read, so a card and its pill are one piece of state.
          Rendered even with an empty grid — "0 calls" is an answer; the row
          vanishing is not. A null value renders "—", never a confident 0. */}
      {!isMobile && (
        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5, mb: 1, mt: 0.25, flexWrap: 'wrap' }}>
          {[
            { label: t('stats.total'), value: summaryCounts.total, color: 'var(--counter-total)', filterKey: null, tooltip: t('stats.totalHint') },
            { label: t('stats.answered'), value: summaryCounts.answered, color: 'var(--counter-answered)', filterKey: 'answered', tooltip: t('stats.answeredHint') },
            { label: t('stats.noAnswer'), value: summaryCounts.noAnswer, color: 'var(--counter-no-answer)', filterKey: 'noAnswer', tooltip: t('stats.noAnswerHint') },
            { label: t('stats.outgoing'), value: summaryCounts.outgoing, color: 'var(--counter-outgoing)', filterKey: 'outgoing', tooltip: t('stats.outgoingHint') },
            { label: t('stats.incoming'), value: summaryCounts.incoming, color: 'var(--counter-incoming)', filterKey: 'incoming', tooltip: t('stats.incomingHint') },
          ].map((item) => (
            <StatCounter
              variant="minimal"
              key={item.label}
              label={item.label}
              value={item.value}
              color={item.color}
              tooltip={item.filterKey === null ? item.tooltip : `${item.tooltip} — click again to clear`}
              active={item.filterKey === null ? !anyQuickActive : isQuickActive(item.filterKey)}
              onClick={() => {
                if (item.filterKey === null) clearQuickFilters();
                else handleQuickFilterToggle(item.filterKey);
              }}
            />
          ))}
        </Box>
      )}
      {/* THE chart of the screen. "Live now" swaps the timeline for the live
          monitor; group-by + date-bucket appear only for the timeline, since
          neither means anything to it. Collapse chevron is remembered per
          screen; expand opens the full reports drawer. Filters drive it;
          brushing the histogram filters the table. */}
      {!isMobile && (
        <Paper
          elevation={0}
          sx={{
            flexShrink: 0, border: '1px solid var(--theme-border)', borderRadius: '8px',
            backgroundColor: 'var(--theme-bg-secondary)', px: 1.5, pt: 0.75, pb: stripCollapsed ? 0.75 : 0.25, mb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <BarChartIcon sx={{ fontSize: 16, color: 'var(--theme-text-secondary)' }} />
            {/* The list's own chart — calls over time. Not tied to reports
                (reports live in the full reports drawer); grouped by a field. */}
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
              {chartMode === 'live' ? t('chart.liveCalls') : t('chart.overTime')}
            </Typography>

            {/* Group-by belongs to the timeline only — in live mode it styled a
                chart that isn't on screen. */}
            {chartMode !== 'live' && (
              <>
                <Typography variant="caption" sx={{ color: 'var(--theme-text-secondary)', fontWeight: 600, ml: 0.5 }}>{t('chart.by')}</Typography>
                <Select
                  value={groupByOptions.some((o) => o.key === groupBy) ? groupBy : 'cause'}
                  onChange={(e) => handleGroupByChange(e.target.value)}
                  size="small"
                  sx={{ height: 24, fontSize: '0.72rem', minWidth: 100, '& .MuiSelect-select': { py: 0.25 } }}
                >
                  {groupByOptions.map((o) => (
                    <MenuItem key={o.key} value={o.key} sx={{ fontSize: '0.78rem' }}>{o.label}</MenuItem>
                  ))}
                </Select>
              </>
            )}

            <Box sx={{ flexGrow: 1 }} />

            {/* Live is a view toggle, not a filter — it swaps what this chart
                shows. It used to sit in the counter row, where it read as a
                sixth statistic you could filter by. */}
            {!userSession && <Tooltip title={t('chart.liveToggleHint')}>
              <Chip
                size="small"
                onClick={() => setChartMode((mode) => (mode === 'live' ? 'timeline' : 'live'))}
                variant={chartMode === 'live' ? 'filled' : 'outlined'}
                icon={(
                  <Box
                    component="span"
                    sx={{
                      width: 7, height: 7, borderRadius: '50%', ml: 0.75,
                      bgcolor: chartMode === 'live' ? '#fff' : 'var(--accent-primary)',
                      animation: chartMode === 'live' ? 'calls-live-pulse 1.6s ease-in-out infinite' : 'none',
                      '@keyframes calls-live-pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.25 } },
                    }}
                  />
                )}
                label={liveCallsTotal != null ? t('chart.liveNowCount', { count: liveCallsTotal }) : t('chart.liveNow')}
                sx={{
                  height: 24, borderRadius: 1.5, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                  color: chartMode === 'live' ? '#fff' : 'var(--accent-primary)',
                  bgcolor: chartMode === 'live' ? 'var(--accent-primary)' : undefined,
                  borderColor: 'var(--accent-primary)',
                  '&:hover': { bgcolor: chartMode === 'live' ? 'var(--accent-primary-hover)' : 'var(--accent-primary-alpha-8)' },
                }}
              />
            </Tooltip>}

            {/* Date bucket — top-right of the chart bar, purple button group.
                Timeline-only: live mode has no buckets to size. */}
            {chartMode !== 'live' && (
            <ButtonGroup size="small" variant="outlined">
              {[
                { key: 'auto', label: t('bucket.auto') },
                { key: 'hour', label: t('bucket.hour') },
                { key: 'day', label: t('bucket.day') },
                { key: 'week', label: t('bucket.week') },
              ].map((b) => {
                const active = (aggGrouping || 'auto') === b.key;
                // Same button as the footer's page numbers. The colours set
                // here before painted the active label in its own background
                // colour, so the selected bucket read as a blank block.
                return (
                  <Button
                    key={b.key}
                    onClick={() => handleGroupingChange(b.key === 'auto' ? null : b.key)}
                    variant={active ? 'contained' : 'outlined'}
                    sx={{ minWidth: 34, px: 0.75, fontSize: '11px', py: 0.1 }}
                  >
                    {b.label}
                  </Button>
                );
              })}
            </ButtonGroup>
            )}

            {/* Single date selector for the screen lives in the search bar —
                the duplicate quick-range buttons that used to sit here were
                removed. */}
            <Tooltip title={t('chart.openReports')}>
              <IconButton size="small" onClick={() => setReportsDrawerOpen(true)} sx={{ color: 'var(--theme-text-primary)', p: 0.25 }}>
                <OpenInFullIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={stripCollapsed ? t('chart.show') : t('chart.hide')}>
              <IconButton size="small" onClick={toggleStripCollapsed} sx={{ color: 'var(--theme-text-primary)', p: 0.25 }}>
                {stripCollapsed ? <ExpandMoreIcon sx={{ fontSize: 17 }} /> : <ExpandLessIcon sx={{ fontSize: 17 }} />}
              </IconButton>
            </Tooltip>
          </Box>

          {!stripCollapsed && (chartMode === 'live' ? (
            // Live replaces the chart — live calls monitor in the chart area.
            <Box sx={{ maxHeight: 260, overflow: 'auto', py: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Chip
                  label={t('chart.openList')}
                  size="small"
                  variant="outlined"
                  onClick={() => setLiveDrawerOpen(true)}
                  sx={{ cursor: 'pointer', fontSize: 11, height: 22 }}
                />
              </Box>
              {/* live_calls is InfluxDB-backed and actually served by
                  /api/monitoring/charts. EnvironmentChartsPanel asked for
                  environment_stats, whose mount was deleted from the
                  mothership — the fetcher registry deliberately omits it, so
                  pressing Live surfaced "Unknown chart type: environment_stats"
                  instead of a chart. Live statistics on a list screen come
                  from Influx; Postgres-backed reporting lives on Reports. */}
              {/* Time runs left to right in every language. */}
              <LtrIsland>
                <LiveChartStrip chartType="live_calls" title={t('chart.liveCalls')} autoSeries />
              </LtrIsland>
            </Box>
          ) : aggregateLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 100 }}>
              <CircularProgress size={22} />
            </Box>
          ) : histogramData.length > 0 ? (
            <LtrIsland>
              <TimeHistogram
                logs={[]}
                aggregateData={histogramData}
                height={100}
                onBrushSelection={(start, end) => {
                  // Drag across a spike -> filter the table to exactly that window
                  const from = Math.floor(start.getTime() / 1000);
                  const to = Math.floor(end.getTime() / 1000);
                  handleSearch({ 'search[created_at]': `${from} - ${to}` }, false);
                }}
                onBarClick={handleChartBarClick}
              />
            </LtrIsland>
          ) : (
            <Typography variant="body2" sx={{ color: 'var(--mui-palette-text-secondary)', textAlign: 'center', py: 3 }}>
              {t('chart.empty')}
            </Typography>
          ))}
        </Paper>
      )}
      {isMobile ? (
        selectedCall && panelMode === 'conversation' ? (
          <CallConversationPanel
            call={selectedCall}
            onBack={() => setPanelMode('details')}
            onClose={() => { setSelectedCall(null); setPanelMode('details'); }}
            isMobile
          />
        ) : selectedCall && panelMode === 'logs' ? (
          <CallLogsPanel
            call={selectedCall}
            onBack={() => setPanelMode('details')}
            onClose={() => { setSelectedCall(null); setPanelMode('details'); }}
            isMobile
          />
        ) : selectedCall ? (
          <CallDetailPanel
            call={selectedCall}
            onClose={() => { setSelectedCall(null); setPanelMode('details'); }}
            onOpenRecording={handleOpenRecording}
            onAddNote={handleAddNote}
            onViewConversation={handleViewConversation}
            onViewLogs={handleViewLogs}
            onViewEvents={() => goToEvents('call', selectedCall.uuid || selectedCall.id)}
            isMobile
          />
        ) : (
          <CallMobileView
            rows={displayRows}
            onOpenRecording={handleOpenRecording}
            onRowClick={(call) => setSelectedCall(call)}
            hasNextPage={hasNextPage}
            loadingMore={loadingMore}
            onLoadMore={() => loadMoreCalls(dateRange)}
          />
        )
      ) : (
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
          {/* Data Grid */}
          <Box
            ref={scrollContainerRef}
            sx={{
              flex: 1,
              minHeight: 0,
              transition: 'flex 0.25s ease',
            }}
          >
            <DataGrid
              rows={displayRows}
              columns={gridColumns}
              loading={loadingCalls}
              error={errorCalls}
              onRowsScrollEnd={handleRowsScrollEnd}
              onRowClick={(params) => setSelectedCall(params.row)}
              hideFooterPagination
              disableSelectionOnClick
              autoHeight={false}
              rowHeight={44}
              sx={{
                height: '100%',
                border: '1px solid var(--theme-border)',
                borderRadius: '8px',
                backgroundColor: 'var(--widget-content-bg)',
                // Logs (syslog) typography — small monospace for dense scanning.
                fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
                fontSize: '12px',
                '& .MuiDataGrid-cellContent, & .MuiDataGrid-cell': {
                  fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
                  fontSize: '12px',
                },
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: 'var(--widget-header-bg)',
                  borderBottom: '1px solid var(--theme-border)',
                },
                '& .MuiDataGrid-columnHeader': {
                  backgroundColor: 'var(--widget-header-bg)',
                  color: 'var(--theme-text-primary)',
                  fontWeight: 600,
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                  color: 'var(--theme-text-primary)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                },
                '& .MuiDataGrid-cell': {
                  borderBottom: '1px solid var(--theme-border)',
                  color: 'var(--theme-text-primary)',
                },
                '& .MuiDataGrid-row': {
                  cursor: 'pointer',
                  '&:nth-of-type(even)': {
                    backgroundColor: 'var(--theme-bg-secondary)',
                  },
                  '&:hover': {
                    backgroundColor: 'var(--theme-hover)',
                  },
                  '&.Mui-selected': {
                    backgroundColor: 'var(--accent-primary-alpha-8)',
                    '&:hover': {
                      backgroundColor: 'var(--accent-primary-alpha-12)',
                    }
                  },
                },
                '& .MuiDataGrid-footerContainer': {
                  backgroundColor: 'var(--widget-header-bg)',
                  borderTop: '1px solid var(--theme-border)',
                },
                '& .MuiDataGrid-virtualScroller': {
                  backgroundColor: 'var(--widget-content-bg)',
                },
                '& .MuiTablePagination-root': {
                  color: 'var(--theme-text-primary)',
                },
                '& .MuiIconButton-root': {
                  color: 'var(--theme-text-secondary)',
                },
              }}
              sortingMode="server"
              sortModel={sortModel}
              onSortModelChange={handleSortModelChangeWithSync}
              slots={{
                footer: () => (
                  <CustomFooter
                    isClientFiltered={isClientFiltered}
                    loadingMore={loadingMore}
                    hasNextPage={hasNextPage}
                    onClearFilter={() => handleClearAllFilters(setCurrentSearchParams)}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalRecords={totalRecords}
                    onGoToPage={(page) => goToPage(page, dateRange)}
                  />
                ),
              }}
            />
          </Box>
          {selectedCall && panelMode === 'details' && (
            <CallDetailPanel
              call={selectedCall}
              onClose={() => { setSelectedCall(null); setPanelMode('details'); }}
              onOpenRecording={handleOpenRecording}
              onAddNote={handleAddNote}
              onViewConversation={handleViewConversation}
              onViewLogs={handleViewLogs}
              onViewEvents={() => goToEvents('call', selectedCall.uuid || selectedCall.id)}
            />
          )}
          {selectedCall && panelMode === 'conversation' && (
            <CallConversationPanel
              call={selectedCall}
              onBack={() => setPanelMode('details')}
              onClose={() => { setSelectedCall(null); setPanelMode('details'); }}
            />
          )}
          {selectedCall && panelMode === 'logs' && (
            <CallLogsPanel
              call={selectedCall}
              onBack={() => setPanelMode('details')}
              onClose={() => { setSelectedCall(null); setPanelMode('details'); }}
            />
          )}
        </Box>
      )}
      <RecordingDialog
        open={recordingDialogOpen}
        selectedRecording={selectedRecording}
        analysisLoading={analysisLoading}
        analysisResult={analysisResult}
        analysisError={analysisError}
        onClose={handleCloseRecording}
        onAnalyze={handleAnalyzeRecording}
      />
      <ColumnSelector
        anchorEl={columnSelectorAnchorEl}
        open={Boolean(columnSelectorAnchorEl)}
        onClose={handleColumnSelectorClose}
        visibleColumns={visibleColumns}
        onToggle={handleToggleColumnVisibility}
        onSelectAll={handleSelectAllColumns}
        onDeselectAll={handleDeselectAllColumns}
        onReset={handleResetColumns}
        columns={Object.entries(availableColumns || {}).map(([field, col]) => ({
          field,
          headerName: col.name || field
        }))}
      />
      <FilterEditDialog
        open={editDialogOpen}
        onClose={handleCancelEdit}
        onSave={() => handleSaveEditedFilter(currentSearchParams)}
        editingFilter={editingFilter}
        editValue={editValue}
        editOperator={editOperator}
        onValueChange={setEditValue}
        onOperatorChange={setEditOperator}
      />
      <LiveDrawer
        open={liveDrawerOpen}
        onClose={() => setLiveDrawerOpen(false)}
        title={t('drawer.liveCalls')}
        icon={<PhoneInTalkIcon sx={{ color: '#5c6bc0' }} />}
        count={liveCallsTotal}
        onRefresh={refreshLiveCalls}
        width={{ xs: '100%', sm: '70%', md: '48%', lg: '38%' }}
      >
        {liveDrawerOpen && <LiveCallsPanel open={liveDrawerOpen} />}
      </LiveDrawer>

      {/* Full call reports — every queries.yml :category: calls report, tables incl. */}
      <LiveDrawer
        open={reportsDrawerOpen}
        onClose={() => setReportsDrawerOpen(false)}
        title={t('drawer.reports')}
        icon={<AssessmentIcon sx={{ color: '#0e9488' }} />}
      >
        {reportsDrawerOpen && <ReportsPanel category="calls" open={reportsDrawerOpen} />}
      </LiveDrawer>
    </Box>
  );
};

export default Calls;
