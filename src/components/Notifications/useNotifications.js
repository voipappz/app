import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getToken } from '../../lib/auth';
import { apiList } from '../../lib/clients/api';
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
      // Through the app's data-access layer, which owns the Bearer header and
      // the 401 → drop-session path. The hand-rolled fetch this replaces set
      // `Authorization: <undefined>` and knew nothing about 401s.
      const { rows } = await apiList(NOTIFICATIONS_PATH);
      const data = Array.isArray(rows) ? rows : [];

      // Transform the API response to ensure consistent structure
      const transformedNotifications = data.map(notification => ({
        ...notification,
        id: notification.uuid,
        isRead: !!notification.read_at,
        timeAgo: getTimeAgo(notification.created_at),
        recipient: notification.recipient || null,
        meta: notification.meta || {}
      }));

      setNotifications(transformedNotifications);
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
  function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  }

  // Auto-refresh notifications every 30 seconds
  useEffect(() => {
    fetchNotifications();
    
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Real-time updates could be added here with WebSocket connection
  useEffect(() => {
    // WebSocket connection for real-time notifications
    // This would be implemented when real-time functionality is needed
    
    return () => {
      // Cleanup WebSocket connection
    };
  }, []);

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