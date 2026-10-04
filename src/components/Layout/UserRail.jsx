// UserRail — the portal user's navigation: an icon rail with labels, and an
// account button at the bottom.
//
// Deliberately NOT the admin Sidebar: that one carries the
// customer/environment switcher, admin nav groups, health dot, devzone and
// tickets — none of which a customer should see. A small purpose-built rail
// is simpler than parameterising that one down.
import { useState } from 'react';
import {
  Avatar, Box, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PhoneIcon from '@mui/icons-material/Phone';
import HistoryIcon from '@mui/icons-material/History';
import SensorsIcon from '@mui/icons-material/Sensors';
import DialpadIcon from '@mui/icons-material/Dialpad';
import LogoutIcon from '@mui/icons-material/Logout';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useLocation, useNavigate } from 'react-router';
import { useUserAuth } from '../../context/UserAuthContext';
import { useAIChatSidebar } from '../../context/AIChatSidebarContext';
import { useThemeMode } from '../../context/ThemeContext';
import { canAccessScreen } from '../../utils/jwt';
import CopyableEmail from '../common/CopyableEmail/CopyableEmail.jsx';
import ResponsiveRail, { RailItem, RailSpacer, RAIL_WIDTH } from '../common/ResponsiveRail/ResponsiveRail.jsx';

// Re-exported only to keep this module's public surface unchanged. Nothing
// imports it (and nothing ever has — it has been unused since the initial
// commit); ResponsiveRail is where the value now lives.
export { RAIL_WIDTH };

export default function UserRail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, acl } = useUserAuth();
  const { isDarkMode, toggleTheme } = useThemeMode();
  const { openAIDrawer } = useAIChatSidebar() || {};
  const [accountAnchor, setAccountAnchor] = useState(null);

  const name = user?.name || user?.fullname || user?.email || 'Account';
  const initial = (String(name).trim()[0] || 'U').toUpperCase();
  const dashboardAllowed = canAccessScreen(acl, 'dashboard');

  return (
    <ResponsiveRail ariaLabel="Portal navigation" testId="user-rail">
      {dashboardAllowed && <RailItem
        testId="rail-dashboard"
        icon={<DashboardIcon />}
        label="Dashboard"
        active={location.pathname === '/'}
        onClick={() => navigate('/')}
      />}
      {/* Live sits between the board and the history: the board is what you
          configure, Calls is what already happened, and this is what is
          happening right now. */}
      {dashboardAllowed && <RailItem
        testId="rail-live"
        icon={<SensorsIcon />}
        label="Live"
        active={location.pathname === '/live'}
        onClick={() => navigate('/live')}
      />}
      <RailItem
        testId="rail-calls"
        icon={<HistoryIcon />}
        label="Calls"
        active={location.pathname === '/my-calls' || (!dashboardAllowed && location.pathname === '/')}
        onClick={() => navigate('/my-calls')}
      />
      {/* Numbers is not ACL-gated, like the other navigation items here. It
          was gated on canAccessScreen(acl, 'dids') and portal users' ACLs
          don't carry a dids entry, so the item never appeared. The route guard
          is relaxed to match (see DualProtectedRoute in App.jsx) — the two must
          agree, or the link leads somewhere that bounces you straight back. */}
      <RailItem
        testId="rail-dids"
        icon={<DialpadIcon />}
        label="Numbers"
        active={location.pathname === '/my-dids' || location.pathname === '/routing'}
        onClick={() => navigate('/my-dids')}
      />
      {/* Opens the assistant over the current screen rather than navigating,
          so a question about what is on screen keeps that screen in view. */}
      {openAIDrawer && (
        <RailItem
          testId="rail-assistant"
          icon={<AutoAwesomeIcon />}
          label="Assistant"
          active={false}
          onClick={openAIDrawer}
        />
      )}
      {/* The phone's trigger moved to the bottom right (PhoneFab). It was the
          only item here that did not navigate — it toggles a panel that opens
          on the opposite side of the screen — so it now sits where the dock
          actually appears. Its registration dot moved with it. */}

      <RailSpacer />
      <Divider flexItem sx={{ mb: 1, display: { xs: 'none', md: 'block' } }} />

      {/* Theme toggle as its own rail item, above the avatar — the slot the
          original app used (a lone moon in the rail's bottom section), so a
          user coming from it finds it where their hand already goes. The
          choice is persisted by ThemeContext, nothing extra here. */}
      <Box sx={{ width: '100%', display: { xs: 'none', md: 'block' } }}>
        <RailItem
          icon={isDarkMode ? <LightModeIcon /> : <DarkModeIcon />}
          label={isDarkMode ? 'Light' : 'Dark'}
          active={false}
          onClick={toggleTheme}
          testId="rail-theme-toggle"
        />
      </Box>

      <Tooltip title={name} placement="right">
        <Avatar
          onClick={(e) => setAccountAnchor(e.currentTarget)}
          data-testid="rail-account"
          sx={{
            width: { xs: 34, md: 38 }, height: { xs: 34, md: 38 },
            flexShrink: 0, bgcolor: 'primary.main', fontSize: '0.95rem', cursor: 'pointer',
            mx: { xs: 1, md: 0 }, mb: { xs: 0, md: 1 }
          }}
        >
          {initial}
        </Avatar>
      </Tooltip>

      <Menu
        anchorEl={accountAnchor}
        open={Boolean(accountAnchor)}
        onClose={() => setAccountAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { minWidth: 240 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography sx={{ fontWeight: 700 }} noWrap>{user?.name || user?.fullname || 'Signed in'}</Typography>
          {user?.email && <Typography variant="body2" color="text.secondary" noWrap><CopyableEmail email={user.email} /></Typography>}
        </Box>
        <Divider />
        <MenuItem
          onClick={() => { setAccountAnchor(null); logout(); }}
          data-testid="rail-logout"
        >
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Sign out" />
        </MenuItem>
      </Menu>
    </ResponsiveRail>
  );
}
