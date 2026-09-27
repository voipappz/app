import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useSystemLogs } from './SystemLogs';
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

// Crystal's NATS relay preserves the logger/component by prefixing the stored
// message (`http.client: Performing request`). Split that transport shape for
// display without changing the raw value shown in Log details.
const displayLog = (log) => {
  const rawMessage = String(log.message || log.msg || '');
  const relayedNodeLine = (log.app === 'node' || log.app === 'crystal')
    ? rawMessage.match(/^([\w./-]+):\s+([\s\S]+)$/)
    : null;
  return {
    source: log.source || relayedNodeLine?.[1] || log.app || log.type || 'Unknown',
    message: relayedNodeLine?.[2] || rawMessage,
  };
};

// Main SystemLogs component
const SystemLogs = ({ initialParams }) => {
  const { selectedCustomer, isRoot } = useCustomerEnvironment();
  const {
    logs,
    loading,
    totalCount,
    pagination,
    setPagination,
    hasMore,
    loadMore,

    apps,
    nodes,

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
  const groupedLogs = useMemo(() => {
    const valueFor = (log) => {
      if (groupBy === 'source') return displayLog(log).source;
      if (groupBy === 'host') return log.host || log.node || log.server;
      if (groupBy === 'severity') return log.severity || log.level;
      if (groupBy === 'facility') return log.facility;
      return 'All messages';
    };
    const groups = new Map();
    logs.forEach((log) => {
      const label = String(valueFor(log) || 'Unknown');
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(log);
    });
    return [...groups.entries()];
  }, [logs, groupBy]);

  // Any value in Log details becomes a filter in one click: the three with a
  // dropdown set it, everything else (key=value fields) searches the message.
  const filterBy = useCallback((key, value) => {
    const text = String(value);
    if (key === 'server') setSelectedHost(text);
    else if (key === 'source') setSelectedApp(text);
    else if (key === 'level') {
      const severity = text.toLowerCase();
      setSelectedSeverity(severity === 'error' ? 'err' : severity === 'warn' ? 'warning' : severity);
    } else {
      const needle = `${key}=${text}`;
      setLocalSearch(needle);
      setSearchQuery(needle);
    }
    setSelectedLog(null);
  }, [setSelectedHost, setSelectedApp, setSelectedSeverity, setSearchQuery]);

  const applyGroupFilter = useCallback((value) => {
    if (groupBy === 'host') {
      setSelectedHost(value === 'Unknown' ? '' : value);
      return;
    }
    if (groupBy === 'severity') {
      const severity = String(value).toLowerCase();
      setSelectedSeverity(severity === 'error' ? 'err' : severity === 'warn' ? 'warning' : severity);
      return;
    }
    if (groupBy === 'source') {
      const sourceNames = apps.map((app) => typeof app === 'string' ? app : app.name);
      if (sourceNames.includes(value)) {
        setSelectedApp(value);
      } else {
        const query = `${value}:`;
        setLocalSearch(query);
        setSearchQuery(query);
      }
    }
  }, [groupBy, apps, setSelectedHost, setSelectedSeverity, setSelectedApp, setSearchQuery]);

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
          <LocalizationProvider dateAdapter={AdapterDateFns}>
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
          </LocalizationProvider>

          <Divider orientation="vertical" flexItem />

          {/* Search */}
          <TextField
            size="small"
            label="Search"
            placeholder="Email, ID, IP, or message"
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
            label={`${logs.length} / ${totalCount}`}
            size="small"
            sx={{ fontFamily: 'monospace', fontSize: '11px' }}
          />
          <FormControl size="small" sx={{ minWidth: 92 }}>
            <Select
              value={pagination.limit}
              onChange={(e) => setPagination({ page: 0, limit: Number(e.target.value) })}
              inputProps={{ 'aria-label': 'Logs per page' }}
              sx={{ fontSize: '11px', '& .MuiSelect-select': { py: 0.5 } }}
            >
              {[25, 50, 100, 200].map((size) => <MenuItem key={size} value={size}>{size} per load</MenuItem>)}
            </Select>
          </FormControl>
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

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Group by:
          </Typography>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              inputProps={{ 'aria-label': 'Group log timeline by' }}
              sx={{ fontSize: '12px' }}
            >
              <MenuItem value="source">Source</MenuItem>
              <MenuItem value="host">Server</MenuItem>
              <MenuItem value="severity">Level</MenuItem>
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
            {searchQuery && <Chip size="small" label={`Message: ${searchQuery}`} onDelete={handleClearSearch} sx={{ height: 22, fontSize: '0.68rem' }} />}
          </Box>
        )}
      </Paper>

      {/* Message-first stream. Sources and other structured values are useful
          as group headers; each line itself stays focused on the log message. */}
      <Paper
        elevation={0}
        data-testid="syslog-stream"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) loadMore();
        }}
        sx={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--mui-palette-divider)', borderRadius: 1, bgcolor: 'var(--mui-palette-background-paper)' }}>
        {loading && logs.length === 0 ? (
          <Typography sx={{ p: 3, textAlign: 'center', color: 'text.secondary', fontSize: '0.82rem' }}>Loading messages…</Typography>
        ) : groupedLogs.length === 0 ? (
          <Typography sx={{ p: 3, textAlign: 'center', color: 'text.secondary', fontSize: '0.82rem' }}>No log messages found</Typography>
        ) : groupedLogs.map(([group, entries]) => (
          <Box key={group} component="section">
            <Box
              role="button"
              tabIndex={0}
              onClick={() => applyGroupFilter(group)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') applyGroupFilter(group); }}
              sx={{ position: 'sticky', top: 0, zIndex: 1, px: 1, py: 0.35, display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: 'var(--mui-palette-surface-muted)', borderTop: '1px solid var(--mui-palette-divider)', borderBottom: '1px solid var(--mui-palette-divider)', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                {groupBy === 'source' ? 'Source' : groupBy === 'host' ? 'Server' : groupBy === 'severity' ? 'Level' : 'Messages'}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{group}</Typography>
              <Chip label={entries.length} size="small" sx={{ ml: 'auto', height: 18, fontSize: '0.62rem' }} />
            </Box>
            {entries.map((log, index) => {
              const rawLevel = String(log.severity || log.level || 'info').toLowerCase();
              const level = normalizeSeverityKey(rawLevel);
              const levelStyle = LEVEL_CONFIG[level] || LEVEL_CONFIG[rawLevel] || LEVEL_CONFIG.info;
              const displayed = displayLog(log);
              const message = displayed.message;
              const time = log.time || log.timestamp || log.isodate;
              const rawLine = `${String(time || '')} ${rawLevel.toUpperCase()} ${displayed.source} - ${message}`;
              return (
                <Box
                  key={log.uuid || log.id || `${group}-${index}`}
                  onClick={() => setSelectedLog(log)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.25, minHeight: 26, borderBottom: '1px solid var(--mui-palette-divider)', cursor: 'pointer', overflow: 'hidden', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Typography noWrap title={rawLine} sx={{ flex: 1, minWidth: 0, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', lineHeight: 1.25 }}>
                    <Box component="span" sx={{ color: 'text.secondary' }}>{String(time || '')}</Box>
                    {' '}
                    <Box component="span" sx={{ color: levelStyle.color, fontWeight: 700 }}>{rawLevel.toUpperCase()}</Box>
                    {' '}
                    <Box component="span" sx={{ color: 'text.secondary' }}>{displayed.source}</Box>
                    {' - '}{message}
                  </Typography>
                  <Tooltip title="Copy raw line">
                    <IconButton size="small" onClick={(event) => { event.stopPropagation(); navigator.clipboard.writeText(rawLine); }} sx={{ p: 0.2, flexShrink: 0 }}>
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
          </Box>
        ))}
        {logs.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 1 }}>
            {loading ? (
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Loading older messages…</Typography>
            ) : hasMore ? (
              <Button size="small" onClick={loadMore}>Load more</Button>
            ) : (
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>End of the selected time range</Typography>
            )}
          </Box>
        )}
      </Paper>

      <Typography data-testid="syslog-count" sx={{ flexShrink: 0, fontSize: '0.72rem', color: 'text.secondary', px: 0.5 }}>
        {logs.length.toLocaleString()} of {totalCount.toLocaleString()} messages loaded
      </Typography>

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
          <Box component="pre" tabIndex={0} sx={{ m: 0, p: 1.5, bgcolor: 'var(--mui-palette-surface-muted)', border: '1px solid var(--mui-palette-divider)', borderRadius: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.78rem' }}>
            {selectedLog?.message || selectedLog?.msg || ''}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default SystemLogs;
