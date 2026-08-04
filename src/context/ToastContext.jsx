// ToastContext — the app-wide toast queue, mounted once in App.jsx next to the
// other providers. Anything in the tree can raise a toast with
// `useToast().showToast(toast)`; the rules (dedupe, cap, expiry) live in
// components/Toaster/toastQueue.js and the cards in components/Toaster/Toaster.jsx.
//
// The provider deliberately knows nothing about notifications — the bell feed is
// wired in by <NotificationToasts /> so the toaster stays a surface, not a
// feature.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Toaster from '../components/Toaster/Toaster';
import { expireToasts, hasExpiring, pushToast } from '../components/Toaster/toastQueue';

// A no-op default: a component rendered outside the provider (isolated tests,
// the login screen) can call showToast without blowing up.
const ToastContext = createContext({ showToast: () => {}, dismissToast: () => {} });

export const useToast = () => useContext(ToastContext);

const TICK_MS = 500;   // expiry resolution — cheap, and only while a card is up

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((toast) => setToasts((q) => pushToast(q, toast)), []);
  const dismissToast = useCallback(
    (id) => setToasts((q) => q.filter((t) => t.id !== id)),
    [],
  );

  // One timer for the whole stack, and only while something can expire — an
  // idle toaster costs nothing, and sticky-only stacks stop the clock.
  useEffect(() => {
    if (!hasExpiring(toasts)) return;
    const id = setInterval(() => setToasts((q) => expireToasts(q, Date.now())), TICK_MS);
    return () => clearInterval(id);
  }, [toasts]);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export default ToastProvider;
