import { describe, expect, it } from 'vitest';
import { findCurrentUserStatus, normalizeUserStatus } from './userStatus';

describe('user status normalization', () => {
  it('reads the va-crystal user state fields without changing their meaning', () => {
    expect(normalizeUserStatus({
      uuid: 'u-9019', status_name: 'Available', state: 'waiting', call_counter: '7',
      last_call_at: '1786525074', talking_to_number: '2335550100', active_queue_name: 'Support',
    })).toMatchObject({
      uuid: 'u-9019', availability: 'Available', state: 'waiting', callCount: 7,
      lastCallAt: '1786525074', talkingTo: '2335550100', queue: 'Support',
    });
  });

  it('selects the signed-in user rather than another live agent', () => {
    const rows = [{ uuid: 'u-1', call_counter: 10 }, { uuid: 'u-9019', call_counter: 3 }];
    expect(findCurrentUserStatus(rows, { user_uuid: 'u-9019' })?.callCount).toBe(3);
  });
});
