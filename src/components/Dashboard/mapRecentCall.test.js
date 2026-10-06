import { describe, it, expect } from 'vitest';
import { mapRecentCall } from './useDashboardSnapshot.js';

describe('mapRecentCall', () => {
  it("reads the call's facts from `profile`, the shape GET /api/calls returns", () => {
    const row = {
      uuid: 'c-1',
      created_at: '2026-10-05T10:14:00Z',
      recording: { url: null },
      profile: { caller: '2300', callee: '233256020519', direction: 'outgoing', talk_duration: '00:01:05', cause: 'answer' },
    };
    expect(mapRecentCall(row, 0)).toMatchObject({
      id: 'c-1',
      direction: 'outgoing',
      from_number: '2300',
      to_number: '233256020519',
      status: 'answer',
      duration_sec: 65,
      started_at: '2026-10-05T10:14:00Z',
      call: row,
    });
  });

  it('still reads a flat row', () => {
    expect(mapRecentCall({ id: 7, caller: '100', callee: '200', direction: 'incoming', billsec_duration: '12' }, 0))
      .toMatchObject({ id: 7, from_number: '100', to_number: '200', direction: 'incoming', duration_sec: 12 });
  });
});
