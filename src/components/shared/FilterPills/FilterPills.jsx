import React, { useMemo, useState, useCallback } from 'react';
import { Box, Chip, Menu, MenuItem, Popover, TextField } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import FilterListIcon from '@mui/icons-material/FilterList';
import i18n from '../../../i18n';

/**
 * The inline filter pills, and the small vocabulary of helpers that turn a
 * screen's `search[...]` params into "active filters" and back. They were
 * written inside CentralizedSearch; the Calls screen now renders its pills
 * in its own counter row, so they live here and CentralizedSearch imports them.
 */

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

export const getSegmentIcon = (segmentName) => {
  return ICON_MAP[segmentName] || <FilterListIcon sx={{ fontSize: 16 }} />;
};

export const NUMERIC_OP_MAP = { '=': 'EQ', '>': 'GT', '≥': 'GTE', '<': 'LT', '≤': 'LTE', '≠': 'NE' };

export const isStringSegment = (segment) => {
  const t = segment?.type;
  return !t || t === 'string' || !['numeric', 'number', 'select', 'multi_select', 'select2_ajax', 'auto_complete_ajax', 'date', 'time', 'tag'].includes(t);
};

export const isNumericSegment = (segment) => {
  const t = segment?.type;
  return t === 'numeric' || t === 'number';
};

// The look of a filter that is ON — the set pill and the overflow chips share it,
// so a filter reads the same whichever element is showing it.
export const ACTIVE_CHIP_SX = {
  fontFamily: 'Rubik, sans-serif', fontSize: '0.78rem', borderRadius: '16px',
  backgroundColor: 'var(--accent-primary-alpha-8)',
  color: 'var(--accent-primary)',
  border: '1px solid var(--accent-primary-alpha-20)',
  '& .MuiChip-icon': { color: 'var(--accent-primary)' },
  '& .MuiChip-deleteIcon': {
    color: 'var(--accent-primary)',
    '&:hover': { color: 'var(--accent-primary-dark)' },
  },
};

// The bare text params (`search[inline]`, `search[text]`) are not segments. The
// search box used to show them; a screen with no search box asks for them as a
// chip instead (`textParams`), so a text filter arriving in the URL is visible
// and removable.
export const getActiveFilters = (segments, currentSearchParams, { textParams = [] } = {}) => {
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
    if (key === 'search[text]' || key === 'search[inline]') {
      if (textParams.includes(key) && value !== undefined && value !== null && value !== '') {
        active.push({
          segment: null,
          fieldName: key.slice('search['.length, -1),
          paramKey: key,
          value,
          displayValue: String(value),
          isText: true,
        });
      }
      continue;
    }
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

// Pills for the fields a screen wants permanently visible, in the order it
// asked for them. Names that the server didn't send as segments are skipped
// rather than faked — a pill that can't be filled is worse than no pill.
export const pillSegmentsFor = (fields, segments) => {
  if (!fields || !segments) return [];
  return fields
    .map((name) => segments.find(s => (s.name || s.field) === name))
    .filter(Boolean);
};

// The params with one filter taken out: every operator of its field, or — for
// a tag — that one meta key.
export const withoutActiveFilter = (currentSearchParams, filter) => {
  const newParams = { ...currentSearchParams };
  if (filter.isMeta) {
    delete newParams[filter.paramKey];
  } else {
    Object.keys(newParams).forEach(key => {
      if (key.includes(`search[${filter.fieldName}]`)) {
        delete newParams[key];
      }
    });
  }
  return newParams;
};

// The params with a pill's choice applied. A pill picks exactly one value, so
// it emits IS — not the panel's IN — and wraps choice-list values in an array.
// That makes a pill and a screen's own quick-filter buttons write the identical
// param, so one lights the other. This field's other operators are dropped
// first, so IS can't stack on NOT.
export const withPillValue = (currentSearchParams, segments, fieldName, value) => {
  const segment = segments?.find(s => (s.name || s.field) === fieldName);
  const isNumeric = isNumericSegment(segment);
  const operator = isNumeric ? (NUMERIC_OP_MAP['='] || 'EQ') : 'IS';
  const paramValue = (!isNumeric && Array.isArray(segment?.data)) ? [value] : value;

  const next = {};
  Object.entries(currentSearchParams || {}).forEach(([key, val]) => {
    if (!key.includes(`search[${fieldName}]`)) next[key] = val;
  });
  next[`search[${fieldName}][${operator}]`] = paramValue;
  return next;
};

/**
 * One filter, one element.
 *
 * Unset it reads as its own name — `Cause ▾` — and opens the values it accepts.
 * Set it reads as the answer — `Cause: Answer ✕`. That second state IS the
 * active-filter chip, not a copy of it: screens that opt into pills render this
 * row *instead of* the chip row, so a filter is never on screen twice.
 *
 * Options come from `segment.data` when the server supplies one (cause,
 * direction, disposition…); everything else gets a one-line text box, which is
 * all the full ⚙ panel would have given it anyway.
 */
export const FilterPill = ({ segment, active, onApply, onRemove }) => {
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
        sx={ACTIVE_CHIP_SX}
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
 * The pills for `fields`, in that order. `onChange(nextParams, shouldReset)`
 * has CentralizedSearch's `onFilterChange` shape: a pick carries the other
 * params forward (false); a ✕ drops the field (true).
 *
 * Renders its pills as siblings of whatever is around it (`display: contents`),
 * so a screen can put them in its own row.
 */
const FilterPills = ({ segments, fields, currentSearchParams, onChange }) => {
  const pillSegments = useMemo(() => pillSegmentsFor(fields, segments), [fields, segments]);
  const activeFilters = useMemo(
    () => getActiveFilters(segments, currentSearchParams),
    [segments, currentSearchParams]
  );

  const handleApply = useCallback((fieldName, value) => {
    onChange(withPillValue(currentSearchParams, segments, fieldName, value), false);
  }, [segments, currentSearchParams, onChange]);

  const handleRemove = useCallback((filter) => {
    onChange(withoutActiveFilter(currentSearchParams, filter), true);
  }, [currentSearchParams, onChange]);

  if (pillSegments.length === 0) return null;

  return (
    <Box data-testid="filter-pills" sx={{ display: 'contents' }}>
      {pillSegments.map((segment) => {
        const fieldName = segment.name || segment.field;
        return (
          <FilterPill
            key={fieldName}
            segment={segment}
            active={activeFilters.find(f => f.fieldName === fieldName) || null}
            onApply={handleApply}
            onRemove={handleRemove}
          />
        );
      })}
    </Box>
  );
};

export default FilterPills;
