// List view options: sort, direction, outcome and (for those allowed) scope.
// One small menu; remembered per browser in localStorage.
export const SORTS = {
  newest: { orderBy: 'started_at', orderKind: 'desc' },
  oldest: { orderBy: 'started_at', orderKind: 'asc' },
  longest: { orderBy: 'duration', orderKind: 'desc' },
  shortest: { orderBy: 'duration', orderKind: 'asc' },
};
export const DEFAULT_VIEW = { sort: 'newest', direction: '', outcome: '', everyone: false };
const KEY = 'conversations-view';

export function readView() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULT_VIEW, ...(SORTS[v.sort] ? { sort: v.sort } : {}), direction: ['incoming', 'outgoing'].includes(v.direction) ? v.direction : '', outcome: ['answered', 'missed', 'bot'].includes(v.outcome) ? v.outcome : '', everyone: v.everyone === true };
  } catch { return DEFAULT_VIEW; }
}
export function saveView(view) {
  try { localStorage.setItem(KEY, JSON.stringify(view)); } catch { /* storage unavailable */ }
}

export const digitsOf = (v) => String(v || '').replace(/\D/g, '');

/** Typed digits match the number anywhere after dropping leading zeros, so 0525… finds +972525…. */
export function matchesNumber(number, query) {
  const d = digitsOf(query).replace(/^0+/, '');
  return !d || digitsOf(number).includes(d);
}

const duration = (s, now) => s.duration ?? (s.started_at ? Math.max(0, (now - Date.parse(s.started_at)) / 1000) : 0);

/** Client side search, filter and sort for live rows. */
export function applyView(rows, { query, view, now = Date.now() }) {
  const out = rows
    .filter((s) => matchesNumber(s.remote_number, query))
    .filter((s) => !view.direction || s.direction === view.direction)
    .filter((s) => !view.outcome || !s.outcome || s.outcome === view.outcome);
  const { orderBy, orderKind } = SORTS[view.sort] || SORTS.newest;
  const key = orderBy === 'duration' ? (s) => duration(s, now) : (s) => Date.parse(s.started_at) || 0;
  return out.sort((a, b) => (orderKind === 'asc' ? key(a) - key(b) : key(b) - key(a)));
}
