export const formatCallDuration = (sec) => {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};

export const isCallSummary = (event) => event.kind === 'call' &&
  (event.data?.summary === 'true' || event.data?.summary === true);

/** Group only explicit call IDs. Never combine separate calls by number or time. */
export function groupCallHistory(events) {
  const ordered = [...events].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
  const calls = new Map();
  const items = [];
  for (const event of ordered) {
    const callId = event.kind === 'call' && event.data?.call_uuid;
    if (typeof callId !== 'string' || !callId.trim()) {
      items.push({ kind: 'event', id: `event-${event.id}`, at: event.at, event });
      continue;
    }
    let group = calls.get(callId);
    if (!group) {
      group = { kind: 'call', id: `call-${callId}`, callId, at: event.at, events: [], summary: null };
      calls.set(callId, group);
      items.push(group);
    }
    group.events.push(event);
    // The API orders revisions by event time. The latest summary is the
    // displayed result; previous summaries stay available in the details.
    if (isCallSummary(event)) group.summary = event;
  }
  return items;
}
