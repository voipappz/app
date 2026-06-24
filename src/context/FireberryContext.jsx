import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import FireberryClientSDK from '@fireberry/sdk/client';

const FireberryContext = createContext(null);

const isInsideFireberry = () =>
  typeof window !== 'undefined' && window.parent !== window;

// Simple standalone toast — no MUI dependency, always visible
function StandaloneToast({ message, type, onClose }) {
  const colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 99999,
      background: colors[type] || colors.info,
      color: '#fff', padding: '12px 20px', borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      fontFamily: 'sans-serif', fontSize: 14, fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 12, minWidth: 250,
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
    </div>
  );
}

export function FireberryProvider({ children }) {
  const clientRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [fallbackToast, setFallbackToast] = useState(null);

  useEffect(() => {
    const insideFireberry = isInsideFireberry();
    console.log('[Fireberry] mounted — insideFireberry:', insideFireberry);

    if (!insideFireberry) return;

    const client = new FireberryClientSDK();
    clientRef.current = client;
    setReady(true);
    console.log('[Fireberry] SDK ready');

    client.initializeContext()
      .then(() => console.log('[Fireberry] context OK'))
      .catch((err) => console.warn('[Fireberry] context failed (non-fatal):', err));

    // Auto-toast on load to confirm SDK is wired up
    setTimeout(() => {
      client.system.toast.show({
        content: 'VoipAppz connected to Fireberry!',
        toastType: 'success',
        placement: 'top-end',
        autoDismissTimeout: 5000,
      }).catch(() => {});
    }, 1500);

    return () => client.destroy();
  }, []);

  const showToast = useCallback(({ content, toastType = 'info', placement = 'top-end', withCloseButton, autoDismissTimeout = 5000 } = {}) => {
    console.log('[Fireberry] showToast →', { content, toastType, ready, hasClient: !!clientRef.current });

    if (ready && clientRef.current) {
      console.log('[Fireberry] → sending to Fireberry SDK');
      return clientRef.current.system.toast.show({ content, toastType, placement, withCloseButton, autoDismissTimeout });
    }

    console.log('[Fireberry] → showing standalone fallback toast');
    setFallbackToast({ content, toastType });
    if (autoDismissTimeout) {
      setTimeout(() => setFallbackToast(null), autoDismissTimeout);
    }
    return Promise.resolve();
  }, [ready]);

  const toast = {
    show: showToast,
    hide: useCallback(() => {
      if (ready && clientRef.current) return clientRef.current.system.toast.hide();
      setFallbackToast(null);
      return Promise.resolve();
    }, [ready]),
  };

  return (
    <FireberryContext.Provider value={{ ready, toast, client: clientRef.current }}>
      {children}
      {fallbackToast && (
        <StandaloneToast
          message={fallbackToast.content}
          type={fallbackToast.toastType}
          onClose={() => setFallbackToast(null)}
        />
      )}
    </FireberryContext.Provider>
  );
}

export function useFireberry() {
  return useContext(FireberryContext);
}
