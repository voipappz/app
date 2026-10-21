import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import LogVolumeChart from './LogVolumeChart.jsx';
import {
  Box,
  Paper,
  TextField,
  Chip,
  Typography,
  InputAdornment,
  IconButton,
  FormControlLabel,
  Switch,
  Tooltip,
  Alert,
  Button,
  Divider,
  ButtonGroup,
  FormControl,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  TablePagination,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  FilterAlt as FilterAltIcon,
  FilterAltOff as FilterAltOffIcon,
  FiberManualRecord as DotIcon,
  Download as DownloadIcon,
  ContentCopy as ContentCopyIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import DateLocalizationProvider from '../../i18n/DateLocalizationProvider';
import { useSystemLogs, chartGroupFor, chartInterval, FACETS } from './SystemLogs';
import { formatNumber } from '../../utils/numberUtils';
import LogFacets from './LogFacets.jsx';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import {
  LEVEL_CONFIG,
  AUTO_REFRESH_OPTIONS,
  normalizeSeverityKey,
  PERIOD_OPTIONS,
  SEVERITY_ORDER,
} from '../../utils/logFormatting';

const parseLogFields = (message = '') => {
  const fields = {};
  String(message).replace(/(?:^|\s)([a-zA-Z_][\w.-]*)=([^\s]*)/g, (_match, key, value) => {
    fields[key] = value;
    return _match;
  });
  return fields;
};

// One call (or one node request) is one `session=<id>` across the node's
// lines and this API's; the message TYPE is the `action` tag — an action
// (did.updated, node.license_invalid) or a node line's request kind (sip_auth,
// dialplan, sofia.conf). Both ride in the message as key=value extras and the
// API also parses them into `fields`.
const fieldsOf = (log) => log.fields || parseLogFields(log.message || log.msg);
const sessionOf = (log) => String(log.session || fieldsOf(log).session || '');
const typeOf = (log) => String(log.action || fieldsOf(log).action || fieldsOf(log).kind || '');
const shortId = (id) => (id.length > 14 ? `${id.slice(0, 8)}…` : id);
const SESSION_NEEDLE = /^session=(\S+)$/;

// Crystal's NATS relay preserves the logger/component by prefixing the stored
// message (`http.client: Performing request`). Split that transport shape for
// display without changing the raw value shown in Log details. The session and
// type extras are shown as chips on the line, so they leave the text too.
const displayLog = (log) => {
  const rawMessage = String(log.message || log.msg || '');
  const relayedNodeLine = (log.app === 'node' || log.app === 'crystal')
    ? rawMessage.match(/^([\w./-]+):\s+([\s\S]+)$/)
    : null;
  // Pliny appends its extras AFTER the message text, so only a trailing run of
  // these tokens is metadata; the same words inside a sentence stay.
  const message = (relayedNodeLine?.[2] || rawMessage)
    .replace(/(?:\s+(?:session|kind|action)=\S*)+\s*$/, '')
    .trim();
  return {
    source: log.source || relayedNodeLine?.[1] || log.app || log.type || 'Unknown',
    message,
  };
};

// Fixed column widths of the log table.
const COL = { time: 150, host: 120, source: 110 };
// "2026-10-14 17:24:03.150" from whatever time shape the row carries.
const formatLogTime = (t) => {
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return String(t);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};
// The chart's split, named by the server tag it counts by.
const CHART_GROUP_LABELS = { severity: 'Level', app: 'Source', host: 'Server', action: 'Type' };

// Main SystemLogs component
const SystemLogs = ({ initialParams }) => {
  const { selectedCustomer, isRoot } = useCustomerEnvironment();
  const {
    logs,
    loading,
    totalCount,
    pagination,
    setPage,
    setPageSize,
    volume,
    volumeLoading,
    facets,
    facetsLoading,

    apps,
    nodes,
    actions,

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

    dateRange,
    setDateRange,
    handlePeriodSelect,

    autoRefreshInterval,
    setAutoRefreshInterval,

    refreshLogs,
    clearFilters,
    hasActiveFilters,

    enableTrace,
    disableTrace,
    getTraceStatus,
    enableConsole,
    disableConsole,
    getConsoleStatus,
  } = useSystemLogs({
    // Root is already restricted by the API to this deployment's organization.
    // Do not additionally narrow it to the selected customer: infrastructure
    // producers such as Crystal may not carry a customer_uuid on every line.
    // Non-root sessions remain customer-scoped server-side.
    customerUuid: isRoot ? null : selectedCustomer?.uuid,
    initialParams,
  });

  const [traceEnabled, setTraceEnabled] = useState(false);
  const [consoleEnabled, setConsoleEnabled] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const selectedFields = useMemo(
    () => selectedLog?.fields || parseLogFields(selectedLog?.message || selectedLog?.msg),
    [selectedLog]
  );

  // Check trace + console status on mount
  useEffect(() => {
    const checkTraceStatus = async () => {
      const isEnabled = await getTraceStatus();
      setTraceEnabled(isEnabled);
    };
    checkTraceStatus();
  }, [getTraceStatus]);

  useEffect(() => {
    const checkConsoleStatus = async () => {
      const isEnabled = await getConsoleStatus();
      setConsoleEnabled(isEnabled);
    };
    checkConsoleStatus();
  }, [getConsoleStatus]);

  // Debounced search
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const searchTimerRef = useRef(null);

  const handleSearchChange = useCallback(
    (e) => {
      const value = e.target.value;
      setLocalSearch(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 300);
    },
    [setSearchQuery]
  );

  const handleClearSearch = useCallback(() => {
    setLocalSearch('');
    setSearchQuery('');
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, [setSearchQuery]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  // Export handler
  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `syslogs-export-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  // Clear-all handler — keeps the TextField in sync
  const handleClearFilters = useCallback(() => {
    clearFilters();
    setLocalSearch('');
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, [clearFilters]);

  // Trace toggle handler
  const handleTraceToggle = useCallback(
    async (e) => {
      const enabled = e.target.checked;
      if (enabled) {
        const changed = await enableTrace();
        if (!changed) return;
      } else {
        const changed = await disableTrace();
        if (!changed) return;
      }
      setTraceEnabled(enabled);
    },
    [enableTrace, disableTrace]
  );

  // Console mode toggle handler (console! — errors also captured to syslog)
  const handleConsoleToggle = useCallback(
    async (e) => {
      const enabled = e.target.checked;
      if (enabled) {
        const changed = await enableConsole();
        if (!changed) return;
      } else {
        const changed = await disableConsole();
        if (!changed) return;
      }
      setConsoleEnabled(enabled);
    },
    [enableConsole, disableConsole]
  );

  // Syslog is a message stream. Group the visible page by fields that are
  // actually present on the API rows; missing values stay in one honest bucket.
  // Any value in Log details becomes a filter in one click: the three with a
  // dropdown set it, everything else (key=value fields) searches the message.
  const filterBy = useCallback((key, value) => {
    const text = String(value);
    if (key === 'server') setSelectedHost(text);
    else if (key === 'source') setSelectedApp(text);
    else if (key === 'type' || key === 'action') setSelectedAction(text);
    else if (key === 'level') {
      const severity = text.toLowerCase();
      setSelectedSeverity(severity === 'error' ? 'err' : severity === 'warn' ? 'warning' : severity);
    } else {
      const needle = `${key}=${text}`;
      setLocalSearch(needle);
      setSearchQuery(needle);
    }
    setSelectedLog(null);
  }, [setSelectedHost, setSelectedApp, setSelectedAction, setSelectedSeverity, setSearchQuery]);

  // One click on a line's session chip shows that whole call; on its type chip,
  // every line of that type.
  const filterBySession = useCallback((id) => {
    const needle = `session=${id}`;
    // A search still being typed must not land after the chip and undo it.
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setLocalSearch(needle);
    setSearchQuery(needle);
  }, [setSearchQuery]);

  // A facet value picked in the side panel filters by it ('' clears it).
  const selectFacet = useCallback((param, value) => {
    if (param === 'severity') setSelectedSeverity(value);
    else if (param === 'app') setSelectedApp(value);
    else if (param === 'host') setSelectedHost(value);
    else if (param === 'action') setSelectedAction(value);
  }, [setSelectedSeverity, setSelectedApp, setSelectedHost, setSelectedAction]);

  // The aggregate lowercases tag values; filters need the exact name, so a
  // counted value is matched back to the name the server lists it under.
  const canonicalFacetValue = useCallback((key, value) => {
    const lower = String(value).toLowerCase();
    const pick = (names) => names.find((n) => String(n).toLowerCase() === lower);
    if (key === 'app') return pick(apps.map((a) => (typeof a === 'string' ? a : a.name))) || value;
    if (key === 'host') return pick(nodes.map((n) => (typeof n === 'string' ? n : n.name))) || value;
    if (key === 'action') return pick(actions.map((r) => r.action)) || value;
    return value;
  }, [apps, nodes, actions]);

  const sessionFilter = searchQuery.match(SESSION_NEEDLE)?.[1];

  if (!selectedCustomer) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          Please select a customer to view system logs.
        </Alert>
      </Box>
    );
  }


  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        p: 1,
        gap: 0.5,
        // See Events.jsx — no 64px top bar exists to subtract; the shell's
        // content row is already footer-aware.
        height: '100%',
        minHeight: 0,
        width: '100%',
        bgcolor: 'var(--mui-palette-surface-muted)',
      }}
    >
      {/* Row 1: Time Range, Search, Actions */}
      <Paper
        elevation={0}
        sx={{
          px: 1,
          py: 0.75,
          bgcolor: 'var(--mui-palette-background-paper)',
          border: '1px solid var(--mui-palette-divider)',
          borderRadius: 1,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {/* Period Quick Select */}
          <ButtonGroup size="small" variant="outlined">
            {PERIOD_OPTIONS.map((period) => (
              <Button
                key={period}
                onClick={() => handlePeriodSelect(period)}
                variant={dateRange?.period === period ? 'contained' : 'outlined'}
                sx={{ minWidth: 36, px: 0.75, fontSize: '11px' }}
              >
                {period}
              </Button>
            ))}
          </ButtonGroup>

          {/* Custom Date/Time Pickers */}
          <DateLocalizationProvider>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <DateTimePicker
                value={dateRange?.start || new Date()}
                onChange={(date) =>
                  setDateRange((prev) => ({ ...prev, start: date, period: 'custom' }))
                }
                ampm={false}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { width: 180, '& input': { fontSize: '12px', py: 0.75 } },
                  },
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>to</Typography>
              <DateTimePicker
                value={dateRange?.end || new Date()}
                onChange={(date) =>
                  setDateRange((prev) => ({ ...prev, end: date, period: 'custom' }))
                }
                ampm={false}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { width: 180, '& input': { fontSize: '12px', py: 0.75 } },
                  },
                }}
              />
            </Box>
          </DateLocalizationProvider>

          <Divider orientation="vertical" flexItem />

          {/* Search */}
          <TextField
            size="small"
            label="Search"
            placeholder="Message, session id, call uuid"
            value={localSearch}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: localSearch && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={handleClearSearch}>
                    <ClearIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ width: 220, '& input': { fontSize: '13px' } }}
          />

          <Box sx={{ flexGrow: 1 }} />

          {/* Refresh */}
          <Tooltip title="Refresh">
            <IconButton onClick={refreshLogs} disabled={loading} size="small">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Auto-refresh dropdown */}
          <FormControl size="small" sx={{ minWidth: 70 }}>
            <Select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(e.target.value)}
              sx={{ fontSize: '11px', '& .MuiSelect-select': { py: 0.5, px: 1 } }}
              renderValue={(val) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {val > 0 && (
                    <DotIcon
                      sx={{
                        fontSize: 10,
                        color: 'success.main',
                        animation: 'pulse 1.5s infinite',
                        '@keyframes pulse': {
                          '0%, 100%': { opacity: 1 },
                          '50%': { opacity: 0.3 },
                        },
                      }}
                    />
                  )}
                  {val === 0 ? 'Auto' : `${val}s`}
                </Box>
              )}
            >
              {AUTO_REFRESH_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Trace toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={traceEnabled}
                onChange={handleTraceToggle}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {traceEnabled ? (
                  <PlayIcon sx={{ fontSize: 14, color: 'success.main' }} />
                ) : (
                  <PauseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                )}
                <Typography variant="caption">Trace</Typography>
              </Box>
            }
            sx={{ m: 0 }}
          />

          {/* Console mode toggle — while on, error logs are captured to syslog */}
          <FormControlLabel
            control={
              <Switch
                checked={consoleEnabled}
                onChange={handleConsoleToggle}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {consoleEnabled ? (
                  <PlayIcon sx={{ fontSize: 14, color: 'success.main' }} />
                ) : (
                  <PauseIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                )}
                <Typography variant="caption">Console</Typography>
              </Box>
            }
            sx={{ m: 0 }}
          />

          {/* Export */}
          <Tooltip title="Export as JSON">
            <IconButton onClick={handleExport} disabled={logs.length === 0} size="small">
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Count */}
          <Chip
            label={`${formatNumber(totalCount)} messages`}
            size="small"
            sx={{ fontFamily: 'monospace', fontSize: '11px' }}
          />
        </Box>
      </Paper>

      {/* Row 2: Filters */}
      <Paper
        elevation={0}
        sx={{
          px: 1,
          py: 0.6,
          bgcolor: 'var(--mui-palette-background-paper)',
          border: '1px solid var(--mui-palette-divider)',
          borderRadius: 1,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontWeight: 600 }}>
            Level:
          </Typography>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={selectedSeverity || ''}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              displayEmpty
              inputProps={{ 'aria-label': 'Filter logs by level' }}
              sx={{ fontSize: '12px' }}
            >
              <MenuItem value=""><em>All levels</em></MenuItem>
              {SEVERITY_ORDER.map((s) => (
                <MenuItem key={s} value={s === 'error' ? 'err' : s === 'warn' ? 'warning' : s}>
                  {LEVEL_CONFIG[s]?.label || s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={selectedHost || ''}
              onChange={(e) => setSelectedHost(e.target.value)}
              displayEmpty
              inputProps={{ 'aria-label': 'Filter logs by server' }}
              sx={{ fontSize: '12px' }}
            >
              <MenuItem value=""><em>All servers</em></MenuItem>
              {nodes.map((node) => {
                const name = typeof node === 'string' ? node : node.name;
                const type = typeof node === 'string' ? null : node.type;
                const key = typeof node === 'string' ? node : node.uuid || node.name;
                return (
                  <MenuItem key={key} value={name}>
                    {name} {type && `(${type})`}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={selectedApp || ''}
              onChange={(e) => setSelectedApp(e.target.value)}
              displayEmpty
              inputProps={{ 'aria-label': 'Filter logs by source' }}
              sx={{ fontSize: '12px' }}
            >
              <MenuItem value=""><em>All sources</em></MenuItem>
              {apps.map((app) => {
                const name = typeof app === 'string' ? app : app.name;
                const key = typeof app === 'string' ? app : app.uuid || app.name;
                return (
                  <MenuItem key={key} value={name}>{name}</MenuItem>
                );
              })}
            </Select>
          </FormControl>

          {/* Message type: the action tag — a node request kind (sip_auth,
              dialplan, sofia.conf) or an action (node.license_invalid). The
              list is what the window actually holds; a type that is filtered
              on but no longer in the window stays selectable. */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={selectedAction || ''}
              onChange={(e) => setSelectedAction(e.target.value)}
              displayEmpty
              inputProps={{ 'aria-label': 'Filter logs by type' }}
              sx={{ fontSize: '12px' }}
            >
              <MenuItem value=""><em>All types</em></MenuItem>
              {selectedAction && !actions.some((row) => row.action === selectedAction) && (
                <MenuItem value={selectedAction}>{selectedAction}</MenuItem>
              )}
              {actions.map((row) => (
                <MenuItem key={row.action} value={row.action}>
                  {row.action}
                  <Typography component="span" sx={{ ml: 'auto', pl: 1, fontSize: '0.68rem', color: 'text.secondary' }}>{row.count}</Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Split chart by:
          </Typography>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              inputProps={{ 'aria-label': 'Split the volume chart by' }}
              sx={{ fontSize: '12px' }}
            >
              <MenuItem value="severity">Level</MenuItem>
              <MenuItem value="app">Source</MenuItem>
              <MenuItem value="host">Server</MenuItem>
              <MenuItem value="action">Type</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flexGrow: 1 }} />

          {hasActiveFilters && (
            <Button
              size="small"
              startIcon={<FilterAltOffIcon sx={{ fontSize: 16 }} />}
              onClick={handleClearFilters}
              sx={{ fontSize: '11px', textTransform: 'none', color: 'text.secondary' }}
            >
              Clear filters
            </Button>
          )}
        </Box>
        {hasActiveFilters && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }} aria-label="Active log filters">
            {selectedApp && <Chip size="small" label={`Source: ${selectedApp}`} onDelete={() => setSelectedApp('')} sx={{ height: 22, fontSize: '0.68rem' }} />}
            {selectedHost && <Chip size="small" label={`Server: ${selectedHost}`} onDelete={() => setSelectedHost('')} sx={{ height: 22, fontSize: '0.68rem' }} />}
            {selectedSeverity && <Chip size="small" label={`Level: ${selectedSeverity}`} onDelete={() => setSelectedSeverity('')} sx={{ height: 22, fontSize: '0.68rem' }} />}
            {selectedAction && <Chip size="small" label={`Type: ${selectedAction}`} onDelete={() => setSelectedAction('')} sx={{ height: 22, fontSize: '0.68rem' }} />}
            {searchQuery && <Chip size="small" label={sessionFilter ? `Call: ${sessionFilter}` : `Message: ${searchQuery}`} onDelete={handleClearSearch} sx={{ height: 22, fontSize: '0.68rem' }} />}
          </Box>
        )}
      </Paper>

      {/* The explorer: facets (server counts) | histogram + table + pager. */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1 }}>
        <LogFacets
          facets={FACETS}
          counts={facets}
          loading={facetsLoading}
          selected={{ severity: selectedSeverity, app: selectedApp, host: selectedHost, action: selectedAction }}
          onSelect={selectFacet}
          canonical={canonicalFacetValue}
        />
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <LogVolumeChart
            data={volume}
            loading={volumeLoading}
            groupLabel={CHART_GROUP_LABELS[chartGroupFor(groupBy)]}
            interval={dateRange?.start && dateRange?.end ? chartInterval(dateRange.start, dateRange.end) : 'hour'}
            onSelectRange={(start, end) => setDateRange({ start, end, period: 'custom' })}
          />

          {/* One row per line: level bar, time, server, source, message. The
              lines are the servers' own English, so the stream stays left to
              right in Hebrew too; its sides are logical, so the RTL styles
              don't flip them inside it. */}
          <Paper
            elevation={0}
            dir="ltr"
            data-testid="syslog-stream"
            sx={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--mui-palette-divider)', borderRadius: 1, bgcolor: 'var(--mui-palette-background-paper)' }}>
            <Box role="row" sx={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 1, ps: 1.5, pe: 1, py: 0.4, bgcolor: 'var(--mui-palette-surface-muted)', borderBottom: '1px solid var(--mui-palette-divider)' }}>
              {[['Date', COL.time], ['Server', COL.host], ['Source', COL.source]].map(([label, width]) => (
                <Typography key={label} role="columnheader" sx={{ width, flexShrink: 0, fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>{label}</Typography>
              ))}
              <Typography role="columnheader" sx={{ flex: 1, fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>Message</Typography>
            </Box>
            {loading && logs.length === 0 ? (
              <Typography sx={{ p: 3, textAlign: 'center', color: 'text.secondary', fontSize: '0.82rem' }}>Loading messages…</Typography>
            ) : logs.length === 0 ? (
              <Typography sx={{ p: 3, textAlign: 'center', color: 'text.secondary', fontSize: '0.82rem' }}>No log messages found</Typography>
            ) : logs.map((log, index) => {
              const rawLevel = String(log.severity || log.level || 'info').toLowerCase();
              const level = normalizeSeverityKey(rawLevel);
              const levelStyle = LEVEL_CONFIG[level] || LEVEL_CONFIG[rawLevel] || LEVEL_CONFIG.info;
              const displayed = displayLog(log);
              const message = displayed.message;
              const time = log.time || log.timestamp || log.isodate;
              const host = log.host || log.node || log.server || '';
              const session = sessionOf(log);
              const type = typeOf(log);
              const rawLine = `${String(time || '')} ${rawLevel.toUpperCase()} ${displayed.source} - ${String(log.message || log.msg || message)}`;
              const chipSx = { height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.6 }, flexShrink: 0 };
              const cell = { flexShrink: 0, fontSize: '0.7rem', fontFamily: '"JetBrains Mono", monospace', color: 'text.secondary' };
              return (
                <Box
                  key={log.uuid || log.id || `${time}-${index}`}
                  role="row"
                  onClick={() => setSelectedLog(log)}
                  title={rawLine}
                  sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1, ps: 1.5, pe: 1, py: 0.25, minHeight: 26, borderBottom: '1px solid var(--mui-palette-divider)', cursor: 'pointer', overflow: 'hidden', '&:hover': { bgcolor: 'action.hover' },
                    '&::before': { content: '""', position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: 3, bgcolor: levelStyle.color } }}
                >
                  <Typography noWrap sx={{ ...cell, width: COL.time }}>{formatLogTime(time)}</Typography>
                  <Typography noWrap sx={{ ...cell, width: COL.host }} title={host}>{host || '—'}</Typography>
                  <Typography noWrap sx={{ ...cell, width: COL.source, color: 'text.primary' }} title={displayed.source}>{displayed.source}</Typography>
                  <Typography noWrap sx={{ flex: 1, minWidth: 0, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', lineHeight: 1.25 }}>
                    {!['info', 'notice', 'debug'].includes(level) && (
                      <Box component="span" sx={{ color: levelStyle.color, fontWeight: 700, me: 0.75 }}>{rawLevel.toUpperCase()}</Box>
                    )}
                    {message}
                  </Typography>
                  {type && (
                    <Chip
                      size="small"
                      label={type}
                      aria-label={`Filter by type ${type}`}
                      onClick={(event) => { event.stopPropagation(); setSelectedAction(type); }}
                      color={selectedAction === type ? 'primary' : 'default'}
                      variant="outlined"
                      sx={chipSx}
                    />
                  )}
                  {session && (
                    <Tooltip title={`Show this call: session ${session}`}>
                      <Chip
                        size="small"
                        label={shortId(session)}
                        aria-label={`Filter by session ${session}`}
                        onClick={(event) => { event.stopPropagation(); filterBySession(session); }}
                        color={sessionFilter === session ? 'primary' : 'default'}
                        sx={{ ...chipSx, fontFamily: 'monospace' }}
                      />
                    </Tooltip>
                  )}
                  <Tooltip title="Copy raw line">
                    <IconButton size="small" onClick={(event) => { event.stopPropagation(); navigator.clipboard.writeText(rawLine); }} sx={{ p: 0.2, flexShrink: 0 }}>
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
          </Paper>

          {/* Server-side paging: the server filters and counts, one page at a time. */}
          <TablePagination
            component="div"
            data-testid="syslog-pagination"
            count={totalCount}
            page={totalCount === 0 ? 0 : Math.min(pagination.page, Math.max(0, Math.ceil(totalCount / pagination.limit) - 1))}
            onPageChange={(_, page) => setPage(page)}
            rowsPerPage={pagination.limit}
            rowsPerPageOptions={[25, 50, 100, 200, 500]}
            onRowsPerPageChange={(e) => setPageSize(Number(e.target.value))}
            labelRowsPerPage="Per page"
            showFirstButton
            showLastButton
            sx={{ flexShrink: 0, border: '1px solid var(--mui-palette-divider)', borderRadius: 1, bgcolor: 'var(--mui-palette-background-paper)',
              '& .MuiTablePagination-toolbar': { minHeight: 40 } }}
          />
        </Box>
      </Box>

      <Dialog
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        fullWidth
        maxWidth="md"
        aria-labelledby="syslog-detail-title"
      >
        <DialogTitle id="syslog-detail-title" sx={{ display: 'flex', alignItems: 'center' }}>
          Log details
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="Close details">
            <IconButton aria-label="Close log details" onClick={() => setSelectedLog(null)}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent dividers>
          <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 1, m: 0 }}>
            {Object.entries({
              time: selectedLog?.time || selectedLog?.timestamp,
              level: selectedLog?.severity || selectedLog?.level,
              server: selectedLog?.host,
              source: selectedLog?.app,
              type: selectedLog ? typeOf(selectedLog) : undefined,
              ...selectedFields,
            }).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => (
              <React.Fragment key={key}>
                <Typography component="dt" sx={{ fontWeight: 700, fontSize: '0.78rem' }}>{key.replaceAll('_', ' ')}</Typography>
                <Box component="dd" sx={{ m: 0, display: 'flex', alignItems: 'flex-start', gap: 0.5, minWidth: 0 }}>
                  <Typography component="span" sx={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: '0.78rem', overflowWrap: 'anywhere' }}>{String(value)}</Typography>
                  {key !== 'time' && (
                    <Tooltip title={`Show only ${key.replaceAll('_', ' ')} = ${String(value)}`}>
                      <IconButton size="small" aria-label={`Filter by ${key.replaceAll('_', ' ')}`} onClick={() => filterBy(key, value)} sx={{ p: 0.25, flexShrink: 0 }}>
                        <FilterAltIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </React.Fragment>
            ))}
          </Box>
          <Typography component="h3" sx={{ mt: 2, mb: 0.5, fontWeight: 700, fontSize: '0.85rem' }}>Raw message</Typography>
          <Box component="pre" dir="ltr" tabIndex={0} sx={{ m: 0, p: 1.5, bgcolor: 'var(--mui-palette-surface-muted)', border: '1px solid var(--mui-palette-divider)', borderRadius: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.78rem' }}>
            {selectedLog?.message || selectedLog?.msg || ''}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default SystemLogs;
