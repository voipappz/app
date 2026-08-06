import { describe, expect, it } from 'vitest';
import { summarizeLiveRows } from './DashboardWidgets';

describe('summarizeLiveRows', () => {
  it('matches the Nimbus live-agent status buckets', () => {
    expect(summarizeLiveRows([
      { 'user.status': { data: 'available' } },
      { 'user.state': { data: 'in_a_queue_call' } },
      { 'user.status': 'on_break' },
      { 'user.state': 'ringing' },
      { state: 'Waiting' },
    ])).toEqual({ available: 2, onCall: 1, onBreak: 1, waiting: 1 });
  });
});
