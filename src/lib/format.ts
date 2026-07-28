// Cross-feature pure formatters. No React, no MUI — kept dependency-free so
// they're trivially unit-testable and usable from any component folder.
//
// Lives in lib/ rather than a feature folder because more than one feature
// needs it: the Calls KPI tiles and the login OTP countdown both render the
// same clock, and a second copy is how two screens end up disagreeing about
// what 75 minutes looks like.

/**
 * Compact clock format — `m:ss`, or `h:mm:ss` past the hour.
 * Falsy input reads as `0:00` (no duration is not an error).
 */
export function fmtClock(sec: number): string {
  if (!sec) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
