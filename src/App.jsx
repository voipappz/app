import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams, useParams } from 'react-router';
import { Suspense, lazy } from 'react';
// Sentry is initialized in main.jsx
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserAuthProvider, useUserAuth } from './context/UserAuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { CustomerEnvironmentProvider } from './context/CustomerEnvironmentContext';
import { TourProvider } from './context/TourContext';
import { ThemeProvider } from './context/ThemeContext';
import { SoftphoneProvider } from './context/SoftphoneContext.jsx';
import { QueryProvider } from './providers/QueryProvider';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary.jsx';
import Layout from './components/Layout/Layout.jsx';
import { TourOverlay } from './components/Tour';
import { usePermissions } from './hooks/usePermissions';
import { getPermittedNavItems } from './config/navConfig';
import { canUserEnterRoute } from './routing/routeAccess';
import { CircularProgress, Box, Typography } from '@mui/material';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { ConfirmProvider } from './components/ui';
// ONE theme, light + dark, driven by src/theme/tokens.js — see theme.js.
import muiTheme from './theme/theme';

// Eager: the sign-in page (user or account, toggled) is the entry point for
// unauthenticated visitors.
import SignIn from './components/Login/SignIn.jsx';

// Lazy-load all other route components for code splitting
const Reports = lazy(() => import('./components/Reports/Reports.jsx'));
const LiveDashboard = lazy(() => import('./components/LiveDashboard/LiveDashboard.jsx'));
const AdminDashboard = lazy(() => import('./components/Dashboard/AdminDashboard.jsx'));
const Calls = lazy(() => import('./components/Calls/Calls.jsx'));

const Notifications = lazy(() => import('./components/Notifications/Notifications.jsx'));
const Users = lazy(() => import('./components/Users/Users.jsx'));
const Account = lazy(() => import('./components/Account/Account.jsx'));
const Accounts = lazy(() => import('./components/Accounts/Accounts.jsx'));
const Subscriptions = lazy(() => import('./components/Subscriptions/Subscriptions.jsx'));
const Providers = lazy(() => import('./components/Providers/Providers.jsx'));
const Environments = lazy(() => import('./components/Environments/Environments.jsx'));
const DIDs = lazy(() => import('./components/DIDs/DIDs.jsx'));
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
  return <Navigate to={`/routes?did=${id}`} replace />;
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

const lastLoginPath = () => {
  try { return sessionStorage.getItem('nimbus_login_path') === '/' ? '/' : '/admin'; }
  catch { return '/admin'; }
};

// MODULE SCOPE ON PURPOSE. Defined inside AppContent it was a new component
// identity on every render, so React remounted the whole subtree — including
// Layout, which owns the phone dock's open state. The dock opened and shut
// itself within ~300ms.
//
// Signed out, `/` is the user sign-in page and `/admin` is the account
// sign-in page. Signed in, both use the same ACL-filtered console.
const Root = ({ loginMode = 'user' }) => {
  const admin = useAuth();
  const user = useUserAuth();
  if (admin.initializing || user.initializing) return null;
  // A sign-in QR (/?login_token=) signs in as ITS user, whoever this browser
  // was signed in as: show the user sign-in, which redeems it.
  if (new URL(window.location.href).searchParams.has('login_token')) return <Layout><SignIn mode="user" /></Layout>;
  if (admin.isAuthenticated) return <Navigate to="/calls" replace />;
  if (user.isAuthenticated) {
    const first = getPermittedNavItems(user.acl, { strict: true })[0];
    return first ? <Navigate to={first.path} replace /> : <Layout><NoAccess /></Layout>;
  }
  return <Layout><SignIn mode={loginMode} /></Layout>;
};

// A portal user on a screen their ACL does not grant (or an account-only
// screen, which has no key). A page, not a redirect: a redirect between two
// screens that disagree about a key is a loop.
const NoAccess = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1, color: 'var(--theme-text-secondary)' }} data-testid="no-access">
    <Typography variant="h6" sx={{ color: 'var(--theme-text-primary)' }}>Not available</Typography>
    <Typography variant="body2">Your access does not include this screen.</Typography>
  </Box>
);

function AppContent() {
  // Define route guards INSIDE AppContent so they're guaranteed to be inside AuthProvider
  const ProtectedRoute = ({ children, requiredAcl }) => {
    const { isAuthenticated, initializing } = useAuth();
    const user = useUserAuth();
    const { canAccess } = usePermissions();

    // Wait for AuthContext to finish initializing (restoring auth from localStorage)
    // This prevents race conditions where API calls happen before auth is restored
    if (initializing || user.initializing) {
      return null; // Show nothing while auth is being restored
    }

    // A portal USER in the console: the same ACL model as an account, applied
    // strictly — the screen's key must be granted; a screen with no key is an
    // account's. (usePermissions reads whichever session is active.)
    if (!isAuthenticated && user.isAuthenticated) {
      return canUserEnterRoute(requiredAcl, canAccess) ? children : <Layout><NoAccess /></Layout>;
    }

    // After initialization is complete, check if user is authenticated
    // AuthContext handles all token validation using JWT exp claim
    if (!isAuthenticated) return <Navigate to={lastLoginPath()} replace />;

    // ACL route protection: block access if user lacks read/index/list permission.
    // Bounce to /account, which carries no requiredAcl — sending a denial to an
    // ACL-guarded route (as /live -> /reports did) loops forever for a user who
    // lacks that ACL.
    if (requiredAcl && !canAccess(requiredAcl)) {
      return <Navigate to="/account" replace />;
    }

    return children;
  };

  return (
    <Router>
      <Suspense fallback={<Layout><PageLoader /></Layout>}>
      <Routes>
        {/* Separate sign-in doors; authenticated sessions use one console. */}
        <Route path="/" element={<Root loginMode="user" />} />
        <Route path="/admin" element={<Root loginMode="account" />} />
        <Route path="/login" element={<Navigate to="/admin" replace />} />
        {/* Live answers "what is my team doing right now". An account watches
            the environment it picks; a user their own. Same key as its
            sidebar item, for both sessions. */}
        <Route
          path="/live"
          element={
            <ProtectedRoute requiredAcl="reports">
              <Layout>
                <LiveDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* The user portal is gone; its old paths land on the console's. */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/my-calls" element={<Navigate to="/calls" replace />} />
        <Route path="/my-dids" element={<Navigate to="/routes" replace />} />

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
          path="/routes/list"
          element={
            <ProtectedRoute requiredAcl="routes">
              <Layout>
                <DIDs />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* Per-route edit deep link — editing happens on the visual routing
            flow (React Flow canvas), so forward to it. The old /dids and
            /routing paths are gone, not redirected: the screen is Routes. */}
        <Route path="/routes/:id" element={<DIDEditRedirect />} />
        {/* Gated on `routes` in whichever session is live. (The API aliases
            `routes` to the stored `dids` key in both directions, so either
            spelling resolves — see voipappz-api #18.) */}
        <Route
          path="/routes"
          element={
            <ProtectedRoute requiredAcl="routes">
              <Layout>
                <RoutingScreen />
              </Layout>
            </ProtectedRoute>
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
        {/* Removed portal addresses and every unknown address land at the
            shared session root, which selects the first permitted screen. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </Router>
  );
}

function App() {
  return (
    <ErrorBoundary>
      {/* modeStorageKey/defaultMode match ThemeContext, so MUI's own mode
          state boots in step with the app's `data-theme` (ThemeContext keeps
          them in step afterwards through useColorScheme). */}
      <MuiThemeProvider theme={muiTheme} modeStorageKey="theme-preference" defaultMode="light" disableTransitionOnChange>
        <ThemeProvider>
          {/* One confirmation dialog for the whole app (useConfirm). */}
          <ConfirmProvider>
          <QueryProvider>
            <AuthProvider>
              <UserAuthProvider>
              {/* Mounted above the Router so SIP registration and any active
                  call survive page navigation — see SoftphoneContext.jsx. */}
              <SoftphoneProvider>
                <NotificationProvider>
                  <CustomerEnvironmentProvider>
                    <TourProvider>
                      <AppContent />
                      <TourOverlay />
                    </TourProvider>
                  </CustomerEnvironmentProvider>
                </NotificationProvider>
              </SoftphoneProvider>
              </UserAuthProvider>
            </AuthProvider>
          </QueryProvider>
          </ConfirmProvider>
        </ThemeProvider>
      </MuiThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
