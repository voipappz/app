import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useConversationNotifications from './useConversationNotifications';

const cable = vi.hoisted(() => ({ handlers: null, unsubscribe: vi.fn(), create: vi.fn() }));
vi.mock('../../services/cable', () => ({
  getConsumer: () => ({ subscriptions: { create: cable.create } }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  cable.create.mockImplementation((_identifier, handlers) => {
    cable.handlers = handlers;
    return { unsubscribe: cable.unsubscribe };
  });
});
afterEach(() => vi.useRealTimers());

describe('conversation notifications', () => {
  it('batches changes, deduplicates delivery and ignores other notification types', () => {
    const onChange = vi.fn();
    renderHook(() => useConversationNotifications({ enabled: true, onChange }));
    const message = { type: 'conversation.changed', version: 1, event_id: 'one', call_uuid: 'call' };
    act(() => {
      cable.handlers.received(message);
      cable.handlers.received({ ...message, event_id: 'two' });
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      cable.handlers.received(message);
      cable.handlers.received({ ...message, type: 'other', event_id: 'three' });
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(cable.create).toHaveBeenCalledWith({ channel: 'Notifications' }, expect.any(Object));
  });

  it('refreshes on reconnect and cancels pending refreshes on unmount', () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() => useConversationNotifications({ enabled: true, onChange }));
    act(() => { cable.handlers.connected(); vi.advanceTimersByTime(300); });
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => cable.handlers.connected());
    unmount();
    act(() => vi.advanceTimersByTime(60000));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(cable.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe without conversation access', () => {
    renderHook(() => useConversationNotifications({ enabled: false, onChange: vi.fn() }));
    expect(cable.create).not.toHaveBeenCalled();
  });
});
