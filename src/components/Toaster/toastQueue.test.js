import { describe, it, expect } from 'vitest';
import {
  MAX_TOASTS, TOAST_TTL_MS, clampText, expireToasts, hasExpiring, isSticky,
  pushToast, selectNewToasts, toToast,
} from './toastQueue';

const notification = (over = {}) => ({
  uuid: 'n-1', level: 'info', type: 'info', subject: 'Subject', msg: 'Body',
  created_at: '2026-08-04T10:00:00Z', read_at: null, ...over,
});

describe('toToast', () => {
  it('maps a bell-feed row and stamps an expiry', () => {
    const t = toToast(notification(), 1_000);
    expect(t).toMatchObject({ id: 'n-1', level: 'info', title: 'Subject', body: 'Body', sticky: false });
    expect(t.expiresAt).toBe(1_000 + TOAST_TTL_MS);
  });

  it('keeps errors and exceptions on screen (no expiry)', () => {
    expect(toToast(notification({ level: 'error' })).sticky).toBe(true);
    expect(toToast(notification({ level: 'error' })).expiresAt).toBeNull();
    // level is fine, but the type alone says exception → still sticky
    expect(toToast(notification({ level: 'info', type: 'exception' })).sticky).toBe(true);
    expect(isSticky('WARNING')).toBe(false);
  });

  it('falls back to info and tolerates a bare row', () => {
    expect(toToast({ uuid: 'x' }).level).toBe('info');
    expect(toToast(null).id).toBe('');
  });

  it('clamps a long body', () => {
    const long = 'x'.repeat(400);
    expect(clampText(long).length).toBe(140);
    expect(clampText(long).endsWith('…')).toBe(true);
    expect(clampText('short')).toBe('short');
  });
});

describe('selectNewToasts', () => {
  it('takes unread rows only, oldest first', () => {
    const rows = [
      notification({ uuid: 'new', created_at: '2026-08-04T12:00:00Z' }),
      notification({ uuid: 'old', created_at: '2026-08-04T09:00:00Z' }),
      notification({ uuid: 'read', read_at: '2026-08-04T11:00:00Z' }),
    ];
    expect(selectNewToasts(rows, new Set()).map((t) => t.id)).toEqual(['old', 'new']);
  });

  it('never returns a notification that was already toasted (dedupe on uuid)', () => {
    const rows = [notification({ uuid: 'a' }), notification({ uuid: 'b' })];
    const seen = new Set(['a']);
    expect(selectNewToasts(rows, seen).map((t) => t.id)).toEqual(['b']);
    // the same feed on the next poll, with both now seen
    expect(selectNewToasts(rows, new Set(['a', 'b']))).toEqual([]);
  });

  it('skips rows with no id and survives a non-array feed', () => {
    expect(selectNewToasts([{ subject: 'no id' }], new Set())).toEqual([]);
    expect(selectNewToasts(null, new Set())).toEqual([]);
  });
});

describe('pushToast', () => {
  const t = (id, sticky = false) => ({ id, sticky, expiresAt: sticky ? null : 1_000 });

  it('adds a toast and ignores a duplicate id already on screen', () => {
    const q = pushToast([], t('a'));
    expect(pushToast(q, t('a'))).toBe(q);
    expect(q).toHaveLength(1);
  });

  it('caps the stack at three', () => {
    const q = ['a', 'b', 'c', 'd'].reduce((acc, id) => pushToast(acc, t(id)), []);
    expect(q).toHaveLength(MAX_TOASTS);
    expect(q.map((x) => x.id)).toEqual(['b', 'c', 'd']);   // the oldest gives way
  });

  it('evicts an auto-dismissing toast before an unread error', () => {
    const q = [t('err', true), t('a'), t('b')];
    expect(pushToast(q, t('c')).map((x) => x.id)).toEqual(['err', 'b', 'c']);
  });

  it('drops the stalest error rather than wedging the stack shut', () => {
    const q = [t('e1', true), t('e2', true), t('e3', true)];
    expect(pushToast(q, t('new')).map((x) => x.id)).toEqual(['e2', 'e3', 'new']);
  });

  it('ignores a toast with no id', () => {
    expect(pushToast([], { id: '' })).toEqual([]);
  });
});

describe('expireToasts', () => {
  it('drops only what is past its deadline', () => {
    const q = [
      { id: 'gone', sticky: false, expiresAt: 500 },
      { id: 'live', sticky: false, expiresAt: 2_000 },
      { id: 'err', sticky: true, expiresAt: null },
    ];
    expect(expireToasts(q, 1_000).map((t) => t.id)).toEqual(['live', 'err']);
  });

  it('keeps errors forever', () => {
    const q = [{ id: 'err', sticky: true, expiresAt: null }];
    expect(expireToasts(q, Number.MAX_SAFE_INTEGER)).toEqual(q);
    expect(hasExpiring(q)).toBe(false);
    expect(hasExpiring([...q, { id: 'a', sticky: false, expiresAt: 1 }])).toBe(true);
  });
});
