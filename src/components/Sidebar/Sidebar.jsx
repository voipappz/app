import { useNavigate, useLocation } from 'react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import {
  Avatar,
  Badge,
  Box,
  Divider,
  IconButton,
  List,
  Menu,
  MenuItem,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Tooltip,
  Typography,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import LogoutIcon from '@mui/icons-material/Logout';
import LanguageIcon from '@mui/icons-material/Language';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useIsUserSession } from '../../hooks/useIsUserSession';
import { getPermittedNavItems, navLabel } from '../../config/navConfig';
import { useLocale } from '../../i18n/LocaleContext';
import useNavBadges from '../../hooks/useNavBadges';
import './Sidebar.css';
import SidebarCustomerSwitcher from './CustomerSwitcher/SidebarCustomerSwitcher.jsx';


// `wide`: the phone drawer, with each label beside its icon instead of under it.
const Sidebar = ({ collapsed, onNavigate, wide = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const account = useAuth();
  const userAuth = useUserAuth();
  // A portal USER signs in to this same console. Same ACL model as an account:
  // the same items, filtered strictly by the user's ACL; nothing without a key.
  const userSession = useIsUserSession();
  const acl = userSession ? userAuth.acl : account.acl;
  const user = userSession
    ? { email: userAuth.user?.email, fullName: userAuth.user?.fullname || userAuth.user?.name }
    : account.user;
  const { t } = useTranslation();
  const { isDarkMode, toggleTheme } = useThemeMode();
  const { language, setLanguage } = useLocale();
  const otherLanguage = language === 'he' ? 'en' : 'he';
  const themeLabel = t(isDarkMode ? 'appearance.lightMode' : 'appearance.darkMode');
  // Menus open from the sidebar toward the page: rightwards in English,
  // leftwards in Hebrew, where the sidebar sits on the right.
  const isRtl = useTheme().direction === 'rtl';
  const towardPage = isRtl ? 'left' : 'right';
  const towardSidebar = isRtl ? 'right' : 'left';
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);

  const accountName = user?.fullName || user?.firstName || user?.email?.split('@')[0] || t('accountFallback');



  const badges = useNavBadges(!userSession);            // live nav counts (account only)

  const menuItems = getPermittedNavItems(acl, { strict: userSession });     // day-to-day (top)
  // The account's profile opens the account dialog; a user's opens this menu.
  const openProfile = (e) => (userSession
    ? setUserMenuAnchor(e.currentTarget)
    : window.dispatchEvent(new Event('openAccountDialog')));
  const isActive = (path) => location.pathname === path;
  // An entry can stand for more than one route (Logs: Calls and Messages).
  const isItemActive = (item) => isActive(item.path) || Boolean(item.alsoPaths?.includes(location.pathname));

  // Navigate, then let the host (e.g. mobile drawer) close itself. The event lets
  // a screen react to its own nav being clicked (e.g. close an open edit doc).
  const handleNavigate = (path) => {
    navigate(path);
    window.dispatchEvent(new CustomEvent('nimbus:sidebarNavigate', { detail: path }));
    onNavigate?.();
  };

  // Live count badge per nav item — the sidebar doubles as a status board:
  // Calls shows active calls (purple), Events shows criticals last 24h (red),
  // Monitoring shows unread alerts (red with a critical among them, else amber).
  const navBadge = (path) => {
    if (path === '/calls' && badges.liveCalls > 0) return { count: badges.liveCalls, color: '#8b5cf6' };
    if (path === '/events' && badges.criticalEvents > 0) return { count: badges.criticalEvents, color: '#ef4444' };
    if (path === '/monitoring' && badges.openAlerts > 0) {
      return { count: badges.openAlerts, color: badges.criticalAlerts > 0 ? '#ef4444' : '#f59e0b' };
    }
    return null;
  };

  const renderNavItem = (item, index) => {
    const IconComp = item.iconComponent;
    const badge = navBadge(item.path);
    const label = navLabel(t, item);
    const count = badge ? (badge.count > 99 ? '99+' : badge.count) : null;
    const button = (
      <ListItemButton
        onClick={() => handleNavigate(item.path)}
        aria-label={label}
        aria-current={isItemActive(item) ? 'page' : undefined}
        className={`sidebar-nav-button ${isItemActive(item) ? 'active' : ''}`}
      >
        {/* Collapsed: the icon is the item (named in its tooltip). */}
        <ListItemIcon className="sidebar-nav-icon" sx={{ minWidth: 'auto', justifyContent: 'center', position: 'relative' }}>
          <IconComp />
          {badge && collapsed && (
            <Box component="span" sx={{
              position: 'absolute', top: -3, right: 2, minWidth: 14, height: 14, px: 0.4,
              borderRadius: '7px', backgroundColor: badge.color, color: '#fff',
              fontSize: '0.58rem', fontWeight: 700, lineHeight: '14px', textAlign: 'center',
            }}>
              {count}
            </Box>
          )}
        </ListItemIcon>
        {/* Open: the words are the item. */}
        <span className="sidebar-nav-text">{label}</span>
        {badge && !collapsed && (
          <Box component="span" className="sidebar-nav-badge" sx={{ backgroundColor: badge.color }}>{count}</Box>
        )}
      </ListItemButton>
    );
    return (
      <ListItem key={item.path || index} disablePadding className="sidebar-nav-item">
        {collapsed ? <Tooltip title={label} placement={towardPage}>{button}</Tooltip> : button}
      </ListItem>
    );
  };

  return (
    <Box className={`sidebar-container ${collapsed ? 'collapsed' : ''} ${wide ? 'sidebar-container--wide' : ''}`}>

      {/* The customer — an account's only. A user has one environment and no
          selectors. */}
      {!userSession && (
        <Box className="sidebar-top">
          <SidebarCustomerSwitcher expanded={!collapsed} />
        </Box>
      )}

      {/* Day-to-day navigation — flat list, no groups */}
      <List className="sidebar-nav-list">
        {menuItems.map(renderNavItem)}
      </List>

      {/* Language and light/dark mode, just above the account they belong
          to. Appearance is the viewer's, not a permission: both sessions get
          it. Open: a compact row; collapsed: stacked icons. Each is named in
          its tooltip, which opens toward the page. */}
      <Box
        className={`sidebar-bottom-tools ${collapsed && !wide ? 'sidebar-bottom-tools--stacked' : ''}`}
        sx={{ mt: 'auto' }}
        data-testid="sidebar-appearance"
      >
        {/* One click to the other language, named in that language. */}
        <Tooltip title={t(`languageName.${otherLanguage}`)} placement={towardPage}>
          <IconButton
            className="sidebar-tool-button"
            onClick={() => setLanguage(otherLanguage)}
            aria-label={t('appearance.switchLanguage')}
            data-testid="sidebar-language"
          >
            <LanguageIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={themeLabel} placement={towardPage}>
          <IconButton
            className="sidebar-tool-button"
            onClick={toggleTheme}
            aria-label={themeLabel}
            data-testid="sidebar-theme"
          >
            {isDarkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Account — pinned at the bottom: the avatar, named in its tooltip. */}
      <Box className="sidebar-profile-section">
        <Tooltip
          placement={towardPage}
          arrow
          title={
            <Box sx={{ textAlign: 'center', py: 0.25 }}>
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                {t(userSession ? 'signedInAs.user' : 'signedInAs.admin')}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>{accountName}</Typography>
              {user?.email && (
                <Typography variant="caption" sx={{ opacity: 0.85 }}>{user.email}</Typography>
              )}
            </Box>
          }
        >
          <IconButton
            className="sidebar-profile-button"
            onClick={openProfile}
            aria-label={t('shell.editAccount')}
          >
            {/* The avatar's colour, and the admin's shield, say which side is
                signed in (an account or a user). */}
            <Badge
              overlap="circular"
              anchorOrigin={{ vertical: 'bottom', horizontal: towardPage }}
              invisible={userSession}
              badgeContent={<ShieldIcon className="sidebar-profile-shield" />}
            >
              <Avatar
                className={`sidebar-profile-avatar ${userSession ? 'sidebar-profile-avatar--user' : 'sidebar-profile-avatar--admin'}`}
                data-testid="sidebar-profile-avatar"
              >
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </Avatar>
            </Badge>
          </IconButton>
        </Tooltip>
        {/* Open (and the phone drawer): who is signed in, beside the avatar -
            name, email, and which side. Collapsed: the avatar alone. */}
        {(wide || !collapsed) && (
          <Box className="sidebar-profile-text" data-testid="sidebar-profile-text">
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{accountName}</Typography>
            {user?.email && (
              <Typography variant="caption" color="text.secondary" noWrap>{user.email}</Typography>
            )}
            <Typography variant="caption" color="text.secondary" noWrap sx={{ opacity: 0.8 }}>
              {t(userSession ? 'signedInAs.user' : 'signedInAs.admin')}
            </Typography>
          </Box>
        )}
        {/* Sign out, in plain sight when the sidebar is open (it lived inside
            the account dialog / the user menu). */}
        {(wide || !collapsed) && (
          <Tooltip title={t('action.signOut')} placement={towardPage}>
            <IconButton
              data-testid="sidebar-sign-out"
              aria-label={t('action.signOut')}
              onClick={() => {
                if (userSession) { userAuth.logout(); navigate('/'); }
                else { account.logout?.(); navigate('/admin'); }
              }}
              sx={{ color: 'var(--theme-text-secondary)', flexShrink: 0 }}
            >
              <LogoutIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* A user's profile menu: who is signed in, and sign out (the account
          dialog is an account's). */}
      <Menu
        anchorEl={userMenuAnchor} open={Boolean(userMenuAnchor)} onClose={() => setUserMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: towardPage }} transformOrigin={{ vertical: 'bottom', horizontal: towardSidebar }}
      >
        <Box sx={{ px: 2, py: 1 }} data-testid="user-menu-identity">
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{t('signedInAs.user')}</Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{user?.email || accountName}</Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => { setUserMenuAnchor(null); userAuth.logout(); navigate('/'); }} data-testid="user-menu-sign-out">
          {t('action.signOut')}
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default Sidebar;
