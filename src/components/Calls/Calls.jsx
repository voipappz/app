import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import LtrIsland from '../../i18n/LtrIsland';
import './Calls.css'; // Styles
import './CellWithHover/CellWithHover.css'; // Cell hover styles
import useCalls, { allTimeRange, todayRange, NOT_ANSWERED_CAUSES } from './Calls.js'; // Custom hook
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
import { usePermissions } from '../../hooks/usePermissions';
import RowEventsButton from '../shared/RowEventsButton/RowEventsButton.jsx';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { SIDEBAR_WIDTH } from '../Portal/PortalSidebar.jsx';
import { formatDuration } from '../../utils/phoneUtils';

// Components
import RecordingDialog from './RecordingDialog/RecordingDialog.jsx';
import CustomFooter from './CustomFooter/CustomFooter.jsx';
import ColumnSelector from './ColumnSelector/ColumnSelector.jsx';
import FilterEditDialog from './FilterEditDialog/FilterEditDialog.jsx';
import CallActions from './CallActions/CallActions.jsx';
import CallLogFilter from './CallLogFilter/CallLogFilter';
import { activeCallFilter, withCallFilter } from './CallLogRow/callDirection';
import CallMobileView from './CallMobileView/CallMobileView.jsx';
import CallDetailPanel from './CallDetailPanel/CallDetailPanel.jsx';
import StatChips from '../shared/StatChips/StatChips.jsx';
import { DirectionIcon, CauseIcon, RecordingControls } from './CallIcons.jsx';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import FilterPills from '../shared/FilterPills/FilterPills.jsx';
import TimeHistogram from '../../views/syslogs/TimeHistogram';
import { convertAggregateToHistogramFormat } from '../../utils/logFormatting';
import PhoneIcon from '@mui/icons-material/Phone';
import PhoneMissedIcon from '@mui/icons-material/PhoneMissed';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import DateLocalizationProvider from '../../i18n/DateLocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { useNavigate } from 'react-router';
import useNavBadges from '../../hooks/useNavBadges';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { formatClock, formatPercent } from './callFormat';
import { callFieldName, callValueName } from './callWords';
import { formatNumber } from '../../utils/numberUtils';

// MUI Components
import {
  Box, Typography, IconButton, TextField, InputAdornment, Paper, useTheme, useMediaQuery,
  CircularProgress, Select, MenuItem, Tooltip, Button, ButtonGroup, Drawer, Divider,
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
import { DataGrid } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { saveExportResponse } from '../../utils/downloadExport';

// Server segment names (see Segment.calls) — the four fields people actually
// filter calls by. The other nine stay behind the ⚙ panel.
const INLINE_FILTER_FIELDS = ['call.cause', 'call.direction', 'call.caller', 'call.callee'];

// Every control in the chart toolbar is 36px tall with 8px corners.
const TOOLBAR_GROUP_SX = {
  height: 36, minHeight: 36,
  '& .MuiButton-root': { height: 36, minHeight: 36 },
  '& .MuiButtonGroup-firstButton, & .MuiButtonGroup-grouped:first-of-type': { borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px' },
  '& .MuiButtonGroup-lastButton, & .MuiButtonGroup-grouped:last-of-type': { borderTopRightRadius: '8px', borderBottomRightRadius: '8px' },
};
const TOOLBAR_PICKER_SX = { width: 170, '& .MuiOutlinedInput-root': { height: 36, minHeight: 36, borderRadius: '8px' } };

// A panel's open/closed choice, remembered in this browser under `key`
// (false, open, until someone closes it). Storage may be unavailable.
function useRememberedFlag(key) {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  const toggle = () => setOn((current) => {
    try { localStorage.setItem(key, current ? '0' : '1'); } catch { /* storage unavailable */ }
    return !current;
  });
  return [on, toggle];
}

const Calls = () => {
  const { t } = useTranslation('calls');
  const [quickSearchText, setQuickSearchText] = React.useState('');
  const [selectedCall, setSelectedCall] = React.useState(null);
  // "Live now" is one chip at the end of the counter row, and a link to /live.
  // Its count is the sidebar's: useNavBadges already polls action=live every
  // 30s for the Calls nav badge, so the chip and the badge say the same number.
  // action=live is served to an account only; a portal user has no live count.
  const userSession = useIsUserSession();
  const navigate = useNavigate();
  const { liveCalls } = useNavBadges(!userSession);
  // The call detail panel's "Events" button: the Postgres event store for this
  // call. It used to be wired to the per-record logs modal, which is gone --
  // logs are read on the Logs screen (/logs) only.
  const goToEvents = useNavigateToEvents();
  const { canAccess } = usePermissions();
  const canViewEvents = canAccess('logs');

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
  // Below lg the chart toolbar folds: the grouping becomes one select and the
  // bucket buttons go, so the row stays one row.
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));
  // Eight group-by buttons only fit beside the period, the pickers and the
  // actions on a wide screen; below xl they are one Select (seen wrapping
  // at 1440, with "by" stranded at the end of the first row).
  const compactGroupBy = useMediaQuery(theme.breakpoints.down('xl'));
  
  // Data and API calls
  const {
    columns: apiColumns,
    allRows,
    hasNextPage,
    currentPage,
    totalPages,
    totalRecords,
    waitingForCalls,
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
  } = useCalls({ allTime: isMobile });
  // The open call as the list has it now, so a refresh (after blocking its
  // number, say) shows in the panel too; a call opened from History may not
  // be in the list, and is shown as it was opened.
  const sameCall = (a, b) => (a.uuid || a.id) === (b.uuid || b.id);
  const openCall = selectedCall && ((allRows || []).find((row) => sameCall(row, selectedCall)) || selectedCall);
  // The filters' names as shown: the API names them in English (callWords.js).
  const shownSegments = useMemo(
    () => (segments || []).map((segment) => ({
      ...segment,
      label: callFieldName(segment.name || segment.field, segment.label),
      ...(Array.isArray(segment.data) && {
        data: segment.data.map((option) => (option && typeof option === 'object'
          ? { ...option, name: callValueName(option.value ?? option.uuid ?? option.id, option.name ?? option.label) }
          : option)),
      }),
    })),
    [segments, t],
  );

  // Crossing the phone breakpoint swaps the range: a phone starts at All (back
  // to the first call), a desktop at today again.
  // URL sync refetches whenever the range changes.
  const [period, setPeriod] = useState(isMobile ? 'all' : 'today');
  const wasMobile = useRef(isMobile);
  useEffect(() => {
    if (wasMobile.current === isMobile) return;
    wasMobile.current = isMobile;
    setDateRange(isMobile ? allTimeRange() : todayRange());
    setPeriod(isMobile ? 'all' : 'today');
  }, [isMobile, setDateRange]);

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
      registerScreen('calls', shownSegments, {
        onSearch: (params) => {
          handleSearch(params, false);
        },
        onClear: () => {
          handleClearAllFilters(setCurrentSearchParams);
        },
      });
    }
    return () => unregisterScreen();
  }, [shownSegments, registerScreen, unregisterScreen]);

  // Handle date range changes
  const handleDateRangeChange = (newRange) => {
    setDateRange(newRange);
    // Preserve existing search parameters when changing date range
    fetchCalls(newRange, currentSearchParams);
  };

  // Manual refresh with current filters and date range
  const handleRefresh = useCallback(() => {
    fetchCalls(dateRange, currentSearchParams);
  }, [fetchCalls, dateRange, currentSearchParams]);

  // The quick search: the top bar's field on desktop, the TextField on a phone.
  const handleQuickSearch = (e) => {
    if (e.key === 'Enter') {
      if (quickSearchText.trim()) {
        // The call filter stays on while searching.
        const searchParams = withCallFilter({ 'search[inline]': quickSearchText.trim() }, activeCallFilter(currentSearchParams));
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
        showNotification(t('export.failed'), 'error');
        return;
      }

      // Saves the streamed CSV body, or fetches a legacy x-report URL WITH the
      // token. Returns false when neither worked, so we build the CSV below.
      if (await saveExportResponse(response, { access })) {
        showNotification(t('export.ready'), 'success');
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
      showNotification(t('export.failed'), 'error');
    }
  };


  // Keep the phone's search field in step with the params (a search[inline]
  // arriving in the URL, or every filter cleared).
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
    showNotification(t('actions.noteAdded'), 'success');
  };

  // Create grid columns with icons and actions
  const gridColumns = useMemo(() => {
    const columns = createGridColumns(visibleColumns, DirectionIcon, CauseIcon, RecordingControls);
    return [...columns, {
      // The row's own actions, for an account and a user alike: details,
      // Events (with `logs`), and the ⋮ menu (call back, copy, note, block).
      field: 'callRowActions',
      headerName: '',
      width: canViewEvents ? 122 : 86,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      resizable: false,
      align: 'right',
      renderCell: ({ row }) => (
        // A click in here (or in the ⋮ menu, through its portal) is not a row click.
        <Box onClick={(event) => event.stopPropagation()} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: '100%' }}>
          <Tooltip title={t('row.callInfo')}>
            <IconButton size="small" aria-label={t('row.callInfo')} onClick={(event) => {
              event.stopPropagation();
              setSelectedCall(row);
            }}>
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        <RowEventsButton
          subject="call"
          uuid={row.uuid || row.id}
          sx={{
            bgcolor: 'var(--theme-bg-primary)',
            boxShadow: 'var(--shadow-subtle)',
            '&:hover': { bgcolor: 'var(--accent-primary-alpha-12)' },
          }}
        />
          <CallActions call={row} onAddNote={handleAddNote} onBlockChanged={handleRefresh} />
        </Box>
      ),
    }];
  }, [visibleColumns, createGridColumns, canViewEvents, handleRefresh]);

  // Answered/No-Answer/Outgoing/Incoming are REAL search filters now — each maps
  // to a search[call.*] param that becomes part of the query (server-side), not
  // client-side row hiding. Clicking toggles it into currentSearchParams and
  // re-runs the search, so it also shows as a filter chip in the search bar.
  const QUICK_FILTERS = useMemo(() => ({
    answered: { key: 'search[call.cause][IS]',     value: ['answer'],   field: 'cause' },
    // The same causes the No Answer counter sums — a call with no cause is
    // not "no answer", so the filter does not use NOT answer.
    noAnswer: { key: 'search[call.cause][IS]',     value: NOT_ANSWERED_CAUSES, field: 'cause' },
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
    const fromApi = shownSegments
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
  }, [shownSegments, t]);
  const [aggGrouping, setAggGrouping] = useState(null);   // null=auto | 'hour' | 'day' | 'week'
  const [stripCollapsed, toggleStripCollapsed] = useRememberedFlag('reportsStrip:calls:collapsed');
  // The phone's statistics boxes: open until folded away, and remembered.
  const [statsCollapsed, toggleStatsCollapsed] = useRememberedFlag('calls:mobileStats:collapsed');
  // Legend names in plain words; an unknown key is shown humanised.
  const seriesLabel = useCallback((key) => {
    const known = {
      answer: t('series.answer', { defaultValue: 'Answered' }),
      no_answer: t('series.no_answer', { defaultValue: 'No answer' }),
      busy: t('series.busy', { defaultValue: 'Busy' }),
      error: t('series.error', { defaultValue: 'Failed' }),
      none: t('series.none', { defaultValue: 'No result' }),
      unknown: t('series.unknown', { defaultValue: 'Unknown' }),
      incoming: t('stats.incoming'),
      outgoing: t('stats.outgoing'),
    };
    return known[key] || String(key).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }, [t]);

  // The chart's hover box: "Total: 12 calls".
  const chartTotalText = useCallback((count) => t('chart.total', { n: formatNumber(count) }), [t]);

  // Quick periods, like the Logs screen. A picked from/to makes it 'custom'.
  // 'all' is the phone's: it starts there (back to the first call).
  const handlePeriod = useCallback((key) => {
    const now = new Date();
    let start;
    let end = now;
    if (key === 'all') {
      [start, end] = allTimeRange();
    } else if (key === 'today') {
      start = new Date(now); start.setHours(0, 0, 0, 0);
      end = new Date(now); end.setHours(23, 59, 59, 999);
    } else {
      const hours = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }[key];
      start = new Date(now.getTime() - hours * 3600 * 1000);
    }
    setPeriod(key);
    handleDateRangeChange([start, end]);
  }, [handleDateRangeChange]);

  // The period, and the counters that filter: one each, for the desktop
  // toolbar and the phone's rows above the list.
  const periodButtons = (
    <ButtonGroup size="small" variant="outlined" aria-label={t('period.label', { defaultValue: 'Period' })} sx={TOOLBAR_GROUP_SX}>
      {[
        ...(isMobile ? [{ key: 'all', label: t('period.all', { defaultValue: 'All' }) }] : []),
        { key: 'today', label: t('period.today', { defaultValue: 'Today' }) },
        { key: '24h', label: '24h' },
        { key: '7d', label: '7d' },
        { key: '30d', label: '30d' },
      ].map((p) => (
        <Button
          key={p.key}
          onClick={() => handlePeriod(p.key)}
          variant={period === p.key ? 'contained' : 'outlined'}
          sx={{ minWidth: isMobile ? 0 : 48, px: 1, textTransform: 'none', flex: isMobile ? 1 : undefined }}
        >
          {p.label}
        </Button>
      ))}
    </ButtonGroup>
  );
  const counterItems = [
    { key: 'total', label: t('stats.total'), hint: t('stats.totalHint'), value: summaryCounts.total, icon: <PhoneIcon />, colorVar: '--counter-total', filterKey: null },
    {
      key: 'answered',
      label: summaryCounts.answerRate == null ? t('stats.answered') : `${t('stats.answered')} · ${formatPercent(summaryCounts.answerRate)}`,
      hint: t('stats.answeredHint'), value: summaryCounts.answered, icon: <PhoneInTalkIcon />, colorVar: '--counter-answered', filterKey: 'answered',
    },
    { key: 'noAnswer', label: t('stats.noAnswer'), hint: t('stats.noAnswerHint'), value: summaryCounts.noAnswer, icon: <PhoneMissedIcon />, colorVar: '--counter-no-answer', filterKey: 'noAnswer' },
    { key: 'outgoing', label: t('stats.outgoing'), hint: t('stats.outgoingHint'), value: summaryCounts.outgoing, icon: <CallMadeIcon />, colorVar: '--counter-outgoing', filterKey: 'outgoing' },
    { key: 'incoming', label: t('stats.incoming'), hint: t('stats.incomingHint'), value: summaryCounts.incoming, icon: <CallReceivedIcon />, colorVar: '--counter-incoming', filterKey: 'incoming' },
  ].map(({ filterKey, value, ...item }) => ({
    ...item,
    // null is "unknown", never a confident 0.
    value: value == null ? '—' : value,
    active: filterKey === null ? !anyQuickActive : isQuickActive(filterKey),
    onClick: () => (filterKey === null ? clearQuickFilters() : handleQuickFilterToggle(filterKey)),
  })).concat([
    { key: 'avgDuration', label: t('stats.avgDuration'), hint: t('stats.avgDurationHint'), value: formatClock(summaryCounts.avgDuration), icon: <TimerOutlinedIcon /> },
  ]);

  const histogramData = useMemo(
    () => convertAggregateToHistogramFormat(aggregate[groupBy] || []),
    [aggregate, groupBy]
  );

  // The strip chart belongs to THIS screen (calls over time) and is no longer
  // fed by the reports engine — reports have their own screen (the sidebar).

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
      {/* Mobile Search Bar (fallback) */}
      {isMobile && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 0.5,
        }}>
          <CallLogFilter
            value={activeCallFilter(currentSearchParams)}
            onChange={(choice) => handleSearch(withCallFilter(currentSearchParams, choice), false)}
          />
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
      {/* The phone's period and counters, the desktop's own pieces: the
          period buttons stretch to the width, the counters (which filter, as
          on the desktop) wrap under them. No chart: it does not fit. */}
      {isMobile && (
        <Box data-testid="calls-mobile-summary" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 0.75 }}>
          <Box sx={{ display: 'flex', '& > .MuiButtonGroup-root': { flex: 1 } }}>{periodButtons}</Box>
          {/* The statistics, and the arrow that folds them at their top-end
              corner, in the same place open or folded. Folded, the first box
              (Total) stays, with any box whose filter is on, so a filter in
              use is never out of sight; the list gets the rest of the room. */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
            <StatChips
              items={statsCollapsed ? counterItems.filter((item, index) => index === 0 || item.active) : counterItems}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Tooltip title={statsCollapsed ? t('mobile.showStats') : t('mobile.hideStats')}>
              <IconButton
                size="small" onClick={toggleStatsCollapsed} data-testid="calls-stats-toggle"
                aria-label={statsCollapsed ? t('mobile.showStats') : t('mobile.hideStats')}
                aria-expanded={!statsCollapsed}
                sx={{ flexShrink: 0, mt: 0.25, color: 'var(--theme-text-secondary)' }}
              >
                {statsCollapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      )}
      {/* THE chart of the screen. One toolbar row above it, every control
          36px: the period (quick ranges, then from / to), the table actions,
          then what the chart is split by, the bucket, and the collapse
          chevron (remembered per screen). Filters drive it; brushing the
          histogram filters the table. */}
      {!isMobile && (
        <Paper
          elevation={0}
          data-testid="calls-chart"
          sx={{
            flexShrink: 0, border: '1px solid var(--theme-border)', borderRadius: '8px',
            backgroundColor: 'var(--theme-bg-secondary)', px: 1.5, pt: 0.75, pb: stripCollapsed ? 0.75 : 0.25, mb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', minHeight: 40 }}>

            {periodButtons}

            <DateLocalizationProvider>
              <Box data-testid="calls-chart-date-range" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <DateTimePicker
                  value={dateRange?.[0] ? new Date(dateRange[0]) : null}
                  onChange={(d) => { if (d) { setPeriod('custom'); handleDateRangeChange([d, dateRange?.[1] ? new Date(dateRange[1]) : new Date()]); } }}
                  ampm={false}
                  slotProps={{ textField: { size: 'small', sx: TOOLBAR_PICKER_SX } }}
                />
                <Typography variant="body2" color="text.secondary">{t('period.to', { defaultValue: 'to' })}</Typography>
                <DateTimePicker
                  value={dateRange?.[1] ? new Date(dateRange[1]) : null}
                  onChange={(d) => { if (d) { setPeriod('custom'); handleDateRangeChange([dateRange?.[0] ? new Date(dateRange[0]) : new Date(), d]); } }}
                  ampm={false}
                  slotProps={{ textField: { size: 'small', sx: TOOLBAR_PICKER_SX } }}
                />
              </Box>
            </DateLocalizationProvider>

            {/* The table's three actions, one group: they used to sit in the
                search field's popup, which is gone. */}
            <ButtonGroup size="small" variant="outlined" data-testid="calls-toolbar-actions" aria-label={t('toolbar.actions')} sx={TOOLBAR_GROUP_SX}>
              {[
                { key: 'refresh', label: t('common:search.refresh'), icon: <RefreshIcon fontSize="small" />, onClick: handleRefresh },
                { key: 'export', label: t('common:search.exportCsv'), icon: <FileDownloadIcon fontSize="small" />, onClick: handleExport },
                { key: 'columns', label: t('common:search.columns'), icon: <ViewColumnIcon fontSize="small" />, onClick: handleColumnSelectorOpen },
              ].map((a) => (
                <Tooltip key={a.key} title={a.label}>
                  <Button aria-label={a.label} onClick={a.onClick} sx={{ width: 36, minWidth: 36, px: 0, color: 'var(--theme-text-secondary)' }}>
                    {a.icon}
                  </Button>
                </Tooltip>
              ))}
            </ButtonGroup>

            {/* Group-by, bucket and the collapse chevron wrap as one unit,
                so "by" never ends up alone at the end of a row. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, ml: 'auto' }}>
            <Typography variant="body2" color="text.secondary">{t('chart.by')}</Typography>
            {compactGroupBy ? (
              <Select
                size="small"
                value={groupBy}
                onChange={(e) => handleGroupByChange(e.target.value)}
                inputProps={{ 'aria-label': t('chart.groupBy') }}
                sx={{ height: 36, minHeight: 36, borderRadius: '8px', fontSize: '0.8rem', '& .MuiSelect-select': { py: 0 } }}
              >
                {groupByOptions.map((o) => <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>)}
              </Select>
            ) : (
              <ButtonGroup size="small" variant="outlined" aria-label={t('chart.groupBy')} sx={TOOLBAR_GROUP_SX}>
                {groupByOptions.map((o) => (
                  <Button
                    key={o.key}
                    onClick={() => handleGroupByChange(o.key)}
                    variant={groupBy === o.key ? 'contained' : 'outlined'}
                    sx={{ textTransform: 'none', px: 1.25 }}
                  >
                    {o.label}
                  </Button>
                ))}
              </ButtonGroup>
            )}

            {!isNarrow && (
              <ButtonGroup size="small" variant="outlined" aria-label={t('bucket.label')} sx={TOOLBAR_GROUP_SX}>
                {['auto', 'hour', 'day', 'week'].map((k) => (
                  <Button
                    key={k}
                    onClick={() => handleGroupingChange(k === 'auto' ? null : k)}
                    variant={(aggGrouping || 'auto') === k ? 'contained' : 'outlined'}
                    sx={{ textTransform: 'none', px: 1.25 }}
                  >
                    {t(`bucket.${k}`)}
                  </Button>
                ))}
              </ButtonGroup>
            )}

            <Tooltip title={stripCollapsed ? t('chart.show') : t('chart.hide')}>
              <IconButton
                onClick={toggleStripCollapsed}
                aria-label={stripCollapsed ? t('chart.show') : t('chart.hide')}
                sx={{ width: 36, height: 36, borderRadius: '8px', color: 'var(--theme-text-secondary)' }}
              >
                {stripCollapsed ? <ExpandMoreIcon sx={{ fontSize: 22 }} /> : <ExpandLessIcon sx={{ fontSize: 22 }} />}
              </IconButton>
            </Tooltip>
            </Box>
          </Box>

          {!stripCollapsed && (aggregateLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 100 }}>
              <CircularProgress size={22} />
            </Box>
          ) : histogramData.length > 0 ? (
            <LtrIsland>
              <TimeHistogram
                logs={[]}
                aggregateData={histogramData}
                height={180}
                showLegend
                labelFor={seriesLabel}
                totalText={chartTotalText}
                onLegendClick={handleChartBarClick}
                onBrushSelection={(start, end) => {
                  // Drag across a spike -> filter the table to exactly that window
                  const from = Math.floor(start.getTime() / 1000);
                  const to = Math.floor(end.getTime() / 1000);
                  handleSearch({ 'search[created_at]': `${from} - ${to}` }, false);
                }}
                onBarClick={handleChartBarClick}
              />
            </LtrIsland>
          ) : null)}
        </Paper>
      )}
      {/* The counters ARE the filters, and they share one row with the pills:
          clicking a counter writes the same search[call.*] param a pill reads,
          so a chip and its pill are one piece of state. Then the Filters
          button (the full panel, in a popover) and the chips for whatever else
          is active. Live now sits at the far right and leads to /live.
          Rendered even with an empty grid — "0 calls" is an answer; the row
          vanishing is not. A null value renders "—", never a confident 0. */}
      {!isMobile && (
        <Box data-testid="calls-counters" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.25 }}>
          <StatChips items={counterItems} />
          <Divider orientation="vertical" flexItem sx={{ borderColor: 'var(--theme-border)', my: 0.5 }} />
          {/* The four fields people actually filter calls by, as pills. The
              other nine are behind the Filters button. */}
          <FilterPills
            segments={shownSegments}
            fields={INLINE_FILTER_FIELDS}
            currentSearchParams={currentSearchParams}
            onChange={handleSearch}
          />
          {/* The search field docks into the top bar (inline search over
              calls, search[inline]); its popup holds the full filter panel.
              Refresh / Export / Columns stay in the chart toolbar. */}
          <CentralizedSearch
            inlineFilters={INLINE_FILTER_FIELDS}
            segments={shownSegments}
            currentSearchParams={currentSearchParams}
            onFilterChange={handleSearch}
            onQuickSearch={handleQuickSearch}
            quickSearchText={quickSearchText}
            onQuickSearchChange={handleQuickSearchChange}
            onRefresh={handleRefresh}
            placeholder={t('search.placeholder')}
            onClearAllFilters={() => handleClearAllFilters(setCurrentSearchParams)}
            textParam="search[inline]"
            showExclude={true}
            // The period is chosen in the chart's toolbar, beside the grouping.
            hideDateRange
          />
          {!userSession && (
            <StatChips
              sx={{ ml: 'auto' }}
              items={[{ key: 'live', live: true, label: t('chart.liveNow'), value: liveCalls, colorVar: '--counter-answered', hint: t('chart.liveNowHint'), onClick: () => navigate('/live') }]}
            />
          )}
        </Box>
      )}

      {isMobile ? (
        (
          <CallMobileView
            rows={displayRows}
            loading={waitingForCalls}
            error={errorCalls}
            onRetry={handleRefresh}
            hasNextPage={hasNextPage}
            loadingMore={loadingMore}
            onLoadMore={() => loadMoreCalls(dateRange)}
            onBlockChanged={handleRefresh}
            canViewEvents={canViewEvents}
            onViewEvents={(call) => goToEvents('call', call.uuid || call.id)}
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
              // Lets the grid shrink (it scrolls inside) so a wide column set
              // never pushes the call panel off screen.
              minWidth: 0,
              transition: 'flex 0.25s ease',
            }}
          >
            <DataGrid
              rows={displayRows}
              columns={gridColumns}
              // Loading until the first answer, not "No rows" before any request.
              loading={waitingForCalls}
              error={errorCalls}
              onRowsScrollEnd={handleRowsScrollEnd}
              onRowClick={(params) => setSelectedCall(params.row)}
              hideFooterPagination
              disableSelectionOnClick
              autoHeight={false}
              // Dense, like the Logs screen: more calls on screen, less chrome.
              rowHeight={34}
              columnHeaderHeight={36}
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
                  // One baseline per row: the recording player sat above the text.
                  display: 'flex',
                  alignItems: 'center',
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

        </Box>
      )}
      <Drawer
        anchor="right"
        open={Boolean(selectedCall)}
        onClose={() => setSelectedCall(null)}
        PaperProps={{ sx: {
          width: { xs: '100vw', sm: SIDEBAR_WIDTH },
          maxWidth: '100vw',
          border: 'none',
          '& .call-detail-panel': { width: '100%', minHeight: 0, border: 'none', borderRadius: 0, animation: 'none' },
        } }}
      >
          {openCall && (
            <CallDetailPanel
              call={openCall}
              onBlockChanged={handleRefresh}
              onClose={() => setSelectedCall(null)}
              onOpenCall={setSelectedCall}
              onViewEvents={() => goToEvents('call', selectedCall.uuid || selectedCall.id)}
            />
          )}
      </Drawer>
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
          headerName: callFieldName(col.type === 'link' ? col.link_prop : (col.sub_prop || field), col.name || field)
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
    </Box>
  );
};

export default Calls;
