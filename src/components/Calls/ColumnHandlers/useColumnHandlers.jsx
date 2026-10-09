import { useState, useMemo, useCallback, useEffect } from 'react';
import Bdi from '../../../i18n/Bdi';
import moment from 'moment';
import { formatPhoneNumber, extractCountryFromPhone, formatDuration } from '../../../utils/phoneUtils';
import { Tooltip, Box } from '@mui/material';
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import ReactCountryFlag from 'react-country-flag';
import CellWithHover from '../CellWithHover/CellWithHover.jsx';
import { useCallNumber } from '../../../hooks/useCallNumber';

// Per-column width hints (matched by logical name) so columns size to their
// content instead of every column stretching to flex:1 (which made them too wide).
// Name/contact-style columns flex to absorb leftover space; everything else is fixed.
const COLUMN_WIDTHS = {
  created_at: 175,
  direction: 115,
  state: 110,
  cause: 115,
  disposition: 150,
  hangup_disposition: 150,
  duration: 100,
  talk_duration: 120,
  bill_duration: 110,
  country: 90,
  cid: 130,
  caller_id_number: 140,
  provider: 130,
  environment: 130,
  recording: 180,
  actions: 90,
};
const FLEX_COLUMNS = new Set(['caller', 'callee', 'contact', 'fullname', 'user_name', 'name']);

// Flex columns absorb ALL leftover width, so caller+callee together ate the row
// and pushed the columns after them off-screen. They stay flexible (content
// length varies — extensions are 3 digits, MSISDNs are 12+), but capped, so
// leftover space is shared with the rest of the grid instead of consumed here.
const FLEX_MAX_WIDTH = 220;

// Columns that can never be hidden — the ones that make a row actionable.
const MANDATORY_COLUMNS = new Set(['recording', 'actions']);

// A status value's tone, drawn as a small dot beside plain text. The colours
// are the counters' own tokens, so "answered" is the same green in the counter
// row, the chart and the table. A value with no tone (complete, cancel,
// timeout, …) gets a grey dot: it is on almost every row and says nothing new.
const TONE_COLORS = {
  good: 'var(--counter-answered)',
  bad: 'var(--counter-no-answer)',
  warn: 'var(--accent-warning)',
  info: 'var(--accent-info)',
  neutral: 'var(--theme-text-tertiary)',
};
const STATUS_TONES = {
  available: 'good', registered: 'good', answer: 'good', contact_answer: 'good',
  busy: 'bad', incall: 'bad', failed: 'bad', no_answer: 'bad', noanswer: 'bad',
  break: 'warn', on_break: 'warn', paused: 'warn', caller_hangup: 'warn',
  waiting: 'info', contact_hangup: 'info',
};
const STATUS_LABELS = {
  available: 'Available', busy: 'Busy', incall: 'In Call',
  break: 'Break', on_break: 'On Break', offline: 'Offline',
  paused: 'Paused', waiting: 'Waiting',
  answer: 'Answer', completed: 'Completed', complete: 'Complete',
  no_answer: 'No Answer', noanswer: 'No Answer',
  failed: 'Failed', cancel: 'Cancel',
  contact_hangup: 'Contact Hangup', caller_hangup: 'Caller Hangup',
  contact_answer: 'Contact Answer',
  incoming: 'Incoming', outgoing: 'Outgoing',
  registered: 'Registered',
};

// Faint placeholder so empty/zero values recede and real data stands out.
const EMPTY_DASH = (
  <span style={{ color: 'var(--theme-text-tertiary, #9ca3af)', opacity: 0.5 }}>—</span>
);
const isEmptyValue = (v) =>
  v === null || v === undefined || v === '' || v === 'N/A' || String(v).toLowerCase() === 'none';

const statusKey = (value) => String(value).toLowerCase().replace(/-/g, '_');
const statusLabel = (value) =>
  STATUS_LABELS[statusKey(value)] || String(value).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Every status-like cell (cause, state, disposition, hangup) in one look.
const StatusText = ({ value }) => (
  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
    <Box
      component="span"
      sx={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        bgcolor: TONE_COLORS[STATUS_TONES[statusKey(value)] || 'neutral'],
      }}
    />
    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusLabel(value)}</Box>
  </Box>
);

/**
 * Generate a unique key for a column based on its type (matching nimbus-admin pattern).
 * sub_object → "prop.sub_prop" (e.g., "profile.caller")
 * link → "link_prop.name" (e.g., "environment.name")
 * tooltip_object → "prop.tooltip_prop"
 * date/string → prop directly
 */
const getColumnKey = (col, index) => {
  if (col.type === 'sub_object' && col.prop && col.sub_prop) {
    return `${col.prop}.${col.sub_prop}`;
  }
  if (col.type === 'link' && col.link_prop) {
    return `${col.link_prop}.name`;
  }
  if (col.type === 'tooltip_object' && col.prop && col.tooltip_prop) {
    return `${col.prop}.${col.tooltip_prop}`;
  }
  return col.prop || col.field || `col_${index}`;
};

/**
 * Extract value from row based on column definition
 */
const getValueFromRow = (row, columnDef, fieldKey) => {
  const { type, prop, sub_prop, link_prop, tooltip_prop } = columnDef;

  switch (type) {
    case 'sub_object':
      return row[prop]?.[sub_prop] ?? null;
    case 'link':
      return row[link_prop]?.name ?? null;
    case 'tooltip_object':
      return row[prop]?.[tooltip_prop] ?? null;
    case 'date':
      return row[prop] ?? null;
    case 'string':
    default:
      if (prop && prop.includes('.')) {
        const parts = prop.split('.');
        let value = row;
        for (const part of parts) {
          value = value?.[part];
        }
        return value ?? null;
      }
      return row[prop] ?? row[fieldKey] ?? null;
  }
};

/**
 * Get logical field name for matching special renderers and icons.
 * Maps API field keys like "profile.direction" to "direction".
 */
const getLogicalName = (fieldKey, columnDef) => {
  if (columnDef?.sub_prop) return columnDef.sub_prop;
  if (fieldKey.includes('.')) return fieldKey.split('.').pop();
  return fieldKey;
};

const useColumnHandlers = (handleOpenRecording, onSearch, currentSearchParams = {}, apiColumns = [], segments = [], onOpenCall = null) => {

  // Column key -> server segment. `segments` (Segment.calls) is the authority on
  // what the API will actually filter by, so it decides which cells offer the
  // magnifier at all. Column keys arrive in several shapes — "cause",
  // "call.cause", "profile.caller" — so try the key as given, then "call."-
  // prefixed, then the part after the last dot.
  const segmentFor = useCallback((field) => {
    if (!field || !Array.isArray(segments)) return null;
    const nameOf = (s) => s.name || s.field;
    const short = String(field).includes('.') ? String(field).split('.').pop() : String(field);
    return segments.find(s => nameOf(s) === field)
      || segments.find(s => nameOf(s) === `call.${short}`)
      || segments.find(s => {
        const n = nameOf(s);
        return n && (n.includes('.') ? n.split('.').pop() : n) === short;
      })
      || null;
  }, [segments]);

  // Click a value, filter by that value. Emits the same param a filter pill
  // writes — `search[<segment>][IS]` — so the cell, the pill and the stat cards
  // are one piece of state instead of three near-identical ones. Returns
  // undefined for a field the server can't filter, and CellWithHover then hides
  // the magnifier rather than offering a click that changes nothing.
  const cellSearchFor = useCallback((field) => {
    const segment = segmentFor(field);
    if (!segment || !onSearch) return undefined;
    const segmentName = segment.name || segment.field;
    const isNumeric = segment.type === 'numeric';
    const options = Array.isArray(segment.data) ? segment.data : null;

    return (value) => {
      if (value === null || value === undefined || value === '' || value === 'N/A') return;

      // Cells render whatever case the switch wrote ("ANSWER"); the filter has
      // to send the option value the server knows ("answer").
      let filterValue = value;
      if (options) {
        const match = options.find((o) => {
          const v = o.uuid || o.value || o.id || o;
          return String(v).toLowerCase() === String(value).toLowerCase();
        });
        filterValue = [match ? (match.uuid || match.value || match.id || match) : value];
      }

      // onSearch replaces the whole param set — keep the rest, drop this
      // field's other operators so IS can't stack on NOT.
      const next = {};
      Object.entries(currentSearchParams || {}).forEach(([key, val]) => {
        if (!key.includes(`search[${segmentName}]`)) next[key] = val;
      });
      next[`search[${segmentName}][${isNumeric ? 'EQ' : 'IS'}]`] = filterValue;
      onSearch(next, false);
    };
  }, [segmentFor, currentSearchParams, onSearch]);

  const handleCopy = useCallback((value, field) => {
    console.log(`Copied ${field}: ${value}`);
  }, []);

  // A caller or callee number opens the phone with it (right-hand sidebar).
  const callNumber = useCallNumber();

  const [columnSelectorAnchorEl, setColumnSelectorAnchorEl] = useState(null);

  // Get columns with selected=true from API (matching nimbus-admin pattern)
  const getSelectedColumnsFromApi = useCallback((columns) => {
    if (columns && columns.length > 0) {
      const selectedCols = columns
        .filter(col => col.selected === true)
        .map((col) => {
          const originalIndex = columns.indexOf(col);
          return getColumnKey(col, originalIndex);
        });
      return selectedCols;
    }
    return [];
  }, []);

  // Initialize visibleColumns - try localStorage first, then API defaults
  const getInitialVisibleColumns = useCallback(() => {
    if (apiColumns && apiColumns.length > 0) {
      const selectedColumns = getSelectedColumnsFromApi(apiColumns);
      const allColumns = apiColumns.map((col, index) => getColumnKey(col, index));

      // Try localStorage - only use if it has at least 3 valid columns
      const savedColumns = localStorage.getItem('calls_visible_columns');
      if (savedColumns) {
        try {
          const parsed = JSON.parse(savedColumns);
          // Keep any saved column that still exists in the current schema.
          // Honor the saved selection as long as at least one key still matches;
          // only fall through to API defaults when none do (truly stale storage).
          const validSavedColumns = parsed.filter(col => allColumns.includes(col));
          if (validSavedColumns.length >= 1) {
            // Force the mandatory columns back in: a preference saved before
            // they were mandatory (or hand-edited storage) would otherwise
            // leave a row you can read but not act on.
            MANDATORY_COLUMNS.forEach((col) => {
              if (!validSavedColumns.includes(col)) validSavedColumns.push(col);
            });
            return validSavedColumns;
          }
          // No saved key matches the columns currently loaded — this is usually
          // a transient/partial load or an environment switch. Do NOT wipe the
          // saved selection (the filter above already ignores stale keys);
          // just fall through to API defaults for this render.
        } catch {
          // Corrupt value — safe to clear.
          localStorage.removeItem('calls_visible_columns');
        }
      }

      // Use API's selected columns
      if (selectedColumns.length > 0) {
        // Always include recording column
        if (!selectedColumns.includes('recording')) {
          selectedColumns.push('recording');
        }
        return selectedColumns;
      }

      // Fallback: show all columns (recording is already in availableColumns)
      return allColumns;
    }
    return [];
  }, [apiColumns, getSelectedColumnsFromApi]);

  const [visibleColumns, setVisibleColumns] = useState([]);

  // Build availableColumns from API columns (matching nimbus-admin pattern)
  // NOTE: Must be declared before callbacks that reference it
  const availableColumns = useMemo(() => {
    const columnsMap = {};

    if (apiColumns && apiColumns.length > 0) {
      apiColumns.forEach((col, index) => {
        const fieldKey = getColumnKey(col, index);
        columnsMap[fieldKey] = {
          name: col.name,
          minWidth: 120,
          type: col.type,
          prop: col.prop,
          sub_prop: col.sub_prop,
          link_prop: col.link_prop,
          tooltip_prop: col.tooltip_prop,
          sort_by: col.sort_by,
          field: col.field,
          originalIndex: index
        };
      });

      // Always include recording column (not from API but always visible)
      columnsMap['recording'] = {
        name: 'Recording',
        minWidth: 120,
        type: 'special',
        prop: 'recording',
        field: 'recording',
        originalIndex: apiColumns.length
      };
    }

    return columnsMap;
  }, [apiColumns]);

  // Update visible columns when API columns load
  useEffect(() => {
    if (apiColumns && apiColumns.length > 0 && visibleColumns.length === 0) {
      const initialColumns = getInitialVisibleColumns();
      if (initialColumns.length > 0) {
        setVisibleColumns(initialColumns);
      }
    }
  }, [apiColumns, visibleColumns.length, getInitialVisibleColumns]);

  const handleColumnSelectorOpen = (event) => {
    setColumnSelectorAnchorEl(event.currentTarget);
  };

  const handleColumnSelectorClose = () => {
    setColumnSelectorAnchorEl(null);
  };

  const handleToggleColumnVisibility = (fieldKey) => {
    // Recording and Actions are mandatory: they're how you DO something with a
    // row (play/download a recording, open the row's actions). Hiding them
    // leaves a row you can read but not act on, with no obvious way back.
    if (MANDATORY_COLUMNS.has(fieldKey) && visibleColumns.includes(fieldKey)) return;

    const newVisibleColumns = visibleColumns.includes(fieldKey)
      ? visibleColumns.filter(key => key !== fieldKey)
      : [...visibleColumns, fieldKey];

    setVisibleColumns(newVisibleColumns);
    localStorage.setItem('calls_visible_columns', JSON.stringify(newVisibleColumns));
  };

  // Select all columns
  const handleSelectAllColumns = useCallback(() => {
    const allColumnKeys = Object.keys(availableColumns);
    setVisibleColumns(allColumnKeys);
    localStorage.setItem('calls_visible_columns', JSON.stringify(allColumnKeys));
  }, [availableColumns]);

  // Deselect all columns (keep at least first column + recording)
  const handleDeselectAllColumns = useCallback(() => {
    const firstColumn = apiColumns.length > 0
      ? getColumnKey(apiColumns[0], 0)
      : Object.keys(availableColumns)[0];
    const minColumns = firstColumn ? [firstColumn] : [];
    MANDATORY_COLUMNS.forEach((col) => {
      if (!minColumns.includes(col)) minColumns.push(col);
    });
    setVisibleColumns(minColumns);
    localStorage.setItem('calls_visible_columns', JSON.stringify(minColumns));
  }, [apiColumns, availableColumns]);

  // Reset to API defaults
  const handleResetColumns = useCallback(() => {
    const defaultColumns = getSelectedColumnsFromApi(apiColumns);
    const columnsToSet = defaultColumns.length > 0
      ? defaultColumns
      : apiColumns.map((col, index) => getColumnKey(col, index));
    setVisibleColumns(columnsToSet);
    localStorage.removeItem('calls_visible_columns');
  }, [apiColumns, getSelectedColumnsFromApi]);

  // Create DataGrid columns dynamically
  const createGridColumns = useCallback((visibleCols, DirectionIcon, CauseIcon, RecordingControls, CallActions, handleAddNote) => {
    return visibleCols.map(fieldKey => {
      const columnDef = availableColumns[fieldKey];
      if (!columnDef) return null;

      // Get logical name for matching special renderers
      const logicalName = getLogicalName(fieldKey, columnDef);

      const sizing = FLEX_COLUMNS.has(logicalName)
        ? { flex: 1, minWidth: 120, maxWidth: FLEX_MAX_WIDTH }
        : { width: COLUMN_WIDTHS[logicalName] || columnDef.minWidth || 120 };

      // Every header is the grid's own title: same type, no icon on some.
      const baseColumn = {
        field: fieldKey,
        headerName: columnDef.name,
        ...sizing,
        sortable: !!columnDef.sort_by,
      };

      // Special columns with custom rendering (matched by logical name)
      const specialRenderCells = {
        created_at: (params) => {
          const value = getValueFromRow(params.row, columnDef, fieldKey);
          if (!value) return EMPTY_DASH;
          const displayTime = moment(value).format('DD/MM/YY HH:mm:ss');
          return (
            <CellWithHover
              value={value}
              field={fieldKey}
              onSearch={cellSearchFor(fieldKey)}
              onCopy={handleCopy}
              searchable={false}
              copyable={true}
            >
              {displayTime}
            </CellWithHover>
          );
        },

        caller: (params) => {
          const value = getValueFromRow(params.row, columnDef, fieldKey);
          if (isEmptyValue(value)) return EMPTY_DASH;
          return (
            <CellWithHover
              value={value}
              field="caller"
              onSearch={cellSearchFor("caller")}
              onCopy={handleCopy}
              onCall={callNumber}
            >
              <Bdi>{value}</Bdi>
            </CellWithHover>
          );
        },

        callee: (params) => {
          const value = getValueFromRow(params.row, columnDef, fieldKey);
          if (isEmptyValue(value)) return EMPTY_DASH;
          const formattedCallee = formatPhoneNumber(value);
          return (
            <CellWithHover
              value={value}
              field="callee"
              onSearch={cellSearchFor("callee")}
              onCopy={handleCopy}
              onCall={callNumber}
            >
              <Bdi>{formattedCallee}</Bdi>
            </CellWithHover>
          );
        },

        direction: (params) => {
          const value = getValueFromRow(params.row, columnDef, fieldKey);
          if (isEmptyValue(value)) return EMPTY_DASH;
          // Direction is a category, not an outcome: an arrow and the word,
          // no box and no status colour.
          const isOutgoing = statusKey(value).includes('out');
          const Arrow = isOutgoing ? CallMadeIcon : CallReceivedIcon;
          return (
            <CellWithHover
              value={value}
              field="direction"
              onSearch={cellSearchFor("direction")}
              onCopy={handleCopy}
            >
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <Arrow sx={{ fontSize: 14, color: 'var(--theme-text-secondary)' }} />
                {statusLabel(value)}
              </Box>
            </CellWithHover>
          );
        },

        cause: (params) => {
          const value = getValueFromRow(params.row, columnDef, fieldKey);
          if (isEmptyValue(value)) return EMPTY_DASH;
          return (
            <CellWithHover
              value={value}
              field="cause"
              onSearch={cellSearchFor("cause")}
              onCopy={handleCopy}
            >
              <StatusText value={value} />
            </CellWithHover>
          );
        },

        cid: (params) => {
          const value = getValueFromRow(params.row, columnDef, fieldKey);
          if (isEmptyValue(value)) return EMPTY_DASH;
          const cid = value;
          return (
            <CellWithHover
              value={cid}
              field="cid"
              onSearch={cellSearchFor("cid")}
              onCopy={handleCopy}
            >
              <Bdi>{cid}</Bdi>
            </CellWithHover>
          );
        },

        caller_id_number: (params) => {
          const value = getValueFromRow(params.row, columnDef, fieldKey);
          if (isEmptyValue(value)) return EMPTY_DASH;
          const cid = value;
          return (
            <CellWithHover
              value={cid}
              field={fieldKey}
              onSearch={cellSearchFor(fieldKey)}
              onCopy={handleCopy}
            >
              <Bdi>{cid}</Bdi>
            </CellWithHover>
          );
        },
      };

      // Match special renderer by logical name
      const specialRenderer = specialRenderCells[logicalName];
      if (specialRenderer) {
        return {
          ...baseColumn,
          renderCell: specialRenderer
        };
      }

      // Recording column (special - not from API)
      if (logicalName === 'recording' || fieldKey === 'recording') {
        return {
          ...baseColumn,
          renderCell: (params) => {
            const recordingUrl = params.row.recording?.url ||
                                 params.row.profile?.recordingUrl ||
                                 params.row.profile?.recording_url ||
                                 params.row.recordingUrl ||
                                 params.row.recording_url;
            return (
              <RecordingControls
                recordingUrl={recordingUrl}
                onOpenCall={() => onOpenCall?.(params.row)}
              />
            );
          }
        };
      }

      // Actions column (special - not from API)
      if (logicalName === 'actions' || fieldKey === 'actions') {
        return {
          ...baseColumn,
          renderCell: (params) => (
            <CallActions
              call={{
                uuid: params.row.uuid,
                id: params.row.id,
                caller_number: params.row.profile?.caller,
                destination_number: params.row.profile?.callee,
                direction: params.row.profile?.direction
              }}
              onAddNote={handleAddNote}
            />
          )
        };
      }

      // Generic render cell for all other API-defined columns
      return {
        ...baseColumn,
        renderCell: (params) => {
          const value = getValueFromRow(params.row, columnDef, fieldKey);
          const displayValue = value ?? 'N/A';

          // Format dates
          if (columnDef.type === 'date' && value) {
            const formatted = moment(value).format('DD/MM/YY HH:mm');
            return (
              <CellWithHover
                value={value}
                field={fieldKey}
                onSearch={cellSearchFor(fieldKey)}
                onCopy={handleCopy}
                searchable={false}
              >
                {formatted}
              </CellWithHover>
            );
          }

          // Format duration fields (mute zero/empty durations so non-zero stand out)
          if (logicalName.endsWith('_duration') || logicalName === 'duration') {
            const num = parseInt(value);
            if (isEmptyValue(value) || isNaN(num) || num === 0) return EMPTY_DASH;
            const formattedDuration = formatDuration(num);
            return (
              <CellWithHover
                value={value}
                field={fieldKey}
                onSearch={cellSearchFor(fieldKey)}
                onCopy={handleCopy}
              >
                {formattedDuration}
              </CellWithHover>
            );
          }

          // Status/state/disposition fields: a tone dot and the word
          const isStatusField = logicalName.includes('status') || logicalName.includes('state') || logicalName.includes('disposition');
          if (isStatusField) {
            if (isEmptyValue(value)) return EMPTY_DASH;
            return (
              <CellWithHover
                value={value}
                field={fieldKey}
                onSearch={cellSearchFor(fieldKey)}
                onCopy={handleCopy}
              >
                <StatusText value={value} />
              </CellWithHover>
            );
          }

          // Link type - show environment name etc.
          if (columnDef.type === 'link') {
            if (isEmptyValue(value)) return EMPTY_DASH;
            return (
              <CellWithHover
                value={displayValue}
                field={fieldKey}
                onSearch={cellSearchFor(fieldKey)}
                onCopy={handleCopy}
              >
                {String(displayValue)}
              </CellWithHover>
            );
          }

          // Country flag from callee phone number
          if (logicalName === 'country') {
            const phoneNumber = params.row.profile?.callee;
            if (!phoneNumber) return EMPTY_DASH;
            const countryInfo = extractCountryFromPhone(phoneNumber);
            if (!countryInfo.code) return EMPTY_DASH;
            return (
              <Tooltip title={countryInfo.name}>
                <ReactCountryFlag
                  countryCode={countryInfo.code}
                  svg
                  style={{ width: '1.5em', height: '1.2em' }}
                />
              </Tooltip>
            );
          }

          // Default: render as text with CellWithHover (mute empties)
          if (isEmptyValue(value)) return EMPTY_DASH;
          return (
            <CellWithHover
              value={displayValue}
              field={fieldKey}
              onSearch={cellSearchFor(fieldKey)}
              onCopy={handleCopy}
            >
              {String(displayValue)}
            </CellWithHover>
          );
        }
      };
    }).filter(Boolean);
  }, [availableColumns, currentSearchParams, cellSearchFor, handleCopy, callNumber, handleOpenRecording, onOpenCall]);

  return {
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
  };
};

export default useColumnHandlers;
