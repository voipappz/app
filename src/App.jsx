import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams, useParams } from 'react-router';
import { Suspense, lazy } from 'react';
// Sentry is initialized in main.jsx
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserAuthProvider, useUserAuth } from './context/UserAuthContext';
import { PortalPreferencesProvider } from './context/PortalPreferencesContext';
import { NotificationProvider } from './context/NotificationContext';
import { CustomerEnvironmentProvider } from './context/CustomerEnvironmentContext';
import { TourProvider } from './context/TourContext';
import { ThemeProvider } from './context/ThemeContext';
import { PhoneProvider } from './context/PhoneContext';
import { SoftphoneProvider } from './context/SoftphoneContext.jsx';
import { QueryProvider } from './providers/QueryProvider';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary.jsx';
import Layout from './components/Layout/Layout.jsx';
import { TourOverlay } from './components/Tour';
import { usePermissions } from './hooks/usePermissions';
import { canAccessScreen } from './utils/jwt';
import { CircularProgress, Box, Typography, Button } from '@mui/material';
import { ConfirmProvider } from './components/ui';
// Language + reading direction, and with them the Emotion cache and the MUI
// theme (ONE theme, light + dark, driven by src/theme/tokens.js).
import { LocaleProvider, useLocale } from './i18n/LocaleContext';
import LocaleSync from './i18n/LocaleSync';

// Eager: Login and UserLogin are the entry points for unauthenticated users
import Login from './components/Login/Login.jsx';
import UserLogin from './components/Login/UserLogin.jsx';

// Lazy-load all other route components for code splitting
const Reports = lazy(() => import('./components/Reports/Reports.jsx'));
const LiveDashboard = lazy(() => import('./components/LiveDashboard/LiveDashboard.jsx'));
const Dashboard = lazy(() => import('./components/Dashboard/PortalDashboard.jsx'));
const AdminDashboard = lazy(() => import('./components/Dashboard/AdminDashboard.jsx'));
const Phone = lazy(() => import('./components/Phone/PhoneScreen.jsx'));
// The PORTAL's call history — deliberately not the admin Calls screen
// (/calls), which is built around dynamic field configs and saved segments.
const PortalCalls = lazy(() => import('./components/PortalCalls/PortalCalls.jsx'));
const Calls = lazy(() => import('./components/Calls/Calls.jsx'));

const Notifications = lazy(() => import('./components/Notifications/Notifications.jsx'));
const Users = lazy(() => import('./components/Users/Users.jsx'));
const Account = lazy(() => import('./components/Account/Account.jsx'));
const Accounts = lazy(() => import('./components/Accounts/Accounts.jsx'));
const Subscriptions = lazy(() => import('./components/Subscriptions/Subscriptions.jsx'));
const Providers = lazy(() => import('./components/Providers/Providers.jsx'));
const Environments = lazy(() => import('./components/Environments/Environments.jsx'));
const DIDs = lazy(() => import('./components/DIDs/DIDs.jsx'));
// The PORTAL's numbers screen — the same DIDs screen in portalMode. See
// PortalDIDs.jsx for why it isn't a separate implementation.
const PortalDIDs = lazy(() => import('./components/PortalDIDs/PortalDIDs.jsx'));
const PBXRouting = lazy(() => import('./components/PBXRouting/PBXRoutingView.jsx'));
// Routing lands on the DIDs LIST; the flow canvas opens only via a row's
// Edit button (?did=...). Closing the canvas returns to the list.
const DIDsList = lazy(() => import('./components/DIDs/DIDs.jsx'));
const RoutingScreen = () => {
  const [params, setParams] = useSearchParams();
  // /routing is reachable from both surfaces. Falling back to the list means
  // falling back to the LIST FOR THIS SESSION — a portal user closing the
  // canvas must not land on the console's DIDs screen.
  const admin = useAuth();
  const user = useUserAuth();
  const portalMode = !admin.isAuthenticated && user.isAuthenticated;
  return params.get('did')
    ? <PBXRouting onClose={() => setParams({}, { replace: true })} />
    : <DIDsList portalMode={portalMode} />;
};
// /dids/:id deep link — per-DID edit is the visual routing flow.
const DIDEditRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/routing?did=${id}`} replace />;
};
const CommsLog = lazy(() => import('./components/CommsLog/CommsLog.jsx'));
const Services = lazy(() => import('./components/Studio/ServicesStudio.jsx'));
const BillingStudio = lazy(() => import('./components/Studio/BillingStudio.jsx'));
const Events = lazy(() => import('./components/Events/Events.jsx'));
const LogsScreen = lazy(() => import('./views/syslogs/LogsScreen.jsx'));
const Bots = lazy(() => import('./components/Bots/Bots.jsx'));
const CallsLog = lazy(() => import('./components/CallsLog/CallsLog.jsx'));
const HealthMonitor = lazy(() => import('./components/HealthMonitor/HealthMonitor.jsx'));
const Extensions = lazy(() => import('./components/Extensions/Extensions.jsx'));
const Messages = lazy(() => import('./components/Messages/Messages.jsx'));
const Monitoring = lazy(() => import('./components/Monitoring/Monitoring.jsx'));
// The nodes list with its create/edit/delete/import (nodes API) — also a
// section of Monitoring, and reachable on its own from the sidebar.
const MonitoringNodes = lazy(() => import('./components/Monitoring/MonitoringNodes.jsx'));
const Workflows = lazy(() => import('./components/Workflows/Workflows.jsx'));
const Campaigns = lazy(() => import('./components/Campaigns/Campaigns.jsx'));
const Templates = lazy(() => import('./components/Templates/Templates.jsx'));
const Tariffs = lazy(() => import('./components/Tariffs/Tariffs.jsx'));
const Schema = lazy(() => import('./components/Appz/Schema.jsx'));
const Transactions = lazy(() => import('./components/Transactions/Transactions.jsx'));
const Settings = lazy(() => import('./components/Settings/Settings.jsx'));
const ApiDocs = lazy(() => import('./components/ApiDocs/ApiDocs.jsx'));
const McpWorkspace = lazy(() => import('./components/ApiDocs/McpWorkspace.jsx'));

const PageLoader = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <CircularProgress size={36} />
  </Box>
);

// MODULE SCOPE ON PURPOSE. Defined inside AppContent it was a new component
// identity on every render, so React remounted the whole subtree — including
// Layout, which owns the phone dock's open state. The dock opened and shut
// itself within ~300ms.
//
// `/` IS the end-user portal: the login when signed out, the dashboard
// when signed in. The portal is one screen with the phone docked beside it,
// so the dashboard sits at the root rather than one hop inside it — there
// is nothing for a "home" that isn't the dashboard to be.
//
// An admin session gets sent to its own console instead; the account
// surface's front door is /admin.
const PortalRoot = () => {
  const admin = useAuth();
  const user = useUserAuth();
  if (admin.initializing || user.initializing) return null;
  if (user.isAuthenticated) {
    return canAccessScreen(user.acl, 'dashboard')
      ? <Layout><Dashboard /></Layout>
      : <Layout><PortalCalls /></Layout>;
  }
  if (admin.isAuthenticated) return <Navigate to="/calls" replace />;
  return <Layout><UserLogin /></Layout>;
};

function AppContent() {
  // Define route guards INSIDE AppContent so they're guaranteed to be inside AuthProvider
  const ProtectedRoute = ({ children, requiredAcl }) => {
    const { isAuthenticated, initializing } = useAuth();
    const { canAccess } = usePermissions();

    // Wait for AuthContext to finish initializing (restoring auth from localStorage)
    // This prevents race conditions where API calls happen before auth is restored
    if (initializing) {
      return null; // Show nothing while auth is being restored
    }

    // After initialization is complete, check if user is authenticated
    // AuthContext handles all token validation using JWT exp claim
    if (!isAuthenticated) return <Navigate to="/admin" replace />;

    // ACL route protection: block access if user lacks read/index/list permission.
    // Bounce to /account, which carries no requiredAcl — sending a denial to an
    // ACL-guarded route (as /live -> /reports did) loops forever for a user who
    // lacks that ACL.
    if (requiredAcl && !canAccess(requiredAcl)) {
      return <Navigate to="/account" replace />;
    }

    return children;
  };

  const PublicRoute = ({ children }) => {
    const { isAuthenticated, initializing } = useAuth();

    // Wait for AuthContext to finish initializing
    if (initializing) {
      return null;
    }

    // Already signed in and sitting on /admin → straight to the landing screen (Calls).
    return !isAuthenticated ? children : <Navigate to="/calls" replace />;
  };

  // Dashboard and Phone are shared, ACL-gated screens usable from EITHER
  // surface (confirmed: one route each, not separate namespaces per surface).
  // Whichever session is active decides which ACL system gates the screen;
  // the screen itself reads useAuth()/useUserAuth() to pick its data scoping
  // (selected environment vs. the user's own environment_uuid).
  // Portal-only screens. The widget dashboard is the END USER's landing
  // screen, so an admin session is sent to its own landing screen rather than
  // shown it here. The console has its own copy of the same dashboard at
  // /admin/dashboard (AdminDashboard, a pilot), scoped to the selected
  // customer/environment.
  const PortalRoute = ({ children, aclKey }) => {
    const admin = useAuth();
    const user = useUserAuth();
    if (admin.initializing || user.initializing) return null;
    if (admin.isAuthenticated) return <Navigate to="/calls" replace />;
    if (!user.isAuthenticated) return <Navigate to="/" replace />;
    // Phone is always available to a signed-in portal user, unconditional on
    // ACL — mirrors app, where the phone icon was just always there, never
    // gated. (It's also reachable via the persistent PhoneFab.)
    if (aclKey === 'phone') return children;
    return canAccessScreen(user.acl, aclKey) ? children : <Navigate to="/" replace />;
  };

  const DualProtectedRoute = ({ children, aclKey }) => {
    const admin = useAuth();
    const user = useUserAuth();
    const { canAccess } = usePermissions();

    if (admin.initializing || user.initializing) return null;

    if (admin.isAuthenticated) {
      return canAccess(aclKey) ? children : <Navigate to="/account" replace />;
    }
    if (user.isAuthenticated) {
      // `dids` is granted unconditionally: portal users' ACLs carry no dids
      // entry, so gating on it hid the Numbers rail item AND bounced /my-dids
      // and /routing. Grant a dids ACL to portal users on the backend and this
      // can go back to the check below. The ADMIN branch above is untouched —
      // the console still enforces the dids ACL on /dids and /routing.
      if (aclKey === 'dids') return children;
      return canAccessScreen(user.acl, aclKey) ? children : <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/" replace />;
  };

  return (
    <Router>
      <Suspense fallback={<Layout><PageLoader /></Layout>}>
      <Routes>
        {/* `/` is the end-user (customer) front door; `/admin` is the account
            surface this Login has always been. `/login` is kept as a bare
            redirect so old admin bookmarks still land somewhere. */}
        <Route path="/" element={<PortalRoot />} />
        <Route
          path="/admin"
          element={
            <PublicRoute>
              <Layout>
                <Login />
              </Layout>
            </PublicRoute>
          }
        />
        <Route path="/login" element={<Navigate to="/admin" replace />} />
        {/* Live is the END USER's screen, not an admin one: it answers "what
            is my team doing right now" for the person working the queue.
            PortalRoute enforces that — an admin session is sent to Calls.
            `dashboard` is the portal ACL key (portal ACLs are singular:
            call/report/dashboard, not the admin's plural). */}
        <Route
          path="/live"
          element={
            <PortalRoute aclKey="dashboard">
              <Layout>
                <LiveDashboard />
              </Layout>
            </PortalRoute>
          }
        />
        {/* The dashboard lives AT the portal's root, not beside it — see
            PortalRoot. This path is kept so existing links still work. */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route
          path="/my-calls"
          element={
            <DualProtectedRoute aclKey="calls">
              <Layout>
                <PortalCalls />
              </Layout>
            </DualProtectedRoute>
          }
        />
        <Route
          path="/my-dids"
          element={
            <DualProtectedRoute aclKey="dids">
              <Layout>
                <PortalDIDs />
              </Layout>
            </DualProtectedRoute>
          }
        />
        <Route
          path="/phone"
          element={
            <PortalRoute aclKey="phone">
              <Layout>
                <Phone />
              </Layout>
            </PortalRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute requiredAcl="reports">
              <Layout>
                <Reports />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route 
          path="/calls"
          element={
            <ProtectedRoute requiredAcl="calls">
              <Layout>
                <Calls />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* The live-calls dashboard in the account console (pilot): the same
            body as the portal's landing screen, scoped to the selected
            customer/environment. Gated on calls, the data it shows. */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute requiredAcl="calls">
              <Layout>
                <AdminDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute requiredAcl="notifications">
              <Layout>
                <Notifications />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/health-monitor"
          element={
            <ProtectedRoute requiredAcl="monitors">
              <Layout>
                <HealthMonitor />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredAcl="users">
              <Layout>
                <Users />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <Layout>
                <Account />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/account/customer"
          element={
            <ProtectedRoute>
              <Layout>
                <Account />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts"
          element={
            <ProtectedRoute requiredAcl="accounts">
              <Layout>
                <Accounts />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/subscriptions"
          element={
            <ProtectedRoute requiredAcl="subscriptions">
              <Layout>
                <Subscriptions />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <ProtectedRoute requiredAcl="subscriptions">
              <Layout>
                <Transactions />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/providers"
          element={
            <ProtectedRoute requiredAcl="providers">
              <Layout>
                <Providers />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/environments"
          element={
            <ProtectedRoute requiredAcl="environments">
              <Layout>
                <Environments />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/services"
          element={
            <ProtectedRoute requiredAcl="services">
              <Layout>
                <Services />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute requiredAcl="subscriptions">
              <Layout>
                <BillingStudio />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/events"
          element={
            <ProtectedRoute requiredAcl="logs">
              <Layout>
                <Events />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/logs"
          element={
            <ProtectedRoute requiredAcl="logs">
              <Layout>
                <LogsScreen />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/schema"
          element={
            <ProtectedRoute requiredAcl="schemas">
              <Layout>
                <Schema />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/bots"
          element={
            <ProtectedRoute requiredAcl="bots">
              <Layout>
                <Bots />
              </Layout>
            </ProtectedRoute>
          }
        />


        <Route
          path="/calls-log"
          element={
            <ProtectedRoute>
              <Layout>
                <CallsLog />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dids"
          element={
            <ProtectedRoute requiredAcl="routes">
              <Layout>
                <DIDs />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* Per-DID edit deep link — editing a DID happens on the visual
            routing flow (React Flow canvas), so forward to it. */}
        <Route path="/dids/:id" element={<DIDEditRedirect />} />
        {/* Dual-surface: the portal's Numbers screen links a number's call flow
            here too, gated on the same `routes` ACL in whichever session is
            live. (The API aliases `routes` to the stored `dids` key in both
            directions, so either spelling resolves — see voipappz-api #18.) */}
        <Route
          path="/routing"
          element={
            <DualProtectedRoute aclKey="routes">
              <Layout>
                <RoutingScreen />
              </Layout>
            </DualProtectedRoute>
          }
        />
        <Route
          path="/activity-log"
          element={
            <ProtectedRoute requiredAcl="calls">
              <Layout>
                <CommsLog />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/extensions"
          element={
            <ProtectedRoute requiredAcl="extensions">
              <Layout>
                <Extensions />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute requiredAcl="messages">
              <Layout>
                <Messages />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/monitoring"
          element={
            <ProtectedRoute>
              <Layout>
                <Monitoring />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nodes"
          element={
            <ProtectedRoute requiredAcl="nodes">
              <Layout>
                <Box sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', p: { xs: 2, md: 3 } }}>
                  <MonitoringNodes />
                </Box>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns"
          element={
            <ProtectedRoute requiredAcl="campaigns">
              <Layout>
                <Campaigns />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <ProtectedRoute requiredAcl="templates">
              <Layout>
                <Templates />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/tariffs"
          element={
            <ProtectedRoute requiredAcl="tariffs">
              <Layout>
                <Tariffs />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/devzone"
          element={
            <ProtectedRoute>
              <Layout>
                <ApiDocs />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/mcp"
          element={
            <ProtectedRoute>
              <Layout>
                <McpWorkspace />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="/api-docs" element={<Navigate to="/devzone" replace />} />
        <Route
          path="/workflow"
          element={
            <ProtectedRoute requiredAcl="workflows">
              <Layout>
                <Workflows />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* Catch-all 404 — auth-gated like every other route so a hard load of
            an unknown URL cannot mount Layout and fire protected API requests
            before AuthContext has restored the session. */}
        <Route path="*" element={
          <ProtectedRoute>
          <Layout>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, color: 'var(--theme-text-secondary)' }}>
              <Typography variant="h4" sx={{ fontWeight: 600, color: 'var(--theme-text-primary)' }}>404</Typography>
              <Typography variant="body1">No route matched this URL.</Typography>
              <Button variant="outlined" size="small" onClick={() => window.location.href = '/reports'} sx={{ mt: 1, textTransform: 'none' }}>
                Go to Reports
              </Button>
            </Box>
          </Layout>
          </ProtectedRoute>
        } />
      </Routes>
      </Suspense>
    </Router>
  );
}

/**
 * Remounts the app when the reading direction changes.
 *
 * Switching direction swaps the Emotion cache, which regenerates every class
 * name in the tree. Components that cached measured geometry against the old
 * styles keep stale numbers — DataGrid's column widths and React Flow's node
 * positions are the ones that bite. A remount is the honest fix, and the cost
 * is acceptable for something a person does roughly once: the session, auth,
 * the React Query cache and the URL all live above here and survive, as does
 * an active SIP call (SoftphoneProvider is mounted above too). What does not
 * survive is an open dialog or half-filled form, which is the right trade.
 *
 * A separate component because App() renders LocaleProvider rather than
 * sitting inside it, so it cannot read the context itself.
 */
const DirectionKeyedContent = () => {
  const { direction } = useLocale();
  return <AppContent key={direction} />;
};

function App() {
  return (
    <ErrorBoundary>
      {/* Owns the Emotion cache and the MUI theme, because both depend on
          reading direction: the theme has to be REBUILT per direction
          (`direction` is a top-level createTheme option) and the cache has to
          be in place before any style is inserted. ThemeContext stays inside
          it — it calls MUI's useColorScheme() and needs the MUI provider
          above. See src/i18n/LocaleContext.jsx. */}
      <LocaleProvider>
        <ThemeProvider>
          {/* One confirmation dialog for the whole app (useConfirm). */}
          <ConfirmProvider>
          <QueryProvider>
            <AuthProvider>
              <UserAuthProvider>
              <PortalPreferencesProvider>
                {/* Applies the customer's default language after login, unless
                    this browser has chosen one. Needs a session, so it cannot
                    live in LocaleProvider (which must sit above everything to
                    own the Emotion cache). Renders nothing. */}
                <LocaleSync />
                {/* Mounted above the Router (and above both auth providers, so
                    it can see either session) so SIP registration and any
                    active call survive page navigation — see SoftphoneContext.jsx. */}
                <SoftphoneProvider>
                  <NotificationProvider>
                    <CustomerEnvironmentProvider>
                      <PhoneProvider>
                      <TourProvider>
                        <DirectionKeyedContent />
                        <TourOverlay />
                      </TourProvider>
                      </PhoneProvider>
                    </CustomerEnvironmentProvider>
                  </NotificationProvider>
                </SoftphoneProvider>
              </PortalPreferencesProvider>
              </UserAuthProvider>
            </AuthProvider>
          </QueryProvider>
          </ConfirmProvider>
        </ThemeProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}

export default App;
