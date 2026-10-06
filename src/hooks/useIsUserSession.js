import { useAuth } from '../context/AuthContext';
import { useUserAuth } from '../context/UserAuthContext';

/**
 * A portal USER is signed in, not an account. Such a session sees only its own
 * environment: no customer or environment selectors, pickers, columns or
 * fields. When a browser holds both, the account session wins
 * (services/sessionIsolation.js), so this is false.
 */
export function useIsUserSession() {
  const { isAuthenticated: account } = useAuth();
  const { isAuthenticated: user } = useUserAuth();
  return Boolean(user && !account);
}

/**
 * Which side is signed in: 'admin' (an account), 'user', or null. Same
 * precedence as useIsUserSession: the account wins when both are present.
 */
export function useSessionRole() {
  const { isAuthenticated: account } = useAuth();
  const { isAuthenticated: user } = useUserAuth();
  if (account) return 'admin';
  if (user) return 'user';
  return null;
}
