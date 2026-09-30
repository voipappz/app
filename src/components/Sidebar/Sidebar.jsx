import { useNavigate, useLocation } from 'react-router';
import { useState } from 'react';
import {
  Avatar,
  Box,
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
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import CodeIcon from '@mui/icons-material/Code';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useIsUserSession } from '../../hooks/useIsUserSession';
import { getPermittedNavItems } from '../../config/navConfig';
import useNavBadges from '../../hooks/useNavBadges';
import './Sidebar.css';
import SidebarCustomerSwitcher from './CustomerSwitcher/SidebarCustomerSwitcher.jsx';


const Sidebar = ({ collapsed, onNavigate }) => {
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
  const { isDarkMode, toggleTheme } = useThemeMode();
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const [supportMenuAnchor, setSupportMenuAnchor] = useState(null);

  const accountName = user?.fullName || user?.firstName || user?.email?.split('@')[0] || 'Account';


  // The utility icons relocated from the removed top bar. They dispatch the same
  // window events the (still-mounted) TopBar listens for to open its modals.
  // The Wizard moved into the customer/environment box; Notifications moved to
  // the Monitoring page's right rail; neither is repeated here.
  const dispatch = (name, detail) => window.dispatchEvent(detail !== undefined ? new CustomEvent(name, { detail }) : new Event(name));

  const badges = useNavBadges(!userSession);            // live nav counts (account only)

  const menuItems = getPermittedNavItems(acl, { strict: userSession });     // day-to-day (top)
  // The account's profile opens the account dialog; a user's opens this menu.
  const openProfile = (e) => (userSession
    ? setUserMenuAnchor(e.currentTarget)
    : window.dispatchEvent(new Event('openAccountDialog')));
  const isActive = (path) => location.pathname === path;

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
    return (
      <ListItem key={item.path || index} disablePadding className="sidebar-nav-item">
          <ListItemButton
            onClick={() => handleNavigate(item.path)}
            aria-label={item.text}
            aria-current={isActive(item.path) ? 'page' : undefined}
            className={`sidebar-nav-button ${isActive(item.path) ? 'active' : ''}`}
          >
            <ListItemIcon className="sidebar-nav-icon" sx={{ minWidth: 'auto', justifyContent: 'center', position: 'relative' }}>
              <IconComp />
              {badge && (
                <Box component="span" sx={{
                  position: 'absolute', top: -3, right: 2, minWidth: 14, height: 14, px: 0.4,
                  borderRadius: '7px', backgroundColor: badge.color, color: '#fff',
                  fontSize: '0.58rem', fontWeight: 700, lineHeight: '14px', textAlign: 'center',
                }}>
                  {badge.count > 99 ? '99+' : badge.count}
                </Box>
              )}
            </ListItemIcon>
            <span className="sidebar-nav-text">{item.text}</span>
          </ListItemButton>
      </ListItem>
    );
  };

  return (
    <Box className={`sidebar-container ${collapsed ? 'collapsed' : ''}`}>

      {/* The customer — an account's only. A user has one environment and no
          selectors. */}
      {!userSession && (
        <Box className="sidebar-top">
          <SidebarCustomerSwitcher />
        </Box>
      )}

      {/* Day-to-day navigation — flat list, no groups */}
      <List className="sidebar-nav-list">
        {menuItems.map(renderNavItem)}
      </List>

      {!userSession && (
        <List disablePadding>
            <ListItem disablePadding className="sidebar-nav-item">
              <ListItemButton
                id="sidebar-support-button"
                className={`sidebar-nav-button ${['/mcp', '/devzone'].includes(location.pathname) ? 'active' : ''}`}
                aria-label="Support"
                aria-haspopup="menu"
                aria-expanded={Boolean(supportMenuAnchor)}
                aria-controls={supportMenuAnchor ? 'sidebar-support-menu' : undefined}
                onClick={(event) => setSupportMenuAnchor(event.currentTarget)}
              >
                <ListItemIcon className="sidebar-nav-icon"><SupportAgentIcon /></ListItemIcon>
                <span className="sidebar-nav-text">Support</span>
              </ListItemButton>
            </ListItem>
          <Menu
            id="sidebar-support-menu"
            anchorEl={supportMenuAnchor}
            open={Boolean(supportMenuAnchor)}
            onClose={() => setSupportMenuAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            MenuListProps={{ 'aria-labelledby': 'sidebar-support-button' }}
          >
            <MenuItem selected={isActive('/mcp')} onClick={() => { setSupportMenuAnchor(null); handleNavigate('/mcp'); }}>
              <ListItemIcon><HubOutlinedIcon fontSize="small" /></ListItemIcon>MCP
            </MenuItem>
            <MenuItem selected={isActive('/devzone')} onClick={() => { setSupportMenuAnchor(null); handleNavigate('/devzone'); }}>
              <ListItemIcon><CodeIcon fontSize="small" /></ListItemIcon>DevZone
            </MenuItem>
            <MenuItem
              component="a"
              href="https://voipappz.zendesk.com/hc/en-us"
              target="_blank"
              rel="noopener noreferrer"
              data-tour="help-button"
              onClick={() => { setSupportMenuAnchor(null); onNavigate?.(); }}
            >
              <ListItemIcon><HelpOutlineIcon fontSize="small" /></ListItemIcon>Documentation
            </MenuItem>
            <MenuItem onClick={() => { setSupportMenuAnchor(null); dispatch('openTicketsModal'); onNavigate?.(); }}>
              <ListItemIcon><ConfirmationNumberIcon fontSize="small" /></ListItemIcon>Tickets
            </MenuItem>
          </Menu>
        </List>
      )}

      {/* Bottom tools, followed by the account row. */}
      {/* None of these has an ACL key: account-console tools, not a user's. */}
      {userSession ? <Box sx={{ mt: 'auto' }} /> : (
      <Box className="sidebar-bottom-tools" sx={{ mt: 'auto' }}>
      </Box>
      )}

      {/* Account — pinned at the bottom: the avatar, named in its tooltip. */}
      <Box className="sidebar-profile-section">
        <Tooltip
          placement="right"
          arrow
          title={
            <Box sx={{ textAlign: 'center', py: 0.25 }}>
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
            aria-label="Edit account"
          >
            <Avatar className="sidebar-profile-avatar">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </Avatar>
          </IconButton>
        </Tooltip>
      </Box>

      {/* A user's profile menu: appearance and sign out (the account dialog
          is an account's). */}
      <Menu
        anchorEl={userMenuAnchor} open={Boolean(userMenuAnchor)} onClose={() => setUserMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <MenuItem onClick={() => { toggleTheme(); setUserMenuAnchor(null); }} data-testid="user-menu-theme">
          {isDarkMode ? 'Light mode' : 'Dark mode'}
        </MenuItem>
        <MenuItem onClick={() => { setUserMenuAnchor(null); userAuth.logout(); navigate('/'); }} data-testid="user-menu-sign-out">
          Sign out
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default Sidebar;
