// NotificationToasts — the bridge from the bell feed to the app-wide toaster.
// Renders nothing; it watches useNotifications() and raises a toast for each
// unread notification it has not toasted before.
//
// Call events are NOT a source here: the softphone's CallToast already owns
// incoming calls, and doubling them up would be two toasts for one event.
//
// The `seen` set is the session-long memory that makes this bearable: the feed
// re-polls every 30s and a notification stays unread until the user opens the
// page, so without it every poll would re-toast the same rows forever.
import { useEffect, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import { useNotifications } from '../Notifications/useNotifications';
import { selectNewToasts } from './toastQueue';

export default function NotificationToasts() {
  const { notifications, error } = useNotifications();
  const { showToast } = useToast();
  const seenRef = useRef(new Set());

  useEffect(() => {
    // A failed feed falls back to demo rows (see useNotifications) — toasting
    // those would put fabricated alerts in front of the user every time the
    // backend is unreachable. Silence is the honest failure mode.
    if (error) return;

    for (const toast of selectNewToasts(notifications, seenRef.current)) {
      seenRef.current.add(toast.id);
      showToast(toast);
    }
  }, [notifications, error, showToast]);

  return null;
}
