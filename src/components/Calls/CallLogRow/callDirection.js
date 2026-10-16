// What a call log line needs to know about a call, from the API's own values:
// profile.direction is "incoming" | "outgoing", profile.cause is
// "answer" | "no_answer".

const DIRECTIONS = { incoming: 'incoming', inbound: 'incoming', outgoing: 'outgoing', outbound: 'outgoing' };

/**
 * @returns {{ kind: 'incoming'|'outgoing'|'missedIncoming'|'missedOutgoing'|'unknown',
 *             missed: boolean, number: string, seconds: number }}
 *   `number` is the other party: who called in, or who was called.
 */
export function callFacts(call) {
  const profile = call?.profile || {};
  const direction = DIRECTIONS[profile.direction] || 'unknown';
  const missed = profile.cause === 'no_answer';
  const number = direction === 'outgoing' ? profile.callee : (profile.caller || profile.callee);

  let kind = direction;
  if (missed && direction === 'incoming') kind = 'missedIncoming';
  if (missed && direction === 'outgoing') kind = 'missedOutgoing';

  return { kind, missed, number: number ? String(number) : '', seconds: Number(profile.talk_duration) || 0 };
}

// "2:31", "1:02:05": a phone's way of writing how long a call took.
export function shortDuration(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = String(whole % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

// The recording's address, wherever this call keeps it.
export function recordingUrl(call) {
  return call?.recording?.url || call?.profile?.recordingUrl || call?.profile?.recording_url
    || call?.recordingUrl || call?.recording_url || null;
}

// The phone filter's choices, as the server search params they stand for.
export const CALL_FILTERS = {
  incoming: { 'search[call.direction][IS]': ['incoming'] },
  outgoing: { 'search[call.direction][IS]': ['outgoing'] },
  missed: { 'search[call.cause][IS]': ['no_answer'] },
};
const FILTER_KEYS = ['search[call.direction][IS]', 'search[call.cause][IS]', 'search[call.cause][NOT]'];

// Which choice the current search params amount to ('all' when none).
export function activeCallFilter(params) {
  const holds = (key, value) => {
    const current = params?.[key];
    if (current === undefined || current === null || current === '') return false;
    return (Array.isArray(current) ? current : String(current).split(',')).includes(value);
  };
  if (holds('search[call.cause][IS]', 'no_answer')) return 'missed';
  if (holds('search[call.direction][IS]', 'incoming')) return 'incoming';
  if (holds('search[call.direction][IS]', 'outgoing')) return 'outgoing';
  return 'all';
}

// The search params with the phone filter swapped for `choice`.
export function withCallFilter(params, choice) {
  const next = { ...(params || {}) };
  FILTER_KEYS.forEach((key) => { delete next[key]; });
  return { ...next, ...(CALL_FILTERS[choice] || {}) };
}
