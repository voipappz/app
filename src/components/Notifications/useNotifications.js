import { useState, useEffect, useCallback, useRef } from 'react';
import { eventsWsProtocols, eventsWsUrl } from '../Calls/useCalls';
import { useAuth } from '../../context/AuthContext';
import { getToken } from '../../lib/auth';
import { config } from '../../config';

const NOTIFICATIONS_PATH = '/api/notifications';

// The bearer header, from the one credential (lib/auth). Every call here used
// to send `Authorization: <undefined>` because it read a key off useAuth() that
// does not exist — reads span forever and writes silently did nothing.
const authHeaders = () => {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  };
};

function getTimeAgo(dateString) {
  const date = new Date(dateString);
  const diffInMinutes = Math.floor((new Date() - date) / (1000 * 60));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
  return `${Math.floor(diffInMinutes / 1440)}d ago`;
}

// One notification row, whether it came from the initial fetch or was pushed
// over the cable. Both sources carry the same server-side record, so they must
// normalize identically — a pushed row that looked different would render as a
// second, subtly wrong notification.
const toRow = (notification) => ({
  ...notification,
  id: notification.uuid,
  isRead: !!notification.read_at,
  timeAgo: getTimeAgo(notification.created_at),
  recipient: notification.recipient || null,
  meta: notification.meta || {},
});

export const useNotifications = () => {
  // The session token, from the ONE place that holds it (lib/auth). This used
  // to read `access` off useAuth(), which has never exposed such a key — so the
  // token was permanently undefined and the guard below returned every time,
  // leaving `loading` (initialised true) stuck on. The page could not load for
  // anyone; it just span.
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const fetchNotifications = useCallback(async () => {
    // Signed out: settle the state rather than returning with `loading` still
    // true. An early return that leaves a spinner up is indistinguishable from
    // a hang, and that is exactly how this page presented.
    if (!isAuthenticated) {
      setNotifications([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // NOT through apiList. This runs as an app-wide BACKGROUND POLL (the
      // toaster mounts it on every screen), and apiList treats a 401 as "the
      // session is over" — so one unauthorised poll signed the user out from
      // under whatever they were doing. A background feed must never have that
      // authority: it carries the same bearer token, and on 401 it simply has
      // nothing to show.
      const response = await fetch(NOTIFICATIONS_PATH, { headers: authHeaders() });
      if (response.status === 401) { setNotifications([]); return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      const data = Array.isArray(body) ? body : [];

      setNotifications(data.map(toRow));
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError(err.message);
      
      // Fallback to mock data for development/testing
      const mockNotifications = [
        {
          uuid: 'mock-1',
          id: 'mock-1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          read_at: null,
          recipient: {
            uuid: 'user-1',
            first_name: 'Demo',
            last_name: 'User',
            fullname: 'Demo User',
            email: 'demo@example.com'
          },
          type: 'exception',
          level: 'error',
          count: 1,
          subject: 'Demo Database Connection Error',
          msg: 'This is a demo notification showing how database connection errors would appear in the system.',
          meta: {
            backtrace: JSON.stringify([
              '/app/lib/database.rb:123:in `connect`',
              '/app/lib/models/user.rb:45:in `find`',
              '/app/controllers/auth.rb:67:in `authenticate`'
            ])
          },
          isRead: false,
          timeAgo: getTimeAgo(new Date().toISOString())
        },
        {
          uuid: 'mock-2',
          id: 'mock-2',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date(Date.now() - 3600000).toISOString(),
          read_at: null,
          recipient: {
            uuid: 'user-1',
            first_name: 'Demo',
            last_name: 'User',
            fullname: 'Demo User',
            email: 'demo@example.com'
          },
          type: 'warning',
          level: 'warning',
          count: 2,
          subject: 'High Memory Usage Detected',
          msg: 'Memory usage has exceeded 85% threshold. Consider optimizing queries or scaling resources.',
          meta: {},
          isRead: false,
          timeAgo: getTimeAgo(new Date(Date.now() - 3600000).toISOString())
        }
      ];
      setNotifications(mockNotifications);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const markAsRead = useCallback(async (notificationId) => {
    try {
      // API call to mark as read
      const response = await fetch(`${config.api.notifications}/${notificationId}/read`, {
        method: 'PATCH',
        headers: authHeaders()
      });

      if (response.ok) {
        // Update local state
        setNotifications(prev => prev.map(notification =>
          notification.uuid === notificationId
            ? { ...notification, read_at: new Date().toISOString(), isRead: true }
            : notification
        ));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Still update local state for demo purposes
      setNotifications(prev => prev.map(notification =>
        notification.uuid === notificationId
          ? { ...notification, read_at: new Date().toISOString(), isRead: true }
          : notification
      ));
    }
  }, []);

  const deleteNotification = useCallback(async (notificationId) => {
    try {
      // API call to delete notification
      const response = await fetch(`${config.api.notifications}/${notificationId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });

      if (response.ok) {
        // Update local state
        setNotifications(prev => prev.filter(notification => notification.uuid !== notificationId));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      // Still update local state for demo purposes
      setNotifications(prev => prev.filter(notification => notification.uuid !== notificationId));
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      const response = await fetch(`${config.api.notifications}/mark-all-read`, {
        method: 'PATCH',
        headers: authHeaders()
      });

      if (response.ok) {
        setNotifications(prev => prev.map(notification => ({
          ...notification,
          read_at: new Date().toISOString(),
          isRead: true
        })));
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      // Still update local state for demo purposes
      setNotifications(prev => prev.map(notification => ({
        ...notification,
        read_at: new Date().toISOString(),
        isRead: true
      })));
    }
  }, []);

  const refreshNotifications = useCallback(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Helper function to calculate time ago
  // One fetch for what already exists. There is no interval any more: the
  // server PUSHES new notifications over the cable (deno subscribes this user's
  // `notifications:<user_uuid>` stream on their behalf and relays it here), so
  // polling every 30s only re-fetched a list that had not changed.
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Live feed. Same socket and bearer-subprotocol handshake the dashboard uses.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const url = eventsWsUrl('notification');
    let stopped = false;

    function connect() {
      if (stopped) return;
      const ws = new WebSocket(url, eventsWsProtocols());
      wsRef.current = ws;
      ws.addEventListener('close', () => {
        // Reconnect unless we are unmounting: a dropped socket would otherwise
        // silently stop notifications, and nothing polls to cover for it now.
        if (!stopped) reconnectTimer.current = window.setTimeout(connect, 3000);
      });
      ws.addEventListener('error', () => { /* close fires too */ });
      ws.addEventListener('message', (event) => {
        let frame;
        try { frame = JSON.parse(event.data); } catch { return; }
        if (frame?.type !== 'notification' || !frame.message) return;
        const row = toRow(frame.message);
        if (!row.id) return;
        setNotifications((prev) => (
          // The same notification can arrive twice (a reconnect that overlaps
          // the initial fetch); key on uuid so it never doubles up.
          prev.some((existing) => existing.id === row.id) ? prev : [row, ...prev]
        ));
      });
    }

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      try { wsRef.current?.close(); } catch { /* already gone */ }
      wsRef.current = null;
    };
  }, [isAuthenticated]);

  return {
    notifications,
    loading,
    error,
    markAsRead,
    deleteNotification,
    markAllAsRead,
    refreshNotifications,
    unreadCount: notifications.filter(n => !n.read_at).length
  };
};