// Grouping + sorting model for the Calls page. Pure — no React, no MUI — so the
// desktop table and the mobile card list render the SAME sections, and the logic
// is trivially unit-testable (see callsGrouping.test.js).
import { asDate } from './callFormat';

export const TIME_ORDER = ['Today', 'Yesterday', 'This week', 'Older'];
export const STATUS_ORDER = ['in_progress', 'ringing', 'completed', 'no_answer', 'busy', 'failed'];

const DAY_MS = 86_400_000;

/** Bucket a call's start time into Today / Yesterday / This week / Older. */
export function timeBucket(startedAt, now = new Date()) {
  const d = asDate(startedAt);
  if (!d || Number.isNaN(d.getTime())) return 'Older';
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= startToday) return 'Today';
  if (d >= new Date(startToday - DAY_MS)) return 'Yesterday';
  if (d >= new Date(startToday - 7 * DAY_MS)) return 'This week';
  return 'Older';
}

/** Comparator for two call rows on `key`, honoring 'asc' | 'desc'. */
export function compareCalls(a, b, key, order) {
  let va = a?.[key];
  let vb = b?.[key];
  if (key === 'started_at') {
    va = asDate(va)?.getTime() || 0;
    vb = asDate(vb)?.getTime() || 0;
  }
  if (key === 'duration_seconds' || key === 'leg_count' || key === 'event_count') {
    va = Number(va) || 0;
    vb = Number(vb) || 0;
  }
  va = va ?? '';
  vb = vb ?? '';
  const r = va < vb ? -1 : va > vb ? 1 : 0;
  return order === 'asc' ? r : -r;
}

const groupBySelector = (arr, keyFn) => arr.reduce((m, c) => {
  const k = keyFn(c);
  (m[k] ||= []).push(c);
  return m;
}, {});

/**
 * Build the rendered sections for the Calls list.
 *
 * @param calls  rows to display
 * @param opts   { groupBy: 'time'|'status'|'none', orderBy, order, now }
 * @returns [{ label, kind, count, subs: [{ label, kind, rows }] }]
 *   `label: null` means "no header" (flat list / single implicit subgroup).
 */
export function buildSections(calls, { groupBy = 'time', orderBy = 'started_at', order = 'desc', now } = {}) {
  const rows = [...(calls || [])].sort((a, b) => compareCalls(a, b, orderBy, order));
  if (groupBy === 'none') return [{ label: null, count: rows.length, subs: [{ label: null, rows }] }];

  // Known statuses first, in STATUS_ORDER; anything the API invents afterwards,
  // so an unrecognized status never silently drops its rows from the page.
  const orderedStatuses = (g) => STATUS_ORDER.filter((s) => g[s])
    .concat(Object.keys(g).filter((s) => !STATUS_ORDER.includes(s)));

  if (groupBy === 'status') {
    const g = groupBySelector(rows, (c) => c.status || 'queued');
    return orderedStatuses(g)
      .map((s) => ({ label: s, kind: 'status', count: g[s].length, subs: [{ label: null, rows: g[s] }] }));
  }

  // time → status
  const gt = groupBySelector(rows, (c) => timeBucket(c.started_at, now));
  return TIME_ORDER.filter((tk) => gt[tk]).map((tk) => {
    const gs = groupBySelector(gt[tk], (c) => c.status || 'queued');
    const subs = orderedStatuses(gs).map((s) => ({ label: s, kind: 'status', rows: gs[s] }));
    return { label: tk, kind: 'time', count: gt[tk].length, subs };
  });
}
