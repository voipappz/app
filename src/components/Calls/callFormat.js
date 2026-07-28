// Shared pure formatters for the Calls feature (grid rows + the call-detail
// drawer). No React, no MUI — kept dependency-free so they're trivially unit-
// testable and reusable across the Calls components.

export function fmtDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Compact clock format (m:ss / h:mm:ss) for the narrow avg-duration KPI tile,
// so "1m 45s" doesn't overflow the 2-column mobile card. Moved to lib/format
// once the login OTP countdown needed the same thing; re-exported here so the
// Calls components and their tests keep importing it from one place.
export { fmtClock } from '../../lib/format';

// API timestamps look like "2026-05-28 21:00:00.123" — UTC, but with no zone
// marker. Force UTC ('Z') so toLocaleString()/toLocaleTimeString() render in the
// browser's local timezone (e.g. GMT+3); without it JS parses them as local and
// the displayed time is off by the UTC offset.
export function asDate(s) {
  if (!s) return null;
  let t = String(s).replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(t)) t += 'Z';
  return new Date(t);
}
