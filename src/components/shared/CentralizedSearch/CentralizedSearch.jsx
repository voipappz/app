import React, { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Typography,
  Button,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  Autocomplete,
  CircularProgress,
  Checkbox,
  ListItemText,
  Menu,
  Popover,
  Popper,
  Paper,
  ClickAwayListener,
  useMediaQuery,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import TuneIcon from '@mui/icons-material/Tune';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import FilterListIcon from '@mui/icons-material/FilterList';
import LabelIcon from '@mui/icons-material/Label';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import EnhancedDateRangePicker from '../EnhancedDateRangePicker/EnhancedDateRangePicker.jsx';
import { useAuth } from '../../../context/AuthContext';
import { useUserAuth } from '../../../context/UserAuthContext';
import { parseSearchInput } from '../../../hooks/useCentralizedSearch';
import { primaryButtonStyle, secondaryButtonStyle } from '../../../theme/buttonStyles';
import './CentralizedSearch.css';

const ICON_MAP = {
  'caller': <PersonIcon sx={{ fontSize: 16 }} />,
  'call.caller': <PersonIcon sx={{ fontSize: 16 }} />,
  'callee': <PhoneIcon sx={{ fontSize: 16 }} />,
  'call.callee': <PhoneIcon sx={{ fontSize: 16 }} />,
  'created_at': <CalendarTodayIcon sx={{ fontSize: 16 }} />,
  'call.created_at': <CalendarTodayIcon sx={{ fontSize: 16 }} />,
  'name': <PersonIcon sx={{ fontSize: 16 }} />,
  'email': <PersonIcon sx={{ fontSize: 16 }} />,
};

// The top bar's slot for the docked search field (rendered by TopBar).
export const TOPBAR_SEARCH_SLOT_ID = 'topbar-search-slot';

// The date range in a few characters, for the docked field: "Today", "Oct 3",
// "Oct 1 – Oct 5".
const rangeLabel = (range, t) => {
  const [from, to] = range || [];
  if (!from || !to) return null;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  // English keeps the browser's own short format, as before; Hebrew uses he-IL.
  const locale = i18n.language === 'he' ? 'he-IL' : undefined;
  const day = (d) => d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  if (a.toDateString() === b.toDateString()) {
    return a.toDateString() === new Date().toDateString() ? t('search.today') : day(a);
  }
  return `${day(a)} – ${day(b)}`;
};

const getSegmentIcon = (segmentName) => {
  return ICON_MAP[segmentName] || <FilterListIcon sx={{ fontSize: 16 }} />;
};

const NUMERIC_OP_MAP = { '=': 'EQ', '>': 'GT', '\u2265': 'GTE', '<': 'LT', '\u2264': 'LTE', '\u2260': 'NE' };
const NUMERIC_OP_LABELS = [
  { value: '=', label: '=' },
  { value: '>', label: '>' },
  { value: '\u2265', label: '\u2265' },  // >=  (GTE) \u2014 like the Calls duration filter
  { value: '<', label: '<' },
  { value: '\u2264', label: '\u2264' },  // <=  (LTE)
  { value: '\u2260', label: '\u2260' },
];

const isStringSegment = (segment) => {
  const t = segment?.type;
  return !t || t === 'string' || !['numeric', 'number', 'select', 'multi_select', 'select2_ajax', 'auto_complete_ajax', 'date', 'time', 'tag'].includes(t);
};

const isNumericSegment = (segment) => {
  const t = segment?.type;
  return t === 'numeric' || t === 'number';
};

const FilterInput = ({ segment, value, onChange, access }) => {
  const { t } = useTranslation();
  const fieldName = segment.name || segment.field;
  const options = segment.data || [];
  const getOptionValue = (opt) => opt.uuid || opt.value || opt.id;
  const getOptionLabel = (opt) => opt.name || opt.label || String(opt);

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      fontFamily: 'Rubik, sans-serif',
      fontSize: '0.85rem',
      borderRadius: '8px',
      backgroundColor: 'var(--theme-bg-primary, #f9fafb)',
      '& fieldset': { borderColor: 'var(--border-light)' },
      '&:hover fieldset': { borderColor: 'var(--accent-primary)' },
      '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' },
    },
  };

  if (segment.type === 'select' && options.length > 0) {
    return (
      <FormControl size="small" fullWidth>
        <Select
          value={value || ''}
          onChange={(e) => onChange(fieldName, 'IS', e.target.value)}
          displayEmpty
          sx={{
            fontFamily: 'Rubik, sans-serif',
            fontSize: '0.85rem',
            borderRadius: '8px',
            backgroundColor: 'var(--theme-bg-primary, #f9fafb)',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-light)' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent-primary)' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent-primary)' },
          }}
        >
          <MenuItem value=""><em style={{ color: 'var(--text-tertiary)' }}>{t('search.any')}</em></MenuItem>
          {options.map((opt, i) => (
            <MenuItem key={getOptionValue(opt) || i} value={getOptionValue(opt)}>
              {getOptionLabel(opt)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  }

  if (segment.type === 'multi_select' && options.length > 0) {
    const selected = Array.isArray(value) ? value : (value ? [value] : []);
    return (
      <FormControl size="small" fullWidth>
        <Select
          multiple
          value={selected}
          onChange={(e) => onChange(fieldName, 'IN', e.target.value)}
          displayEmpty
          renderValue={(sel) => {
            if (sel.length === 0) return <em style={{ color: 'var(--text-tertiary)' }}>{t('search.any')}</em>;
            return sel.map(v => {
              const opt = options.find(o => getOptionValue(o) === v);
              return opt ? getOptionLabel(opt) : v;
            }).join(', ');
          }}
          sx={{
            fontFamily: 'Rubik, sans-serif',
            fontSize: '0.85rem',
            borderRadius: '8px',
            backgroundColor: 'var(--theme-bg-primary, #f9fafb)',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-light)' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent-primary)' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent-primary)' },
          }}
        >
          {options.map((opt, i) => (
            <MenuItem key={getOptionValue(opt) || i} value={getOptionValue(opt)}>
              <Checkbox checked={selected.includes(getOptionValue(opt))} size="small" />
              <ListItemText primary={getOptionLabel(opt)} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  }

  if (segment.type === 'select2_ajax' || segment.type === 'auto_complete_ajax') {
    return <AjaxInput segment={segment} value={value} onChange={onChange} access={access} />;
  }

  if (segment.type === 'numeric' || segment.type === 'number') {
    return (
      <TextField
        size="small"
        fullWidth
        type="number"
        placeholder={segment.placeholder || segment.label || t('search.value')}
        value={value || ''}
        onChange={(e) => onChange(fieldName, 'IS', e.target.value)}
        sx={inputSx}
      />
    );
  }

  // Date range: renders From/To date pickers and emits the API's expected
  // `<from_epoch>-<to_epoch>` string (ParseSearchDate splits on '-' into two
  // unix timestamps). One-sided input is bounded (from=epoch 0, to=now).
  if (segment.type === 'date' || segment.type === 'daterange') {
    const [fromPart, toPart] = String(value || '').split('-');
    const toInput = (epoch) => {
      const n = parseInt(epoch, 10);
      return (!n || n <= 0) ? '' : new Date(n * 1000).toISOString().slice(0, 10);
    };
    const fromVal = toInput(fromPart);
    const toVal = toInput(toPart);
    const emit = (fromStr, toStr) => {
      if (!fromStr && !toStr) { onChange(fieldName, 'IS', ''); return; }
      const fromEpoch = fromStr ? Math.floor(new Date(`${fromStr}T00:00:00`).getTime() / 1000) : 0;
      const toEpoch = toStr ? Math.floor(new Date(`${toStr}T23:59:59`).getTime() / 1000) : Math.floor(Date.now() / 1000);
      onChange(fieldName, 'IS', `${fromEpoch}-${toEpoch}`);
    };
    return (
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <TextField
          size="small" type="date" label={t('search.from')} InputLabelProps={{ shrink: true }}
          value={fromVal} onChange={(e) => emit(e.target.value, toVal)} sx={inputSx}
        />
        <TextField
          size="small" type="date" label={t('search.to')} InputLabelProps={{ shrink: true }}
          value={toVal} onChange={(e) => emit(fromVal, e.target.value)} sx={inputSx}
        />
      </Box>
    );
  }

  return (
    <TextField
      size="small"
      fullWidth
      placeholder={segment.placeholder || segment.label || t('search.value')}
      value={value || ''}
      onChange={(e) => onChange(fieldName, 'IS', e.target.value)}
      sx={inputSx}
    />
  );
};

const AjaxInput = ({ segment, value, onChange, access }) => {
  const { t } = useTranslation();
  const fieldName = segment.name || segment.field;
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');

  React.useEffect(() => {
    if (!open || inputValue.length < 3) return;

    const fetchOptions = async () => {
      setLoading(true);
      try {
        const url = segment.url || '/api/search';
        const searchField = segment.search_fields || 'query';
        const apiUrl = `${url}?${searchField}=${encodeURIComponent(inputValue)}`;
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${access}`,
            'Accept': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          setOptions(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Autocomplete fetch failed:', err);
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(fetchOptions, 300);
    return () => clearTimeout(timeout);
  }, [inputValue, open, segment, access]);

  const getLabel = (opt) => {
    if (typeof opt === 'string') return opt;
    return opt[segment.title_field || 'name'] || String(opt);
  };

  const keyField = segment.key_field || 'uuid';
  const selected = Array.isArray(value) ? value : (value ? [value] : []);
  return (
    <Autocomplete
      multiple
      filterSelectedOptions
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={selected}
      onChange={(_, newVals) => {
        const ids = (newVals || []).map((v) => (v && typeof v === 'object') ? (v[keyField] || v) : v);
        onChange(fieldName, 'IN', ids);
      }}
      inputValue={inputValue}
      onInputChange={(_, val) => setInputValue(val)}
      options={options}
      loading={loading}
      getOptionLabel={(opt) => {
        if (typeof opt === 'string') {
          const found = options.find((o) => o[keyField] === opt);
          return found ? getLabel(found) : opt;
        }
        return getLabel(opt);
      }}
      isOptionEqualToValue={(opt, val) => {
        const optId = opt[keyField];
        const valId = (val && typeof val === 'object') ? val[keyField] : val;
        return optId === valId;
      }}
      size="small"
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={segment.placeholder || t('search.searchPlaceholder')}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontFamily: 'Rubik, sans-serif',
              fontSize: '0.85rem',
              borderRadius: '8px',
              backgroundColor: 'var(--theme-bg-primary, #f9fafb)',
              '& fieldset': { borderColor: 'var(--border-light)' },
              '&:hover fieldset': { borderColor: 'var(--accent-primary)' },
              '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' },
            },
          }}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};

const TagFilterInput = ({ segment, value, onChange, access }) => {
  const { t } = useTranslation();
  const fieldName = segment.name || segment.field;
  const tagValue = (typeof value === 'object' && value !== null) ? value : { key: '', value: '' };
  const [keyOptions, setKeyOptions] = useState([]);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);

  React.useEffect(() => {
    if (!keyOpen || !segment.url) return;
    let cancelled = false;
    const fetchKeys = async () => {
      setKeyLoading(true);
      try {
        const response = await fetch(segment.url, {
          headers: { 'Authorization': `Bearer ${access}`, 'Accept': 'application/json' },
        });
        if (response.ok && !cancelled) {
          const data = await response.json();
          setKeyOptions(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Tag keys fetch failed:', err);
      } finally {
        if (!cancelled) setKeyLoading(false);
      }
    };
    fetchKeys();
    return () => { cancelled = true; };
  }, [keyOpen, segment.url, access]);

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      fontFamily: 'Rubik, sans-serif',
      fontSize: '0.85rem',
      borderRadius: '8px',
      backgroundColor: 'var(--theme-bg-primary, #f9fafb)',
      '& fieldset': { borderColor: 'var(--border-light)' },
      '&:hover fieldset': { borderColor: 'var(--accent-primary)' },
      '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' },
    },
  };

  return (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      <Autocomplete
        freeSolo
        open={keyOpen}
        onOpen={() => setKeyOpen(true)}
        onClose={() => setKeyOpen(false)}
        options={keyOptions}
        loading={keyLoading}
        value={tagValue.key || null}
        onChange={(_, newVal) => onChange(fieldName, 'IS', { ...tagValue, key: newVal || '' })}
        onInputChange={(_, val, reason) => {
          if (reason !== 'reset') onChange(fieldName, 'IS', { ...tagValue, key: val || '' });
        }}
        size="small"
        sx={{ flex: 1, minWidth: 0 }}
        renderInput={(params) => (
          <TextField {...params} placeholder={t('search.key')} sx={inputSx}
            InputProps={{ ...params.InputProps,
              endAdornment: (<>{keyLoading ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</>),
            }}
          />
        )}
      />
      <TextField
        size="small"
        sx={{ flex: 1, minWidth: 0, ...inputSx }}
        placeholder={t('search.value')}
        value={tagValue.value || ''}
        onChange={(e) => onChange(fieldName, 'IS', { ...tagValue, value: e.target.value })}
      />
    </Box>
  );
};

const getActiveFilters = (segments, currentSearchParams) => {
  if (!segments || !currentSearchParams) return [];

  const active = [];
  const matchedFields = new Set();

  // Collect meta tag filters: search[meta][key]=value
  const metaEntries = [];
  for (const [key, value] of Object.entries(currentSearchParams)) {
    const metaMatch = key.match(/^search\[meta\]\[([^\]]+)\]$/);
    if (metaMatch) {
      metaEntries.push({ metaKey: metaMatch[1], metaValue: value, paramKey: key });
    }
  }
  if (metaEntries.length > 0) {
    const tagSegment = segments?.find(s => s.type === 'tag');
    metaEntries.forEach((entry) => {
      const displayValue = entry.metaValue ? `${entry.metaKey}=${entry.metaValue}` : entry.metaKey;
      active.push({
        segment: tagSegment || { label: i18n.t('search.tag'), type: 'tag', name: 'meta' },
        fieldName: `meta__${entry.metaKey}`,
        paramKey: entry.paramKey,
        value: entry.metaValue,
        displayValue,
        isMeta: true,
      });
    });
    matchedFields.add('meta');
  }

  for (const [key, value] of Object.entries(currentSearchParams)) {
    if (key === 'order_by' || key === 'order_type' || key === '_client') continue;
    if (key === 'search[text]' || key === 'search[inline]') continue;
    if (key.startsWith('search[meta]')) continue; // already handled above

    for (const segment of segments) {
      const fieldName = segment.name || segment.field;
      if (matchedFields.has(fieldName)) continue;
      if (segment.type === 'tag') continue; // skip tag segments in normal matching

      if (key.includes(`search[${fieldName}]`)) {
        let displayValue = value;
        if (Array.isArray(value)) {
          if (segment.data) {
            const getVal = (o) => o.uuid || o.value || o.id;
            const getLbl = (o) => o.name || o.label || String(o);
            displayValue = value.map(v => {
              const opt = segment.data.find(d => getVal(d) === v);
              return opt ? getLbl(opt) : v;
            }).join(', ');
          } else {
            displayValue = value.join(', ');
          }
        } else if (segment.data) {
          const getVal = (o) => o.uuid || o.value || o.id;
          const getLbl = (o) => o.name || o.label || String(o);
          const opt = segment.data.find(d => getVal(d) === value);
          if (opt) displayValue = getLbl(opt);
        }

        active.push({ segment, fieldName, paramKey: key, value, displayValue: String(displayValue) });
        matchedFields.add(fieldName);
        break;
      }
    }

    if (!active.some(a => a.paramKey === key)) {
      const genericMatch = key.match(/search\[([^\]]+)\]/);
      if (genericMatch) {
        const rawField = genericMatch[1];
        if (!matchedFields.has(rawField)) {
          active.push({
            segment: null,
            fieldName: rawField,
            paramKey: key,
            value,
            displayValue: String(Array.isArray(value) ? value.join(', ') : value),
          });
          matchedFields.add(rawField);
        }
      }
    }
  }

  return active;
};

/**
 * One filter, one element.
 *
 * Unset it reads as its own name — `Cause ▾` — and opens the values it accepts.
 * Set it reads as the answer — `Cause: Answer ✕`. That second state IS the
 * active-filter chip, not a copy of it: screens that opt into pills render this
 * row *instead of* the chip row below, so a filter is never on screen twice.
 *
 * Options come from `segment.data` when the server supplies one (cause,
 * direction, disposition…); everything else gets a one-line text box, which is
 * all the full ⚙ panel would have given it anyway.
 */
const FilterPill = ({ segment, active, onApply, onRemove }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [draft, setDraft] = useState('');
  const fieldName = segment.name || segment.field;
  const options = Array.isArray(segment.data) ? segment.data : null;

  const close = () => setAnchorEl(null);

  const apply = (value) => {
    close();
    if (value === '' || value === null || value === undefined) return;
    onApply(fieldName, value);
  };

  if (active) {
    return (
      <Chip
        icon={getSegmentIcon(fieldName)}
        label={`${segment.label}: ${active.displayValue}`}
        size="small"
        onDelete={() => onRemove(active)}
        sx={{
          fontFamily: 'Rubik, sans-serif', fontSize: '0.78rem', borderRadius: '16px',
          backgroundColor: 'var(--accent-primary-alpha-8)',
          color: 'var(--accent-primary)',
          border: '1px solid var(--accent-primary-alpha-20)',
          '& .MuiChip-icon': { color: 'var(--accent-primary)' },
          '& .MuiChip-deleteIcon': {
            color: 'var(--accent-primary)',
            '&:hover': { color: 'var(--accent-primary-dark)' },
          },
        }}
      />
    );
  }

  return (
    <>
      <Chip
        label={segment.label}
        size="small"
        variant="outlined"
        deleteIcon={<ArrowDropDownIcon />}
        onDelete={(e) => setAnchorEl(e.currentTarget.parentElement)}
        onClick={(e) => { setDraft(''); setAnchorEl(e.currentTarget); }}
        sx={{
          fontFamily: 'Rubik, sans-serif', fontSize: '0.78rem', borderRadius: '16px',
          cursor: 'pointer',
          color: 'var(--theme-text-secondary)',
          borderColor: 'var(--border-light)',
          '& .MuiChip-deleteIcon': { color: 'var(--text-tertiary)', ml: -0.5 },
          '&:hover': { borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' },
        }}
      />
      {options ? (
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
          {options.map((opt) => {
            const value = opt.uuid || opt.value || opt.id || opt;
            const label = opt.name || opt.label || String(opt);
            return (
              <MenuItem key={String(value)} onClick={() => apply(value)} sx={{ fontSize: '0.8rem' }}>
                {label}
              </MenuItem>
            );
          })}
        </Menu>
      ) : (
        <Popover
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Box sx={{ p: 1 }}>
            <TextField
              autoFocus
              size="small"
              placeholder={segment.label}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') apply(draft.trim()); }}
              sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.85rem' } }}
            />
          </Box>
        </Popover>
      )}
    </>
  );
};

/**
 * Shared CentralizedSearch component for all screens.
 *
 * @param {string} placeholder - Search input placeholder text
 * @param {Function} onExport - Optional. If provided, shows Export CSV button
 * @param {Function} onColumnSelectorOpen - Optional. If provided, shows Columns button
 * @param {string} textParam - Param the bare search text is sent as (default search[name])
 */
const CentralizedSearch = ({
  segments,
  currentSearchParams,
  onFilterChange,
  onQuickSearch,
  onClearAllFilters,
  dateRange,
  onDateRangeChange,
  onRefresh,
  onExport,
  onColumnSelectorOpen,
  quickSearchText,
  onQuickSearchChange,
  placeholder,
  showExclude = false,
  hideSearchInput = false,
  inlineFilters = null,
  textParam = 'search[name]',
}) => {
  const { t } = useTranslation();
  // The bearer for the raw fetches in AjaxInput/TagFilterInput (they bypass
  // apiService, which resolves this itself). Falls back to the portal token so
  // a screen shared with the portal — DIDs and its meta-key tag segment — can
  // load its filter options instead of firing an unauthenticated request.
  const { access: adminAccess, isAuthenticated: adminAuthenticated } = useAuth();
  const { token: portalToken } = useUserAuth();
  const access = adminAuthenticated ? adminAccess : (portalToken || adminAccess);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Where this renders: docked in the top bar when it offers a slot, unless
  // this is a phone or the screen is open inside a dialog (the bar is behind it).
  const rootRef = useRef(null);
  const dockRef = useRef(null);
  const isPhone = useMediaQuery('(max-width:599.95px)');
  const [slot, setSlot] = useState(null);
  useLayoutEffect(() => {
    const el = document.getElementById(TOPBAR_SEARCH_SLOT_ID);
    const inDialog = rootRef.current?.closest('[role="dialog"]');
    setSlot(el && !inDialog && !isPhone && !hideSearchInput ? el : null);
  }, [isPhone, hideSearchInput]);
  const docked = Boolean(slot);
  const [filterValues, setFilterValues] = useState({});
  const [filterNegated, setFilterNegated] = useState({});
  const [filterNumericOps, setFilterNumericOps] = useState({});

  const activeFilters = useMemo(
    () => getActiveFilters(segments, currentSearchParams),
    [segments, currentSearchParams]
  );

  const handleFieldChange = useCallback((fieldName, _operator, value) => {
    setFilterValues(prev => ({ ...prev, [fieldName]: value }));
  }, []);

  const toggleNegate = useCallback((fieldName) => {
    setFilterNegated(prev => ({ ...prev, [fieldName]: !prev[fieldName] }));
  }, []);

  const handleApplyFilters = useCallback(() => {
    const searchParams = {};

    Object.entries(filterValues).forEach(([fieldName, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        const segment = segments?.find(s => (s.name || s.field) === fieldName);

        // Tag segment: emit search[meta][key]=value
        if (segment?.type === 'tag' && typeof value === 'object' && value.key) {
          searchParams[`search[meta][${value.key}]`] = value.value || '';
          return;
        }

        let operator;
        if (isStringSegment(segment)) {
          operator = filterNegated[fieldName] ? 'NOT' : 'IS';
        } else if (isNumericSegment(segment)) {
          operator = NUMERIC_OP_MAP[filterNumericOps[fieldName] || '='] || 'EQ';
        } else if (segment?.type === 'multi_select') {
          operator = 'IN';
        } else {
          operator = 'IS';
        }

        const searchKey = `search[${fieldName}][${operator}]`;
        searchParams[searchKey] = value;
      }
    });

    if (Object.keys(searchParams).length > 0) {
      onFilterChange(searchParams, false);
    }
    setShowFilterPanel(false);
  }, [filterValues, filterNegated, filterNumericOps, segments, onFilterChange]);

  const handleClearFilterPanel = useCallback(() => {
    setFilterValues({});
    setFilterNegated({});
    setFilterNumericOps({});
  }, []);

  const handleRemoveActiveFilter = useCallback((filter) => {
    const newParams = { ...currentSearchParams };
    if (filter.isMeta) {
      // Remove this specific meta key param
      delete newParams[filter.paramKey];
    } else {
      Object.keys(newParams).forEach(key => {
        if (key.includes(`search[${filter.fieldName}]`)) {
          delete newParams[key];
        }
      });
    }
    onFilterChange(newParams, true);
  }, [currentSearchParams, onFilterChange]);

  // Pills for the fields a screen wants permanently visible, in the order it
  // asked for them. Names that the server didn't send as segments are skipped
  // rather than faked — a pill that can't be filled is worse than no pill.
  const pillSegments = useMemo(() => {
    if (!inlineFilters || !segments) return [];
    return inlineFilters
      .map((name) => segments.find(s => (s.name || s.field) === name))
      .filter(Boolean);
  }, [inlineFilters, segments]);

  // Everything active that no pill already speaks for — tags, and whatever the
  // ⚙ panel or the search box set on the other fields.
  const overflowFilters = useMemo(() => {
    const pillNames = new Set(pillSegments.map(s => s.name || s.field));
    return activeFilters.filter(f => !pillNames.has(f.fieldName));
  }, [activeFilters, pillSegments]);

  const handlePillApply = useCallback((fieldName, value) => {
    const segment = segments?.find(s => (s.name || s.field) === fieldName);
    const isNumeric = isNumericSegment(segment);
    const operator = isNumeric ? (NUMERIC_OP_MAP['='] || 'EQ') : 'IS';
    // A pill picks exactly one value, so it emits IS — not the panel's IN — and
    // wraps choice-list values in an array. That makes a pill and a screen's own
    // quick-filter buttons write the identical param, so one lights the other.
    const paramValue = (!isNumeric && Array.isArray(segment?.data)) ? [value] : value;

    // onFilterChange replaces the whole param set, so carry the rest forward —
    // dropping this field's other operators first, so IS can't stack on NOT.
    const next = {};
    Object.entries(currentSearchParams || {}).forEach(([key, val]) => {
      if (!key.includes(`search[${fieldName}]`)) next[key] = val;
    });
    next[`search[${fieldName}][${operator}]`] = paramValue;
    onFilterChange(next, false);
  }, [segments, currentSearchParams, onFilterChange]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      const text = quickSearchText.trim();
      if (segments && segments.length > 0 && text) {
        // Gmail-style colon-syntax parsing
        const parsed = parseSearchInput(text, segments, textParam);
        onFilterChange(parsed, false);
      } else {
        onQuickSearch(e);
      }
      if (docked) setShowFilterPanel(false);
    }
  };

  const toggleFilterPanel = () => {
    if (!showFilterPanel) {
      const values = {};
      activeFilters.forEach(af => {
        if (af.isMeta) {
          const metaKeyMatch = af.fieldName.match(/^meta__(.+)$/);
          if (metaKeyMatch && !values.meta) {
            values.meta = { key: metaKeyMatch[1], value: af.value || '' };
          }
        } else if (af.segment) {
          values[af.fieldName] = af.value;
        }
      });
      setFilterValues(values);
      setFilterNegated({});
      setFilterNumericOps({});
    }
    setShowFilterPanel(!showFilterPanel);
  };


  // Docked: the search field lives in the top bar (TopBar's
  // #topbar-search-slot), beside the application selector, and everything that
  // refines it — date range, filters — opens as a popup under it. `showFilterPanel`
  // is that popup's open state. The screen itself keeps only the active-filter
  // chips. Inline (the layout below) is kept for phones, for a screen opened
  // inside a dialog, and wherever there is no top bar.
  const openPopup = () => { if (!showFilterPanel) toggleFilterPanel(); };
  const dateLabel = rangeLabel(dateRange, t);

  const searchInput = !hideSearchInput && (<Box className="centralized-search-input">
          <TextField
            placeholder={placeholder ?? t('search.defaultPlaceholder')}
            value={quickSearchText}
            onChange={(e) => onQuickSearchChange(e.target.value)}
            onKeyPress={handleKeyPress}
            onFocus={docked ? openPopup : undefined}
            inputProps={{ onClick: docked ? openPopup : undefined }}
            onKeyDown={docked ? (e) => { if (e.key === 'Escape') setShowFilterPanel(false); } : undefined}
            size="small"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'var(--theme-bg-secondary, #fff)',
                borderRadius: showFilterPanel && !docked ? '12px 12px 0 0' : (docked ? '8px' : '12px'),
                height: docked ? 34 : 44,
                fontSize: docked ? '0.8rem' : '0.9rem',
                fontFamily: 'Rubik, sans-serif',
                color: 'var(--theme-text-primary)',
                boxShadow: 'var(--shadow-subtle)',
                '& input': { color: 'var(--theme-text-primary)', padding: '10px 0' },
                '& input::placeholder': { color: 'var(--theme-text-secondary)', opacity: 0.7 },
                '& fieldset': { borderColor: 'var(--theme-border, #dfe1e5)' },
                '&:hover': {
                  boxShadow: 'var(--shadow-hover)',
                  '& fieldset': { borderColor: 'var(--accent-primary)' },
                },
                '&.Mui-focused': {
                  boxShadow: 'var(--shadow-focus)',
                  '& fieldset': { borderColor: 'var(--accent-primary)' },
                },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'var(--text-tertiary)', fontSize: '1.3rem', ml: 0.5 }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  {quickSearchText && (
                    <IconButton
                      size="small"
                      onClick={() => { onQuickSearchChange(''); onClearAllFilters(); }}
                      sx={{ p: 0.5, color: 'var(--text-tertiary)' }}
                    >
                      <ClearIcon sx={{ fontSize: '1rem' }} />
                    </IconButton>
                  )}
                  {docked && dateLabel && (
                    <Button
                      size="small"
                      onClick={openPopup}
                      aria-label={t('search.dateRange', { range: dateLabel })}
                      sx={{ minWidth: 0, px: 0.75, py: 0, mr: 0.25, textTransform: 'none', fontSize: '0.7rem', whiteSpace: 'nowrap', color: 'var(--theme-text-secondary)' }}
                    >
                      {dateLabel}
                    </Button>
                  )}
                  {segments && segments.length > 0 && (
                    <Tooltip title={showFilterPanel ? t('search.hideFilters') : t('search.showFilters')}>
                      <IconButton
                        size="small"
                        onClick={toggleFilterPanel}
                        sx={{
                          p: 0.5,
                          mr: 0.25,
                          color: showFilterPanel ? 'var(--accent-primary)' : 'var(--theme-text-secondary)',
                          backgroundColor: showFilterPanel ? 'var(--accent-primary-alpha-8)' : 'transparent',
                          '&:hover': { backgroundColor: 'var(--accent-primary-alpha-10)' },
                        }}
                      >
                        <TuneIcon sx={{ fontSize: '1.2rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {/* (The "Everywhere" scope escalation was removed — global
                      search lives in the topbar box; this input always filters
                      the current screen.) */}
                </InputAdornment>
              ),
            }}
          />
        </Box>);

  const datePicker = (
        <EnhancedDateRangePicker
          dateRange={dateRange}
          setDateRange={onDateRangeChange}
        />
  );

  const actions = (
        <Box className="centralized-search-actions">
          <Tooltip title={t('search.refresh')}>
            <IconButton onClick={onRefresh} size="small" sx={{ color: 'var(--theme-text-secondary)' }}>
              <RefreshIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          {onExport && (
            <Tooltip title={t('search.exportCsv')}>
              <IconButton onClick={onExport} size="small" sx={{ color: 'var(--theme-text-secondary)' }}>
                <FileDownloadIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          )}
          {onColumnSelectorOpen && (
            <Tooltip title={t('search.columns')}>
              <IconButton onClick={onColumnSelectorOpen} size="small" sx={{ color: 'var(--theme-text-secondary)' }}>
                <ViewColumnIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
  );

  const filterPanel = segments && segments.length > 0 && (
        <Box className="centralized-search-filter-panel">
          <Box className="centralized-search-filter-grid">
            {segments.map((segment) => {
              const fieldName = segment.name || segment.field;
              const isString = isStringSegment(segment);
              const isNumeric = isNumericSegment(segment);
              const isTag = segment.type === 'tag';
              const isNegated = filterNegated[fieldName] || false;

              return (
                <Box key={fieldName} className="centralized-search-filter-field">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: 'Rubik, sans-serif',
                        fontWeight: 600,
                        color: 'var(--theme-text-secondary, #5f6368)',
                        fontSize: '0.7rem',
                        textTransform: 'capitalize',
                      }}
                    >
                      {segment.label}
                    </Typography>

                    {isString && showExclude && (
                      <Chip
                        label={isNegated ? t('search.excluding') : t('search.exclude')}
                        size="small"
                        onClick={() => toggleNegate(fieldName)}
                        sx={{
                          height: 18,
                          fontSize: '0.6rem',
                          fontFamily: 'Rubik, sans-serif',
                          fontWeight: 500,
                          cursor: 'pointer',
                          ml: 'auto',
                          ...(isNegated
                            ? { backgroundColor: 'var(--chip-error-bg)', color: 'var(--accent-error)', border: '1px solid var(--chip-error-border)' }
                            : { backgroundColor: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border-light)' }),
                        }}
                      />
                    )}
                  </Box>

                  {isTag ? (
                    <TagFilterInput
                      segment={segment}
                      value={filterValues[fieldName] || { key: '', value: '' }}
                      onChange={handleFieldChange}
                      access={access}
                    />
                  ) : isNumeric ? (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Select
                        value={filterNumericOps[fieldName] || '='}
                        onChange={(e) => setFilterNumericOps(prev => ({ ...prev, [fieldName]: e.target.value }))}
                        size="small"
                        sx={{
                          minWidth: 48,
                          fontFamily: 'Rubik, sans-serif',
                          fontSize: '0.85rem',
                          borderRadius: '8px',
                          backgroundColor: 'var(--theme-bg-primary, #f9fafb)',
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-light)' },
                          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent-primary)' },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent-primary)' },
                        }}
                      >
                        {NUMERIC_OP_LABELS.map(op => (
                          <MenuItem key={op.value} value={op.value}>{op.label}</MenuItem>
                        ))}
                      </Select>
                      <FilterInput
                        segment={segment}
                        value={filterValues[fieldName] || ''}
                        onChange={handleFieldChange}
                        access={access}
                      />
                    </Box>
                  ) : (
                    <FilterInput
                      segment={segment}
                      value={filterValues[fieldName] || ''}
                      onChange={handleFieldChange}
                      access={access}
                    />
                  )}
                </Box>
              );
            })}
          </Box>

          <Box className="centralized-search-filter-actions">
            <Button
              size="small"
              onClick={handleClearFilterPanel}
              sx={{
                ...secondaryButtonStyle,
                px: 2,
                py: 0.5,
                borderRadius: '8px',
                textTransform: 'none',
                fontFamily: 'Rubik, sans-serif',
                fontSize: '0.8rem',
              }}
            >
              Clear
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleApplyFilters}
              sx={{
                ...primaryButtonStyle,
                px: 2,
                py: 0.5,
                borderRadius: '8px',
                textTransform: 'none',
                fontFamily: 'Rubik, sans-serif',
                fontSize: '0.8rem',
              }}
            >
              Search
            </Button>
          </Box>
        </Box>
      );

  const pillRow = pillSegments.length > 0 && (
        <Box className="centralized-search-active-chips">
          {pillSegments.map((segment) => {
            const fieldName = segment.name || segment.field;
            return (
              <FilterPill
                key={fieldName}
                segment={segment}
                active={activeFilters.find(f => f.fieldName === fieldName) || null}
                onApply={handlePillApply}
                onRemove={handleRemoveActiveFilter}
              />
            );
          })}
          {overflowFilters.map((filter) => (
            <Chip
              key={filter.paramKey}
              icon={filter.isMeta ? <LabelIcon sx={{ fontSize: 16 }} /> : getSegmentIcon(filter.fieldName)}
              label={filter.isMeta
                ? `${t('search.tag')}: ${filter.displayValue}`
                : `${filter.segment ? filter.segment.label : filter.fieldName}: ${filter.displayValue}`}
              size="small"
              onDelete={() => handleRemoveActiveFilter(filter)}
              sx={{
                fontFamily: 'Rubik, sans-serif', fontSize: '0.78rem', borderRadius: '16px',
                backgroundColor: 'var(--accent-primary-alpha-8)',
                color: 'var(--accent-primary)',
                border: '1px solid var(--accent-primary-alpha-20)',
                '& .MuiChip-icon': { color: 'var(--accent-primary)' },
                '& .MuiChip-deleteIcon': {
                  color: 'var(--accent-primary)',
                  '&:hover': { color: 'var(--accent-primary-dark)' },
                },
              }}
            />
          ))}
          {activeFilters.length > 0 && (
            <Chip
              label={t('search.clearAll')}
              size="small"
              variant="outlined"
              onClick={onClearAllFilters}
              sx={{
                fontFamily: 'Rubik, sans-serif', fontSize: '0.75rem', borderRadius: '16px',
                color: 'var(--text-tertiary)',
                borderColor: 'var(--border-light)',
                '&:hover': { borderColor: 'var(--accent-error)', color: 'var(--accent-error)' },
              }}
            />
          )}
        </Box>
      );

  const chipRow = activeFilters.length > 0 && (
        <Box className="centralized-search-active-chips">
          {activeFilters.map((filter) => {
            const label = filter.isMeta
              ? `${t('search.tag')}: ${filter.displayValue}`
              : filter.segment
                ? `${filter.segment.label}: ${filter.displayValue}`
                : `${filter.fieldName}: ${filter.displayValue}`;

            return (
              <Chip
                key={filter.paramKey}
                icon={filter.isMeta ? <LabelIcon sx={{ fontSize: 16 }} /> : getSegmentIcon(filter.fieldName)}
                label={label}
                size="small"
                onDelete={() => handleRemoveActiveFilter(filter)}
                sx={{
                  fontFamily: 'Rubik, sans-serif',
                  fontSize: '0.8rem',
                  borderRadius: '16px',
                  backgroundColor: 'var(--accent-primary-alpha-8)',
                  color: 'var(--accent-primary)',
                  border: '1px solid var(--accent-primary-alpha-20)',
                  '& .MuiChip-icon': { color: 'var(--accent-primary)' },
                  '& .MuiChip-deleteIcon': {
                    color: 'var(--accent-primary)',
                    '&:hover': { color: 'var(--accent-primary-dark)' },
                  },
                }}
              />
            );
          })}
          <Chip
            label={t('search.clearAll')}
            size="small"
            variant="outlined"
            onClick={onClearAllFilters}
            sx={{
              fontFamily: 'Rubik, sans-serif',
              fontSize: '0.75rem',
              borderRadius: '16px',
              color: 'var(--text-tertiary)',
              borderColor: 'var(--border-light)',
              '&:hover': { borderColor: 'var(--accent-error)', color: 'var(--accent-error)' },
            }}
          />
        </Box>
      );

  if (docked) {
    return (
      <>
        <Box className="centralized-search" ref={rootRef}>
          {chipRow}
        </Box>
        {createPortal(
          <ClickAwayListener onClickAway={() => setShowFilterPanel(false)}>
            <Box className="topbar-search" ref={dockRef} data-testid="topbar-search">
              {searchInput}
              {actions}
              <Popper
                open={showFilterPanel}
                anchorEl={dockRef.current}
                placement="bottom-start"
                sx={{ zIndex: (t) => t.zIndex.modal }}
              >
                <Paper className="topbar-search-popup" elevation={6} data-testid="topbar-search-popup">
                  {datePicker}
                  {pillRow}
                  {filterPanel}
                </Paper>
              </Popper>
            </Box>
          </ClickAwayListener>,
          slot
        )}
      </>
    );
  }

  return (
    <Box className="centralized-search" ref={rootRef}>
      <Box className="centralized-search-row">
        {searchInput}

        {datePicker}

        {actions}
      </Box>

      {/* Inline Filter Panel */}
      {showFilterPanel && filterPanel}

      {/* Opt-in pill row. It REPLACES the active-chip row below rather than
          joining it: the chip row and a screen's own counters were each
          rendering the same filter, which is what made selecting "Answered"
          appear twice. One filter, one element, one row. */}
      {pillRow}

      {!pillRow && chipRow}
    </Box>
  );
};

export default CentralizedSearch;
