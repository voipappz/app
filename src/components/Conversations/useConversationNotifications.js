import { useEffect, useRef } from 'react';
import { getConsumer } from '../../services/cable';

/** One subscription on the shared socket; the API remains the source of history. */
export default function useConversationNotifications({ enabled, onChange }) {
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer;
    let disposed = false;
    const seen = new Set();
    // Batch a burst, but do not keep postponing the refresh under steady traffic.
    const schedule = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => { timer = undefined; if (!disposed) callback.current(); }, 300);
    };
    const subscription = getConsumer()?.subscriptions.create({ channel: 'Notifications' }, {
      connected: schedule, // also called when ActionCable re-subscribes
      received: (message) => {
        if (message?.type !== 'conversation.changed' || message.version !== 1 ||
            typeof message.event_id !== 'string' || !message.event_id ||
            typeof message.call_uuid !== 'string' || !message.call_uuid || seen.has(message.event_id)) return;
        seen.add(message.event_id);
        if (seen.size > 500) seen.delete(seen.values().next().value);
        schedule();
      },
    });
    const recover = () => { if (document.visibilityState !== 'hidden') schedule(); };
    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', recover);
    // Core NATS notifications are best-effort. Also recover from a broker
    // interruption which did not close the browser's WebSocket.
    const recovery = setInterval(recover, 60000);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(recovery);
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', recover);
      subscription?.unsubscribe();
    };
  }, [enabled]);
}
