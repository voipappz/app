import { Box, Typography, Button, IconButton } from '@mui/material';
import { useLayout } from './Layout';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import MainMenu from '../MainMenu/MainMenu.jsx';
import LoginLeft from '../LoginLeft/LoginLeft.jsx';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import { APP_THEME } from '../../theme/appTheme';
import LanguageSelector from '../common/LanguageSelector';
import SystemHealth from '../common/SystemHealth';
import PhoneWidget from '../Phone/PhoneWidget';
import { useFireberry } from '../../context/FireberryContext';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import './Layout.css';

const Layout = ({ children }) => {
  useLayout();
  const location = useLocation();
  const { t } = useTranslation();
  const isLoginPage = location.pathname === '/login';
  const { user, logout } = useAuth();
  const { toast } = useFireberry();
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

  // Version is baked at build time via VITE_APP_VERSION (see config/deploy.yml).
  // In dev (no env var set) we fall back to "dev" so something always renders.
  const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';

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
        <Box data-testid="authenticated-layout">
          {/* Global Header */}
          <Box
            component="header"
            sx={{
              backgroundColor: APP_THEME.header.backgroundColor,
              color: APP_THEME.header.color,
              height: APP_THEME.header.height,
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              borderBottom: '1px solid #e5e7eb',
              position: 'fixed',
              top: 0,
              insetInlineEnd: 0,
              zIndex: 1200,
              // Full width — nav now lives in this top bar, no sidebar offset.
              width: '100%'
            }}
          >
            <Box
              sx={{
                mx: 'auto',
                px: { xs: 2, sm: 3, lg: 4 },
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              {/* Left side - Hamburger (mobile only) + Title and Role */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {/* Hamburger Menu - Mobile Only */}
                <IconButton
                  color="inherit"
                  edge="start"
                  onClick={handleDrawerToggle}
                  sx={{
                    display: { xs: 'block', md: 'none' }
                  }}
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
                {/* Primary navigation — in the top bar (desktop); mobile uses the
                    hamburger drawer. MainMenu renders the inline nav on desktop and
                    the slide-out drawer on mobile. */}
                <MainMenu
                  mobileDrawerOpen={mobileDrawerOpen}
                  onDrawerToggle={handleDrawerToggle}
                />
              </Box>

              {/* Right side - User info, Language and Logout */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: { xs: 1, sm: 2 }
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ display: { xs: 'none', sm: 'block' } }}
                >
                  {t('header.greeting', { name: user?.name })}
                </Typography>
                <IconButton
                  size="small"
                  title="Test Fireberry Toast"
                  onClick={() => toast.show({ content: 'Fireberry toast is working!', toastType: 'success', autoDismissTimeout: 4000 })}
                  sx={{ color: '#475569' }}
                >
                  <NotificationsActiveIcon fontSize="small" />
                </IconButton>
                <SystemHealth />
                <PhoneWidget />
                <LanguageSelector />
                <Button
                  variant="text"
                  size="small"
                  onClick={logout}
                  startIcon={<LogoutIcon />}
                  sx={{
                    color: '#475569',
                    fontWeight: 600,
                    '&:hover': {
                      backgroundColor: 'rgba(0, 173, 180, 0.08)',
                      color: '#00838A'
                    }
                  }}
                >
                  {t('header.logout')}
                </Button>
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
