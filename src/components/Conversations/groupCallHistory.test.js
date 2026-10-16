import { describe, expect, it } from 'vitest';
import { groupCallHistory } from './groupCallHistory';

const call = (id, callId, minute, extra = {}) => ({
  id, at: `2026-10-16T12:0${minute}:00Z`, kind: 'call',
  data: { call_uuid: callId, ...extra },
});

describe('groupCallHistory', () => {
  it('uses the latest summary, retains prior updates and leaves notes in the timeline', () => {
    const ringing = call('ring', 'a', 0);
    const early = call('early', 'a', 1, { summary: 'true', outcome: 'missed' });
    const note = { ...call('note', 'a', 2), kind: 'note', text: 'Call back' };
    const final = call('final', 'a', 3, { summary: true, outcome: 'answered' });
    const input = [final, note, ringing, early];
    const output = groupCallHistory(input);
    expect(output).toHaveLength(2);
    expect(output[0]).toMatchObject({ kind: 'call', at: ringing.at, summary: final, events: [ringing, early, final] });
    expect(output[1]).toMatchObject({ kind: 'event', event: note });
    expect(input).toEqual([final, note, ringing, early]);
  });

  it('keeps different call IDs separate even with the same number, time and summary', () => {
    const same = { summary: 'true', remote_number: '0501234567', duration: 300 };
    const output = groupCallHistory([call('one', 'a', 0, same), call('two', 'b', 0, same)]);
    expect(output.map((item) => item.callId)).toEqual(['a', 'b']);
  });

  it('does not guess which call events without IDs belong to', () => {
    const events = [call('one', undefined, 0), call('two', '', 1), call('three', 123, 2)];
    expect(groupCallHistory(events).map((item) => item.event)).toEqual(events);
  });

  it('keeps incomplete calls without inventing a summary or losing activity', () => {
    const event = call('ring', 'a', 0);
    expect(groupCallHistory([event])[0]).toMatchObject({ summary: null, events: [event] });
  });
});
