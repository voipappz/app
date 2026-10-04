import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CodeIcon from '@mui/icons-material/Code';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import SettingsIcon from '@mui/icons-material/Settings';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MenuIcon from '@mui/icons-material/Menu';
import CircleIcon from '@mui/icons-material/Circle';
import useApiHealth from '../../hooks/useApiHealth';
import useGatusHealth from '../../hooks/useGatusHealth';
import { useAuth } from '../../context/AuthContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { getPermittedNavItems, getPermittedTopbarItems } from '../../config/navConfig';
import useNavBadges from '../../hooks/useNavBadges';
import './Sidebar.css';
import CopyableEmail from '../common/CopyableEmail/CopyableEmail.jsx';

// First letter of the customer name for the switcher avatar (mirrors the
// account avatar at the bottom). Falls back to a neutral glyph.
const customerInitial = (name) => (name?.trim()?.[0] || '🏢').toUpperCase();

const Sidebar = ({ collapsed, expanded = false, onNavigate, onToggleExpand, onToggleSidebar }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { acl, user } = useAuth();
  const { selectedCustomer } = useCustomerEnvironment();
  const isMobile = useMediaQuery((t) => t.breakpoints.down('md'));
  // ── Health, as one colour ────────────────────────────────────────────────
  // Two sources, because neither alone tells the truth:
  //   useApiHealth   the app plane — DB / Redis / NATS, from GET /health
  //   useGatusHealth the node probes — SIP, media, metrics, host
  // Both are module-level singletons with a shared timer, so subscribing here
  // costs nothing beyond what the TopBar pill already polls.
  const { checks: apiChecks, isHealthy: apiHealthy, loading: apiLoading } = useApiHealth();
  const { summary: gatusSummary, loading: gatusLoading } = useGatusHealth();

  const { healthColor, healthLabel, healthTooltip } = useMemo(() => {
    if (apiLoading && gatusLoading) {
      return { healthColor: 'var(--color-neutral)', healthLabel: 'checking', healthTooltip: 'Status — checking…' };
    }

    // A check that reported false. NOT the same as "the endpoint said ok":
    // /health returns status "ok" while NATS is down, because only DB and Redis
    // are treated as essential. That silent case is the whole reason this is a
    // colour — a disconnected NATS is also why the Gatus panel goes blank.
    const failed = Object.entries(apiChecks || {})
      .filter(([, c]) => c && c.ok === false)
      .map(([name]) => name);

    const total = gatusSummary?.total || 0;
    const down = gatusSummary?.down || 0;

    // RED: an essential is down, or every node probe is failing.
    if (apiHealthy === false || (total > 0 && down === total)) {
      const why = apiHealthy === false ? 'API unhealthy' : 'all node probes down';
      return { healthColor: 'var(--color-danger)', healthLabel: 'down', healthTooltip: `Status — DOWN (${why})` };
    }

    // YELLOW: essentials fine, something else is not.
    if (failed.length > 0 || down > 0) {
      const parts = [];
      if (failed.length > 0) parts.push(failed.join(', '));
      if (down > 0) parts.push(`${down}/${total} probes down`);
      return {
        healthColor: 'var(--color-warning)',
        healthLabel: 'degraded',
        healthTooltip: `Status — DEGRADED (${parts.join('; ')})`,
      };
    }

    return { healthColor: 'var(--color-success)', healthLabel: 'healthy', healthTooltip: 'Status — all healthy' };
  }, [apiChecks, apiHealthy, apiLoading, gatusSummary, gatusLoading]);

  const accountName = user?.fullName || user?.firstName || user?.email?.split('@')[0] || 'Account';

  // The trigger shows the CUSTOMER (the box it opens picks customer → applications).
  // Full name in text (like the account row); it ellipsizes if long.
  const fullCustomerName = selectedCustomer?.name || 'Select customer…';
  const envLabel = fullCustomerName;
  const toggleSidebar = () => (isMobile ? onToggleSidebar?.() : (onToggleExpand || onToggleSidebar)?.());

  // The utility icons relocated from the removed top bar. They dispatch the same
  // window events the (still-mounted) TopBar listens for to open its modals.
  // The Wizard moved into the customer/environment box; Notifications moved to
  // the Monitoring page's right rail; neither is repeated here.
  const dispatch = (name, detail) => window.dispatchEvent(detail !== undefined ? new CustomEvent(name, { detail }) : new Event(name));
  // Opens the topbar's combined customer+environment box, anchored to this button.
  const openEnvSelector = (e) => window.dispatchEvent(new CustomEvent('openEnvSelector', { detail: e.currentTarget }));

  const badges = useNavBadges();                        // live nav counts (calls/events)

  const menuItems = getPermittedNavItems(acl);          // day-to-day (top)
  const adminItems = getPermittedTopbarItems(acl);      // professional/admin (pinned bottom)
  const isActive = (path) => location.pathname === path;

  // Navigate, then let the host (e.g. mobile drawer) close itself. The event lets
  // a screen react to its own nav being clicked (e.g. close an open edit doc).
  const handleNavigate = (path) => {
    navigate(path);
    window.dispatchEvent(new CustomEvent('nimbus:sidebarNavigate', { detail: path }));
    onNavigate?.();
  };

  // Live count badge per nav item — the sidebar doubles as a status board:
  // Calls shows active calls (purple), Events shows criticals last 24h (red).
  const navBadge = (path) => {
    if (path === '/calls' && badges.liveCalls > 0) return { count: badges.liveCalls, color: '#8b5cf6' };
    if (path === '/events' && badges.criticalEvents > 0) return { count: badges.criticalEvents, color: '#ef4444' };
    return null;
  };

  const renderNavItem = (item, index) => {
    const IconComp = item.iconComponent;
    const badge = navBadge(item.path);
    // defaultValue keeps a key that is missing from a locale file rendering as
    // English rather than as `nav:whatever`.
    const label = item.labelKey ? t(item.labelKey, { defaultValue: item.text }) : item.text;
    return (
      <Tooltip key={item.path || index} title={label} placement="right" arrow disableHoverListener={expanded}>
        <ListItem disablePadding className="sidebar-nav-item">
          <ListItemButton
            onClick={() => handleNavigate(item.path)}
            className={`sidebar-nav-button ${isActive(item.path) ? 'active' : ''}`}
          >
            <ListItemIcon className="sidebar-nav-icon" sx={{ minWidth: 'auto', justifyContent: 'center', position: 'relative' }}>
              <IconComp />
              {badge && !expanded && (
                <Box component="span" sx={{
                  position: 'absolute', top: -4, right: -6, minWidth: 14, height: 14, px: 0.4,
                  borderRadius: '7px', backgroundColor: badge.color, color: '#fff',
                  fontSize: '0.58rem', fontWeight: 700, lineHeight: '14px', textAlign: 'center',
                }}>
                  {badge.count > 99 ? '99+' : badge.count}
                </Box>
              )}
            </ListItemIcon>
            <span className="sidebar-nav-text">{label}</span>
            {badge && expanded && (
              <Box component="span" sx={{
                ml: 'auto', minWidth: 18, height: 16, px: 0.6, borderRadius: '8px',
                backgroundColor: badge.color, color: '#fff', fontSize: '0.62rem',
                fontWeight: 700, lineHeight: '16px', textAlign: 'center',
              }}>
                {badge.count > 99 ? '99+' : badge.count}
              </Box>
            )}
          </ListItemButton>
        </ListItem>
      </Tooltip>
    );
  };

  return (
    <Box className={`sidebar-container ${collapsed ? 'collapsed' : ''} ${expanded ? 'expanded' : ''}`}>
      {/* Top row — hamburger + the customer selector (short name; opens the
          combined customer/application box). Hamburger sits left of the name. */}
      <Box className="sidebar-top" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        <Tooltip title="Toggle menu" placement="right" arrow>
          <IconButton className="sidebar-hamburger" onClick={toggleSidebar} size="small" aria-label="Toggle menu">
            <MenuIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={fullCustomerName} placement="right" arrow disableHoverListener={expanded}>
          <ListItemButton className="sidebar-env-trigger" onClick={openEnvSelector} aria-label="Customer and application" sx={{ flex: 1, minWidth: 0 }}>
            <Avatar className="sidebar-env-avatar">{customerInitial(selectedCustomer?.name)}</Avatar>
            <span className="sidebar-nav-text" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, fontSize: '0.82rem' }}>{envLabel}</span>
            <KeyboardArrowDownIcon className="sidebar-nav-text" sx={{ fontSize: 16, opacity: 0.5 }} />
          </ListItemButton>
        </Tooltip>
      </Box>

      {/* Day-to-day navigation — flat list, no groups */}
      <List className="sidebar-nav-list">
        {menuItems.map(renderNavItem)}
      </List>

      {/* Professional / admin screens — flow right after the day-to-day items */}
      {adminItems.length > 0 && (
        <Box className="sidebar-admin-section">
          <List disablePadding>
            {adminItems.map(renderNavItem)}
          </List>
        </Box>
      )}

      {/* Bottom tools — a trimmed utility cluster: Monitoring, then theme/help/
          devzone/MCP/settings/tickets, then the account row. Wizard moved into the customer
          box; Notifications moved to the Monitoring right rail. Events/Syslog
          live under Logs. */}
      <Box className="sidebar-bottom-tools" sx={{ mt: 'auto' }}>
        {/* Health — a COLOUR, not an icon. This was a plain Timeline glyph, so
            the one thing an operator wants at a glance ("is anything wrong?")
            required navigating away to find out. It now carries the state:

              green   everything reporting healthy
              yellow  DEGRADED — the essentials are fine but something is not.
                      This is the case that used to be invisible: the API's
                      /health returns status "ok" whenever DB and Redis are up,
                      even with NATS disconnected — and NATS being down is
                      exactly what makes the Gatus panel vanish, because the
                      admin fetches it over that same client.
              red     an essential is down (DB/Redis), or every Gatus probe fails
              grey    still loading, or health not reachable at all

            Both hooks are module-level singletons, so reading them here adds no
            polling — it subscribes to the timers the TopBar pill already runs. */}
        <Tooltip title={healthTooltip} placement="right" arrow>
          <IconButton
            className="sidebar-tool-button"
            onClick={() => navigate('/monitoring')}
            onContextMenu={(e) => { e.preventDefault(); dispatch('openHealthDialog'); }}
            aria-label={`Status — ${healthLabel}`}
          >
            <CircleIcon sx={{ fontSize: 14, color: healthColor }} />
          </IconButton>
        </Tooltip>
        {/* Dark-mode toggle now lives only in the account menu (next to Sign
            Out) — removed the duplicate sidebar button. */}
        <Box className="sidebar-tool-divider" />
        <Tooltip title="Help Center" placement="right" arrow>
          <IconButton
            className="sidebar-tool-button"
            component="a"
            href="https://voipappz.zendesk.com/hc/en-us"
            target="_blank"
            data-tour="help-button"
            aria-label="Help Center"
          >
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="API DevZone" placement="right" arrow>
          <IconButton
            className="sidebar-tool-button"
            onClick={() => handleNavigate('/devzone')}
            aria-label="API DevZone"
          >
            <CodeIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="MCP" placement="right" arrow>
          <IconButton
            className="sidebar-tool-button"
            onClick={() => handleNavigate('/mcp')}
            aria-label="MCP"
          >
            <HubOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings" placement="right" arrow>
          <IconButton
            className="sidebar-tool-button"
            onClick={() => handleNavigate('/settings')}
            aria-label="Settings"
          >
            <SettingsIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Tickets" placement="right" arrow>
          <IconButton
            className="sidebar-tool-button"
            onClick={() => window.dispatchEvent(new Event('openTicketsModal'))}
            aria-label="Tickets"
          >
            <ConfirmationNumberIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Account — pinned at the bottom. Expanded: a full profile row
          (avatar + name + email); collapsed rail: just the avatar. */}
      <Box className={`sidebar-profile-section ${expanded ? 'expanded' : ''}`}>
        {expanded ? (
          <Box
            className="sidebar-profile-row"
            onClick={() => window.dispatchEvent(new Event('openAccountDialog'))}
            role="button"
            aria-label="Account"
          >
            <Avatar className="sidebar-profile-avatar">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </Avatar>
            <Box className="sidebar-profile-meta">
              <Typography className="sidebar-profile-name" noWrap>{accountName}</Typography>
              {user?.email && <Typography className="sidebar-profile-email" noWrap><CopyableEmail email={user.email} /></Typography>}
            </Box>
            <KeyboardArrowUpIcon className="sidebar-profile-chev" />
          </Box>
        ) : (
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
              onClick={() => window.dispatchEvent(new Event('openAccountDialog'))}
              aria-label="Edit account"
            >
              <Avatar className="sidebar-profile-avatar">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </Avatar>
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

export default Sidebar;
