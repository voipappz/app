// src/utils/dateUtils.js
import { currentLocaleTag } from '../i18n/formatLocale';

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
 * Formats a date string into a localized date and time string with 24-hour format.
 * Format: DD/MM/YYYY HH:MM:SS (24-hour, no AM/PM)
 * @param {string | Date} dateInput - The date string or Date object to format.
 * @returns {string} The formatted date string, or '-' if the input is invalid.
 */
export const formatDate = (dateInput) => {
  if (!dateInput) return '-';

  const date = toDate(dateInput);

  if (isNaN(date.getTime())) {
    return '-'; // Handle invalid date
  }

  // Use toLocaleString (not toLocaleDateString) for date + time
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
 * Formats a date string into a localized date string without time.
 * @param {string | Date} dateInput - The date string or Date object to format.
 * @returns {string} The formatted date string, or '-' if the input is invalid.
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

/**
 * The calendar day a timestamp falls on, in the viewer's time zone, as
 * "YYYY-MM-DD". Two timestamps on the same day give the same key.
 * @param {string | Date} dateInput
 * @returns {string} The day key, or '' if the input is invalid.
 */
export const dayKey = (dateInput) => {
  const date = toDate(dateInput);
  if (isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * A day as a heading: weekday, day and month ("Mon, 6 Oct"), with the year
 * only when it isn't this year.
 * @param {string | Date} dateInput
 * @returns {string} The heading, or '-' if the input is invalid.
 */
export const formatDayHeading = (dateInput) => {
  const date = toDate(dateInput);
  if (isNaN(date.getTime())) return '-';
  const otherYear = date.getFullYear() !== new Date().getFullYear();
  return date.toLocaleDateString(currentLocaleTag(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(otherYear ? { year: 'numeric' } : {}),
  });
};

/**
 * A clock time ("14:05", or "14:05:09" with seconds) in the viewer's language.
 * @param {string | Date} dateInput
 * @param {boolean} [withSeconds]
 * @returns {string} The time, or '' if the input is invalid.
 */
export const formatTime = (dateInput, withSeconds = false) => {
  const date = typeof dateInput === 'number' ? new Date(dateInput) : toDate(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(currentLocaleTag(), {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
};
