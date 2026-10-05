import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LogoutIcon from '@mui/icons-material/Logout';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import PhoneIcon from '@mui/icons-material/Phone';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import GroupsIcon from '@mui/icons-material/Groups';
import DialpadIcon from '@mui/icons-material/Dialpad';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import CampaignIcon from '@mui/icons-material/Campaign';
import RouteIcon from '@mui/icons-material/Route';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { getPermittedNavItems } from '../../config/navConfig';
import { useRecentPages } from '../../context/RecentPagesContext';
import { useAuth } from '../../context/AuthContext';
import { useUserAuth } from '../../context/UserAuthContext';
import { useIsUserSession } from '../../hooks/useIsUserSession';
import { useThemeMode } from '../../context/ThemeContext';
import { apiService } from '../../services/apiService';
import { readRecentObjects } from '../../utils/recentObjects';
import { timeAgo, splitMatch } from '../../utils/searchText';
import { usePortalSidebar } from '../../context/PortalSidebarContext';
import { useCallNumber } from '../../hooks/useCallNumber';
import { askMcpAssistant } from '../../services/mcpAssistant';
import { buildQuickActions } from './quickActions';

export { timeAgo, splitMatch };

// The "brain" of the global search (Algolia-Autocomplete-style): one hook that
// builds the grouped results (Quick actions · Recent · Navigation · Resources ·
// Actions), handles debounced async resource search, Ask's answer, and keyboard
// navigation. Rendered by the CommandPalette dialog (⌘K / openResourceFinder).

export const RESOURCE_TYPES = [
  { key: 'calls',         label: 'Call',         endpoint: '/api/calls',         route: '/calls',      nameField: 'caller', subtitleField: 'callee', icon: PhoneInTalkIcon, searchParam: 'search[inline]', carryQuery: true },
  { key: 'extensions',    label: 'Device',       endpoint: '/api/devices',    route: '/extensions', nameField: 'name', subtitleField: 'username',  icon: PhoneIcon },
  { key: 'queues',        label: 'Queue',        endpoint: '/api/queues',        route: null,          nameField: 'name', subtitleField: 'strategy',  icon: GroupsIcon },
  { key: 'dids',          label: 'Route',          endpoint: '/api/routes',          route: '/routes/list',       nameField: 'number', subtitleField: 'name',    icon: DialpadIcon },
  { key: 'ivrs',          label: 'IVR',          endpoint: '/api/ivrs',          route: null,          nameField: 'name', subtitleField: null,         icon: AccountTreeIcon },
  { key: 'conferences',   label: 'Conference',   endpoint: '/api/conferences',   route: null,          nameField: 'name', subtitleField: 'status',    icon: MeetingRoomIcon },
  { key: 'announcements', label: 'Announcement', endpoint: '/api/announcements', route: null,          nameField: 'name', subtitleField: null,         icon: CampaignIcon },
  { key: 'vmls',          label: 'Dialplan',     endpoint: '/api/vmls',          route: null,          nameField: 'name', subtitleField: null,         icon: RouteIcon },
  { key: 'bots',          label: 'Bot',          endpoint: '/api/bots',          route: '/bots',       nameField: 'name', subtitleField: null,         icon: SmartToyIcon },
  { key: 'users',         label: 'User',         endpoint: '/api/users',         route: '/users',      nameField: 'name', subtitleField: 'email',     icon: PersonIcon },
];

// Top 5 chips shown by default, rest behind "+N more"
export const PRIMARY_CHIP_COUNT = 5;

// Open a user's edit modal from anywhere: the Users screen consumes the pending
// key on mount (cross-screen) and the event when already mounted (same screen).
const openUserEditorEverywhere = (navigate, obj) => {
  try {
    sessionStorage.setItem('nimbus_pending_user_edit', JSON.stringify({ uuid: obj.uuid, name: obj.name }));
  } catch { /* non-fatal */ }
  window.dispatchEvent(new CustomEvent('nimbus:openUserEditor', { detail: { uuid: obj.uuid, name: obj.name } }));
  navigate(obj.path || '/users');
};

const OBJECT_ICONS = { user: EditOutlinedIcon };

export function useGlobalSearchResults({ open, initialQuery = '', onClose }) {
  const navigate = useNavigate();
  const account = useAuth();
  const userAuth = useUserAuth();
  // A portal USER in the console: navigation filtered strictly by their ACL,
  // no resource search (those endpoints are an account's), their own sign-out.
  const userSession = useIsUserSession();
  const acl = userSession ? userAuth.acl : account.acl;
  const logout = userSession ? userAuth.logout : account.logout;
  const { isDarkMode, toggleTheme } = useThemeMode();
  const { recentPages } = useRecentPages();
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [resourceType, setResourceType] = useState(null); // null = all types
  const [resourceResults, setResourceResults] = useState({});
  const [resourceLoading, setResourceLoading] = useState(false);
  const [showAllChips, setShowAllChips] = useState(false);
  const [recentObjects, setRecentObjects] = useState([]);
  const debounceRef = useRef(null);
  // Ask's answer, shown in the results in place: { question, pending } | { question, text }.
  const [answer, setAnswer] = useState(null);
  const { open: openSidebar } = usePortalSidebar();
  const callNumber = useCallNumber();

  // Reset state when opened; seed from initialQuery (e.g. escalated text).
  useEffect(() => {
    if (open) {
      setQuery(initialQuery || '');
      setHighlightIndex(0);
      setResourceType(null);
      setResourceResults({});
      setResourceLoading(false);
      setShowAllChips(false);
      setRecentObjects(userSession ? [] : readRecentObjects());
      setAnswer(null);
    }
  }, [open, initialQuery, userSession]);

  // A new question starts from the typed text; the old answer is for other words.
  useEffect(() => { setAnswer(null); }, [query]);

  const ask = useCallback(async (question) => {
    setAnswer({ question, pending: true });
    const { text } = await askMcpAssistant(apiService.getToken(), question);
    // A second question asked while this one was in flight wins.
    setAnswer((current) => (current?.question === question ? { question, text } : current));
  }, []);

  // Debounced resource search
  const searchResources = useCallback(async (searchQuery, typeFilter) => {
    if (searchQuery.trim().length < 2) {
      setResourceResults({});
      setResourceLoading(false);
      return;
    }
    setResourceLoading(true);
    const typesToSearch = typeFilter
      ? RESOURCE_TYPES.filter(t => t.key === typeFilter)
      : RESOURCE_TYPES;
    try {
      const promises = typesToSearch.map(async (rt) => {
        try {
          const sp = rt.searchParam || 'search[name]';
          const url = `${rt.endpoint}?${sp}=${encodeURIComponent(searchQuery.trim())}&per_page=5`;
          const response = await apiService.get(url, {}, 'searching resources', false);
          const data = Array.isArray(response) ? response : (response?.data || []);
          return { key: rt.key, data };
        } catch {
          return { key: rt.key, data: [] };
        }
      });
      const results = await Promise.all(promises);
      const resultsMap = {};
      results.forEach(({ key, data }) => {
        if (data.length > 0) resultsMap[key] = data;
      });
      setResourceResults(resultsMap);
    } catch {
      setResourceResults({});
    } finally {
      setResourceLoading(false);
    }
  }, []);

  // Trigger debounced search when query changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length >= 2 && !userSession) {
      setResourceLoading(true);
      debounceRef.current = setTimeout(() => {
        searchResources(query, resourceType);
      }, 300);
    } else {
      setResourceResults({});
      setResourceLoading(false);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, resourceType, searchResources, userSession]);

  // Build grouped results
  const groups = useMemo(() => {
    const lowerQuery = query.toLowerCase().trim();
    const result = [];

    // Quick actions — ask, call, the phone — ahead of everything else.
    const quick = buildQuickActions({
      query,
      phoneEnabled: !userSession,
      on: {
        ask,
        call: (n) => { callNumber(n); onClose(); },
        openPhone: () => { openSidebar('phone', { tab: 'dialpad' }); onClose(); },
      },
    });
    if (quick.length > 0) result.push({ label: 'Quick actions', items: quick });

    // Recent — screens you visited AND objects you edited, merged, newest
    // first, each with a visible "time ago" (browser-history style).
    const recentMerged = [
      ...recentObjects.map(o => ({
        id: `recent-obj-${o.uuid}`,
        label: o.name || o.uuid,
        description: o.type === 'user' ? 'User · edited' : o.type,
        timestamp: o.timestamp,
        timeLabel: timeAgo(o.timestamp),
        iconComponent: OBJECT_ICONS[o.type] || EditOutlinedIcon,
        action: () => { openUserEditorEverywhere(navigate, o); onClose(); },
      })),
      ...recentPages.map(p => ({
        id: `recent-${p.path}`,
        label: p.label,
        path: p.path,
        timestamp: p.timestamp,
        timeLabel: timeAgo(p.timestamp),
        iconComponent: p.iconComponent || AccessTimeIcon,
        action: () => { navigate(p.path); onClose(); },
      })),
    ]
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .filter(item => !lowerQuery || item.label.toLowerCase().includes(lowerQuery))
      .slice(0, 10);
    if (recentMerged.length > 0) {
      result.push({ label: 'Recent', items: recentMerged });
    }

    // Navigation
    const navItems = getPermittedNavItems(acl, { strict: userSession });
    const filteredNav = lowerQuery
      ? navItems.filter(item => item.text.toLowerCase().includes(lowerQuery) || item.path.toLowerCase().includes(lowerQuery))
      : navItems;
    if (filteredNav.length > 0) {
      result.push({
        label: 'Navigation',
        items: filteredNav.map(item => ({
          id: `nav-${item.path}`,
          label: item.text,
          path: item.path,
          iconComponent: item.iconComponent,
          action: () => { navigate(item.path); onClose(); },
        })),
      });
    }

    // Resource results (from API) — inserted between Navigation and Actions
    const resourceKeys = Object.keys(resourceResults);
    if (resourceKeys.length > 0) {
      resourceKeys.forEach(key => {
        const rt = RESOURCE_TYPES.find(t => t.key === key);
        if (!rt) return;
        const items = resourceResults[key];
        result.push({
          label: `${rt.label}s (${items.length})`,
          isResource: true,
          items: items.map(item => {
            const id = item.uuid || item.id;
            const primaryText = item[rt.nameField] || '-';
            const secondaryText = rt.subtitleField ? item[rt.subtitleField] : null;
            const envName = item.environment?.name || '';
            return {
              id: `resource-${key}-${id}`,
              label: primaryText,
              description: typeof secondaryText === 'object' ? JSON.stringify(secondaryText) : secondaryText,
              badge: rt.label,
              envName,
              iconComponent: rt.icon,
              action: () => {
                // Users open straight into their edit modal; other types go to
                // their screen.
                if (rt.key === 'users' && id) {
                  openUserEditorEverywhere(navigate, { uuid: id, name: primaryText, path: '/users' });
                } else if (rt.route) {
                  // carryQuery: land on the screen with the same search applied.
                  navigate(rt.carryQuery
                    ? `${rt.route}?${new URLSearchParams({ [rt.searchParam]: query.trim() })}`
                    : rt.route);
                }
                onClose();
              },
            };
          }),
        });
      });
    }

    // Actions
    const actions = [
      {
        id: 'action-theme',
        label: isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        iconComponent: isDarkMode ? LightModeIcon : DarkModeIcon,
        action: () => { toggleTheme(); onClose(); },
      },
      {
        id: 'action-logout',
        label: 'Sign Out',
        iconComponent: LogoutIcon,
        action: () => { logout(); navigate(userSession ? '/' : '/admin'); onClose(); },
      },
    ];
    const filteredActions = lowerQuery
      ? actions.filter(a => a.label.toLowerCase().includes(lowerQuery))
      : actions;
    if (filteredActions.length > 0) {
      result.push({ label: 'Actions', items: filteredActions });
    }

    return result;
  }, [query, acl, userSession, recentPages, recentObjects, isDarkMode, resourceResults, navigate, onClose, logout, toggleTheme, ask, callNumber, openSidebar]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => groups.flatMap(g => g.items), [groups]);

  // Keyboard handling for the input (↑ ↓ Enter; Esc handled by the surface)
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[highlightIndex]) {
        flatItems[highlightIndex].action();
      }
    }
  }, [flatItems, highlightIndex]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [query, resourceResults]);

  return {
    query, setQuery,
    highlightIndex, setHighlightIndex,
    resourceType, setResourceType,
    resourceLoading,
    showAllChips, setShowAllChips,
    groups, flatItems,
    handleKeyDown,
    answer,
    resourceSearch: !userSession,
  };
}
