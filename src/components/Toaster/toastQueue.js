// Toast queue — the pure rules behind the app-wide toaster. No React, no MUI,
// so the parts that are easy to get wrong (dedupe, the cap, expiry) are plain
// functions with unit tests instead of behaviour you can only see by watching
// the screen.
//
// Two dedupe layers, and they are not the same thing:
//   - `selectNewToasts` skips anything already SEEN this session, so a bell
//     feed that re-polls the same unread notification every 30s toasts it once;
//   - `pushToast` skips anything already IN the stack, so a double push in one
//     tick can't stack two identical cards.

export const TOAST_TTL_MS = 6_000;   // auto-dismiss window
export const MAX_TOASTS = 3;         // concurrent cards — a burst must not cover the app
export const TOAST_BODY_MAX = 140;   // characters of `msg` a card shows

// Levels that must NOT disappear on their own: if something broke, the user
// gets to read it and close it. `type` is checked too — the API sends
// `{ type: 'exception', level: 'error' }` and either alone is enough.
const STICKY = new Set(['error', 'exception', 'critical', 'fatal', 'alert']);

export const isSticky = (value) => STICKY.has(String(value ?? '').toLowerCase());

/** Trim a notification body to one glanceable line's worth of text. */
export function clampText(text, max = TOAST_BODY_MAX) {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Notification (bell feed row) → toast. */
export function toToast(notification, now = Date.now()) {
  const n = notification || {};
  const level = String(n.level || '').toLowerCase() || 'info';
  const sticky = isSticky(level) || isSticky(n.type);
  return {
    id: n.uuid || n.id || '',
    level,
    type: n.type || '',
    title: String(n.subject || '').trim(),
    body: clampText(n.msg),
    sticky,
    // Sticky toasts have no deadline; `expireToasts` leaves them alone.
    expiresAt: sticky ? null : now + TOAST_TTL_MS,
  };
}

/**
 * The unread bell-feed rows that have not been toasted yet, oldest first, so a
 * burst that overflows the cap keeps the NEWEST notifications on screen.
 * `seen` is any Set-like of ids already toasted this session.
 */
export function selectNewToasts(notifications, seen, now = Date.now()) {
  const rows = Array.isArray(notifications) ? notifications : [];
  return rows
    .filter((n) => {
      const id = n?.uuid || n?.id;
      if (!id || seen?.has?.(id)) return false;
      return !n.read_at;          // only what the bell counts as unread
    })
    .slice()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .map((n) => toToast(n, now));
}

/**
 * Add a toast, honouring dedupe and the cap. Over the cap we evict the oldest
 * AUTO-DISMISSING card — an error the user hasn't read yet outranks a card that
 * was going to vanish anyway. When the stack is all errors the oldest error
 * goes, because a toaster that can be wedged shut by three errors is worse than
 * one that drops the stalest.
 */
export function pushToast(queue, toast, max = MAX_TOASTS) {
  const q = Array.isArray(queue) ? queue : [];
  if (!toast?.id) return q;
  if (q.some((t) => t.id === toast.id)) return q;

  const next = [...q, toast];
  if (next.length <= max) return next;

  // Never evict the toast we just added — look for a victim among the rest.
  const older = next.slice(0, -1);
  const victim = older.findIndex((t) => !t.sticky);
  const evict = victim === -1 ? 0 : victim;
  return next.filter((_, i) => i !== evict);
}

/** Drop the auto-dismissing toasts whose window has passed. */
export function expireToasts(queue, now = Date.now()) {
  const q = Array.isArray(queue) ? queue : [];
  return q.filter((t) => t.sticky || !t.expiresAt || t.expiresAt > now);
}

/** Does the stack still need a timer running? */
export const hasExpiring = (queue) => (Array.isArray(queue) ? queue : []).some((t) => !t.sticky);
