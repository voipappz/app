import { lazy } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';

const PBXRouting = lazy(() => import('../PBXRouting/PBXRoutingView.jsx'));
const DIDsList = lazy(() => import('./DIDs.jsx'));

// Routing lands on the DIDs LIST; the flow canvas opens only via a row's
// Edit button (?did=...). Closing the canvas returns to the list.
export default function RoutingScreen() {
  const [params, setParams] = useSearchParams();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  // /routing is reachable from both surfaces. Falling back to the list means
  // falling back to the LIST FOR THIS SESSION — a portal user closing the
  // canvas must not land on the console's DIDs screen.
  const admin = useAuth();
  const user = useUserAuth();
  const portalMode = !admin.isAuthenticated && user.isAuthenticated;
  const did = params.get('did');

  if (!did) return <DIDsList portalMode={portalMode} />;
  // The workflow diagram is an admin's, and is not offered on a phone either.
  // A typed or old link to it opens the route's details instead.
  if (isPhone || portalMode) return <Navigate to={`/routes?route=${encodeURIComponent(did)}`} replace />;
  return <PBXRouting onClose={() => setParams({}, { replace: true })} />;
}
