import { useEffect, useState } from 'react';
import { config } from '../config.js';

/**
 * useCableHealth — is the realtime cable reachable?
 *
 * The sidebar already shows two health signals: useApiHealth (the app plane —
 * DB / Redis / NATS via GET /health) and useGatusHealth (the node's own probes).
 * Neither says anything about the WEBSOCKET, and that is its own failure: the
 * API can be perfectly healthy while the cable is unreachable, in which case a
 * live dashboard shows stale data with nothing on screen admitting it.
 *
 * CONNECTIVITY ONLY — it does not subscribe to a channel. ActionCable sends
 * `{"type":"welcome"}` immediately on a connection it accepted, before any
 * subscription, so that frame alone answers "is the cable up and is my token
 * good". Subscribing would additionally require a channel and params, which is
 * a different question and belongs to whatever screen needs the data.
 *
 * Module-level singleton, matching useApiHealth: one socket shared by every
 * consumer, opened on the first subscriber and closed after the last.
 */

const RECONNECT_MS = 15000;

const state = {
  status: 'idle', // idle | connecting | connected | error | unconfigured
  url: null,
  error: null,
  lastConnectedAt: null,
};

const subscribers = new Set();
let socket = null;
let reconnectTimer = null;
let started = false;

const notify = () => subscribers.forEach((fn) => fn({ ...state }));

const setState = (patch) => {
  Object.assign(state, patch);
  notify();
};

/**
 * The session token, the same one the node verifies against SECRET_KEY.
 * Admin sessions keep it under `auth`; portal users under `user_auth`.
 */
function token() {
  try {
    const admin = JSON.parse(localStorage.getItem('auth') || 'null');
    if (admin?.access) return admin.access;
    const portal = JSON.parse(localStorage.getItem('user_auth') || 'null');
    return portal?.token || null;
  } catch {
    return null;
  }
}

/**
 * Reuses config.ws.cable — no new environment variable. In production that
 * resolves to `/cable`, which Kong routes to the node; in local dev
 * VITE_WS_URL points straight at a node, which serves `/cable` itself.
 */
function cableUrl() {
  const base = config?.ws?.cable;
  if (!base) return null;
  const t = token();
  if (!t) return null;
  return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}`;
}

function connect() {
  const url = cableUrl();
  if (!url) {
    setState({ status: 'unconfigured', url: null, error: null });
    return;
  }

  setState({ status: 'connecting', url: url.replace(/token=[^&]+/, 'token=***'), error: null });

  try {
    // Cable negotiates `actioncable-v1-json`; without requesting it the browser
    // closes the socket before `welcome`, and the dot reads "refused" forever.
    socket = new WebSocket(url, ['actioncable-v1-json']);
  } catch (e) {
    setState({ status: 'error', error: e?.message || 'could not open socket' });
    scheduleReconnect();
    return;
  }

  socket.onmessage = (evt) => {
    // `welcome` is the only frame that proves the connection was ACCEPTED.
    // A rejected token closes the socket instead, which onclose reports.
    try {
      if (JSON.parse(evt.data)?.type === 'welcome') {
        setState({ status: 'connected', error: null, lastConnectedAt: Date.now() });
      }
    } catch {
      // Not JSON — ignore rather than treat a stray frame as a failure.
    }
  };

  socket.onclose = () => {
    socket = null;
    // A close BEFORE welcome means refused (bad or missing token, no route);
    // a close after means the link dropped. Both are "not connected", and the
    // distinction is already visible in whether we ever reached connected.
    if (state.status !== 'unconfigured') {
      setState({ status: 'error', error: state.status === 'connected' ? 'disconnected' : 'refused' });
    }
    scheduleReconnect();
  };

  socket.onerror = () => {
    // onclose always follows; reporting here too would double-notify.
  };
}

function scheduleReconnect() {
  if (!started || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (started) connect();
  }, RECONNECT_MS);
}

function stop() {
  started = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try { socket.close(); } catch { /* already gone */ }
    socket = null;
  }
  setState({ status: 'idle', error: null });
}

export default function useCableHealth() {
  const [snapshot, setSnapshot] = useState({ ...state });

  useEffect(() => {
    subscribers.add(setSnapshot);
    if (!started) {
      started = true;
      connect();
    }
    return () => {
      subscribers.delete(setSnapshot);
      // Tear down with the last consumer — the pattern useNavBadges gets right
      // and useApiHealth does not, which leaves its timer running forever.
      if (subscribers.size === 0) stop();
    };
  }, []);

  return snapshot;
}

// Test seam: drive the module without a real socket.
export const __cable = { state, connect, stop, cableUrl, setState };
