export interface BufferedSocketLike {
  readyState: number;
  bufferedAmount: number;
  send(data: string): void;
}

const WEBSOCKET_OPEN = 1;

/** A slow/closing browser must not grow Deno's outbound WebSocket queue. */
export function canSendRealtime(socket: BufferedSocketLike, maxBufferedBytes: number): boolean {
  return socket.readyState === WEBSOCKET_OPEN && socket.bufferedAmount <= maxBufferedBytes;
}

type Schedule = (callback: () => void, delayMs: number) => unknown;

/**
 * Bound a bursty value stream to one pending timer. Values received during the
 * window are merged, so DashboardLive keeps the latest value for every widget
 * without allocating an unbounded queue.
 *
 * push() returns true when it merged into an already-pending delivery.
 */
export function createCoalescingRelay<T>(
  deliver: (value: T) => void,
  merge: (pending: T, next: T) => T,
  delayMs: number,
  schedule: Schedule = (callback, delay) => setTimeout(callback, delay),
): { push(value: T): boolean } {
  let pending: T | undefined;
  let scheduled = false;

  return {
    push(value: T): boolean {
      const coalesced = pending !== undefined;
      pending = coalesced ? merge(pending as T, value) : value;
      if (scheduled) return coalesced;

      scheduled = true;
      schedule(() => {
        scheduled = false;
        const next = pending;
        pending = undefined;
        if (next !== undefined) deliver(next);
      }, Math.max(0, delayMs));
      return coalesced;
    },
  };
}
