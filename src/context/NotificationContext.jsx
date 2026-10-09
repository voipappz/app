import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Slide, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { apiService } from '../services/apiService';
import { configService } from '../services/configService';

const NotificationContext = createContext();

// Card background per level — same palette as the phone app's Toaster, so the
// two products share one toast idiom instead of each inventing its own.
const LEVEL_BG = {
  error: '#8f2a1e',
  warning: '#8a5a00',
  success: '#367823',
  info: '#2f3640',
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const recentRef = useRef(new Map());
  const sequenceRef = useRef(0);
  const timersRef = useRef(new Map());

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
  }, []);

  // One user action should produce one toast. Concurrent API reads can fail
  // with the same response, so suppress an identical message briefly.
  // Operational polling failures belong on Monitoring, not
  // in a wall of global notifications.
  const enqueue = useCallback((message, severity, duration) => {
    const level = ['success', 'error', 'warning', 'info'].includes(severity) ? severity : 'info';
    const text = String(message || '').trim();
    if (!text) return;

    const now = Date.now();
    const key = `${level}:${text}`;
    const previous = recentRef.current.get(key) || 0;
    if (now - previous < 5000) return;
    recentRef.current.set(key, now);

    // Prevent the dedupe map itself from growing forever.
    for (const [candidate, timestamp] of recentRef.current) {
      if (now - timestamp > 30000) recentRef.current.delete(candidate);
    }

    const id = `${now}-${sequenceRef.current += 1}`;
    setNotifications(prev => [...prev, {
      id, type: level, message: text, timestamp: now,
    }]);
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setNotifications(prev => prev.filter(notif => notif.id !== id));
    }, duration);
    timersRef.current.set(id, timer);
  }, []);

  const showSuccess = useCallback((message) => {
    enqueue(message, 'success', configService.get('notifications.successDuration', 5000));
  }, [enqueue]);

  const showError = useCallback((message) => {
    enqueue(message, 'error', configService.get('notifications.errorDuration', 8000));
  }, [enqueue]);

  const removeNotification = useCallback((id) => {
    clearTimeout(timersRef.current.get(id));
    timersRef.current.delete(id);
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  }, []);

  // Generic notifier: showNotification(message, 'success' | 'error' | 'info' | 'warning').
  // Maps to the typed helpers so callers can pass a severity in one call.
  const showNotification = useCallback((message, severity = 'success') => {
    const level = ['success', 'error', 'warning', 'info'].includes(severity) ? severity : 'info';
    const ms = level === 'error'
      ? configService.get('notifications.errorDuration', 8000)
      : configService.get('notifications.successDuration', 5000);
    enqueue(message, level, ms);
  }, [enqueue]);

  // Register message handlers with API service on mount
  useEffect(() => {
    apiService.setMessageHandlers(showSuccess, showError);
  }, [showSuccess, showError]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    showSuccess,
    showError,
    showNotification,
    removeNotification,
    notifications
  }), [showSuccess, showError, showNotification, removeNotification, notifications]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      
      {/* Toast surface — the phone app's idiom (flat coloured card, inline
          close, slide in) rather than MUI's default Snackbar+Alert, so both
          products look like one product.
          Offset below the topbar: anchored flush to the top it sat over the
          screen's toolbar buttons and hid the controls underneath it.
          Identical messages are deduplicated; distinct messages keep their own
          lifetime and can be scrolled instead of displacing older messages. */}
      {notifications.length > 0 && (
        <Box
          data-testid="toaster"
          sx={{
            // On a phone the card is nearly the full width, so a fixed right
            // inset pushed it off-centre and clipped the close button; pin
            // both edges there and let the card fill the gap.
            position: 'fixed', top: { xs: 60, sm: 72 }, left: '50%',
            transform: 'translateX(-50%)', right: 'auto',
            width: { xs: 'calc(100% - 16px)', sm: 520 }, maxWidth: 'calc(100vw - 24px)', zIndex: 1400,
            maxHeight: 'calc(100dvh - 96px)', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 1,
            pointerEvents: 'auto',
          }}
        >
          {notifications.map((notif) => (
            <Slide key={notif.id} direction="left" in mountOnEnter unmountOnExit>
              <Box
                role={notif.type === 'error' ? 'alert' : 'status'}
                data-testid="notification-toast"
                data-level={notif.type}
                sx={{
                  width: '100%', maxWidth: '100%', position: 'relative', flexShrink: 0, boxSizing: 'border-box',
                  bgcolor: LEVEL_BG[notif.type] || LEVEL_BG.info, color: '#fff',
                  borderRadius: '6px', p: 1.5,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.3)', pointerEvents: 'all',
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => removeNotification(notif.id)}
                  aria-label="Dismiss"
                  data-testid="notification-toast-close"
                  sx={{ position: 'absolute', top: 2, right: 2, color: '#fff', opacity: 0.85 }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
                <Typography sx={{ fontSize: '0.875rem', pr: '24px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {notif.message}
                </Typography>
              </Box>
            </Slide>
          ))}
        </Box>
      )}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
