import {
  startOfDay, endOfDay, addDays,
  startOfWeek, endOfWeek, addWeeks,
  startOfMonth, endOfMonth, addMonths,
  isSameDay, format
} from 'date-fns';

// `label` is the preset's identity (matched in useEnhancedDateRangePicker);
// `key` names its text in common.json (datePicker.preset.<key>).
export const DATE_PRESETS = [
  {
    key: 'today',
    label: 'Today',
    range: () => [startOfDay(new Date()), endOfDay(new Date())],
  },
  {
    key: 'yesterday',
    label: 'Yesterday',
    range: () => [startOfDay(addDays(new Date(), -1)), endOfDay(addDays(new Date(), -1))],
  },
  {
    key: 'last7Days',
    label: 'Last 7 days',
    range: () => [startOfDay(addDays(new Date(), -6)), endOfDay(new Date())],
  },
  {
    key: 'last30Days',
    label: 'Last 30 days',
    range: () => [startOfDay(addDays(new Date(), -29)), endOfDay(new Date())],
  },
  {
    key: 'thisWeek',
    label: 'This Week',
    range: () => [startOfWeek(new Date()), endOfWeek(new Date())],
  },
  {
    key: 'lastWeek',
    label: 'Last Week',
    range: () => [startOfWeek(addWeeks(new Date(), -1)), endOfWeek(addWeeks(new Date(), -1))],
  },
  {
    key: 'thisMonth',
    label: 'This Month',
    range: () => [startOfMonth(new Date()), endOfMonth(new Date())],
  },
  {
    key: 'lastMonth',
    label: 'Last Month',
    range: () => [startOfMonth(addMonths(new Date(), -1)), endOfMonth(addMonths(new Date(), -1))],
  },
];

/**
 * Find matching preset label for a given date range
 */
export const getMatchingPresetLabel = (dateRange) => {
  if (!dateRange || !dateRange[0] || !dateRange[1]) return null;

  const start = new Date(dateRange[0]);
  const end = new Date(dateRange[1]);

  for (const preset of DATE_PRESETS) {
    const [presetStart, presetEnd] = preset.range();
    if (isSameDay(start, presetStart) && isSameDay(end, presetEnd)) {
      return preset.label;
    }
  }
  return null;
};

/**
 * Format a date range for display
 */
// Options (all optional, English by default): presetName(preset) for the
// preset's shown name, emptyText, and a date-fns `locale` for month names.
export const formatDateRangeDisplay = (dateRange, { presetName = (preset) => preset.label, emptyText = 'Select dates', locale } = {}) => {
  if (!dateRange || !dateRange[0] || !dateRange[1]) return emptyText;

  const presetLabel = getMatchingPresetLabel(dateRange);
  if (presetLabel) return presetName(DATE_PRESETS.find((preset) => preset.label === presetLabel));

  const start = new Date(dateRange[0]);
  const end = new Date(dateRange[1]);

  if (isSameDay(start, end)) {
    return format(start, 'MMM d, yyyy', { locale });
  }

  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear) {
    return `${format(start, 'MMM d', { locale })} - ${format(end, 'MMM d, yyyy', { locale })}`;
  }
  return `${format(start, 'MMM d, yyyy', { locale })} - ${format(end, 'MMM d, yyyy', { locale })}`;
};
