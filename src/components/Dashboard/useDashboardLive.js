import { useEffect, useRef, useState } from 'react';
import { eventsWsBase } from '../Calls/useCalls';

/**
 * useDashboardLive — the live agents/extensions panel, streamed from the
 * va-crystal `cable` (DashboardLive channel) and bridged by deno-api onto the
 * `/ws/events` socket as `dashboard.live` frames.
 *
 * The dashboard STRUCTURE (which widgets/columns) is defined in voipappz-api and
 * saved in Redis; cable resolves the per-field values and broadcasts ONLY the
 * value stream. Each frame payload is a widget map:
 *   { "<widget_uuid>": { type: "table", table: [ { uuid, <field>: <value>, … } ] } }
 *
 * We keep the latest snapshot per widget_uuid (cable rebroadcasts the full table
 * every interval, so last-write-wins is correct — no merging needed).
 */
export function useDashboardLive() {
  const [widgets, setWidgets] = useState({});
  const [status, setStatus] = useState('connecting');
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  useEffect(() => {
    const url = `${eventsWsBase()}?topics=dashboard.%23`;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setStatus('connecting');
      ws.addEventListener('open', () => setStatus('open'));
      ws.addEventListener('close', () => {
        setStatus('closed');
        reconnectTimer.current = window.setTimeout(connect, 3000);
      });
      ws.addEventListener('error', () => { /* close fires too */ });
      ws.addEventListener('message', (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg?.type === 'dashboard.live' && msg.payload && typeof msg.payload === 'object') {
          // Drop the non-widget envelope keys deno may add (e.g. { raw }).
          const next = {};
          for (const [uuid, w] of Object.entries(msg.payload)) {
            if (w && typeof w === 'object' && Array.isArray(w.table)) next[uuid] = w;
          }
          if (Object.keys(next).length) setWidgets((prev) => ({ ...prev, ...next }));
        }
      });
    }

    connect();
    return () => {
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return { widgets, status };
}

export default useDashboardLive;
