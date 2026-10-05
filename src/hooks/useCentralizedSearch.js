import { useState, useCallback } from 'react';
import { startOfDay, endOfDay } from 'date-fns';

const getTodayRange = () => [startOfDay(new Date()), endOfDay(new Date())];

/**
 * Parse Gmail-style colon-syntax from free-text input.
 * Supports: field:value  field:"multi word value"
 * Bare text (not part of a token) goes to `textParam` — search[name] unless the
 * screen's API has its own free-text param (Calls: search[inline]).
 */
export const parseSearchInput = (input, segments, textParam = 'search[name]') => {
  const params = {};
  const tokenRegex = /(\w+):("([^"]+)"|(\S+))/g;
  let remaining = input;
  let match;

  while ((match = tokenRegex.exec(input)) !== null) {
    const field = match[1];
    const value = match[3] || match[4]; // quoted or unquoted
    // Resolve field name from segment name or label
    const seg = segments?.find(s =>
      (s.name || s.field) === field ||
      s.label?.toLowerCase() === field.toLowerCase()
    );
    const resolvedField = seg ? (seg.name || seg.field) : field;
    params[`search[${resolvedField}]`] = value;
    remaining = remaining.replace(match[0], '');
  }

  remaining = remaining.trim();
  if (remaining) {
    params[textParam] = remaining;
  }

  return params;
};

/**
 * Shared hook for CentralizedSearch state management.
 * Each screen provides callbacks to bridge CentralizedSearch events
 * to the screen's own filter/fetch logic.
 *
 * @param {Object} options
 * @param {Function} options.onFiltersChange - Called with parsed {field: value} filters
 * @param {Function} options.onResetFilters - Called when all filters are cleared
 * @param {Function} options.onRefresh - Called on refresh / date range change
 */
const useCentralizedSearch = ({ onFiltersChange, onResetFilters, onRefresh } = {}) => {
  const [dateRange, setDateRange] = useState(getTodayRange);
  const [quickSearchText, setQuickSearchText] = useState('');
  const [currentSearchParams, setCurrentSearchParams] = useState({});

  // Parse search[field][OP] params into simple {field: value} object
  const parseFilters = useCallback((params) => {
    const filters = {};
    Object.entries(params).forEach(([key, value]) => {
      if (key === 'order_by' || key === 'order_type' || key === '_client') return;
      if (key === 'search[text]') {
        filters.search = value;
        return;
      }
      // Pass meta tag filters through as nested object: meta[key]=value
      const metaMatch = key.match(/^search\[meta\]\[([^\]]+)\]$/);
      if (metaMatch) {
        if (!filters.meta) filters.meta = {};
        filters.meta[metaMatch[1]] = value;
        return;
      }
      const match = key.match(/search\[([^\]]+)\](?:\[([^\]]+)\])?/);
      if (match) filters[match[1]] = value;
    });
    return filters;
  }, []);

  const handleFilterChange = useCallback((params, isReplacement) => {
    setCurrentSearchParams(prev => {
      const newParams = isReplacement ? params : { ...prev, ...params };
      const filters = parseFilters(newParams);
      if (onFiltersChange) onFiltersChange(filters);
      return newParams;
    });
  }, [parseFilters, onFiltersChange]);

  const handleQuickSearch = useCallback((e) => {
    if (e.key === 'Enter') {
      if (quickSearchText.trim()) {
        handleFilterChange({ 'search[text]': quickSearchText.trim() }, false);
      } else {
        setCurrentSearchParams({});
        setQuickSearchText('');
        if (onResetFilters) onResetFilters();
      }
    }
  }, [quickSearchText, handleFilterChange, onResetFilters]);

  const handleQuickSearchChange = useCallback((value) => {
    setQuickSearchText(value);
    if (value === '') {
      setCurrentSearchParams({});
      if (onResetFilters) onResetFilters();
    }
  }, [onResetFilters]);

  const handleClearAllFilters = useCallback(() => {
    setCurrentSearchParams({});
    setQuickSearchText('');
    if (onResetFilters) onResetFilters();
  }, [onResetFilters]);

  const handleDateRangeChange = useCallback((newRange) => {
    setDateRange(newRange);
    if (onRefresh) onRefresh();
  }, [onRefresh]);

  const handleRefresh = useCallback(() => {
    if (onRefresh) onRefresh();
  }, [onRefresh]);

  return {
    dateRange,
    setDateRange,
    quickSearchText,
    setQuickSearchText,
    currentSearchParams,
    setCurrentSearchParams,
    handleFilterChange,
    handleQuickSearch,
    handleQuickSearchChange,
    handleClearAllFilters,
    handleDateRangeChange,
    handleRefresh,
  };
};

export default useCentralizedSearch;
