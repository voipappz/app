import { describe, expect, it } from 'vitest';
import { checkLevel, overallHealth } from './healthLevel';

describe('health level', () => {
  it('is orange when the API answers but a check failed (NATS down, /health still "ok")', () => {
    const health = { loading: false, isHealthy: true, checks: { database: { ok: true }, nats: { ok: false } } };
    expect(overallHealth(health)).toEqual({ level: 'degraded', reason: 'nats' });
  });

  it('is orange when some node probes are down', () => {
    expect(overallHealth({ loading: false, isHealthy: true }, { total: 4, down: 1 }).level).toBe('degraded');
  });

  it('is red when the API is unhealthy or every probe is down', () => {
    expect(overallHealth({ loading: false, isHealthy: false }).level).toBe('down');
    expect(overallHealth({ loading: false, isHealthy: true }, { total: 2, down: 2 }).level).toBe('down');
  });

  it('is green with no per-service detail when the API answers healthy', () => {
    expect(overallHealth({ loading: false, isHealthy: true, checks: null, response: { raw: 'healthy' } }).level).toBe('healthy');
  });

  it('colours a warning check orange', () => {
    expect(checkLevel({ ok: true, warning: true })).toBe('degraded');
    expect(checkLevel({ ok: false })).toBe('down');
  });
});
