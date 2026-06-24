/**
 * Canonical status → color map (shared design token).
 *
 * Single source of truth for how a call/agent status renders everywhere:
 * Calls table chips, Dashboard cards, Reports. Modeled on nimbus-admin's
 * GridColumns STATUS_BG_COLORS, mapped onto our MUI theme palette so it
 * respects the brand/primary override (VITE_PRIMARY_COLOR).
 *
 * Returns a MUI palette key ('success' | 'error' | 'warning' | 'info' |
 * 'default' | 'primary') so consumers stay theme-driven rather than hardcoding
 * hex values.
 */

// status (lowercased) → MUI color key
const STATUS_TO_COLOR = {
  // call dispositions
  completed: 'success',
  answer: 'success',
  answered: 'success',
  in_progress: 'primary',
  'in-progress': 'primary',
  in_call: 'primary',
  incall: 'primary',
  active: 'primary',
  ringing: 'default',
  queued: 'default',
  no_answer: 'warning',
  'no-answer': 'warning',
  busy: 'warning',
  failed: 'error',
  canceled: 'default',
  cancelled: 'default',
  // agent states
  available: 'success',
  on_break: 'warning',
  break: 'warning',
  offline: 'default',
  waiting: 'info',
};

/** MUI color key for a status string (defaults to 'default'). */
export function statusColor(status) {
  if (!status) return 'default';
  return STATUS_TO_COLOR[String(status).toLowerCase()] || 'default';
}

/** Human label for a status: snake/kebab → Title Case. */
export function statusLabel(status) {
  if (!status) return '—';
  return String(status)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
