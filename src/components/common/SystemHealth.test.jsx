import { describe, expect, it } from 'vitest';
import { healthPresentation } from './SystemHealth';

describe('healthPresentation', () => {
  it('is green only when readiness confirms reconciliation', () => {
    expect(healthPresentation({ status: 'ok', ready: true, checks: {} }).state).toBe('healthy');
    expect(healthPresentation({ status: 'degraded', ready: false, checks: {
      cdr_sync: { status: 'stale' },
    } }).state).toBe('degraded');
    expect(healthPresentation({ status: 'ok', ready: true, checks: {
      events: { status: 'stale' },
    } }).state).toBe('degraded');
  });

  it('is red for a failed dependency or an unreachable health endpoint', () => {
    expect(healthPresentation({ status: 'degraded', ready: false, checks: {
      event_store: { status: 'down' },
    } }).state).toBe('down');
    expect(healthPresentation(null, false).state).toBe('down');
  });
});
