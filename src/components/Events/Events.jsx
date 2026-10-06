import React, { useMemo, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  TextField,
  Chip,
  Typography,
  InputAdornment,
  IconButton,
  Tooltip,
  Alert,
  Button,
  Divider,
  ButtonGroup,
  FormControl,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  TablePagination,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Refresh as RefreshIcon,
  FilterAltOff as FilterAltOffIcon,
  FiberManualRecord as DotIcon,
  Download as DownloadIcon,
  ContentCopy as ContentCopyIcon,
  Shield as ShieldIcon,
  ErrorOutline as ErrorOutlineIcon,
  People as PeopleIcon,
  NotificationsActive as AlertIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import DateLocalizationProvider from '../../i18n/DateLocalizationProvider';
import { useEvents } from './Events';
import { stripedDataGridSx } from '../shared/tableTheme.jsx';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import TimeHistogram from '../../views/syslogs/TimeHistogram';
import {
  LEVEL_CONFIG,
  getSeverityChipColors,
  AUTO_REFRESH_OPTIONS,
  formatRelative,
  formatAbsolute,
  convertAggregateToHistogramFormat,
  PERIOD_OPTIONS,
} from '../../utils/logFormatting';

/**
 * Map EventStore event fields to the format TimeHistogram expects
 */
const mapEventsForHistogram = (events) => {
  return events.map(evt => ({
    severity: evt.level || 'info',
    host: evt.actor || '-',
    message: evt.msg || '',
    app: evt.event_type || evt.type || '-',
    time: evt.time,
  }));
};

/**
 * Format a human-readable message for audit events
 */
// Strip the always-present updated_at/created_at clauses from an auditer msg —
// they're noise on every row ("name=as,as3132131,updated_at=...,..." → "name=...").
const stripAuditTimestamps = (s) =>
  s.replace(/,?\s*(updated_at|created_at)=[^,]*,[^,]*/g, '').replace(/^,\s*/, '').trim();

const formatAuditMessage = (event) => {
  const msg = event.msg || event.message;
  if (msg && typeof msg === 'string' && msg.length > 3 && !msg.startsWith('{')) {
    const cleaned = stripAuditTimestamps(msg);
    return cleaned || msg;
  }

  const d = event.data || {};
  const actor = event.actor || d.account_email || '';
  const type = event.event_type || event.type || '';
  const subject = d.type || event.subject || '';
  const subjectId = (d.type_uuid || event.subject_uuid || '').toString().slice(0, 8);

  switch (type) {
    case 'AuditCreate':
      return `${actor || 'System'} created ${subject}${subjectId ? ` ${subjectId}` : ''}`;
    case 'AuditUpdate':
      return `${actor || 'System'} updated ${subject}${subjectId ? ` ${subjectId}` : ''}`;
    case 'AuditDestroy':
      return `${actor || 'System'} deleted ${subject}${subjectId ? ` ${subjectId}` : ''}`;
    case 'EventAuthAudit': {
      const action = d.action || event.action || '';
      const email = d.account_email || actor;
      if (action === 'login_success') return `${email} logged in successfully`;
      if (action === 'login_failed') return `Failed login attempt for ${email}`;
      if (action === 'login_locked') return `Account locked: ${email}`;
      if (action === 'otp_sent') return `OTP sent to ${email}`;
      if (action === 'otp_verify_failed') return `OTP verification failed for ${email}`;
      if (action === 'password_reset_success') return `Password reset for ${email}`;
      if (action === 'logout') return `${email} logged out`;
      // API-token auth (Endpoints::Base#auth!): the caller IS a credential, so
      // name the scheme and where it came from. token_fingerprint (detail panel)
      // says WHICH token — the token itself is never stored.
      if (action === 'api_auth') {
        return `${email} authenticated by ${d.auth_scheme || 'token'} from ${d.ip_address || 'unknown IP'}`;
      }
      if (action === 'api_auth_failed') {
        const who = email || 'unknown account';
        return `Rejected ${d.auth_scheme || 'token'} auth for ${who} from ${d.ip_address || 'unknown IP'}${d.reason ? ` — ${d.reason}` : ''}`;
      }
      return `${action} — ${email}`;
    }
    case 'EventState': {
      // Per-minute node snapshot — summarize the counts inline so the row is
      // self-contained (no detail panel needed).
      const env = event.metadata?.environment_name || d.environment_name || '';
      const parts = [];
      if (d.calls_total != null)      parts.push(`${d.calls_total} calls`);
      if (d.registrations != null)    parts.push(`${d.registrations} registered`);
      if (d.extensions_total != null) parts.push(`${d.extensions_total} ext`);
      const summary = parts.join(' · ') || 'snapshot';
      return `${env ? env + ': ' : ''}${summary}`;
    }
    default: {
      if (msg) return msg;
      // Any other data-only event: show a compact key=value line so the row
      // carries the info without opening a detail panel.
      const kv = Object.entries(d)
        .filter(([k, v]) => v != null && v !== '' && !['msg', 'session'].includes(k))
        .slice(0, 4)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      return kv || type || '';
    }
  }
};

/** Stat card for the summary bar */
const StatCard = ({ icon, label, value, color }) => (
  <Box sx={{
    display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5,
    borderRadius: 1, bgcolor: `${color}08`, border: `1px solid ${color}20`,
    minWidth: 100,
  }}>
    {icon}
    <Box>
      <Typography sx={{ fontSize: '0.65rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1, fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ fontSize: '1rem', fontWeight: 700, color, lineHeight: 1.2, fontFamily: 'monospace' }}>
        {value ?? '—'}
      </Typography>
    </Box>
  </Box>
);

/**
 * Events — Professional Datadog/Grafana-inspired Event Explorer
 *
 * Data source: EventStore (/api/events) — Postgres event_store_events table
 * Supports: event_type, level, search, from/to, subject/subject_uuid, actor, pagination, aggregate
 */
const Events = ({ initialParams, leftSlot } = {}) => {
  const { selectedCustomer } = useCustomerEnvironment();

  const {
    events,
    loading,
    error,
    totalCount,
    sortModel,
    setSortModel,
    pagination,
    setPagination,
    chartData,
    chartGroupBy,
    setChartGroupBy,
    eventTypes,
    searchQuery,
    setSearchQuery,
    selectedEventType,
    setSelectedEventType,
    selectedLevels,
    toggleLevel,
    allLevels,
    subjectTypes,
    selectedSubjectType,
    setSelectedSubjectType,
    subjects,
    selectedSubjectUuid,
    setSelectedSubjectUuid,
    selectedCallUuid,
    setSelectedCallUuid,
    selectedActor,
    setSelectedActor,
    dateRange,
    setDateRange,
    timeInterval,
    handlePeriodSelect,
    autoRefreshInterval,
    setAutoRefreshInterval,
    refreshEvents,
    clearFilters,
    hasActiveFilters,
    stats,
  } = useEvents(initialParams);

  // Listen for environment change events to refresh data
  React.useEffect(() => {
    const handleEnvironmentChange = () => refreshEvents();
    window.addEventListener('environmentChanged', handleEnvironmentChange);
    return () => window.removeEventListener('environmentChanged', handleEnvironmentChange);
  }, [refreshEvents]);

  // Local debounced search state
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const searchTimerRef = React.useRef(null);

  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setLocalSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  }, [setSearchQuery]);

  const handleClearSearch = useCallback(() => {
    setLocalSearch('');
    setSearchQuery('');
  }, [setSearchQuery]);

  // Convert aggregate data for histogram
  const histogramData = useMemo(() => {
    return convertAggregateToHistogramFormat(chartData);
  }, [chartData]);

  // Map events for TimeHistogram
  const histogramEvents = useMemo(() => {
    return mapEventsForHistogram(events);
  }, [events]);

  // DataGrid rows — add `id` field required by DataGrid
  const gridRows = useMemo(() => {
    return events.map((evt, index) => ({
      ...evt,
      id: evt.uuid || evt.id || index,
    }));
  }, [events]);

  // Click type chip → filter by that event_type
  const handleTypeClick = useCallback((e, eventType) => {
    e.stopPropagation(); // don't open detail panel
    setSelectedEventType(prev => prev === eventType ? '' : eventType);
  }, [setSelectedEventType]);

  // DataGrid columns: TIME | LEVEL | TYPE | SUBJECT | ACTION | AUTHOR | MESSAGE
  const gridColumns = useMemo(() => [
    {
      field: 'time',
      headerName: 'TIME',
      width: 110,
      renderCell: (params) => (
        <Tooltip title={formatAbsolute(params.value)} placement="top">
          <Typography
            variant="body2"
            sx={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.72rem',
              color: 'var(--mui-palette-text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatRelative(params.value)}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'level',
      headerName: 'LEVEL',
      width: 70,
      sortable: false,
      renderCell: (params) => {
        const level = (params.value || 'info').toLowerCase();
        const sev = getSeverityChipColors(level);
        return (
          <Chip
            label={level.toUpperCase()}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: '0.6rem',
              height: 20,
              minWidth: 44,
              color: sev.text,
              bgcolor: sev.bg,
              border: `1px solid color-mix(in srgb, ${sev.text} 20%, transparent)`,
            }}
          />
        );
      },
    },
    {
      field: 'event_type',
      headerName: 'TYPE',
      width: 150,
      renderCell: (params) => {
        const eventType = params.value || params.row.type || '';
        if (!eventType) return null;
        const isFiltered = selectedEventType === eventType;
        return (
          <Chip
            label={eventType}
            size="small"
            variant={isFiltered ? 'filled' : 'outlined'}
            onClick={(e) => handleTypeClick(e, eventType)}
            sx={{
              fontSize: '0.6rem',
              height: 20,
              cursor: 'pointer',
              bgcolor: isFiltered ? '#3b82f6' : undefined,
              color: isFiltered ? '#fff' : undefined,
              borderColor: isFiltered ? '#3b82f6' : undefined,
              '&:hover': { bgcolor: isFiltered ? '#2563eb' : '#f0f9ff' },
            }}
          />
        );
      },
    },
    {
      field: 'subject',
      headerName: 'SUBJECT',
      width: 110,
      sortable: false,
      renderCell: (params) => {
        const subject = params.value || params.row.data?.type;
        if (!subject) return null;
        const isFiltered = selectedSubjectType === subject;
        return (
          <Chip
            label={subject}
            size="small"
            variant={isFiltered ? 'filled' : 'outlined'}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedSubjectType((prev) => (prev === subject ? '' : subject));
            }}
            sx={{
              fontSize: '0.6rem',
              height: 20,
              cursor: 'pointer',
              color: isFiltered ? '#fff' : '#6d28d9',
              bgcolor: isFiltered ? '#6d28d9' : undefined,
              borderColor: '#c4b5fd',
            }}
          />
        );
      },
    },
    {
      field: 'action',
      headerName: 'ACTION',
      width: 100,
      sortable: false,
      renderCell: (params) =>
        params.value ? (
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.72rem',
              color: '#6d28d9',
              fontWeight: 600,
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            {params.value}
          </Typography>
        ) : null,
    },
    {
      field: 'actor',
      headerName: 'AUTHOR',
      width: 180,
      sortable: false,
      renderCell: (params) => {
        const actor = params.value;
        if (!actor) {
          return <Typography variant="caption" sx={{ color: '#cbd5e1' }}>—</Typography>;
        }
        return (
          <Tooltip title={`Filter by ${actor}`}>
            <Typography
              variant="body2"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedActor(actor);
              }}
              sx={{
                fontSize: '0.72rem',
                color: '#0f766e',
                cursor: 'pointer',
                fontFamily: '"JetBrains Mono", monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {actor}
            </Typography>
          </Tooltip>
        );
      },
    },
    {
      field: 'msg',
      headerName: 'MESSAGE',
      flex: 1,
      sortable: false,
      renderCell: (params) => (
        <Typography
          variant="body2"
          noWrap
          sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-primary)' }}
        >
          {formatAuditMessage(params.row)}
        </Typography>
      ),
    },
    {
      field: 'event_id',
      headerName: '',
      width: 36,
      sortable: false,
      renderCell: (params) => {
        const eid = params.value || params.row.id;
        if (!eid) return null;
        return (
          <Tooltip title="Copy event ID">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(String(eid));
              }}
              sx={{ p: 0.25 }}
            >
              <ContentCopyIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-secondary)' }} />
            </IconButton>
          </Tooltip>
        );
      },
    },
  ], [
    selectedEventType,
    selectedSubjectType,
    handleTypeClick,
    setSelectedSubjectType,
    setSelectedActor,
  ]);

  // Pagination handlers
  const handleChangePage = (event, newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleChangeRowsPerPage = (event) => {
    setPagination({ page: 0, limit: parseInt(event.target.value, 10) });
  };

  // Export events
  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-export-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events]);

  if (!selectedCustomer) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          Please select a customer to view events.
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        gap: 1,
        // The 64px top bar is gone (Layout.css: "top bar removed → full
        // height"); the shell hands this screen a flex row that already
        // excludes the footer, so subtracting a header that no longer exists
        // just left 64px of dead white space under the grid.
        height: '100%',
        minHeight: 0,
        width: '100%',
        bgcolor: 'var(--mui-palette-surface-muted)'
      }}
    >
      {/* Row 1: Time Range & Search */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          bgcolor: 'var(--mui-palette-background-paper)',
          border: '1px solid var(--mui-palette-divider)',
          borderRadius: 1,
          flexShrink: 0
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {/* Optional inline tabs (e.g. Logs hub Events/System Logs switch) — sits
              on the same line as the date selector to save vertical space. */}
          {leftSlot}
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
                onChange={(date) => setDateRange(prev => ({ ...prev, start: date, period: 'custom' }))}
                ampm={false}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { width: 180, '& input': { fontSize: '12px', py: 0.75 } }
                  }
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>to</Typography>
              <DateTimePicker
                value={dateRange?.end || new Date()}
                onChange={(date) => setDateRange(prev => ({ ...prev, end: date, period: 'custom' }))}
                ampm={false}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { width: 180, '& input': { fontSize: '12px', py: 0.75 } }
                  }
                }}
              />
            </Box>
          </DateLocalizationProvider>

          <Divider orientation="vertical" flexItem />

          {/* Search */}
          <TextField
            size="small"
            placeholder="Search events..."
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

          {/* Refresh + Auto-refresh */}
          <Tooltip title="Refresh">
            <IconButton onClick={refreshEvents} disabled={loading} size="small">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <FormControl size="small" sx={{ minWidth: 70 }}>
            <Select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(e.target.value)}
              sx={{ fontSize: '11px', '& .MuiSelect-select': { py: 0.5, px: 1 } }}
              renderValue={(val) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {val > 0 && (
                    <DotIcon sx={{
                      fontSize: 10,
                      color: '#22c55e',
                      animation: 'pulse 1.5s infinite',
                      '@keyframes pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.3 },
                      }
                    }} />
                  )}
                  {val === 0 ? 'Auto' : `${val}s`}
                </Box>
              )}
            >
              {AUTO_REFRESH_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Export */}
          <Tooltip title="Export as JSON">
            <IconButton onClick={handleExport} disabled={events.length === 0} size="small">
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Event Count */}
          <Chip
            label={`${events.length} / ${totalCount}`}
            size="small"
            sx={{ fontFamily: 'monospace', fontSize: '11px' }}
          />
        </Box>
      </Paper>

      {/* Security Summary Bar */}
      {stats && (
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>
          <StatCard
            icon={<ShieldIcon sx={{ fontSize: 18, color: '#3b82f6' }} />}
            label="Total Events" value={stats.total_events?.toLocaleString()} color="#3b82f6"
          />
          <StatCard
            icon={<ErrorOutlineIcon sx={{ fontSize: 18, color: '#dc2626' }} />}
            label="Failed Logins" value={stats.failed_logins} color="#dc2626"
          />
          <StatCard
            icon={<AlertIcon sx={{ fontSize: 18, color: '#f59e0b' }} />}
            label="Critical" value={stats.critical_events} color="#f59e0b"
          />
          <StatCard
            icon={<PeopleIcon sx={{ fontSize: 18, color: '#0891b2' }} />}
            label="Unique Actors" value={stats.unique_actors} color="#0891b2"
          />
        </Box>
      )}

      {/* Row 2: Filters */}
      <Paper
        elevation={0}
        sx={{
          px: 1.5,
          py: 1,
          bgcolor: 'var(--mui-palette-background-paper)',
          border: '1px solid var(--mui-palette-divider)',
          borderRadius: 1,
          flexShrink: 0
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {/* Level Chips */}
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontWeight: 600 }}>
            Level:
          </Typography>
          {allLevels.map((level) => {
            const config = LEVEL_CONFIG[level] || { color: 'var(--mui-palette-text-secondary)', bg: 'var(--mui-palette-surface-muted)', label: level.toUpperCase() };
            const isActive = selectedLevels.has(level);
            return (
              <Chip
                key={level}
                label={config.label}
                size="small"
                onClick={() => toggleLevel(level)}
                icon={<DotIcon sx={{ fontSize: '10px !important', color: config.color + ' !important' }} />}
                sx={{
                  height: 24,
                  fontSize: '11px',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  bgcolor: isActive ? config.bg : 'transparent',
                  color: isActive ? config.color : 'var(--mui-palette-text-secondary)',
                  border: `1px solid ${isActive ? config.color : '#e5e7eb'}`,
                  opacity: isActive ? 1 : 0.6,
                  '&:hover': {
                    bgcolor: config.bg,
                    opacity: 1,
                  }
                }}
              />
            );
          })}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Event Type */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              displayEmpty
              sx={{ fontSize: '12px' }}
            >
              <MenuItem value=""><em>All Event Types</em></MenuItem>
              {eventTypes.map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Subject Type */}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={selectedSubjectType}
              onChange={(e) => setSelectedSubjectType(e.target.value)}
              displayEmpty
              sx={{ fontSize: '12px' }}
            >
              <MenuItem value=""><em>Subject</em></MenuItem>
              {subjectTypes.map((t) => (
                <MenuItem key={typeof t === 'string' ? t : t.name || t.type} value={typeof t === 'string' ? t : t.name || t.type}>
                  {typeof t === 'string' ? t : t.name || t.type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Subject UUID (shown when subject type selected) */}
          {selectedSubjectType && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select
                value={selectedSubjectUuid}
                onChange={(e) => setSelectedSubjectUuid(e.target.value)}
                displayEmpty
                sx={{ fontSize: '12px' }}
              >
                <MenuItem value=""><em>All {selectedSubjectType}s</em></MenuItem>
                {subjects.map((s) => {
                  const val = typeof s === 'string' ? s : s.uuid || s.id;
                  const label = typeof s === 'string' ? s : s.name || s.uuid || s.id;
                  return (
                    <MenuItem key={val} value={val}>{label}</MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          )}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Chart Group-By */}
          <ToggleButtonGroup
            value={chartGroupBy}
            exclusive
            onChange={(e, val) => { if (val) setChartGroupBy(val); }}
            size="small"
          >
            <ToggleButton value="event_type" sx={{ fontSize: '11px', px: 1.5, py: 0.25, textTransform: 'none' }}>
              By Type
            </ToggleButton>
            <ToggleButton value="level" sx={{ fontSize: '11px', px: 1.5, py: 0.25, textTransform: 'none' }}>
              By Level
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Active Call chip (set by "filter by call" in the detail panel) —
              shows the full event timeline for one call so it can be tracked. */}
          {selectedCallUuid && (
            <Chip
              label={`call: ${String(selectedCallUuid).slice(0, 8)}`}
              size="small"
              onDelete={() => setSelectedCallUuid('')}
              sx={{
                fontSize: '11px',
                height: 24,
                bgcolor: '#eef2ff',
                color: '#3730a3',
                borderColor: '#c7d2fe',
                border: '1px solid',
              }}
            />
          )}

          {/* Active Author chip (set by clicking AUTHOR cell) */}
          {selectedActor && (
            <Chip
              label={`author: ${selectedActor}`}
              size="small"
              onDelete={() => setSelectedActor('')}
              sx={{
                fontSize: '11px',
                height: 24,
                bgcolor: '#ecfdf5',
                color: '#0f766e',
                borderColor: '#5eead4',
                border: '1px solid',
              }}
            />
          )}

          <Box sx={{ flexGrow: 1 }} />

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              size="small"
              startIcon={<FilterAltOffIcon sx={{ fontSize: 16 }} />}
              onClick={clearFilters}
              sx={{ fontSize: '11px', textTransform: 'none', color: 'text.secondary' }}
            >
              Clear filters
            </Button>
          )}
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ flexShrink: 0 }}>
          {error}
        </Alert>
      )}

      {/* Time Histogram */}
      <Box sx={{ flexShrink: 0 }}>
        <TimeHistogram
          logs={histogramEvents}
          height={100}
          timeInterval={timeInterval}
          aggregateData={histogramData}
          onBrushSelection={(start, end) => setDateRange({ start, end, period: 'custom' })}
        />
      </Box>

      {/* Main Content: DataGrid + Detail Panel */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, gap: 0, overflow: 'hidden' }}>
        {/* DataGrid + Pagination */}
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', transition: 'flex 0.25s ease' }}>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <DataGrid
              rows={gridRows}
              columns={gridColumns}
              loading={loading}
              sortingMode="server"
              sortModel={sortModel}
              onSortModelChange={setSortModel}
              hideFooter
              disableRowSelectionOnClick
              disableColumnMenu
              autoHeight={false}
              rowHeight={44}
              getRowClassName={(params) => {
                const lvl = (params.row.level || '').toLowerCase();
                if (lvl === 'crit' || lvl === 'error') return 'severity-row-error';
                if (lvl === 'warn') return 'severity-row-warn';
                return '';
              }}
              sx={{
                ...stripedDataGridSx,
                height: '100%',
                border: '1px solid var(--mui-palette-divider)',
                borderRadius: '8px',
                backgroundColor: 'var(--mui-palette-background-paper)',
                fontFamily: 'Rubik, sans-serif',
                fontSize: '0.85rem',
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: 'var(--mui-palette-surface-muted)',
                  borderBottom: '1px solid var(--mui-palette-divider)',
                },
                '& .MuiDataGrid-columnHeader': {
                  backgroundColor: 'var(--mui-palette-surface-muted)',
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  color: 'var(--mui-palette-text-secondary)',
                  letterSpacing: '0.05em',
                },
                '& .MuiDataGrid-cell': {
                  borderBottom: '1px solid var(--mui-palette-divider)',
                  py: 0.5,
                },
                '& .MuiDataGrid-row': {
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: '#f0f9ff',
                  },
                  '&.Mui-selected': {
                    backgroundColor: '#eff6ff',
                    '&:hover': {
                      backgroundColor: '#dbeafe',
                    },
                  },
                },
                '& .MuiDataGrid-virtualScroller': {
                  backgroundColor: 'var(--mui-palette-background-paper)',
                },
                '& .severity-row-error': {
                  bgcolor: '#fef2f2',
                  '&:hover': { bgcolor: '#fee2e2' },
                },
                '& .severity-row-warn': {
                  bgcolor: '#fffbeb',
                  '&:hover': { bgcolor: '#fef3c7' },
                },
              }}
            />
          </Box>

          {/* Pagination Controls */}
          <Box sx={{
            borderTop: '1px solid var(--mui-palette-divider)',
            bgcolor: 'var(--mui-palette-surface-muted)',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <TablePagination
              component="div"
              count={totalCount}
              page={pagination.page}
              onPageChange={handleChangePage}
              rowsPerPage={pagination.limit}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[25, 50, 100, 200, 500]}
              labelRowsPerPage="Events per page:"
              sx={{
                '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                  fontSize: '12px',
                  fontFamily: 'monospace'
                },
                '.MuiTablePagination-select': {
                  fontSize: '12px'
                }
              }}
            />
          </Box>
        </Box>

      </Box>
    </Box>
  );
};

export default Events;
