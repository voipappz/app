import { Box, Typography, IconButton } from '@mui/material';
import { useLayout } from './Layout';
import { useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import MainMenu from '../MainMenu/MainMenu.jsx';
import LoginLeft from '../LoginLeft/LoginLeft.jsx';
import MenuIcon from '@mui/icons-material/Menu';
import { APP_THEME } from '../../theme/appTheme';
import SystemHealth from '../common/SystemHealth';
import PhoneWidget from '../Phone/PhoneWidget';
import ErrorBoundary from '../common/ErrorBoundary';
import { appVersion } from '../../config';
import './Layout.css';

const Layout = ({ children }) => {
  useLayout();
  const location = useLocation();
  const { t } = useTranslation();
  const isLoginPage = location.pathname === '/login';
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Header shows the current screen's name (per route), not a static product title.
  const SCREEN_KEY = {
    '/dashboard': 'menu.dashboard',
    '/calls': 'menu.calls',
    '/reports': 'menu.reports',
    '/notifications': 'menu.notifications',
    '/status': 'menu.status',
  };
  const screenKey = SCREEN_KEY[location.pathname];
  const screenTitle = screenKey ? t(screenKey) : t('header.title');

  const handleDrawerToggle = () => {
    setMobileDrawerOpen(!mobileDrawerOpen);
  };

  return (
    <Box className="layout-container" data-testid="layout-container" sx={{direction:'inherit'}}>
      <Box
        component="footer"
        data-testid="app-version"
        sx={{
          position: 'fixed',
          bottom: 4,
          insetInlineEnd: 8,
          fontSize: '0.7rem',
          color: 'text.secondary',
          opacity: 0.6,
          pointerEvents: 'none',
          zIndex: 1300,
          userSelect: 'none',
        }}
      >
        v{appVersion}
      </Box>
      {isLoginPage ? (
        // Login page layout with LoginLeft component
        <Box sx={{ display: 'flex', width: '100%', height: '100vh' }} data-testid="login-layout">
          <Box className="login-left-container" sx={{ width: '40%', minWidth: '320px' }}>
            <LoginLeft />
          </Box>
          <Box className="login-content-container" sx={{ flexGrow: 1 }} data-testid="login-content">
            {children}
          </Box>
        </Box>
      ) : (
        // Regular layout with MainMenu for authenticated pages
        <Box className="authenticated-layout" data-testid="authenticated-layout">
          {/* Global Header */}
          <Box
            component="header"
            sx={{
              // Theme-aware (follows light/dark palette mode).
              backgroundColor: 'background.paper',
              color: 'text.primary',
              height: APP_THEME.header.height,
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              borderBottom: '1px solid',
              borderColor: 'divider',
              position: 'fixed',
              top: 0,
              insetInlineEnd: 0,
              zIndex: 1200,
              // Full width — nav now lives in this top bar, no sidebar offset.
              width: '100%'
            }}
          >
            <Box
              dir="ltr"
              sx={{
                mx: 'auto',
                px: { xs: 2, sm: 3, lg: 4 },
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                // Force physical placement regardless of language: hamburger +
                // menu live on the LEFT, the phone lives on the RIGHT. The `dir`
                // attribute (not just sx) is needed to beat the RTL root.
              }}
            >
              {/* Left side - Hamburger (mobile drawer) + Title */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {/* Hamburger — mobile only. Desktop navigation is the permanent
                    icon rail; a second expandable panel would duplicate it. */}
                <IconButton
                  color="inherit"
                  edge="start"
                  onClick={handleDrawerToggle}
                  aria-label="open menu"
                  data-testid="menu-button"
                  sx={{ display: { xs: 'inline-flex', md: 'none' } }}
                >
                  <MenuIcon />
                </IconButton>

                <Typography
                  variant="h6"
                  component="h1"
                  sx={{
                    fontWeight: 600,
                    fontSize: { xs: '1rem', sm: '1.25rem' }
                  }}
                >
                  {screenTitle}
                </Typography>
                {/* Primary navigation — the permanent icon rail (desktop) or the
                    hamburger drawer (mobile). MainMenu renders both. */}
                <MainMenu
                  mobileDrawerOpen={mobileDrawerOpen}
                  onDrawerToggle={handleDrawerToggle}
                />
              </Box>

              {/* Right side — the phone lives here (menu/language/logout are in
                  the left drawer). Kept simple: health + the softphone. */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
                <SystemHealth />
                <ErrorBoundary label="phone-widget" fallback={null}>
                  <PhoneWidget />
                </ErrorBoundary>
              </Box>
            </Box>
          </Box>

          <Box className="content-container" data-testid="main-content">
            {children}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default Layout;
