import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
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
import BadgeIcon from '@mui/icons-material/Badge';
import MiscellaneousServicesIcon from '@mui/icons-material/MiscellaneousServices';
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
import { buildQuickActions } from './quickActions';

export { timeAgo, splitMatch };

// The "brain" of the global search (Algolia-Autocomplete-style): one hook that
// builds the grouped results — Quick actions · Calls · Devices · Users · Routes
// · Services · Accounts · other resources · Navigation · Recent · Actions —
// handles the debounced async resource search, the Ask hand-off to the
// assistant, and keyboard navigation (↑↓ ⏎ across groups, Tab across types).
// Rendered by the CommandPalette dialog (⌘K, `/`, or openResourceFinder).

// In display order. `labelKey` is the chip, the group header and the screen
// name in "See all N in <Screen>". `carryQuery` lands on the screen with the
// same search applied (Calls: /calls?search[inline]=q, read by useUrlSync).
// `accountOnly` endpoints exist for an account session only.
export const RESOURCE_TYPES = [
  { key: 'calls',         labelKey: 'nav:calls',                  endpoint: '/api/calls',         route: '/calls',       nameField: 'caller', subtitleField: 'callee',   icon: PhoneInTalkIcon, searchParam: 'search[inline]', carryQuery: true },
  { key: 'extensions',    labelKey: 'nav:devices',                endpoint: '/api/devices',       route: '/extensions',  nameField: 'name',   subtitleField: 'username', icon: PhoneIcon },
  { key: 'users',         labelKey: 'nav:users',                  endpoint: '/api/users',         route: '/users',       nameField: 'name',   subtitleField: 'email',    icon: PersonIcon },
  { key: 'dids',          labelKey: 'nav:routes',                 endpoint: '/api/routes',        route: '/routes/list', nameField: 'number', subtitleField: 'name',     icon: DialpadIcon },
  { key: 'services',      labelKey: 'nav:services',               endpoint: '/api/services',      route: '/services',    nameField: 'name',   subtitleField: 'type',     icon: MiscellaneousServicesIcon },
  { key: 'accounts',      labelKey: 'nav:accounts',               endpoint: '/api/accounts',      route: '/accounts',    nameField: 'name',   subtitleField: 'email',    icon: BadgeIcon, accountOnly: true },
  { key: 'queues',        labelKey: 'search:types.queues',        endpoint: '/api/queues',        route: null,           nameField: 'name',   subtitleField: 'strategy', icon: GroupsIcon },
  { key: 'ivrs',          labelKey: 'search:types.ivrs',          endpoint: '/api/ivrs',          route: null,           nameField: 'name',   subtitleField: null,       icon: AccountTreeIcon },
  { key: 'conferences',   labelKey: 'search:types.conferences',   endpoint: '/api/conferences',   route: null,           nameField: 'name',   subtitleField: 'status',   icon: MeetingRoomIcon },
  { key: 'announcements', labelKey: 'search:types.announcements', endpoint: '/api/announcements', route: null,           nameField: 'name',   subtitleField: null,       icon: CampaignIcon },
  { key: 'vmls',          labelKey: 'search:types.vmls',          endpoint: '/api/vmls',          route: null,           nameField: 'name',   subtitleField: null,       icon: RouteIcon },
  { key: 'bots',          labelKey: 'search:types.bots',          endpoint: '/api/bots',          route: '/bots',        nameField: 'name',   subtitleField: null,       icon: SmartToyIcon },
];

// Chips shown by default ([All] + these), the rest behind "+N more".
export const PRIMARY_CHIP_COUNT = 5;
// Rows per group; a resource group with more adds a "See all N in <Screen>" row.
export const MAX_PER_GROUP = 5;

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

// Where a resource type's screen is, with the query carried when it can be.
const screenPath = (rt, query) => (rt.carryQuery
  ? `${rt.route}?${new URLSearchParams({ [rt.searchParam]: query.trim() })}`
  : rt.route);

export function useGlobalSearchResults({ open, initialQuery = '', onClose }) {
  const { t } = useTranslation(['search', 'nav', 'common']);
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
  const [resourceResults, setResourceResults] = useState({}); // key -> { data, total }
  const [resourceLoading, setResourceLoading] = useState(false);
  const [showAllChips, setShowAllChips] = useState(false);
  const [recentObjects, setRecentObjects] = useState([]);
  const debounceRef = useRef(null);
  // The question handed to the assistant: the palette's body becomes AIChat
  // while this is set; `back` returns to the results.
  const [asking, setAsking] = useState(null);
  const { open: openSidebar } = usePortalSidebar();
  const callNumber = useCallNumber();

  const resourceSearch = !userSession;
  const types = useMemo(
    () => RESOURCE_TYPES.filter(rt => !rt.accountOnly || account.isAuthenticated),
    [account.isAuthenticated],
  );

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
      setAsking(null);
    }
  }, [open, initialQuery, userSession]);

  const ask = useCallback((question) => setAsking(question), []);
  const back = useCallback(() => setAsking(null), []);

  // Debounced resource search: a client-side fan-out, per_page=MAX_PER_GROUP
  // each; X-Total (when the endpoint sends it) is the N of "See all N".
  const searchResources = useCallback(async (searchQuery, typeFilter) => {
    if (searchQuery.trim().length < 2) {
      setResourceResults({});
      setResourceLoading(false);
      return;
    }
    setResourceLoading(true);
    const typesToSearch = typeFilter ? types.filter(rt => rt.key === typeFilter) : types;
    try {
      const promises = typesToSearch.map(async (rt) => {
        try {
          const sp = rt.searchParam || 'search[name]';
          const url = `${rt.endpoint}?${sp}=${encodeURIComponent(searchQuery.trim())}&per_page=${MAX_PER_GROUP}`;
          const response = await apiService.get(url, {}, 'searching resources', false);
          const data = Array.isArray(response) ? response : (response?.data || []);
          const total = Array.isArray(response) ? null : (Number.isFinite(response?.total) ? response.total : null);
          return { key: rt.key, data, total };
        } catch {
          return { key: rt.key, data: [], total: null };
        }
      });
      const results = await Promise.all(promises);
      const resultsMap = {};
      results.forEach(({ key, data, total }) => {
        if (data.length > 0) resultsMap[key] = { data, total };
      });
      setResourceResults(resultsMap);
    } catch {
      setResourceResults({});
    } finally {
      setResourceLoading(false);
    }
  }, [types]);

  // Trigger debounced search when query changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length >= 2 && resourceSearch) {
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
  }, [query, resourceType, searchResources, resourceSearch]);

  // Build grouped results
  const groups = useMemo(() => {
    const lowerQuery = query.toLowerCase().trim();
    const result = [];

    // Quick actions — ask, call, the phone — ahead of everything else.
    const quick = buildQuickActions({
      query,
      phoneEnabled: !userSession,
      labels: {
        ask: (q) => t('search:quick.ask', { query: q }),
        askHint: t('search:quick.askHint'),
        call: (q) => t('search:quick.call', { query: q }),
        callHint: t('search:quick.callHint'),
        phone: t('search:quick.phone'),
        phoneHint: t('search:quick.phoneHint'),
      },
      on: {
        ask,
        call: (n) => { callNumber(n); onClose(); },
        openPhone: () => { openSidebar('phone', { tab: 'dialpad' }); onClose(); },
      },
    });
    if (quick.length > 0) result.push({ id: 'quick', label: t('search:groups.quickActions'), items: quick });

    // Resource results (from the API), one group per type, in RESOURCE_TYPES
    // order, at most MAX_PER_GROUP rows plus a "See all N in <Screen>" row.
    types.forEach((rt) => {
      const found = resourceResults[rt.key];
      if (!found || found.data.length === 0) return;
      const screen = t(rt.labelKey);
      const items = found.data.slice(0, MAX_PER_GROUP).map(item => {
        const id = item.uuid || item.id;
        const primaryText = item[rt.nameField] || '-';
        const secondaryText = rt.subtitleField ? item[rt.subtitleField] : null;
        const envName = item.environment?.name || '';
        return {
          id: `resource-${rt.key}-${id}`,
          label: String(primaryText),
          description: typeof secondaryText === 'object' ? JSON.stringify(secondaryText) : secondaryText,
          envName,
          iconComponent: rt.icon,
          action: () => {
            // Users open straight into their edit modal; other types go to
            // their screen, with the search carried when the screen reads it.
            if (rt.key === 'users' && id) {
              openUserEditorEverywhere(navigate, { uuid: id, name: primaryText, path: '/users' });
            } else if (rt.route) {
              navigate(screenPath(rt, query));
            }
            onClose();
          },
        };
      });
      const total = found.total ?? found.data.length;
      if (rt.route && (total > items.length || found.data.length > MAX_PER_GROUP)) {
        items.push({
          id: `resource-${rt.key}-more`,
          isFooter: true,
          label: found.total != null
            ? t('search:seeAll', { count: total, screen })
            : t('search:seeAllUncounted', { screen }),
          action: () => { navigate(screenPath(rt, query)); onClose(); },
        });
      }
      result.push({ id: `resource-${rt.key}`, label: screen, isResource: true, items });
    });

    // Navigation — the whole list when browsing, the best MAX_PER_GROUP when typing.
    const navItems = getPermittedNavItems(acl, { strict: userSession });
    const filteredNav = lowerQuery
      ? navItems.filter(item => item.text.toLowerCase().includes(lowerQuery) || item.path.toLowerCase().includes(lowerQuery)).slice(0, MAX_PER_GROUP)
      : navItems;
    if (filteredNav.length > 0) {
      result.push({
        id: 'navigation',
        label: t('search:groups.navigation'),
        items: filteredNav.map(item => ({
          id: `nav-${item.path}`,
          label: item.labelKey ? t(item.labelKey, { defaultValue: item.text }) : item.text,
          path: item.path,
          iconComponent: item.iconComponent,
          action: () => { navigate(item.path); onClose(); },
        })),
      });
    }

    // Recent — screens you visited AND objects you edited, merged, newest
    // first, each with a visible "time ago" (browser-history style).
    const recentMerged = [
      ...recentObjects.map(o => ({
        id: `recent-obj-${o.uuid}`,
        label: o.name || o.uuid,
        description: o.type === 'user' ? t('search:recentEditedUser') : o.type,
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
      .slice(0, MAX_PER_GROUP);
    if (recentMerged.length > 0) {
      result.push({ id: 'recent', label: t('search:groups.recent'), items: recentMerged });
    }

    // Actions
    const actions = [
      {
        id: 'action-theme',
        label: isDarkMode ? t('common:appearance.lightMode') : t('common:appearance.darkMode'),
        iconComponent: isDarkMode ? LightModeIcon : DarkModeIcon,
        action: () => { toggleTheme(); onClose(); },
      },
      {
        id: 'action-logout',
        label: t('common:action.signOut'),
        iconComponent: LogoutIcon,
        action: () => { logout(); navigate(userSession ? '/' : '/admin'); onClose(); },
      },
    ];
    const filteredActions = lowerQuery
      ? actions.filter(a => a.label.toLowerCase().includes(lowerQuery))
      : actions;
    if (filteredActions.length > 0) {
      result.push({ id: 'actions', label: t('search:groups.actions'), items: filteredActions });
    }

    return result;
  }, [t, query, acl, userSession, types, recentPages, recentObjects, isDarkMode, resourceResults, navigate, onClose, logout, toggleTheme, ask, callNumber, openSidebar]);

  // Flat list for keyboard navigation (footer rows included: Enter opens them)
  const flatItems = useMemo(() => groups.flatMap(g => g.items), [groups]);

  // Tab / Shift+Tab cycle the type chips: All → first type → … → All.
  const cycleType = useCallback((direction) => {
    const order = [null, ...types.map(rt => rt.key)];
    const current = order.indexOf(resourceType);
    const next = order[(current + direction + order.length) % order.length];
    if (next && order.indexOf(next) > PRIMARY_CHIP_COUNT) setShowAllChips(true);
    setResourceType(next);
  }, [types, resourceType]);

  // Keyboard handling for the input (↑ ↓ Enter Tab; Esc handled by the dialog)
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
    } else if (e.key === 'Tab' && resourceSearch && query.trim()) {
      e.preventDefault();
      cycleType(e.shiftKey ? -1 : 1);
    }
  }, [flatItems, highlightIndex, resourceSearch, query, cycleType]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [query, resourceResults]);

  return {
    query, setQuery,
    highlightIndex, setHighlightIndex,
    resourceType, setResourceType,
    types,
    resourceLoading,
    showAllChips, setShowAllChips,
    groups, flatItems,
    handleKeyDown,
    asking, ask, back,
    resourceSearch,
  };
}
