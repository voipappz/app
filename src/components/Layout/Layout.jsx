import { Box, Dialog, Typography, Snackbar, Button, IconButton, useMediaQuery } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useLayout } from './Layout';
import { useLocation } from 'react-router';
import Sidebar from '../Sidebar/Sidebar.jsx';
import AdminMobileNav from '../Sidebar/AdminMobileNav.jsx';
import TopBar from '../TopBar/TopBar.jsx';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';
import PortalHeader from './PortalHeader.jsx';
import { usePortalPreferences } from '../../context/PortalPreferencesContext';
import PhoneDock, { PHONE_DOCK_WIDTH, loadPhonePinned } from '../Phone/PhoneDock.jsx';
import PhoneFab, { PHONE_FAB_CLEARANCE } from '../Phone/PhoneFab.jsx';
import { GlobalSearchProvider } from '../../context/GlobalSearchContext';
import { RecentPagesProvider } from '../../context/RecentPagesContext';
import { AIChatSidebarProvider, useAIChatSidebar } from '../../context/AIChatSidebarContext';
import { loadCustomerData, applyCustomerBranding, getCustomerData } from '../../services/customerService';
import { useVersionCheck } from '../../hooks/useVersionCheck';
import useIdleTimeout from '../../hooks/useIdleTimeout';
import { useThemeMode } from '../../context/ThemeContext';
import WebRTCPanel from '../Users/UserDialog/WebRTCPanel';
import { useZendeskWidget } from '../../services/zendeskWidget';
import './Layout.css';

const PortalMcpAssistant = lazy(() => import('../AIChat/PortalMcpAssistant.jsx'));

// Build version shown in the footer. Prefer the CI build stamp
// (VITE_APP_VERSION = YYYY.MM.DD-<short-sha>, set by the build step in .github/workflows/ci.yml),
// fall back to the package.json version, then "dev" for local `npm run dev`.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || __APP_VERSION__ || 'dev';

/** Direct user-authenticated MCP tools modal. */
const AIChatModal = () => {
  const { aiDrawerOpen, closeAIDrawer, toggleAIDrawer } = useAIChatSidebar();
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down('md'));

  // Cmd/Ctrl+Shift+A to toggle AI chat
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        toggleAIDrawer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleAIDrawer]);

  return (
    <Dialog
      open={aiDrawerOpen}
      onClose={closeAIDrawer}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      keepMounted
      PaperProps={{
        sx: {
          height: { xs: '100dvh', md: '70vh' },
          maxHeight: '700px',
          backgroundColor: 'var(--theme-bg-primary)',
          border: '1px solid var(--theme-border)',
          borderRadius: { xs: 0, md: '12px' },
          display: 'flex',
          flexDirection: 'column',
        }
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 0.5, borderBottom: '1px solid var(--theme-border)' }}>
        <IconButton onClick={closeAIDrawer} size="small">
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <Suspense fallback={<Box sx={{ p: 3, textAlign: 'center', color: 'var(--theme-text-secondary)' }}>Loading...</Box>}>
          <PortalMcpAssistant />
        </Suspense>
      </Box>
    </Dialog>
  );
};
// Both served from this deployment's own public/images. The white one used to be
// hardcoded to https://cloud.voipappz.io:9443 — so every install, MTN included,
// fetched its logo from voipappz's cloud host, and lost its logo entirely if that
// host was unreachable. The asset was in public/images the whole time.
const LOGO_DARK = '/images/VA_logo_dark.png';
const LOGO_WHITE = '/images/VA_logo_white.png';

const Layout = ({ children }) => {
  useLayout();
  const location = useLocation();
  const { isAuthenticated, logout, user, customerUuid } = useAuth();
  const userAuth = useUserAuth();
  const portalPreferences = usePortalPreferences();
  const { isDarkMode } = useThemeMode();
  // `/login` still matches for a moment while it redirects to `/admin`.
  // `/` is BOTH the portal's login and, once signed in, the portal itself
  // (App.jsx's PortalRoot). Only treat it as a login page while there is no
  // portal session — otherwise the dashboard renders bare, with no rail and
  // no phone dock.
  const isLoginPage = ['/admin', '/login'].includes(location.pathname)
    || (location.pathname === '/' && !userAuth.isAuthenticated);
  // A signed-in portal user (not an admin) gets a minimal shell below — the
  // admin sidebar/topbar/WebRTCPanel are all admin-console concepts a portal
  // user has no business seeing.
  const isUserOnlySession = userAuth.isAuthenticated && !isAuthenticated;
  // Zendesk support widget (answer bot + "Get in touch" tickets) — admin
  // console only; the portal's corner belongs to the phone FAB.
  useZendeskWidget(isAuthenticated && !isLoginPage, user, customerUuid);
  const customerDataLoadedRef = useRef(false);
  const { updateAvailable, refresh, dismiss } = useVersionCheck();

  // Security: idle session timeout (default 30 min; VITE_IDLE_TIMEOUT_MINUTES).
  // Warns 1 minute before logging out; any activity keeps the session alive.
  const { warningOpen: idleWarningOpen, staySignedIn } = useIdleTimeout({
    enabled: isAuthenticated && !isLoginPage,
    onTimeout: logout,
  });

  // Load and apply customer branding when authenticated (once)
  useEffect(() => {
    if (isAuthenticated && !isLoginPage) {
      // Use cached data if available (prevents double fetch)
      const cached = getCustomerData();
      if (cached) {
        applyCustomerBranding(cached);
        customerDataLoadedRef.current = true;
        return;
      }
      // Only fetch from API if not already loaded this session
      if (!customerDataLoadedRef.current) {
        customerDataLoadedRef.current = true;
        loadCustomerData().then((data) => {
          if (data) applyCustomerBranding(data);
        });
      }
    }
    // Reset ref on logout so next login fetches fresh data
    if (!isAuthenticated) {
      customerDataLoadedRef.current = false;
    }
  }, [isAuthenticated, isLoginPage]);

  // Portal-user phone dock — open/closed plus a "stick it open" pin that
  // survives reloads (the legacy portal's behaviour).
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phonePinned, setPhonePinned] = useState(loadPhonePinned);
  const effectivePhonePinned = isUserOnlySession ? portalPreferences.preferences.phone_pinned === 'true' : phonePinned;
  const handleTogglePhonePin = () => {
    if (isUserOnlySession) {
      portalPreferences.save({ phone_pinned: String(!effectivePhonePinned) });
      return;
    }
    setPhonePinned((prev) => {
      const next = !prev;
      try { localStorage.setItem('sip-phone-pinned', next ? '1' : '0'); } catch { /* storage disabled */ }
      return next;
    });
  };

  // Sidebar state — desktop collapse only. The phone has no sidebar to toggle
  // any more: AdminMobileNav is a persistent bottom bar, so the hamburger is a
  // desktop affordance and does nothing below md.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Desktop: compact icon rail (default) vs labeled rail, toggled by the
  // sidebar-top hamburger and remembered across sessions.
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try { return localStorage.getItem('nimbus_sidebar_expanded') === 'true'; } catch { return false; }
  });
  const isMobile = useMediaQuery((t) => t.breakpoints.down('md'));
  const handleToggleSidebar = () => {
    if (isMobile) return; // nothing to collapse; the bottom bar is always there
    setSidebarCollapsed(collapsed => !collapsed);
  };
  const handleToggleExpand = () => {
    setSidebarExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem('nimbus_sidebar_expanded', String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <Box className="layout-container" data-testid="layout-container">
      {isLoginPage ? (
        // Login page — self-contained split layout inside Login component
        <Box data-testid="login-layout">
          {children}
        </Box>
      ) : isUserOnlySession ? (
        // Portal user, not an admin: slim rail + page content, with the phone
        // docked on the right (see UserRail.jsx / PhoneDock.jsx). No admin
        // sidebar/topbar — the dashboard is the center of this surface.
        // The assistant is here too: it used to exist only in the admin shell
        // below, so a portal user had neither the modal nor its shortcut.
        //
        // GlobalSearchProvider is mounted here too (not just on the admin
        // branch): screens shared with the portal — DIDs — register their
        // filter segments through it, and useGlobalSearch() THROWS without a
        // provider. It's a self-contained filter store, nothing admin-specific.
        // Nested in the same order as the admin shell below.
        <GlobalSearchProvider>
        <AIChatSidebarProvider>
        <Box data-testid="user-layout" sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <PortalHeader />
          {portalPreferences.error && <Box role="alert" sx={{ p: 1, color: 'error.main' }}>{portalPreferences.error}</Box>}
          <Box
            component="main"
            sx={{
              flex: 1,
              minWidth: 0,
              // A pinned dock is persistent (no backdrop), so the content has
              // to actually make room for it instead of sliding underneath.
              mr: { xs: 0, sm: phoneOpen && effectivePhonePinned ? `${PHONE_DOCK_WIDTH}px` : 0 },
              // The FAB floats over the bottom-right corner, and every screen
              // on this surface ends in a table — without this the last row
              // sits underneath it and cannot be clicked.
              pb: `${PHONE_FAB_CLEARANCE}px`,
              transition: 'margin-right 0.2s ease'
            }}
          >
            {/* A local Suspense boundary. Without it, any lazy chunk this
                subtree pulls in (the phone panel's, a route's) suspends all
                the way up to App.jsx's boundary, whose fallback is ANOTHER
                <Layout> — so the shell was torn down and rebuilt, and
                `phoneOpen` went with it. Opening the dock closed it again
                ~300ms later. */}
            <Suspense fallback={null}>{children}</Suspense>
          </Box>
          <PhoneDock
            open={phoneOpen}
            onClose={() => setPhoneOpen(false)}
            pinned={effectivePhonePinned}
            onTogglePin={handleTogglePhonePin}
          />
          <PhoneFab open={phoneOpen} onToggle={() => setPhoneOpen((open) => !open)} />
        </Box>
        <AIChatModal />
        </AIChatSidebarProvider>
        </GlobalSearchProvider>
      ) : (
        // Authenticated layout: Sidebar + TopBar + Content
        <GlobalSearchProvider>
          <RecentPagesProvider>
          <Box data-testid="authenticated-layout" data-tour="welcome">
            {/* Fixed sidebar — hidden on mobile, shown via the drawer */}
            <Box className="sidebar-desktop">
              <Sidebar collapsed={sidebarCollapsed} expanded={sidebarExpanded} onToggleExpand={handleToggleExpand} onToggleSidebar={handleToggleSidebar} />
            </Box>

            {/* Phone/tablet navigation: a bottom tab bar plus a "More" sheet.
                This replaced a temporary Drawer whose paper was the 80px icon
                width while the Sidebar inside it rendered `expanded` at 210px,
                so every label was clipped off — the console's mobile nav was
                unlabelled icons behind a hamburger. Same ResponsiveRail the
                portal uses. */}
            <AdminMobileNav />

            {/* TopBar — fixed at top, offset by the sidebar */}
            <TopBar
              sidebarCollapsed={sidebarCollapsed}
              sidebarExpanded={sidebarExpanded}
              onToggleSidebar={handleToggleSidebar}
              onToggleExpand={handleToggleExpand}
            />

            {/* Main content area */}
            <Box className={`content-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${sidebarExpanded ? 'sidebar-expanded' : ''}`} data-testid="main-content">
              <Box sx={{ flex: '1 1 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {children}
              </Box>
              <Box className="app-footer">
                <Typography className="app-footer-text" variant="caption" data-testid="app-version">
                  v{APP_VERSION}
                </Typography>
              </Box>
              {/* Brand watermark — pinned bottom-right of the content area so it's
                  always visible (not at the end of scroll). */}
              <img
                className="app-watermark"
                src={isDarkMode ? LOGO_WHITE : LOGO_DARK}
                alt="VoipAppz"
              />
            </Box>
          </Box>
          <WebRTCPanel />
          </RecentPagesProvider>
        </GlobalSearchProvider>
      )}

      {/* Version update notification */}
      <Snackbar
        open={updateAvailable}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message="A new version is available"
        action={
          <>
            <Button color="inherit" size="small" onClick={dismiss}>
              Later
            </Button>
            <Button color="primary" variant="contained" size="small" onClick={refresh} sx={{ ml: 1 }}>
              Refresh
            </Button>
          </>
        }
      />

      {/* Idle-timeout warning — 1 minute before automatic sign-out */}
      <Snackbar
        open={idleWarningOpen}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        message="You'll be signed out in 1 minute due to inactivity"
        action={
          <Button color="primary" variant="contained" size="small" onClick={staySignedIn}>
            Stay signed in
          </Button>
        }
      />
    </Box>
  );
};

export default Layout;
