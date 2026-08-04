// Pure formatters for the phone dock's recent-calls list. No React, no MUI, so
// the fiddly parts (which number is the OTHER party, how a timestamp reads in a
// 300px-wide dock) are unit-tested rather than eyeballed.
import { asDate } from '../Calls/callFormat';

/**
 * The other party's number — the only number worth showing in a call log.
 *
 * `meta._contact_number` is that party whichever way the call went, so it wins.
 * The normalized `from_number`/`to_number` are the fallback, and they are NOT
 * symmetric: on an outbound row `to_number` prefers `_did_number` (our own DID),
 * so falling back to it blindly would show the user their own number.
 */
export function counterpartyNumber(call) {
  const c = call || {};
  const contact = c.raw?.meta?._contact_number;
  if (contact) return String(contact).trim();
  const byDirection = c.direction === 'outbound' ? c.to_number : c.from_number;
  return String(byDirection || c.from_number || c.to_number || '').trim();
}

/**
 * Compact timestamp: today's calls read as a clock, older ones carry a short
 * date. Times are parsed with the Calls feature's `asDate`, which forces UTC on
 * the API's zone-less timestamps — without it every row is off by the browser's
 * UTC offset.
 */
export function fmtCallTime(startedAt, now = new Date(), locale = undefined) {
  const d = asDate(startedAt);
  if (!d || Number.isNaN(d.getTime())) return '';
  const clock = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return clock;
  return `${d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${clock}`;
}

/** Did this call come in? Anything not explicitly inbound is treated as outbound. */
export const isInbound = (call) => call?.direction === 'inbound';

/**
 * An inbound call that was never answered. The API's cause codes are free-ish
 * text, so match the ones that mean "nobody picked up" rather than guessing
 * from duration alone (a 0s answered call exists, and is not a missed call).
 */
const MISSED_CAUSES = new Set(['no_answer', 'noanswer', 'cancel', 'busy', 'rejected', 'unanswered']);
export const isMissed = (call) =>
  isInbound(call) && MISSED_CAUSES.has(String(call?.status || '').toLowerCase());
