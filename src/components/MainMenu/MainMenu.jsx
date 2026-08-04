import { useState } from 'react';
import {
  Avatar,
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItemAvatar,
  Menu,
  MenuItem,
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
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../../context/AuthContext';
import { useACL } from '../../hooks/useACL';
import { useDirection } from '../../context/DirectionContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import './MainMenu.css';
import { appVersion, brand } from '../../config';

const MainMenu = ({ mobileDrawerOpen, onDrawerToggle }) => {
  const { t } = useTranslation();
  const { isAuthenticated, user, logout } = useAuth();
  const { can } = useACL();
  const { direction, toggleDirection, isDark, toggleMode } = useDirection();
  const { language, changeLanguage } = useAppTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [accountAnchor, setAccountAnchor] = useState(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  const close = () => mobileDrawerOpen && onDrawerToggle && onDrawerToggle();
  const go = (event, path) => {
    event.preventDefault();
    navigate(path);
    close();
  };

  // Define all menu items with their required permissions. Status lives in the
  // rail's bottom utility cluster (with the bell), not the main list.
  const allMenuItems = [
    { icon: <DashboardIcon />, text: t('menu.dashboard'), path: '/dashboard', permission: 'dashboard:read' },
    { icon: <PhoneIcon />, text: t('menu.calls'), path: '/calls', permission: 'calls:read' },
    { icon: <BarChartIcon />, text: t('menu.reports'), path: '/reports', permission: 'reports:read' },
  ];

  // Filter menu items based on user permissions
  const menuItems = allMenuItems.filter(item => can(item.permission));
  const canSeeNotifications = can('dashboard:read');
  const canSeeStatus = can('dashboard:read');
  const modeLabel = isDark ? t('menu.lightMode', 'Light mode') : t('menu.darkMode', 'Dark mode');

  const userName = user?.name || user?.email || t('phone.guest', 'guest');
  const userInitial = (String(userName).trim()[0] || 'U').toUpperCase();

  // Mobile drawer — the same navigation model as the rail, in one list.
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
              <ListItemButton component={RouterLink} to={item.path} onClick={(event) => go(event, item.path)} selected={active}>
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          );
        })}
        {canSeeNotifications && (
          <ListItem disablePadding>
            <ListItemButton component={RouterLink} to="/notifications" onClick={(event) => go(event, '/notifications')} selected={location.pathname === '/notifications'}>
              <ListItemIcon><NotificationsActiveIcon /></ListItemIcon>
              <ListItemText primary={t('menu.notifications', 'Notifications')} />
            </ListItemButton>
          </ListItem>
        )}
        {canSeeStatus && (
          <ListItem disablePadding>
            <ListItemButton component={RouterLink} to="/status" onClick={(event) => go(event, '/status')} selected={location.pathname === '/status'}>
              <ListItemIcon><MonitorHeartIcon /></ListItemIcon>
              <ListItemText primary={t('menu.status')} />
            </ListItemButton>
          </ListItem>
        )}
      </List>

      <Divider />
      <List>
        <ListItem sx={{ py: 0.5 }}>
          <ListItemAvatar sx={{ minWidth: 44 }}>
            <Avatar sx={{ width: 32, height: 32, fontSize: '0.9rem', bgcolor: '#2f6fed' }}>{userInitial}</Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={userName}
            secondary={user?.email}
            primaryTypographyProps={{ noWrap: true, sx: { fontWeight: 600 } }}
            secondaryTypographyProps={{ noWrap: true }}
          />
        </ListItem>
        {/* Dark mode toggle */}
        <ListItem disablePadding>
          <ListItemButton onClick={toggleMode}>
            <ListItemIcon>{isDark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}</ListItemIcon>
            <ListItemText primary={modeLabel} />
          </ListItemButton>
        </ListItem>
        {/* Language toggle (he ⇄ en) */}
        <ListItem disablePadding>
          <ListItemButton onClick={() => changeLanguage(language === 'he' ? 'en' : 'he')}>
            <ListItemIcon><TranslateIcon /></ListItemIcon>
            <ListItemText primary={t('menu.language', 'Language')} secondary={language === 'he' ? 'עברית' : 'English'} />
          </ListItemButton>
        </ListItem>
        {/* Direction toggle (RTL ⇄ LTR) */}
        <ListItem disablePadding>
          <ListItemButton onClick={toggleDirection}>
            <ListItemIcon><SwapHorizIcon /></ListItemIcon>
            <ListItemText primary={direction === 'rtl' ? t('menu.switchToLTR', 'Left-to-right') : t('menu.switchToRTL', 'Right-to-left')} />
          </ListItemButton>
        </ListItem>
        {/* Logout */}
        <ListItem disablePadding>
          <ListItemButton onClick={() => { handleLogout(); close(); }}>
            <ListItemIcon><LogoutIcon /></ListItemIcon>
            <ListItemText primary={t('menu.logout')} />
          </ListItemButton>
        </ListItem>
      </List>

      {/* Build version — sits under the logout row so "what am I running?" is
          answerable from the menu, which is where support asks for it. */}
      <Typography
        data-testid="menu-app-version"
        sx={{ px: 2.5, pt: 0.5, pb: 1.5, fontSize: '0.7rem', opacity: 0.6 }}
      >
        v{appVersion}
      </Typography>
    </Box>
  );

  if (!isAuthenticated) return null;
  return (
    <>
      {/* Desktop: the icon rail is THE navigation — no secondary panel. */}
      <Box component="nav" className="navigation-rail" data-testid="navigation-rail" aria-label={t('menu.navigation', 'Main navigation')}>
        <Box className="rail-items">
          {menuItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Tooltip key={item.path} title={item.text} placement="right">
                <ListItemButton
                  component={RouterLink}
                  to={item.path}
                  onClick={(event) => go(event, item.path)}
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
        {/* Bottom cluster (reference UX): dark mode, language, bell, status, avatar. */}
        <Box className="rail-utilities">
          <Tooltip title={modeLabel} placement="right">
            <ListItemButton className="rail-item utility" onClick={toggleMode} data-testid="rail-theme-toggle">
              <Box className="rail-icon">{isDark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}</Box>
            </ListItemButton>
          </Tooltip>
          <Tooltip title={t('menu.language', 'Language')} placement="right">
            <ListItemButton className="rail-item utility" onClick={() => changeLanguage(language === 'he' ? 'en' : 'he')}>
              <Box className="rail-icon"><TranslateIcon /></Box>
              <Typography className="rail-label">{language.toUpperCase()}</Typography>
            </ListItemButton>
          </Tooltip>
          {canSeeNotifications && (
            <Tooltip title={t('menu.notifications', 'Notifications')} placement="right">
              <ListItemButton
                component={RouterLink}
                to="/notifications"
                onClick={(event) => go(event, '/notifications')}
                className={`rail-item utility${location.pathname === '/notifications' ? ' active' : ''}`}
                aria-current={location.pathname === '/notifications' ? 'page' : undefined}
                data-testid="rail-notifications"
              >
                <Box className="rail-icon"><NotificationsActiveIcon /></Box>
              </ListItemButton>
            </Tooltip>
          )}
          {canSeeStatus && (
            <Tooltip title={t('menu.status')} placement="right">
              <ListItemButton
                component={RouterLink}
                to="/status"
                onClick={(event) => go(event, '/status')}
                className={`rail-item utility${location.pathname === '/status' ? ' active' : ''}`}
                aria-current={location.pathname === '/status' ? 'page' : undefined}
              >
                <Box className="rail-icon"><MonitorHeartIcon /></Box>
              </ListItemButton>
            </Tooltip>
          )}
          <Tooltip title={userName} placement="right">
            <ListItemButton
              className="rail-item utility rail-account"
              onClick={(event) => setAccountAnchor(event.currentTarget)}
              data-testid="rail-account"
              aria-haspopup="menu"
            >
              <Avatar sx={{ width: 34, height: 34, fontSize: '0.95rem', bgcolor: '#2f6fed' }}>{userInitial}</Avatar>
            </ListItemButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Account menu — profile summary + the drawer-only actions on desktop. */}
      <Menu
        anchorEl={accountAnchor}
        open={Boolean(accountAnchor)}
        onClose={() => setAccountAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ px: 2, py: 1, maxWidth: 240 }}>
          <Typography sx={{ fontWeight: 700 }} noWrap>{userName}</Typography>
          {user?.email && <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>}
        </Box>
        <Divider />
        <MenuItem onClick={() => { toggleDirection(); setAccountAnchor(null); }}>
          <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
          {direction === 'rtl' ? t('menu.switchToLTR', 'Left-to-right') : t('menu.switchToRTL', 'Right-to-left')}
        </MenuItem>
        <MenuItem data-testid="account-logout" onClick={() => { setAccountAnchor(null); handleLogout(); }}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          {t('menu.logout')}
        </MenuItem>
      </Menu>

      {/* Mobile: the identical navigation model becomes a modal drawer. */}
      <Drawer
        variant="temporary"
        open={mobileDrawerOpen}
        onClose={onDrawerToggle}
        anchor="left"
        ModalProps={{ keepMounted: true }}
        className="mobile-drawer"
        PaperProps={{ 'data-testid': 'mobile-navigation-panel', sx: { backgroundColor: 'background.paper', color: 'text.primary', width: 260, borderInlineEnd: '1px solid', borderColor: 'divider' } }}
      >
        {drawerContent}
      </Drawer>
    </>
  );
};

export default MainMenu;
