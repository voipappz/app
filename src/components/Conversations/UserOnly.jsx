import { Navigate } from 'react-router';
import { useIsUserSession } from '../../hooks/useIsUserSession';

// Conversations is a portal (user) screen only. An account that reaches its
// route is sent to its own landing screen instead.
export default function UserOnly({ to = '/calls', children }) {
  const userSession = useIsUserSession();
  return userSession ? children : <Navigate to={to} replace />;
}
