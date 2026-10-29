import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * The live subscription, driven through a fake consumer rather than a socket.
 *
 * The page's consumer (services/cable.js) is @rails/actioncable's; connecting,
 * the welcome handshake, resubscribing and reconnect backoff are that
 * library's job. What this hook owns — and these pin — is the subscription it
 * asks for and what it makes of the callbacks: a document REPLACES its entity
 * rather than merging into it, a deletion removes the row, a reconnect's fresh
 * snapshot replaces the old rows, and renders are coalesced so a busy
 * environment cannot melt the tab.
 */

let subscriptions = [];
let mockConsumer = null;

function makeConsumer() {
  return {
    subscriptions: {
      create: vi.fn((identifier, callbacks) => {
        const sub = { identifier, callbacks, unsubscribe: vi.fn() };
        subscriptions.push(sub);
        return sub;
      }),
    },
  };
}

vi.mock('../services/cable.js', () => ({
  getConsumer: () => mockConsumer,
}));

const { default: useLiveEntities } = await import('./useLiveEntities');

const frame = (scope, id, doc, extra = {}) => ({ scope, id, revision: 1, deleted: false, doc, ...extra });
const current = () => subscriptions.at(-1);

/** Deliver one frame and let the coalescing window elapse. */
function deliver(f) {
  act(() => { current().callbacks.received(f); });
  act(() => { vi.advanceTimersByTime(300); });
}

describe('useLiveEntities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscriptions = [];
    mockConsumer = makeConsumer();
  });

  afterEach(() => vi.useRealTimers());

  it('subscribes to LiveChannel for the given environment', () => {
    renderHook(() => useLiveEntities('env-1'));

    expect(mockConsumer.subscriptions.create).toHaveBeenCalledTimes(1);
    expect(current().identifier).toEqual({ channel: 'LiveChannel', environment_uuid: 'env-1' });
  });

  it('narrows to a scope when one is given', () => {
    renderHook(() => useLiveEntities('env-1', 'user'));
    expect(current().identifier.scope).toBe('user');
  });

  it('does not subscribe without an environment', () => {
    const { result } = renderHook(() => useLiveEntities(null));
    expect(mockConsumer.subscriptions.create).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('says so when there is no cable to subscribe on', () => {
    mockConsumer = null;
    const { result } = renderHook(() => useLiveEntities('env-1'));
    expect(result.current.status).toBe('unavailable');
    expect(result.current.connected).toBe(false);
  });

  it('is pending until the node confirms, then live', () => {
    const { result } = renderHook(() => useLiveEntities('env-1'));
    expect(result.current.status).toBe('pending');
    expect(result.current.connected).toBe(false);

    act(() => { current().callbacks.connected({ reconnected: false }); });
    expect(result.current.connected).toBe(true);
    expect(result.current.subscription.confirmedAt).toEqual(expect.any(Number));
  });

  it('unsubscribes when the screen goes away', () => {
    // Dropping the reference is not enough: the server keeps streaming to a
    // subscription nobody told it to end.
    const { unmount } = renderHook(() => useLiveEntities('env-1'));
    unmount();
    expect(current().unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('moves the subscription when the environment changes', () => {
    const { rerender } = renderHook(({ env }) => useLiveEntities(env), { initialProps: { env: 'env-1' } });
    const first = current();
    rerender({ env: 'env-2' });

    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(current().identifier.environment_uuid).toBe('env-2');
  });

  it('builds rows from the frames it receives', () => {
    const { result } = renderHook(() => useLiveEntities('env-1'));

    deliver(frame('user', 'u1', { user_name: 'Noam', answer_counter: 2 }));

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toMatchObject({ scope: 'user', id: 'u1', user_name: 'Noam' });
  });

  it('counts frames and when the last one arrived, with the coalesced render', () => {
    const { result } = renderHook(() => useLiveEntities('env-1'));

    deliver(frame('user', 'u1', {}));
    deliver(frame('user', 'u2', {}));

    expect(result.current.subscription.frames).toBe(2);
    expect(result.current.subscription.lastFrameAt).toEqual(expect.any(Number));
  });

  it('REPLACES an entity rather than merging into it', () => {
    // Each frame is a whole document. Merging would leave a field alive after
    // the node cleared it — talking_to_number after a hangup, say.
    const { result } = renderHook(() => useLiveEntities('env-1'));

    deliver(frame('user', 'u1', { state: 'answer', talking_to_number: '0501112222' }));
    deliver(frame('user', 'u1', { state: 'waiting' }));

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].state).toBe('waiting');
    expect(result.current.rows[0].talking_to_number).toBeUndefined();
  });

  it('removes a row on a deletion frame', () => {
    // Whole-document replacement updates rows but never removes one that is
    // gone, so a deleted key has to arrive as an explicit removal.
    const { result } = renderHook(() => useLiveEntities('env-1'));

    deliver(frame('user', 'u1', { state: 'answer' }));
    expect(result.current.rows).toHaveLength(1);

    deliver({ scope: 'user', id: 'u1', deleted: true, doc: {} });
    expect(result.current.rows).toHaveLength(0);
  });

  it('replaces the rows with the snapshot a reconnect re-delivers', () => {
    // A key deleted while the link was down never sends its deletion; the
    // watch re-delivers every CURRENT key on resubscribe, so the old map has
    // to go or the deleted entity stays on screen forever.
    const { result } = renderHook(() => useLiveEntities('env-1'));
    act(() => { current().callbacks.connected({ reconnected: false }); });
    deliver(frame('user', 'gone', { state: 'answer' }));
    deliver(frame('user', 'stays', { state: 'waiting' }));

    act(() => { current().callbacks.disconnected({ willAttemptReconnect: true }); });
    expect(result.current.status).toBe('reconnecting');

    act(() => { current().callbacks.connected({ reconnected: true }); });
    deliver(frame('user', 'stays', { state: 'waiting' }));

    expect(result.current.rows.map((r) => r.id)).toEqual(['stays']);
    expect(result.current.connected).toBe(true);
  });

  it('keeps entities of different scopes apart', () => {
    const { result } = renderHook(() => useLiveEntities('env-1'));

    deliver(frame('user', 'x', { user_name: 'Noam' }));
    deliver(frame('queue', 'x', { call_count: 4 }));

    // Same id, different entities — keying on id alone would collapse them.
    expect(result.current.rows).toHaveLength(2);
    expect(result.current.byScope('user')).toHaveLength(1);
    expect(result.current.byScope('queue')[0].call_count).toBe(4);
  });

  it('coalesces a burst into one render', () => {
    const { result } = renderHook(() => useLiveEntities('env-1'));

    act(() => {
      for (let i = 0; i < 20; i++) current().callbacks.received(frame('user', `u${i}`, { n: i }));
    });

    // Nothing painted yet — the window has not elapsed.
    expect(result.current.rows).toHaveLength(0);

    // One timer fires for the whole burst, not twenty.
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.rows).toHaveLength(20);
  });

  it('drops everything when the environment changes', () => {
    // A different environment is a different dataset, not more of the same one.
    const { result, rerender } = renderHook(({ env }) => useLiveEntities(env), {
      initialProps: { env: 'env-1' },
    });

    deliver(frame('user', 'u1', { user_name: 'Noam' }));
    expect(result.current.rows).toHaveLength(1);

    act(() => { rerender({ env: 'env-2' }); });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.rows).toHaveLength(0);
  });

  it('reports a rejected subscription distinctly from a dropped connection', () => {
    // Rejected means the environment is not this session's, or the node could
    // not resolve it — resubscribing would be refused again.
    const { result } = renderHook(() => useLiveEntities('env-1'));
    act(() => { current().callbacks.rejected(); });
    // The close that may follow must not overwrite the reason.
    act(() => { current().callbacks.disconnected({ willAttemptReconnect: true }); });

    expect(result.current.rejected).toBe(true);
    expect(result.current.connected).toBe(false);
    expect(result.current.status).toBe('rejected');
  });

  it('ignores a malformed frame instead of throwing', () => {
    const { result } = renderHook(() => useLiveEntities('env-1'));

    deliver({ scope: 'user' }); // no id
    expect(result.current.rows).toHaveLength(0);
  });

  // An account watches every environment selected in the top bar: one
  // LiveChannel subscription each (the channel is per environment), one list.
  describe('several environments', () => {
    const subFor = (env) => subscriptions.find((sub) => sub.identifier.environment_uuid === env);
    const deliverTo = (env, f) => {
      act(() => { subFor(env).callbacks.received(f); });
      act(() => { vi.advanceTimersByTime(300); });
    };

    it('subscribes once per environment and shows their rows together', () => {
      const { result } = renderHook(() => useLiveEntities(['env-1', 'env-2']));
      expect(mockConsumer.subscriptions.create).toHaveBeenCalledTimes(2);
      deliverTo('env-1', frame('user', 'a1', { user_name: 'Noam' }));
      deliverTo('env-2', frame('user', 'a2', { user_name: 'Dana' }));
      expect(result.current.byScope('user').map((r) => r.user_name).sort()).toEqual(['Dana', 'Noam']);
    });

    it('is live only when every environment is', () => {
      const { result } = renderHook(() => useLiveEntities(['env-1', 'env-2']));
      act(() => { subFor('env-1').callbacks.connected(); });
      expect(result.current.connected).toBe(false);
      act(() => { subFor('env-2').callbacks.connected(); });
      expect(result.current.connected).toBe(true);
    });

    it('a reconnect in one environment keeps the other environment\'s rows', () => {
      const { result } = renderHook(() => useLiveEntities(['env-1', 'env-2']));
      deliverTo('env-1', frame('user', 'a1', { user_name: 'Noam' }));
      deliverTo('env-2', frame('user', 'a2', { user_name: 'Dana' }));
      act(() => { subFor('env-1').callbacks.connected({ reconnected: true }); });
      act(() => { vi.advanceTimersByTime(300); });
      expect(result.current.byScope('user').map((r) => r.user_name)).toEqual(['Dana']);
    });

    it('unsubscribes all of them when the screen goes away', () => {
      const { unmount } = renderHook(() => useLiveEntities(['env-1', 'env-2']));
      unmount();
      expect(subscriptions.every((sub) => sub.unsubscribe.mock.calls.length === 1)).toBe(true);
    });
  });
});
