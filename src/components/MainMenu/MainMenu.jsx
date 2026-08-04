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
  MenuItem,
  Select,
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
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../../context/AuthContext';
import { useACL } from '../../hooks/useACL';
import { useDirection } from '../../context/DirectionContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import './MainMenu.css';
import { appVersion, brand } from '../../config';
import AccountMenu from './AccountMenu';

const MainMenu = ({ mobileDrawerOpen, onDrawerToggle }) => {
  const { t } = useTranslation();
  const { isAuthenticated, user, logout } = useAuth();
  const { can } = useACL();
  const { isDark, toggleMode } = useDirection();
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
  // Keyed to the email: the display name is often the extension ('9019'),
  // and a rail avatar reading '9' tells you nothing about who is signed in.
  const userInitial = ((user?.email || userName).trim()[0] || 'U').toUpperCase();
  const userEmail = user?.email || '';

  // Language picks the DIRECTION — Hebrew is RTL, English is LTR. There is no
  // separate RTL switch any more: direction is a consequence of the language,
  // not an independent thing to get out of sync with it (changeLanguage sets
  // both — see i18n/useAppTranslation).
  const LANGUAGES = [
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'he', label: 'עברית', short: 'עב' },
  ];

  const languageSelect = (compact) => (
    <Select
      value={LANGUAGES.some((l) => l.code === language) ? language : 'en'}
      onChange={(event) => changeLanguage(event.target.value)}
      variant="standard"
      disableUnderline
      data-testid={compact ? 'rail-language-select' : 'drawer-language-select'}
      inputProps={{ 'aria-label': t('menu.language', 'Language') }}
      renderValue={(value) => {
        const entry = LANGUAGES.find((l) => l.code === value) || LANGUAGES[0];
        return compact ? entry.short : entry.label;
      }}
      sx={compact
        ? { fontSize: '0.72rem', fontWeight: 700, '& .MuiSelect-select': { p: 0, pr: '14px !important', textAlign: 'center' } }
        : { fontSize: '0.9rem', width: '100%' }}
    >
      {LANGUAGES.map((l) => (
        <MenuItem key={l.code} value={l.code} data-testid={`language-option-${l.code}`}>{l.label}</MenuItem>
      ))}
    </Select>
  );

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
        {/* Language — and with it the direction. No separate RTL switch. */}
        <ListItem>
          <ListItemIcon><TranslateIcon /></ListItemIcon>
          <ListItemText
            primary={t('menu.language', 'Language')}
            secondary={languageSelect(false)}
            secondaryTypographyProps={{ component: 'div' }}
          />
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
          {/* Everything about "me" opens from here: details, language, system
              status and the way out. Status is in the popup rather than behind
              its own route — checking the stream is a glance, not a screen. */}
          <Tooltip title={userEmail || userName} placement="right">
            <ListItemButton
              className="rail-item utility rail-account"
              onClick={(event) => setAccountAnchor(event.currentTarget)}
              data-testid="rail-account"
              aria-haspopup="menu"
            >
              <Avatar sx={{ width: 34, height: 34, fontSize: '0.95rem', bgcolor: '#2f6fed' }}>{userInitial}</Avatar>
              {userEmail && (
                <Typography className="rail-label rail-email" title={userEmail} data-testid="rail-account-email">
                  {userEmail}
                </Typography>
              )}
            </ListItemButton>
          </Tooltip>

          {/* The build, under the account — where you look when asked "what are
              you running?", instead of floating over the far corner of a page. */}
          <Typography className="rail-version" data-testid="menu-app-version">v{appVersion}</Typography>
        </Box>
      </Box>

      <AccountMenu
        anchorEl={accountAnchor}
        open={Boolean(accountAnchor)}
        onClose={() => setAccountAnchor(null)}
        user={user}
        onLogout={() => { setAccountAnchor(null); handleLogout(); }}
      />

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
