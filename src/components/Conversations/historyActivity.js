import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import { dayKey } from '../../utils/dateUtils';

export function inHistoryRange(item, range = {}) {
  if (!range.from && !range.to) return true;
  const time = new Date(item.at);
  if (!Number.isFinite(time.getTime())) return false;
  const day = dayKey(time);
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

/** Count distinct call groups, never the individual ringing/answer events. */
export function historyActivity(items, selected, range = {}) {
  const callItems = [...items];
  if (selected?.call_uuid && selected.ended_at && !items.some((item) => item.kind === 'call' && item.callId === selected.call_uuid)) {
    callItems.push({ kind: 'call', callId: selected.call_uuid, at: selected.started_at, summary: { data: selected } });
  }
  const calls = callItems
    .filter((item) => item.kind === 'call' && Number.isFinite(Date.parse(item.at)) && inHistoryRange(item, range))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (!calls.length) return [];
  const first = range.from ? new Date(`${range.from}T00:00:00`) : startOfDay(new Date(calls[0].at));
  const last = range.to ? new Date(`${range.to}T00:00:00`) : startOfDay(new Date(calls[calls.length - 1].at));
  const days = differenceInCalendarDays(last, first) + 1;
  if (!Number.isFinite(days) || days < 1) return [];
  const binDays = Math.max(1, Math.ceil(days / 30));
  const bins = Array.from({ length: Math.ceil(days / binDays) }, (_, index) => ({
    from: dayKey(addDays(first, index * binDays)),
    to: dayKey(addDays(first, Math.min(days - 1, (index + 1) * binDays - 1))),
    answered: 0, missed: 0, other: 0, total: 0,
  }));
  for (const call of calls) {
    const index = Math.floor(differenceInCalendarDays(new Date(call.at), first) / binDays);
    const bin = bins[index];
    if (!bin) continue;
    const outcome = call.summary?.data.outcome || (call.callId === selected?.call_uuid ? selected.outcome : null);
    const category = outcome === 'answered' ? 'answered' : outcome === 'missed' ? 'missed' : 'other';
    bin[category] += 1;
    bin.total += 1;
  }
  return bins;
}
