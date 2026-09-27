import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useUserAuth } from './UserAuthContext';

/**
 * ONE sidebar, whatever is in it.
 *
 * The portal opens things on the right: the phone (with the assistant as one
 * of its tabs), and a call's details. They are the same drawer — a person learns
 * one place where things open, instead of a dock here, a panel there and a
 * detail column that fought the floating buttons for the same corner.
 *
 * `view` is 'phone' | 'call' | null, `params` whatever that view needs.
 */
const Context = createContext({ view: null, params: null, open: () => {}, toggle: () => {}, close: () => {} });

export function PortalSidebarProvider({ children }) {
  const [state, setState] = useState({ view: null, params: null });
  // Either session may hold the phone: an account signs a device in by hand,
  // a portal user's own extension registers itself (SoftphoneContext).
  const admin = useAuth();
  const portal = useUserAuth();
  const isAuthenticated = admin.isAuthenticated || portal.isAuthenticated;

  // Call details are shared; the softphone needs someone signed in.
  const open = useCallback((view, params = null) => {
    if (view === 'phone' && !isAuthenticated) return;
    setState({ view, params });
  }, [isAuthenticated]);
  const close = useCallback(() => setState({ view: null, params: null }), []);
  // Same view again closes it; a different view replaces what is showing.
  const toggle = useCallback((view, params = null) => {
    if (view === 'phone' && !isAuthenticated) return;
    setState((current) => (current.view === view && !params ? { view: null, params: null } : { view, params }));
  }, [isAuthenticated]);

  const value = useMemo(() => ({ ...state, open, toggle, close }), [state, open, toggle, close]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const usePortalSidebar = () => useContext(Context);
