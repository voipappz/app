// src/utils/dateUtils.js
//
// The one place dates are formatted. Every screen should come through here
// rather than calling toLocaleString itself: there were ~50 direct call sites,
// variously pinned to 'en-GB', to 'en-US', or to no locale at all, so the same
// timestamp rendered three different ways depending on which screen you were
// looking at. eslint.config.js now warns on raw toLocale*/Intl outside
// src/utils/ to keep that from growing back.

import i18n from '../i18n';
// Deep import so the other ~70 date-fns locales tree-shake out.
import { he } from 'date-fns/locale/he';

// Server timestamps are UTC but often arrive tz-less ("2026-07-20 18:58:03"),
// which JS parses as LOCAL (times off by the client offset) or, with the
// space form, fails outright in some browsers. Normalize to a real UTC instant.
const toDate = (input) => {
  if (input instanceof Date) return input;
  if (input == null || input === '') return new Date(NaN);
  const str = String(input).trim();
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(str);
  const norm = (!hasTz && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(str))
    ? str.replace(' ', 'T') + 'Z'
    : str;
  return new Date(norm);
};

/**
 * The BCP-47 tag to format with, for the language now active.
 *
 * 'en' maps to en-GB rather than en-US deliberately: en-GB is what this app
 * has always formatted with (DD/MM/YYYY, 24-hour), so English output is
 * unchanged by making this locale-aware at all.
 *
 * Read from the i18next singleton rather than a hook, because these functions
 * are called from column definitions, renderCell callbacks and other places
 * that are not components. The trade-off is that a component showing a date
 * does not re-render by itself when the language changes — the direction
 * remount in App.jsx (DirectionKeyedContent) is what refreshes them.
 */
const LOCALE_TAG = { en: 'en-GB', he: 'he-IL' };
export const currentLocaleTag = () => LOCALE_TAG[i18n.language] || 'en-GB';

/**
 * The matching date-fns locale, for the places that use date-fns rather than
 * Intl (the date-range presets, the MUI pickers' adapter).
 *
 * Returns undefined for English on purpose: that is date-fns's own default, so
 * callers can pass the result straight through without a branch, and only `he`
 * has to be imported.
 */
const DATE_FNS_LOCALES = { he };
export const currentDateFnsLocale = () => DATE_FNS_LOCALES[i18n.language];

/**
 * Date + time, 24-hour. Format follows the active locale
 * (English: DD/MM/YYYY HH:MM:SS).
 * @param {string | Date} dateInput
 * @returns {string} formatted, or '-' when the input is unusable
 */
export const formatDate = (dateInput) => {
  if (!dateInput) return '-';

  const date = toDate(dateInput);

  if (isNaN(date.getTime())) {
    return '-'; // Handle invalid date
  }

  // toLocaleString (not toLocaleDateString) for date + time
  return date.toLocaleString(currentLocaleTag(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false, // Force 24-hour format, no AM/PM
  });
};

/**
 * Date only, no time.
 *
 * NOTE: this deliberately still parses with `new Date()` rather than toDate(),
 * which means a tz-less timestamp is read as local time here but as UTC in
 * formatDate above. That inconsistency predates the locale work and fixing it
 * would change what English renders for those inputs, so it is left alone
 * rather than folded into a locale change. Worth its own commit.
 *
 * @param {string | Date} dateInput
 * @returns {string} formatted, or '-' when the input is unusable
 */
export const formatOnlyDate = (dateInput) => {
  if (!dateInput) return '-';

  let date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    date = new Date(dateInput);
  }

  if (isNaN(date.getTime())) {
    return '-'; // Handle invalid date
  }

  return date.toLocaleDateString(currentLocaleTag(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};
