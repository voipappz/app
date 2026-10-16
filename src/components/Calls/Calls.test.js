import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useCalls, { deriveSummary, NOT_ANSWERED_CAUSES } from './Calls.js';
import { USER_CALL_COLUMNS } from './userCallColumns';

let userSession = false;
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ access: userSession ? undefined : 'account-token' }) }));
vi.mock('../../context/UserAuthContext', () => ({ useUserAuth: () => ({ token: userSession ? 'user-token' : undefined }) }));
vi.mock('../../hooks/useIsUserSession', () => ({ useIsUserSession: () => userSession }));

const requested = () => globalThis.fetch.mock.calls.map(([url, init]) => ({ url: String(url), auth: init?.headers?.Authorization }));

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => [], headers: { get: () => null } }));
});

// A portal user signs in to the same console and sees its Calls screen. The
// API serves a user token the list, segments and aggregate — but not the
// account's column config (action=columns).
describe('useCalls for a portal user', () => {
  it('uses fixed columns and never asks for account-only column or saved-filter data', async () => {
    userSession = true;
    const { result } = renderHook(() => useCalls());
    await waitFor(() => expect(result.current.loadingColumns).toBe(false));
    expect(result.current.columns).toEqual(USER_CALL_COLUMNS);
    expect(requested().some((r) => r.url.includes('action=columns'))).toBe(false);
    expect(requested().some((r) => r.url.includes('action=params') || r.url.includes('action=save_params'))).toBe(false);
  });

  it("sends the user's token", async () => {
    userSession = true;
    renderHook(() => useCalls());
    await waitFor(() => expect(requested().length).toBeGreaterThan(0));
    requested().forEach((r) => expect(r.auth).toBe('Bearer user-token'));
  });
});

describe('useCalls for an account', () => {
  it('reads the column config with the account token', async () => {
    userSession = false;
    renderHook(() => useCalls());
    await waitFor(() => expect(requested().some((r) => r.url.includes('action=columns'))).toBe(true));
    expect(requested().find((r) => r.url.includes('action=columns')).auth).toBe('Bearer account-token');
  });
});

describe('deriveSummary', () => {
  const direction = [{ time: 't', incoming: 1 }];

  it('counts No Answer from the not-answered causes only, never a missing or unclassified cause', () => {
    expect(NOT_ANSWERED_CAUSES).toEqual(['no_answer', 'busy', 'error']);
    const s = deriveSummary({ aggregate: { cause: [{ time: 't', answer: 5, no_answer: 2, busy: 1, error: 1, none: 3, unknown: 4 }], direction } });
    expect(s.total).toBe(16);
    expect(s.answered).toBe(5);
    expect(s.noAnswer).toBe(4);
  });

  it('gives no answer rate over zero calls', () => {
    expect(deriveSummary({ aggregate: { cause: [], direction: [] } }).answerRate).toBeNull();
  });

  it('averages duration per answered call', () => {
    const s = deriveSummary({
      aggregate: { cause: [{ time: 't', answer: 2, no_answer: 2 }], direction },
      durationAggregate: [{ time: 't', answer: '90.0', no_answer: 30 }],
    });
    expect(s.totalDuration).toBe(120);
    expect(s.avgDuration).toBe(45);
    expect(s.answerRate).toBe(0.5);
  });
});

describe('useCalls duration aggregate', () => {
  const respond = (byUrl) => vi.fn(async (url) => {
    const body = byUrl(String(url));
    return { ok: true, json: async () => body, headers: { get: () => null } };
  });
  const counts = [{ time: '2026-10-15T10:00:00', answer: 2, no_answer: 1 }];

  it('asks for metric=duration over the same cause buckets and uses it', async () => {
    userSession = false;
    globalThis.fetch = respond((url) => {
      if (url.includes('metric=duration')) return [{ time: '2026-10-15T10:00:00', answer: '200.0', no_answer: 15 }];
      if (url.includes('/calls/aggregate')) return url.includes('group_by=cause') ? counts : [];
      return [];
    });
    const { result } = renderHook(() => useCalls());
    await waitFor(() => expect(result.current.summaryCounts.totalDuration).toBe(215));
    expect(result.current.summaryCounts.avgDuration).toBe(100);
    const durationUrl = requested().map((r) => r.url).find((u) => u.includes('metric=duration'));
    expect(durationUrl).toContain('group_by=cause');
  });

  it('treats an API that ignores metric=duration (counts back) as unknown', async () => {
    userSession = false;
    globalThis.fetch = respond((url) => (url.includes('/calls/aggregate') && url.includes('group_by=cause') ? counts : []));
    const { result } = renderHook(() => useCalls());
    await waitFor(() => expect(result.current.summaryCounts.total).toBe(3));
    expect(result.current.summaryCounts.totalDuration).toBeNull();
    expect(result.current.summaryCounts.avgDuration).toBeNull();
  });
});
