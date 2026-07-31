import {
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PhoneIcon from '@mui/icons-material/Phone';
import BarChartIcon from '@mui/icons-material/BarChart';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import TranslateIcon from '@mui/icons-material/Translate';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../../context/AuthContext';
import { useACL } from '../../hooks/useACL';
import { useDirection } from '../../context/DirectionContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import './MainMenu.css';
import { brand } from '../../config';

const MainMenu = ({ mobileDrawerOpen, onDrawerToggle }) => {
  const { t } = useTranslation();
  const { isAuthenticated, logout } = useAuth();
  const { can } = useACL();
  const { direction, toggleDirection } = useDirection();
  const { language, changeLanguage } = useAppTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  const close = () => mobileDrawerOpen && onDrawerToggle && onDrawerToggle();

  // Define all menu items with their required permissions
  const allMenuItems = [
    { icon: <DashboardIcon />, text: t('menu.dashboard'), path: '/dashboard', permission: 'dashboard:read' },
    { icon: <PhoneIcon />, text: t('menu.calls'), path: '/calls', permission: 'calls:read' },
    { icon: <BarChartIcon />, text: t('menu.reports'), path: '/reports', permission: 'reports:read' },
    { icon: <NotificationsActiveIcon />, text: t('menu.notifications', 'Notifications'), path: '/notifications', permission: 'dashboard:read' },
    { icon: <MonitorHeartIcon />, text: t('menu.status'), path: '/status', permission: 'dashboard:read' },
  ];

  // Filter menu items based on user permissions
  const menuItems = allMenuItems.filter(item => can(item.permission));

  // Shared styles so nav + options rows read consistently on the dark drawer.
  const rowSx = {
    borderRadius: 1.5, mx: 1, my: 0.25, color: 'rgba(255,255,255,0.85)',
    '& .MuiListItemIcon-root': { color: 'rgba(255,255,255,0.7)', minWidth: 40 },
    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
  };
  const activeSx = { bgcolor: 'rgba(47,111,237,0.10)', color: '#2f6fed', '& .MuiListItemIcon-root': { color: '#2f6fed' } };
  const sectionLabel = (text) => (
    <Typography sx={{ px: 2.5, pt: 1.5, pb: 0.5, fontSize: '0.66rem', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>{text}</Typography>
  );

  // Drawer content — nav + an Options section (language / direction) + logout.
  const drawerContent = (
    <Box className="mobile-drawer-content" sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box className="mobile-logo-container">
        <img src={brand.logo} alt={brand.name} width="50" height="50" />
      </Box>
      <List sx={{ flex: 1 }}>
        {menuItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItem key={item.path} disablePadding>
              <ListItemButton component={RouterLink} to={item.path} onClick={close} sx={{ ...rowSx, ...(active ? activeSx : {}) }}>
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
      {sectionLabel(t('menu.options', 'Options'))}
      <List>
        {/* Language toggle (he ⇄ en) */}
        <ListItem disablePadding>
          <ListItemButton onClick={() => changeLanguage(language === 'he' ? 'en' : 'he')} sx={rowSx}>
            <ListItemIcon><TranslateIcon /></ListItemIcon>
            <ListItemText
              primary={t('menu.language', 'Language')}
              secondary={language === 'he' ? 'עברית' : 'English'}
              secondaryTypographyProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
            />
          </ListItemButton>
        </ListItem>
        {/* Direction toggle (RTL ⇄ LTR) */}
        <ListItem disablePadding>
          <ListItemButton onClick={toggleDirection} sx={rowSx}>
            <ListItemIcon><SwapHorizIcon /></ListItemIcon>
            <ListItemText primary={direction === 'rtl' ? t('menu.switchToLTR', 'Left-to-right') : t('menu.switchToRTL', 'Right-to-left')} />
          </ListItemButton>
        </ListItem>
        {/* Logout */}
        <ListItem disablePadding>
          <ListItemButton onClick={() => { handleLogout(); close(); }} sx={rowSx}>
            <ListItemIcon><LogoutIcon /></ListItemIcon>
            <ListItemText primary={t('menu.logout')} />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  if (!isAuthenticated) return null;
  return (
    <>
      {/* Desktop icon rail follows the supplied live-dashboard reference. */}
      <Box component="nav" className="navigation-rail" data-testid="navigation-rail" aria-label={t('menu.navigation', 'Main navigation')}>
        <Box className="rail-items">
          {menuItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Tooltip key={item.path} title={item.text} placement="right">
                <ListItemButton
                  component={RouterLink}
                  to={item.path}
                  className={`rail-item${active ? ' active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Box className="rail-icon">{item.icon}</Box>
                  <Typography className="rail-label">{item.text}</Typography>
                </ListItemButton>
              </Tooltip>
            );
          })}
        </Box>
        <Box className="rail-utilities">
          <Tooltip title={t('menu.language', 'Language')} placement="right">
            <ListItemButton className="rail-item utility" onClick={() => changeLanguage(language === 'he' ? 'en' : 'he')}>
              <Box className="rail-icon"><TranslateIcon /></Box>
              <Typography className="rail-label">{language.toUpperCase()}</Typography>
            </ListItemButton>
          </Tooltip>
          <Tooltip title={t('menu.logout')} placement="right">
            <ListItemButton className="rail-item utility" onClick={handleLogout}>
              <Box className="rail-icon"><LogoutIcon /></Box>
              <Typography className="rail-label">{t('menu.logout')}</Typography>
            </ListItemButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Desktop: Sentry-style secondary panel beside the permanent rail. */}
      <Drawer
        variant="persistent"
        open={mobileDrawerOpen}
        anchor="left"
        className="desktop-navigation-drawer"
        PaperProps={{ 'data-testid': 'desktop-navigation-panel', sx: { backgroundColor: '#fff', color: '#0f172a', width: 220, left: 72, top: 64, height: 'calc(100% - 64px)', borderRight: '1px solid #e5e7eb' } }}
      >
        {drawerContent}
      </Drawer>

      {/* Mobile: the identical navigation model becomes a modal drawer. */}
      <Drawer
        variant="temporary"
        open={mobileDrawerOpen}
        onClose={onDrawerToggle}
        anchor="left"
        ModalProps={{ keepMounted: true }}
        className="mobile-drawer"
        PaperProps={{ sx: { backgroundColor: '#fff', color: '#0f172a', width: 260, borderRight: '1px solid #e5e7eb' } }}
      >
        {drawerContent}
      </Drawer>
    </>
  );
};

export default MainMenu;
