import { createContext, useContext, useEffect, useCallback, useMemo, useState } from 'react';
import { getSession, sessionUser, logout as authLogout } from '../lib/auth';
import { userLogout } from '../lib/clients/mothership';
import { clearFeaturesCache } from '../hooks/useFeatures';

// Everything cached for the SIGNED-IN user. Cleared on logout so the next
// person at this browser inherits nothing — a different tenant must not see the
// previous one's branding, flags or extension.
//
// UI preferences (app-direction, app-color-mode, app-language) are deliberately
// NOT here: they belong to the person using the browser, not to the session.
// The trusted-device token is kept too — signing out ends the session, it does
// not un-trust the device, which is the whole point of skipping OTP next time.
const SESSION_SCOPED_KEYS = [
  'customerData',      // tenant branding from customer_portal_data
  'sip-settings',      // the account's softphone credentials
  'sip-phone-pinned',  // phone widget UI state, tied to that extension
];

function clearSessionCaches() {
  clearFeaturesCache();
  for (const key of SESSION_SCOPED_KEYS) {
    try { localStorage.removeItem(key); } catch { /* storage disabled */ }
  }
}
import { ACLService } from '../services/aclService';
import { getPermissionsForRole } from '../config/permissions';

const AuthContext = createContext();

// Auth event types for cross-component communication
export const AUTH_EVENTS = {
  LOGOUT: 'auth:logout',
  UNAUTHORIZED: 'auth:unauthorized'
};

export const AuthProvider = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoadingState] = useState(false);
  const [error, setErrorState] = useState(null);

  // Restore the session from localStorage on boot (accounts JWT, no network).
  useEffect(() => {
    try {
      const session = getSession();
      if (session) {
        setUser(sessionUser(session));
        setIsAuthenticated(true);
      }
    } catch (err) {
      console.error('Auth initialization error:', err);
    }
    setIsInitialized(true);
  }, []);

  // Login — called by the Login hook with the persisted AuthSession.
  const login = useCallback((session) => {
    setUser(sessionUser(session));
    setIsAuthenticated(true);
    setErrorState(null);
    setLoadingState(false);
  }, []);

  const logout = useCallback((reason) => {
    // Revoke the session SERVER-side first, while the token is still stored —
    // authLogout() below only clears this browser. Fire-and-forget: userLogout
    // never throws, so a dead network can't trap the user in a logged-in UI.
    //
    // Skipped when the session is already gone server-side (a 401 is what told
    // us so), which also keeps 401 → logout → POST → 401 from looping.
    if (reason !== '401') void userLogout();
    authLogout();
    // Drop everything cached for that user. The softphone tears itself down off
    // isAuthenticated (SipPhoneContext) — it must not keep taking calls for a
    // session that no longer exists.
    clearSessionCaches();
    setUser(null);
    setIsAuthenticated(false);
    setErrorState(null);
    setLoadingState(false);
    if (reason) console.log(`Logged out: ${reason}`);
  }, []);

  // Listen for auth events (e.g. a 401 from the API layer).
  useEffect(() => {
    const handleAuthLogout = (event) => logout(event.detail?.reason || 'external');
    window.addEventListener(AUTH_EVENTS.LOGOUT, handleAuthLogout);
    window.addEventListener(AUTH_EVENTS.UNAUTHORIZED, handleAuthLogout);
    return () => {
      window.removeEventListener(AUTH_EVENTS.LOGOUT, handleAuthLogout);
      window.removeEventListener(AUTH_EVENTS.UNAUTHORIZED, handleAuthLogout);
    };
  }, [logout]);

  const setLoading = useCallback(() => {
    setLoadingState(true);
    setErrorState(null);
  }, []);

  const setError = useCallback((error) => {
    setLoadingState(false);
    setErrorState(error);
  }, []);

  // ACL from the user's app role (accounts default to the wildcard `admin`
  // template until per-account app-roles exist — see lib/auth.ts sessionUser).
  const aclService = useMemo(() => {
    if (!user?.role) return null;
    const permissions = getPermissionsForRole(user.role);
    if (!permissions || permissions.length === 0) return null;
    return new ACLService(permissions);
  }, [user]);

  // AUTH GATE: don't render children until auth state is determined.
  if (!isInitialized) return null;

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      user,
      loading,
      error,
      isInitialized,
      aclService,
      login,
      logout,
      setLoading,
      setError
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
