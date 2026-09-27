import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';

import {
  Avatar,
  Autocomplete,
  Box,
  IconButton,
  Button,
  Badge,
  Divider,
  Drawer,
  List,
  ListItemText,
  ListItemIcon,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Checkbox,
  CircularProgress,
  TextField,
  Menu,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Popover,
  InputAdornment,
  InputBase,
  Switch,
  FormControlLabel,
  Alert,
  Popper,
  Paper,
  useMediaQuery
} from '@mui/material';
import { FixedSizeList } from 'react-window';
import { Z } from '../../utils/zIndex';
import NotificationsIcon from '@mui/icons-material/Notifications';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CircleIcon from '@mui/icons-material/Circle';
import CodeIcon from '@mui/icons-material/Code';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SettingsIcon from '@mui/icons-material/Settings';
import TerminalIcon from '@mui/icons-material/Terminal';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useTour } from '../../context/TourContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { useNotifications } from '../Notifications/useNotifications';

import { useAccount } from '../Account/Account.js';
import AccountDialog from '../Accounts/AccountDialog/AccountDialog';
import { accountsApi } from '../../services/api/accountsApi';
// Screens reused inside modals (lazy so they stay out of the always-loaded TopBar bundle)
const Events = lazy(() => import('../Events/Events.jsx'));
const TOOL_SCREENS = {
  '/logs': lazy(() => import('../../views/syslogs/LogsScreen.jsx')),
  '/monitoring': lazy(() => import('../Monitoring/Monitoring.jsx')),
  '/nodes': lazy(() => import('../Monitoring/MonitoringNodes.jsx')),
  '/providers': lazy(() => import('../Providers/Providers.jsx')),
  '/templates': lazy(() => import('../Templates/Templates.jsx')),
  '/settings': lazy(() => import('../Settings/Settings.jsx')),
};
// Top-right tools that are not ACL screens but still open in the tool dialog.
const ACCOUNT_TOOLS = [{ text: 'Settings', path: '/settings' }];
import ToolDialog from './ToolDialog.jsx';
const Schema = lazy(() => import('../Appz/Schema.jsx'));
import AccountCreateDialog from '../Account/AccountCreateDialog/AccountCreateDialog.jsx';
import CustomerEditDialog from '../Account/CustomerEditDialog/CustomerEditDialog.jsx';
import { customersApi } from '../../services/api/customersApi';
import DynamicProfileEditor from '../common/DynamicProfileEditor/DynamicProfileEditor';
import { nodesApi } from '../../services/api/nodesApi';
import { useNodeHealth } from '../../hooks/useNodeHealth';
import CommandPalette from '../CommandPalette/CommandPalette';
import EnvironmentResourcesPanel from './EnvironmentResourcesPanel';
import NotificationPanel from '../Notifications/NotificationPanel/NotificationPanel';
import MonitoringSidebar from '../Monitoring/MonitoringSidebar.jsx';
import { notificationsApi } from '../../services/api/notificationsApi';
import TicketDetailView from '../Tickets/TicketDetailView/TicketDetailView';
import { useTickets } from '../Tickets/Tickets';
import { openZendeskWidget } from '../../services/zendeskWidget';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useGatusHealth } from '../../hooks/useGatusHealth';
import { HEALTH_COLORS, checkLevel, overallHealth } from './healthLevel';
import GatusHealthPanel from '../Monitoring/GatusHealthPanel.jsx';
import ApiHealthPanel from '../Monitoring/ApiHealthPanel.jsx';
import LiveDrawer from '../Live/LiveDrawer.jsx';
import { EnvironmentChartsPanel } from '../Live/panels/EntityChartsPanels.jsx';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import MenuIcon from '@mui/icons-material/Menu';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { TOPBAR_NAV_ITEMS } from '../../config/navConfig';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import StorageIcon from '@mui/icons-material/Storage';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import FilterListIcon from '@mui/icons-material/FilterList';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import InfoPopover from './InfoPopover';
import EnvironmentDialog from '../Environments/EnvironmentDialog/EnvironmentDialog';
import { environmentsApi } from '../../services/api/environmentsApi';
import { useNotification } from '../../context/NotificationContext';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './TopBar.css';
import TopBarPhoneButton from './TopBarPhoneButton.jsx';
import { useIsUserSession } from '../../hooks/useIsUserSession';
import { usePermissions } from '../../hooks/usePermissions';
import { useUserAuth } from '../../context/UserAuthContext';
import { ConfirmDialog } from '../ui';

const ITEM_HEIGHT = 68; // application rows: name + type, status/date/id, meta chips

// The API's own dependencies as /health?verbose reports them. `process` is
// the API itself, which the pill as a whole already stands for.
const HEALTH_SERVICE_LABELS = { database: 'DB', redis: 'Redis', nats: 'NATS', disk: 'Disk' };

// A selected-environment chip that can be dragged to reorder (drag handle =
// the grip icon; the × still removes). Order persists into the selection.
function SortableEnvChip({ env, onDelete, canDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: env.uuid });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <Chip
      ref={setNodeRef}
      style={style}
      {...attributes}
      icon={
        <span {...listeners} style={{ display: 'flex', alignItems: 'center', cursor: 'grab' }}>
          <DragIndicatorIcon sx={{ fontSize: 14, color: 'var(--theme-text-secondary)' }} />
        </span>
      }
      label={env.name}
      size="small"
      onDelete={canDelete ? () => onDelete(env) : undefined}
      sx={{
        height: 22, fontSize: '0.68rem', fontWeight: 600,
        bgcolor: 'var(--theme-hover)', color: 'var(--theme-text-primary)',
        border: '1px solid #0e9488',
        '& .MuiChip-deleteIcon': { fontSize: 14 },
      }}
    />
  );
}

// --- TopBar Component ---
const TopBar = ({ sidebarCollapsed, sidebarExpanded = false, menuOpen = false, onToggleSidebar, onToggleExpand }) => {
  const navigate = useNavigate();

  const { isAuthenticated, user, logout, accountCustomer } = useAuth();
  const { isDarkMode, toggleTheme } = useThemeMode();
  useTour();
  // A portal USER signs in to this same console, with the account's ACL model:
  // a tool shows for them only when their ACL grants its key; one without a
  // key is an account tool. One environment, their own: a label, not a picker.
  const userSession = useIsUserSession();
  const { canAccess } = usePermissions();
  const allow = (aclKey) => !userSession || Boolean(aclKey && canAccess(aclKey));
  const userEnvironmentName = useUserAuth().user?.environment?.name || '';

  // Responsive: below md the fixed sidebar is hidden (hamburger drives the drawer);
  // on phones the secondary top-right tools collapse into a single ⋮ overflow menu.
  const isMobile = useMediaQuery((t) => t.breakpoints.down('md'));
  const isPhone = useMediaQuery((t) => t.breakpoints.down('sm'));
  const [toolsMenuAnchor, setToolsMenuAnchor] = useState(null);
  const { deleteNotification, fetchNotificationDetails } = useNotifications();
  const {
    customers,
    isRoot,
    selectedCustomer,
    selectedEnvironments,
    uncommittedEnvironments,
    applyingEnvironments,
    hasUncommittedChanges,
    canSelectEnvironment,
    selectCustomer,
    setUncommittedEnvironments,
    applyEnvironmentSelections,
    clearEnvironmentSelections,
    fetchSelectedEnvironments,
    fetchAllEnvironments,
    fetchCustomers
  } = useCustomerEnvironment();
  // Customer-column search for the combined customer+environment box.
  const [custSearch, setCustSearch] = useState('');
  const [custTag, setCustTag] = useState('');   // filter customers by a meta tag (key:value)
  // Available tags across all customers' meta, derived client-side.
  const customerTags = useMemo(() => {
    const set = new Set();
    (customers || []).forEach((c) => {
      const m = c?.meta;
      if (m && typeof m === 'object') {
        Object.entries(m).forEach(([k, v]) => set.add(v ? `${k}:${v}` : k));
      }
    });
    return Array.from(set).sort();
  }, [customers]);
  const customerList = useMemo(() => {
    let base = (customers || []).filter((c) => c && c.name && c.name.trim());
    const q = custSearch.trim().toLowerCase();
    if (q) base = base.filter((c) => c.name.toLowerCase().includes(q));
    if (custTag) {
      base = base.filter((c) => {
        const m = c?.meta;
        return m && typeof m === 'object' && Object.entries(m).some(([k, v]) => (v ? `${k}:${v}` : k) === custTag);
      });
    }
    return base;
  }, [customers, custSearch, custTag]);
  const {
    loading: accountLoading,
    saving: accountSaving,
    detailedAccountData,
    detailedCustomerData,
    fetchAccountDetails,
    searchEnvironments: searchAccountEnvironments,
    fetchAcls: fetchAccountAcls,
    updateCustomerData,
    createDialogOpen: accountCreateDialogOpen,
    environments: accountEnvironments,
    environmentsLoading: accountEnvironmentsLoading,
    acls: accountAcls,
    aclsLoading: accountAclsLoading,
    handleCloseCreateDialog: handleCloseAccountCreateDialog,
    createAccount
  } = useAccount();

  const { showSuccess, showError } = useNotification();

  // Environment CRUD state
  const [envDialogOpen, setEnvDialogOpen] = useState(false);
  const [envDialogEnvironment, setEnvDialogEnvironment] = useState(null);
  const [addEnvMenuAnchor, setAddEnvMenuAnchor] = useState(null); // "add env" split: manual vs schema wizard
  const [envDeleteConfirmOpen, setEnvDeleteConfirmOpen] = useState(false);
  const [envToDelete, setEnvToDelete] = useState(null);
  const [envSaving, setEnvSaving] = useState(false);

  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [badgeCount, setBadgeCount] = useState(0);

  // Health check for the single top-right health button.
  const healthStatus = useApiHealth();
  const { summary: gatusSummary } = useGatusHealth();
  const health = overallHealth(healthStatus, gatusSummary);
  const [healthDialogOpen, setHealthDialogOpen] = useState(false);
  // Node whose Gatus health the Health dialog is scoped to (set from the
  // nodes popover). null node = system-wide.
  const [healthNode, setHealthNode] = useState(null);

  // Zendesk tickets modal — reuse the full useTickets hook (conversations, replies, status editing)
  const [ticketsModalOpen, setTicketsModalOpen] = useState(false);
  const {
    tickets,
    loading: ticketsLoading,
    selectedTicket,
    ticketComments,
    detailViewOpen: ticketDetailOpen,
    ticketStats,
    page: ticketPage,
    rowsPerPage: ticketRowsPerPage,
    totalCount: ticketTotalCount,
    sortBy: ticketSortBy,
    sortOrder: ticketSortOrder,
    handleUpdateTicket,
    handleAddComment: handleAddTicketComment,
    fetchTicketDetails: fetchTicketDetailsForRefresh,
    handleOpenDetailView: handleOpenTicketDetail,
    handleCloseDetailView: handleCloseTicketDetail,
    handlePageChange: handleTicketPageChange,
    handleRowsPerPageChange: handleTicketRowsPerPageChange,
    handleSortChange: handleTicketSortChange,
    handleRefresh: handleTicketRefresh,
    filters: ticketFilters,
    handleFiltersChange: handleTicketFiltersChange,
  } = useTickets({ enabled: !userSession });

  // Ref for org breadcrumb button (used to programmatically open popover)
  const orgBreadcrumbRef = useRef(null);

  // Resource search dialog state (mobile surface)
  const [resourceSearchOpen, setResourceSearchOpen] = useState(false);
  // Optional seed text passed by callers (e.g. an `openResourceFinder`
  // CustomEvent with detail.query). Cleared on close.
  const [resourceSearchInitialQuery, setResourceSearchInitialQuery] = useState('');


  // Open the global search: ⌘K opens the CommandPalette on every viewport.
  const openResourceFinder = useCallback((query = '') => {
    setResourceSearchInitialQuery(query || '');
    setResourceSearchOpen(true);
  }, []);

  // Ctrl+K shortcut to open Resource Finder
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openResourceFinder();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openResourceFinder]);

  // Listen for openResourceFinder events from
  // page-level CentralizedSearch escalating to global. CustomEvent.detail.query
  // (when present) is forwarded to the palette as initial text.
  useEffect(() => {
    const handler = (e) => openResourceFinder(e?.detail?.query || '');
    window.addEventListener('openResourceFinder', handler);
    return () => window.removeEventListener('openResourceFinder', handler);
  }, [openResourceFinder]);

  // Open the account edit dialog on request (the avatar lives in the sidebar
  // bottom now and dispatches this event).
  useEffect(() => {
    const handler = () => {
      fetchAccountDetails();
      searchAccountEnvironments();
      fetchAccountAcls();
      setAccountDialogOpen(true);
    };
    window.addEventListener('openAccountDialog', handler);
    return () => window.removeEventListener('openAccountDialog', handler);
  }, [fetchAccountDetails, searchAccountEnvironments, fetchAccountAcls]);

  // Notifications drawer — the bell moved to the sidebar bottom and dispatches this.
  useEffect(() => {
    const handler = () => setNotificationDrawerOpen(true);
    window.addEventListener('openNotifications', handler);
    return () => window.removeEventListener('openNotifications', handler);
  }, []);

  // Organization state
  const [orgNodes, setOrgNodes] = useState([]);
  const [nodesPopoverAnchor, setNodesPopoverAnchor] = useState(null);
  const [expandedNodeJson, setExpandedNodeJson] = useState(null);
  // Lazy: only fetches once healthNode is set (green button clicked).
  const nodeHealth = useNodeHealth(healthNode ? (healthNode.uuid || healthNode.id || healthNode.name) : null);

  // Unified customer+env popover
  const [customerEnvDialogOpen, setCustomerEnvDialogOpen] = useState(false);
  // Application-level live charts (call counts/durations), opened from the selector
  const [envChartsOpen, setEnvChartsOpen] = useState(false);
  const [customerEnvAnchorEl, setCustomerEnvAnchorEl] = useState(null);
  const [customerEditDialogOpen, setCustomerEditDialogOpen] = useState(false);
  const [customerDialogMode, setCustomerDialogMode] = useState('edit'); // 'edit' | 'create'
  const [customerToEdit, setCustomerToEdit] = useState(null); // a customer picked via the row ✏ (vs the selected one)
  const openCustomerCreate = () => { setCustomerToEdit(null); setCustomerDialogMode('create'); setCustomerEditDialogOpen(true); };
  const openCustomerEdit = (c) => { setCustomerToEdit(c); setCustomerDialogMode('edit'); setCustomerEditDialogOpen(true); };
  // Duplicate: open the create dialog seeded with the source customer (no uuid).
  const openCustomerDuplicate = (c) => {
    const { uuid: _uuid, ...rest } = c || {};
    setCustomerToEdit({ ...rest, name: `${c?.name || 'Customer'} copy` });
    setCustomerDialogMode('create');
    setCustomerEditDialogOpen(true);
  };

  const [environmentSearchValue, setEnvironmentSearchValue] = useState('');
  const [tagFilters, setTagFilters] = useState([]);

  // All environments for the active customer (loaded once from the context's
  // action=all cache when the popover opens; search/filters apply client-side)
  const [allEnvironments, setAllEnvironments] = useState([]);
  const [allEnvsLoading, setAllEnvsLoading] = useState(false);

  // Info popover state (used by environment rows)
  const [infoPopover, setInfoPopover] = useState({ anchorEl: null, title: '', entries: [] });
  const handleInfoClose = () => setInfoPopover({ anchorEl: null, title: '', entries: [] });

  // Committed selection — used for pinning to the top of the list. Stable
  // until Apply (which reloads), so rows don't jump around while toggling.
  const committedUuidSet = useMemo(
    () => new Set(selectedEnvironments.map((e) => e.uuid)),
    [selectedEnvironments]
  );

  // One-line readout of the active application scope for the topbar. Names
  // don't fit once a handful are selected, so show the first and count the
  // rest; the tooltip lists the first 12 for a quick sanity check.
  const selectedEnvSummary = useMemo(() => {
    const names = selectedEnvironments.map((e) => e.name).filter(Boolean);
    if (!selectedCustomer) {
      return { label: 'Select customer', extra: 0, tooltip: 'Choose a customer and applications' };
    }
    if (names.length === 0) {
      return { label: 'No application', extra: 0, tooltip: 'No application selected — screens have no scope. Click to choose.' };
    }
    const shown = names.slice(0, 12).join(', ');
    return {
      label: names[0],
      extra: names.length - 1,
      tooltip: names.length === 1
        ? `Application: ${names[0]}`
        : `${names.length} applications: ${shown}${names.length > 12 ? `, and ${names.length - 12} more` : ''}`,
    };
  }, [selectedEnvironments, selectedCustomer]);

  // Search-only (no tabs): the browse list is always the full environment set
  // filtered by the search box + optional tag. The current selection is shown
  // as draggable chips above the list, so no "Selected" filter is needed.
  const q = environmentSearchValue.trim().toLowerCase();
  const displayedEnvironments = useMemo(() => {
    let list = allEnvironments;
    if (q) {
      list = list.filter((env) =>
        (env.name || '').toLowerCase().includes(q) ||
        (env.notes || '').toLowerCase().includes(q)
      );
    }
    if (tagFilters.length > 0) {
      list = list.filter((env) => {
        const m = env?.meta;
        if (!m || typeof m !== 'object') return false;
        return tagFilters.every((tag) =>
          Object.entries(m).some(([k, v]) => (v ? `${k}:${v}` : k) === tag)
        );
      });
    }
    return list;
  }, [allEnvironments, q, tagFilters]);

  // Order-by for the application dropdown, shown as inline sortable column
  // headers (like the list screens). Changing the sort QUERIES THE SERVER
  // (order_by/order_type, like every list screen) — the cached list is capped
  // (per_page=9999), so client-only sorting lies on large tenants. Selected
  // environments stay pinned to the top; the server order applies within groups.
  const [envSortField, setEnvSortField] = useState('name');
  const [envSortDir, setEnvSortDir] = useState('asc');
  const handleEnvSortChange = useCallback((field) => {
    setEnvSortDir((prevDir) => (envSortField === field && prevDir === 'asc' ? 'desc' : 'asc'));
    setEnvSortField(field);
  }, [envSortField]);
  // Search-only design: load the full environment list whenever the popover is
  // open (the browse list is always the full set). Search is server-side
  // (search[name]) so large tenants filter on the server, not the client.
  useEffect(() => {
    if (!customerEnvDialogOpen || !selectedCustomer?.uuid) return undefined;
    let cancelled = false;
    setAllEnvsLoading(true);
    environmentsApi.getEnvironments({
      customer_uuid: selectedCustomer.uuid,
      page: 1,
      per_page: 9999,
      order_by: envSortField,
      order_type: envSortDir,
      ...(q ? { 'search[name]': q } : {}),
    })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.data || []);
        setAllEnvironments(list);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAllEnvsLoading(false); });
    return () => { cancelled = true; };
  }, [envSortField, envSortDir, q, customerEnvDialogOpen, selectedCustomer?.uuid]);

  // Meta tags available across the environments (key or key:value), for the
  // tag filter — same idea as the customers' tag filter.
  const envTagOptions = useMemo(() => {
    const tags = new Set();
    allEnvironments.forEach((env) => {
      const m = env?.meta;
      if (m && typeof m === 'object') {
        Object.entries(m).forEach(([k, v]) => tags.add(v ? `${k}:${v}` : k));
      }
    });
    return [...tags].sort();
  }, [allEnvironments]);
  const searchFilteredEnvironments = useMemo(() => {
    // The list arrives SERVER-ORDERED (order_by/order_type above); only pin the
    // selected apps to the top — stable sort preserves server order in groups.
    return [...displayedEnvironments].sort((a, b) =>
      (committedUuidSet.has(b.uuid) - committedUuidSet.has(a.uuid))
    );
  }, [displayedEnvironments, committedUuidSet]);

  // (The full-list load is handled by the single lazy effect above — no eager
  // action=all fetch on open. The Selected view uses the cached selection.)

  // Open the environment popover
  const handleOpenCustomerEnvDialog = useCallback(() => {
    setCustomerEnvAnchorEl(orgBreadcrumbRef.current);
    setCustomerEnvDialogOpen(true);
  }, []);

  // The customer+environment selector now lives in the sidebar; it opens this
  // popover anchored to that button (passed as the event detail).
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) setCustomerEnvAnchorEl(e.detail);
      setCustomerEnvDialogOpen(true);
    };
    window.addEventListener('openEnvSelector', handler);
    return () => window.removeEventListener('openEnvSelector', handler);
  }, []);

  // Open the edit dialog with the FULL record — the environments list
  // serializer omits `profile`, so seeding the dialog from the list row
  // left every profile field empty. Show the dialog immediately with the
  // row data, then reseed once the full record arrives.
  const openEnvEdit = useCallback(async (env) => {
    setEnvDialogEnvironment(env);
    setEnvDialogOpen(true);
    try {
      const full = await environmentsApi.getEnvironment(env.uuid || env.id);
      setEnvDialogEnvironment(full?.data || full || env);
    } catch { /* keep the list row as fallback */ }
  }, []);

  const handleEnvSave = useCallback(async (formData) => {
    setEnvSaving(true);
    try {
      if (envDialogEnvironment) {
        await environmentsApi.updateEnvironment(envDialogEnvironment.uuid || envDialogEnvironment.id, formData);
        showSuccess('Application updated');
      } else {
        await environmentsApi.createEnvironment({ ...formData, customer_uuid: selectedCustomer?.uuid });
        showSuccess('Application created');
      }
      setEnvDialogOpen(false);
      setEnvDialogEnvironment(null);
      // Refresh the cheap "selected envs" view and force-refresh the cached
      // full list so a just-created/edited application shows up immediately.
      if (selectedCustomer) {
        await fetchSelectedEnvironments(selectedCustomer.uuid);
        fetchAllEnvironments(selectedCustomer.uuid, true)
          .then((results) => setAllEnvironments(Array.isArray(results) ? results : []))
          .catch(() => {});
      }
    } catch (error) {
      showError(error.message || 'Failed to save application');
      throw error;
    } finally {
      setEnvSaving(false);
    }
  }, [envDialogEnvironment, selectedCustomer, fetchSelectedEnvironments, fetchAllEnvironments, showSuccess, showError]);


  const handleEnvDelete = useCallback(async () => {
    if (!envToDelete) return;
    setEnvSaving(true);
    try {
      await environmentsApi.deleteEnvironment(envToDelete.uuid || envToDelete.id);
      showSuccess('Application deleted');
      setEnvDeleteConfirmOpen(false);
      setEnvToDelete(null);
      if (selectedCustomer) {
        await fetchSelectedEnvironments(selectedCustomer.uuid);
        fetchAllEnvironments(selectedCustomer.uuid, true)
          .then((results) => setAllEnvironments(Array.isArray(results) ? results : []))
          .catch(() => {});
      }
    } catch (error) {
      showError(error.message || 'Failed to delete application');
    } finally {
      setEnvSaving(false);
    }
  }, [envToDelete, selectedCustomer, fetchSelectedEnvironments, fetchAllEnvironments, showSuccess, showError]);

  // Drag-to-reorder for the selected chips (5px activation so the × still clicks).
  const envDragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleEnvDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setUncommittedEnvironments((prev) => {
      const oldIndex = prev.findIndex((e) => e.uuid === active.id);
      const newIndex = prev.findIndex((e) => e.uuid === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, [setUncommittedEnvironments]);

  // Toggle an environment in the uncommitted list
  const handleToggleEnvironment = useCallback((env) => {
    setUncommittedEnvironments(prev => {
      const exists = prev.some(e => e.uuid === env.uuid);
      if (exists) return prev.filter(e => e.uuid !== env.uuid);
      return [...prev, env];
    });
  }, [setUncommittedEnvironments]);

  // Check if env is selected
  const isEnvSelected = useCallback((envUuid) => {
    return uncommittedEnvironments.some(e => e.uuid === envUuid);
  }, [uncommittedEnvironments]);

  // Environment row renderer for FixedSizeList — lean search+select, no management actions
  const EnvironmentRow = useCallback(({ index, style }) => {
    const env = searchFilteredEnvironments[index];
    if (!env) return null;
    const selected = isEnvSelected(env.uuid);
    const metaEntries = env.meta && typeof env.meta === 'object' ? Object.entries(env.meta) : [];
    const metaFull = metaEntries.map(([k, v]) => (v ? `${k}: ${v}` : k)).join('\n');
    return (
      <Box
        style={style}
        onClick={() => handleToggleEnvironment(env)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1.5,
          cursor: 'pointer',
          '&:hover': { backgroundColor: 'var(--theme-hover)', '& .env-edit': { opacity: 1 } },
          ...(selected && { backgroundColor: 'var(--theme-active, rgba(25, 118, 210, 0.08))', borderLeft: '3px solid', borderLeftColor: 'primary.main' }),
          borderBottom: '1px solid var(--border-light, #e0e0e0)',
        }}
      >
        <Checkbox
          size="small"
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={() => handleToggleEnvironment(env)}
          inputProps={{ 'aria-label': `${selected ? 'Deselect' : 'Select'} ${env.name}` }}
          sx={{ p: 0.25, mr: 0.75, flexShrink: 0 }}
        />

        <Box sx={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
          {/* Name + type/production badge */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 500, fontSize: '0.78rem', color: env.enabled ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)' }}>
              {env.name}
            </Typography>
            {(env.application?.production === true || env.type) && (
              <Chip
                size="small"
                label={env.application?.production === true ? 'production' : String(env.type)}
                sx={{ height: 15, fontSize: '0.55rem', flexShrink: 0, bgcolor: env.application?.production === true ? 'rgba(76,175,80,0.16)' : 'var(--theme-bg-secondary)', '& .MuiChip-label': { px: 0.5 } }}
              />
            )}
          </Box>
          {/* Status · created · short id */}
          <Typography variant="caption" noWrap sx={{ fontSize: '0.6rem', color: 'var(--theme-text-secondary)', opacity: 0.85, display: 'block' }}>
            {env.enabled ? 'Active' : 'Inactive'}
            {env.created_at ? ` · ${new Date(env.created_at).toLocaleDateString()}` : ''}
            {env.uuid ? ` · ${env.uuid.slice(0, 8)}` : ''}
          </Typography>
          {/* Metadata chips (full set in tooltip) */}
          {metaEntries.length > 0 && (
            <Tooltip title={metaFull} placement="bottom-start">
              <Box sx={{ display: 'flex', gap: 0.25, mt: 0.2, flexWrap: 'nowrap', overflow: 'hidden' }}>
                {metaEntries.slice(0, 3).map(([k, v]) => (
                  <Chip key={k} size="small" label={v ? `${k}:${v}` : k}
                    sx={{ height: 14, fontSize: '0.5rem', flexShrink: 0, bgcolor: 'var(--theme-bg-secondary)', '& .MuiChip-label': { px: 0.4 } }} />
                ))}
                {metaEntries.length > 3 && (
                  <Typography sx={{ fontSize: '0.5rem', color: 'var(--theme-text-secondary)', alignSelf: 'center' }}>+{metaEntries.length - 3}</Typography>
                )}
              </Box>
            </Tooltip>
          )}
        </Box>

        {/* Edit application — opens the same EnvironmentDialog used for create */}
        <Tooltip title="Edit application" placement="left">
          <IconButton
            className="env-edit"
            size="small"
            onClick={(e) => { e.stopPropagation(); openEnvEdit(env); }}
            sx={{ flexShrink: 0, ml: 0.5, p: 0.25, opacity: selected ? 0.7 : 0, transition: 'opacity 0.15s' }}
          >
            <EditIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>

      </Box>
    );
  }, [searchFilteredEnvironments, isEnvSelected, handleToggleEnvironment, openEnvEdit]);

  // No more eager action=all fetch on customer change or popover open.
  // Default popover view = currently-selected envs (already loaded by the
  // selectCustomer flow). The debounced server-side search effect handles
  // everything else.

  // Fetch nodes on mount (the org logo is no longer shown — the customer
  // selector carries the customer's own avatar instead)
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchNodes = async () => {
      try {
        const response = await nodesApi.getNodes();
        const list = Array.isArray(response) ? response : (response?.data || response?.items || []);
        setOrgNodes(list);
      } catch {
        setOrgNodes([]);
      }
    };
    fetchNodes();
  }, [isAuthenticated]);


  // Production check
  const isProductionSelected = useMemo(() => {
    return selectedEnvironments.some(env =>
      env.application?.production === true || env.type?.toLowerCase() === 'production'
    );
  }, [selectedEnvironments]);


  // Route sidebar "openCustomerDialog" event to the unified panel
  useEffect(() => {
    const handler = () => handleOpenCustomerEnvDialog();
    window.addEventListener('openCustomerDialog', handler);
    return () => window.removeEventListener('openCustomerDialog', handler);
  }, [handleOpenCustomerEnvDialog]);

  // Sidebar's API status pill dispatches this when clicked.
  useEffect(() => {
    const open = () => { setHealthNode(null); setHealthDialogOpen(true); };
    window.addEventListener('openHealthDialog', open);
    return () => window.removeEventListener('openHealthDialog', open);
  }, []);

  // Notification count
  useEffect(() => {
    if (isAuthenticated || (userSession && canAccess('notifications'))) {
      const loadCount = async () => {
        const count = await notificationsApi.countUnreadAlerts('', '');
        setBadgeCount(count);
      };
      loadCount().catch(() => {});
      const timer = setInterval(() => { loadCount().catch(() => {}); }, 30000);
      return () => clearInterval(timer);
    }
  }, [isAuthenticated, userSession, canAccess]);

  const handleTicketsOpen = useCallback(() => {
    setTicketsModalOpen(true);
    handleTicketRefresh();
  }, [handleTicketRefresh]);

  // Listen for openTicketsModal event from Sidebar
  useEffect(() => {
    const handler = () => handleTicketsOpen();
    window.addEventListener('openTicketsModal', handler);
    return () => window.removeEventListener('openTicketsModal', handler);
  }, [handleTicketsOpen]);

  // Events modal — opened by the top-right Events icon (no filter) and by
  // "Events" actions on other screens (carry a subject query string).
  const [eventsModalOpen, setEventsModalOpen] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [eventsModalParams, setEventsModalParams] = useState('');
  useEffect(() => {
    const handler = (e) => {
      setEventsModalParams((e && e.detail) || '');
      setEventsModalOpen(true);
    };
    window.addEventListener('openEventsModal', handler);
    return () => window.removeEventListener('openEventsModal', handler);
  }, []);

  // Wizard (Schema) modal — the top-right "Wizard" icon for quick resource creation.
  const [wizardModalOpen, setWizardModalOpen] = useState(false);
  useEffect(() => {
    const handler = () => setWizardModalOpen(true);
    window.addEventListener('openWizardModal', handler);
    return () => window.removeEventListener('openWizardModal', handler);
  }, []);

  const handleNotificationClick = () => setNotificationDrawerOpen(true);

  const handleNotificationDrawerClose = () => {
    setNotificationDrawerOpen(false);
    setSelectedNotification(null);
  };

  const handleNotificationSelect = (notification) => {
    setSelectedNotification(notification);
  };

  const handleAccountSave = async (formData) => {
    // Use the same full-update path as the Accounts → Edit dialog so the
    // top-menu "Edit Account" behaves identically (name, email, ACL,
    // environments, meta — not just the name).
    const accountId = detailedAccountData?.uuid || detailedAccountData?.id || user?.uuid;
    await accountsApi.updateAccount(accountId, formData);
    await fetchAccountDetails();
    setAccountDialogOpen(false);
  };

  const handleCustomerSave = async (formData) => {
    await updateCustomerData(formData, customerToEdit?.uuid || selectedCustomer?.uuid);
    await fetchCustomers();
  };

  // Root-only: create a brand-new customer (POST /api/customers), then refresh the
  // switcher list and jump into the new customer.
  // The dialog shows its own success toast and auto-closes; here we just persist,
  // refresh the switcher list, and jump into the new customer. Let errors throw so
  // CustomerEditDialog surfaces them inline.
  const handleCustomerCreate = async (formData) => {
    const created = await customersApi.createCustomer(formData);
    const list = await fetchCustomers();
    const fresh = (list || []).find(c => c.uuid === created?.uuid);
    if (fresh) { await selectCustomer(fresh); }
  };

  // The shared shell serves either active session. Account-only controls below
  // are individually gated; a user still needs the environment label, ⌘K,
  // phone button, ACL-granted actions, and profile menu.
  if (!isAuthenticated && !userSession) return null;

  const professionalTools = TOPBAR_NAV_ITEMS.filter(item => canAccess(item.aclKey)).map(item => {
    const Icon = item.iconComponent;
    return {
      key: item.path,
      aclKey: item.aclKey,
      label: item.text,
      icon: <Icon fontSize="small" />,
      onClick: () => item.path === '/events'
        ? window.dispatchEvent(new CustomEvent('openEventsModal', { detail: '' }))
        : setActiveTool(current => current === item.path ? null : item.path),
    };
  });

  // Professional tools stay inline on desktop and in the overflow on phones.
  const ActiveToolScreen = TOOL_SCREENS[activeTool];
  const activeToolItem = TOPBAR_NAV_ITEMS.find(item => item.path === activeTool && canAccess(item.aclKey))
    || (!userSession && ACCOUNT_TOOLS.find(item => item.path === activeTool));
  const overflowTools = [
    { key: 'wizard', label: 'Wizard', icon: <AutoFixHighIcon fontSize="small" />, onClick: () => window.dispatchEvent(new Event('openWizardModal')) },
    ...professionalTools,
    // Appearance is the viewer's, not a permission: always offered.
    { key: 'theme', always: true, label: isDarkMode ? 'Light Mode' : 'Dark Mode', icon: isDarkMode ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />, onClick: toggleTheme },
  ].filter((tool) => tool.always || allow(tool.aclKey));

  return (
    <>
      <Box className={`topbar-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${sidebarExpanded ? 'sidebar-expanded' : ''}`}>
        {/* The single hamburger toggles the tile rail or mobile drawer. */}
        <IconButton
          className="topbar-hamburger"
          onClick={isMobile ? onToggleSidebar : (onToggleExpand || onToggleSidebar)}
          size="small"
          aria-label="Toggle menu"
          aria-expanded={isMobile ? undefined : sidebarExpanded}
          sx={{ display: 'inline-flex' }}
        >
          <MenuIcon sx={{ fontSize: 22, transition: 'transform 220ms ease', transform: menuOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
        </IconButton>
        {/* Selected applications and the customer/environment selector. */}
        {userSession ? (
          <Typography data-testid="topbar-user-environment" sx={{ fontSize: '0.75rem', fontWeight: 600, px: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--theme-text-primary)' }}>
            {userEnvironmentName}
          </Typography>
        ) : (
        <Tooltip title={selectedEnvSummary.tooltip} placement="bottom-start">
          <Button
            ref={orgBreadcrumbRef}
            onClick={handleOpenCustomerEnvDialog}
            size="small"
            endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 16 }} />}
            sx={{
              textTransform: 'none',
              minWidth: 0,
              maxWidth: { xs: 150, sm: 320, md: 460 },
              px: 1,
              py: 0.25,
              gap: 0.5,
              color: selectedEnvironments.length ? 'var(--theme-text-primary)' : 'warning.main',
              '& .MuiButton-endIcon': { ml: 0 },
              '&:hover': { backgroundColor: 'var(--theme-hover)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
              <Typography
                component="span"
                sx={{
                  fontSize: '0.75rem', fontWeight: 600, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {selectedEnvSummary.label}
              </Typography>
              {selectedEnvSummary.extra > 0 && (
                <Chip
                  label={`+${selectedEnvSummary.extra}`}
                  size="small"
                  sx={{ height: 16, fontSize: '0.6rem', flexShrink: 0, '& .MuiChip-label': { px: 0.5 } }}
                />
              )}
            </Box>
          </Button>
        </Tooltip>
        )}
        <Box sx={{ width: 8 }} />

        <Tooltip title="Assistant (Ctrl+K)">
          <Button
            size="small"
            aria-label="Assistant (Ctrl+K)"
            onClick={() => openResourceFinder()}
            startIcon={<SearchIcon sx={{ fontSize: 17 }} />}
            sx={{
              minWidth: 0,
              px: 1,
              py: 0.35,
              textTransform: 'none',
              color: 'var(--theme-text-secondary)',
              border: '1px solid var(--theme-border)',
              borderRadius: '7px',
              fontSize: '0.72rem',
              '&:hover': { backgroundColor: 'var(--theme-hover)' },
            }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Ctrl K</Box>
          </Button>
        </Tooltip>

        {/* Global search moved to ⌘K only (no visible box). */}
        <Box sx={{ flex: 1, minWidth: 0 }} />

        {/* Topbar utility icons (support tools live in the left Support menu) */}
        <Box className="topbar-actions">
          {/* Actions + observability nav — inline on desktop, in ⋮ on phones */}
          {!isPhone && (
          <>
          {allow(null) && (
          <Tooltip title="Wizard">
            <IconButton size="small" onClick={() => window.dispatchEvent(new Event('openWizardModal'))} sx={{ color: 'var(--theme-text-secondary)', '&:hover': { backgroundColor: 'var(--theme-hover)' } }}>
              <AutoFixHighIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          )}
          {professionalTools.map(tool => (
            <Tooltip key={tool.key} title={tool.label}>
              <IconButton size="small" aria-label={tool.label} onClick={tool.onClick} sx={{ color: 'var(--theme-text-secondary)', '&:hover': { backgroundColor: 'var(--theme-hover)' } }}>
                {tool.icon}
              </IconButton>
            </Tooltip>
          ))}
          {!userSession && (
            <Tooltip title="Settings">
              <IconButton
                size="small"
                aria-label="Settings"
                onClick={() => setActiveTool('/settings')}
                sx={{ color: 'var(--theme-text-secondary)', '&:hover': { backgroundColor: 'var(--theme-hover)' } }}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          </>
          )}

          {/* App Health — the API's own services from /health?verbose, always
              visible at the top: one dot per service. Click opens the
              Monitoring screen in the tool dialog. An account's. */}
          {!userSession && (
          <Button
            aria-label="Health"
            onClick={() => setActiveTool('/monitoring')}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5,
              minWidth: 0, textTransform: 'none',
              borderRadius: '14px', cursor: 'pointer',
              border: '1px solid var(--theme-border)',
              '&:hover': { backgroundColor: 'var(--theme-hover)' },
            }}
          >
            {healthStatus.checks ? (
              Object.entries(healthStatus.checks).filter(([key]) => key !== 'process').map(([key, check]) => {
                const label = HEALTH_SERVICE_LABELS[key] || key;
                const level = checkLevel(check);
                const tip = `${label}: ${level === 'down' ? `DOWN — ${check?.error || 'check failed'}` : level === 'degraded' ? 'warning' : `healthy${check?.ms != null ? ` (${check.ms}ms)` : ''}`}`;
                return (
                  <Tooltip key={key} title={tip}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                      <CircleIcon sx={{ fontSize: 9, color: HEALTH_COLORS[level] }} />
                      <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--theme-text-secondary)', lineHeight: 1 }}>
                        {label}
                      </Typography>
                    </Box>
                  </Tooltip>
                );
              })
            ) : (
              // No per-service detail from this API: one dot, coloured by the
              // overall level (API + node probes).
              <Tooltip title={`Status — ${health.reason}`}>
                <CircleIcon data-testid="health-dot" data-level={health.level} sx={{ fontSize: 12, color: HEALTH_COLORS[health.level] }} />
              </Tooltip>
            )}
          </Button>
          )}

          {/* Support tools live in the sidebar; theme lives in the account tools. */}

          {/* Divider between admin and utility icons */}
          <Box sx={{ width: '1px', height: 24, backgroundColor: 'var(--border-light, #e5e7eb)', mx: 0.5, flexShrink: 0 }} />

          <TopBarPhoneButton />

          {allow('notifications') && (
          <Tooltip title="Notifications">
            <IconButton
              size="small"
              onClick={handleNotificationClick}
              sx={{ color: 'var(--theme-text-secondary)' }}
            >
              <Badge badgeContent={badgeCount} color="error">
                <NotificationsIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>
          )}

          {/* Overflow ⋮ — phones only: holds the secondary tools that don't fit */}
          {isPhone && (
            <>
              <Tooltip title="More tools">
                <IconButton size="small" onClick={(e) => setToolsMenuAnchor(e.currentTarget)} sx={{ color: 'var(--theme-text-secondary)' }}>
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={toolsMenuAnchor}
                open={Boolean(toolsMenuAnchor)}
                onClose={() => setToolsMenuAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                {overflowTools.map(tool => (
                  <MenuItem
                    key={tool.key}
                    onClick={() => { tool.onClick(); setToolsMenuAnchor(null); }}
                    sx={{ fontSize: '0.85rem', gap: 1.5 }}
                  >
                    {tool.icon}
                    {tool.label}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}

          {/* (Account avatar moved to the sidebar bottom — it dispatches the
              `openAccountDialog` event handled below.) */}
        </Box>
      </Box>

      {/* Environment selector — compact Popover anchored to the topbar button */}
      <Popover
        open={customerEnvDialogOpen}
        anchorEl={customerEnvAnchorEl}
        onClose={() => { setCustomerEnvDialogOpen(false); setCustomerEnvAnchorEl(null); setEnvironmentSearchValue(''); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{
          '& .MuiPaper-root': {
            width: customerList.length > 0 ? 690 : 360,
            maxHeight: '75vh',
            display: 'flex',
            flexDirection: 'row',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            backgroundColor: 'var(--theme-bg-primary)',
            mt: 0.5,
          }
        }}
      >
        {/* LEFT column — Customers. Always shows the current customer(s); root
            can add/edit/search and switch. Pick one → its environments branch
            into the right column. One box for both. */}
        {customerList.length > 0 && (
          <Box sx={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{ px: 1.25, pt: 1.25, pb: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: isRoot ? 0.75 : 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--theme-text-secondary)' }}>
                  Customer{isRoot ? ` (${customerList.length})` : ''}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Setup wizard">
                  <IconButton
                    size="small"
                    onClick={() => { setCustomerEnvDialogOpen(false); setCustomerEnvAnchorEl(null); window.dispatchEvent(new Event('openWizardModal')); }}
                    sx={{ p: 0.25 }}
                    aria-label="Setup wizard"
                  >
                    <AutoFixHighIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                {isRoot && (
                  <Tooltip title="Add customer">
                    <IconButton size="small" onClick={openCustomerCreate} sx={{ p: 0.25 }}>
                      <AddIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              {isRoot && (
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                  <TextField
                    value={custSearch}
                    onChange={(e) => setCustSearch(e.target.value)}
                    placeholder="Search customers…"
                    variant="outlined" size="small" fullWidth
                    sx={{ '& .MuiInputBase-root': { fontSize: '0.8rem', height: 34 } }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 15, color: 'var(--theme-text-secondary)' }} /></InputAdornment> }}
                  />
                  {customerTags.length > 0 && (
                    <Select
                      value={custTag}
                      onChange={(e) => setCustTag(e.target.value)}
                      displayEmpty
                      size="small"
                      renderValue={(v) => v || 'Tag'}
                      sx={{ height: 34, minWidth: 96, maxWidth: 130, fontSize: '0.72rem', flexShrink: 0, '& .MuiSelect-select': { py: 0.5 } }}
                      MenuProps={{ style: { zIndex: Z.L2.MENU }, PaperProps: { sx: { maxHeight: 320 } } }}
                    >
                      <MenuItem value=""><em>All tags</em></MenuItem>
                      {customerTags.map((t) => <MenuItem key={t} value={t} sx={{ fontSize: '0.75rem' }}>{t}</MenuItem>)}
                    </Select>
                  )}
                </Box>
              )}
            </Box>
            <Divider />
            <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, py: 0.5 }}>
              {customerList.map((c) => {
                const active = c.uuid === selectedCustomer?.uuid;
                // Editing a customer is NOT root-only. The API gates PATCH
                // /api/customers/:id on tenancy -- Account#customer_uuids, the
                // account's own customer plus its AccountResource grants -- and
                // never on the `root` JWT claim, which the serializer that signs
                // it calls a "UI hint only". Gating the pencil on isRoot hid an
                // edit the server would have accepted, and left an account with
                // no way at all to reach its own customer's settings (login OTP
                // among them), since SidebarCustomerSwitcher's ungated "Manage
                // customer" action is imported nowhere. Create and duplicate act
                // outside the caller's tenant, so those stay root-only.
                const canEditCustomer = isRoot || c.uuid === accountCustomer?.uuid;
                const metaEntries = (c.meta && typeof c.meta === 'object') ? Object.entries(c.meta) : [];
                const created = c.created_at ? new Date(c.created_at).toLocaleDateString() : null;
                return (
                  <Box
                    key={c.uuid}
                    onClick={async () => {
                      if (active) return;
                      setEnvironmentSearchValue('');
                      setTagFilters([]);
                      // Keep the picker open. The right pane reacts to the
                      // context change and fetches this customer's applications
                      // in place, so selecting a customer is one step.
                      await selectCustomer(c);
                    }}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.75, cursor: 'pointer', borderLeft: active ? '3px solid var(--accent-primary)' : '3px solid transparent', backgroundColor: active ? 'var(--theme-hover)' : 'transparent', '&:hover': { backgroundColor: 'var(--theme-hover)', '& .cust-actions': { opacity: 1 } } }}
                  >
                    <Avatar sx={{ width: 26, height: 26, fontSize: '0.72rem', bgcolor: active ? 'var(--accent-primary)' : 'var(--theme-bg-secondary)', color: active ? '#fff' : 'var(--theme-text-secondary)', flexShrink: 0 }}>
                      {(c.name || '?').trim()[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: active ? 600 : 500, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.1 }}>
                        <Typography sx={{ fontSize: '0.62rem', color: 'var(--theme-text-secondary)', whiteSpace: 'nowrap' }}>
                          {c.enabled === false ? 'Disabled' : 'Active'}{created ? ` · ${created}` : ''}
                        </Typography>
                        {metaEntries.slice(0, 2).map(([k, v]) => (
                          <Chip key={k} label={v ? `${k}:${v}` : k} size="small" sx={{ height: 15, fontSize: '0.55rem', bgcolor: 'var(--theme-bg-secondary)', '& .MuiChip-label': { px: 0.5 } }} />
                        ))}
                        {metaEntries.length > 2 && <Typography sx={{ fontSize: '0.55rem', color: 'var(--theme-text-secondary)' }}>+{metaEntries.length - 2}</Typography>}
                      </Box>
                    </Box>
                    {canEditCustomer && (
                      <Box className="cust-actions" sx={{ display: 'flex', flexShrink: 0, opacity: active ? 0.7 : 0, transition: 'opacity 0.15s' }}>
                        {isRoot && (
                          <Tooltip title="Duplicate customer">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); openCustomerDuplicate(c); }} sx={{ p: 0.25 }}>
                              <ContentCopyIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Edit customer">
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); openCustomerEdit(c); }} sx={{ p: 0.25 }}>
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </Box>
                );
              })}
              {customerList.length === 0 && (
                <Typography sx={{ p: 2, fontSize: '0.8rem', color: 'var(--theme-text-secondary)' }}>No customers</Typography>
              )}
            </Box>
          </Box>
        )}

        {/* RIGHT column — Applications belonging to the selected customer */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Hierarchy header: these applications belong to the selected customer */}
        <Box sx={{ px: 1.5, pt: 1, pb: 0.25, display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: 0.5, flexShrink: 0 }}>
            Applications
          </Typography>
          {selectedCustomer?.name && (
            <>
              <Typography sx={{ fontSize: '0.7rem', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>›</Typography>
              <Typography variant="caption" noWrap sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--theme-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedCustomer.name}
              </Typography>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Application live charts">
            <IconButton size="small" onClick={() => setEnvChartsOpen(true)} sx={{ p: 0.25, flexShrink: 0 }}>
              <ShowChartIcon sx={{ fontSize: 15, color: '#8b5cf6' }} />
            </IconButton>
          </Tooltip>
          <Chip size="small" label={searchFilteredEnvironments.length} sx={{ height: 16, fontSize: '0.6rem', flexShrink: 0, bgcolor: 'var(--theme-bg-secondary)', '& .MuiChip-label': { px: 0.6 } }} />
        </Box>
        {/* Search input + create application */}
        <Box sx={{ px: 1.5, pt: 1.25, pb: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <TextField
            value={environmentSearchValue}
            onChange={(e) => setEnvironmentSearchValue(e.target.value)}
            placeholder="Search applications..."
            variant="outlined"
            size="small"
            fullWidth
            autoFocus
            sx={{ '& .MuiInputBase-root': { fontSize: '0.82rem', height: 36 } }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: 'var(--theme-text-secondary)' }} /></InputAdornment>,
              endAdornment: environmentSearchValue ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setEnvironmentSearchValue('')}><ClearIcon sx={{ fontSize: 14 }} /></IconButton>
                </InputAdornment>
              ) : allEnvsLoading ? (
                <InputAdornment position="end"><CircularProgress size={14} /></InputAdornment>
              ) : null
            }}
          />
          <Tooltip title="Add application">
            <IconButton
              size="small"
              onClick={(e) => setAddEnvMenuAnchor(e.currentTarget)}
              sx={{ flexShrink: 0, border: '1px solid var(--border-light)', borderRadius: '8px', width: 36, height: 36 }}
            >
              <AddIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={addEnvMenuAnchor}
            open={Boolean(addEnvMenuAnchor)}
            onClose={() => setAddEnvMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={() => { setAddEnvMenuAnchor(null); setEnvDialogEnvironment(null); setEnvDialogOpen(true); }}>
              <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Add manually" secondary="Name + settings" />
            </MenuItem>
            <MenuItem onClick={() => { setAddEnvMenuAnchor(null); setWizardModalOpen(true); }}>
              <ListItemIcon><AutoFixHighIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="From schema (wizard)" secondary="Guided setup" />
            </MenuItem>
          </Menu>
        </Box>

        {/* Keep the active scope visible without letting a long multi-selection
            consume the picker. The chips stay on one scrollable line; the
            complete, clickable result list remains directly below. */}
        {uncommittedEnvironments.length > 0 && (
          <Box sx={{ px: 1.5, pb: 0.75, display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{ flexShrink: 0, color: 'var(--theme-text-secondary)', fontSize: '0.65rem', fontWeight: 600 }}
            >
              Selected ({uncommittedEnvironments.length})
            </Typography>
            <DndContext sensors={envDragSensors} collisionDetection={closestCenter} onDragEnd={handleEnvDragEnd}>
              <Box sx={{ display: 'flex', gap: 0.5, minWidth: 0, overflowX: 'auto', py: 0.15, pr: 0.25, '&::-webkit-scrollbar': { height: 4 } }}>
                <SortableContext items={uncommittedEnvironments.map((e) => e.uuid)} strategy={horizontalListSortingStrategy}>
                  {uncommittedEnvironments.map((env) => (
                    <SortableEnvChip
                      key={env.uuid}
                      env={env}
                      onDelete={handleToggleEnvironment}
                      canDelete={canSelectEnvironment}
                    />
                  ))}
                </SortableContext>
              </Box>
            </DndContext>
          </Box>
        )}

        {/* No tabs — search covers everything (search-only, per design). An
            optional tag filter narrows the browse list. */}
        {envTagOptions.length > 0 && (
          <Box sx={{ px: 1.5, pb: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Select
              value={tagFilters[0] || ''}
              onChange={(e) => setTagFilters(e.target.value ? [e.target.value] : [])}
              size="small"
              displayEmpty
              fullWidth
              sx={{ height: 26, fontSize: '0.7rem', '& .MuiSelect-select': { py: 0.25 } }}
              MenuProps={{ style: { zIndex: Z.L2.MENU } }}
            >
              <MenuItem value=""><em>Any tag</em></MenuItem>
              {envTagOptions.map((tag) => (
                <MenuItem key={tag} value={tag}>{tag}</MenuItem>
              ))}
            </Select>
          </Box>
        )}

        <Divider />

        {/* Inline sortable column headers (like the list screens) — sorting
            re-queries the SERVER with order_by/order_type. */}
        <Box sx={{ px: 1.5, py: 0.25, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid var(--border-light)' }}>
          {[
            { field: 'name',       label: 'Name',    sx: { flex: 1 } },
            { field: 'enabled',    label: 'Active',  sx: { width: 52 } },
            { field: 'created_at', label: 'Created', sx: { width: 64 } },
            { field: 'updated_at', label: 'Updated', sx: { width: 64 } },
          ].map(({ field, label, sx }) => (
            <Box key={field} sx={sx}>
              <TableSortLabel
                active={envSortField === field}
                direction={envSortField === field ? envSortDir : 'asc'}
                onClick={() => handleEnvSortChange(field)}
                sx={{ '& .MuiTableSortLabel-icon': { fontSize: 14 }, fontSize: '0.68rem', fontWeight: 600, color: 'var(--theme-text-secondary)' }}
              >
                {label}
              </TableSortLabel>
            </Box>
          ))}
        </Box>

        {/* Environment list */}
        <Box sx={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
          {searchFilteredEnvironments.length > 0 ? (
            <FixedSizeList
              height={Math.min(searchFilteredEnvironments.length * ITEM_HEIGHT, 320)}
              width="100%"
              itemSize={ITEM_HEIGHT}
              itemCount={searchFilteredEnvironments.length}
              overscanCount={5}
            >
              {EnvironmentRow}
            </FixedSizeList>
          ) : (
            <Box sx={{ p: 2.5, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'var(--theme-text-secondary)', fontSize: '0.82rem' }}>
                {allEnvsLoading ? 'Loading...' : environmentSearchValue ? 'No applications found' : 'No applications'}
              </Typography>
            </Box>
          )}
        </Box>

        {isProductionSelected && (
          <Box sx={{ px: 1.5, py: 0.5, backgroundColor: '#fff3e0', borderTop: '1px solid #ffcc80' }}>
            <Chip label="PRODUCTION SELECTED" size="small" color="error" sx={{ fontWeight: 'bold', fontSize: '0.65rem', height: 20 }} />
          </Box>
        )}

        {/* Footer: Clear + Apply */}
        <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 0.75, borderTop: '1px solid var(--border-light)' }}>
          {canSelectEnvironment && (
            <>
              <Button
                size="small"
                onClick={() => setUncommittedEnvironments(searchFilteredEnvironments.filter((e) => e && e.uuid))}
                disabled={searchFilteredEnvironments.length === 0 || uncommittedEnvironments.length === searchFilteredEnvironments.length}
                sx={{ fontSize: '0.72rem', textTransform: 'none', color: 'var(--theme-text-secondary)' }}
              >
                Select all
              </Button>
              <Button
                size="small"
                onClick={clearEnvironmentSelections}
                disabled={uncommittedEnvironments.length === 0}
                sx={{ fontSize: '0.72rem', textTransform: 'none', color: 'var(--theme-text-secondary)' }}
              >
                Clear
              </Button>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={async () => {
              await applyEnvironmentSelections();
              setCustomerEnvDialogOpen(false);
              setCustomerEnvAnchorEl(null);
              setEnvironmentSearchValue('');
            }}
            disabled={!hasUncommittedChanges || uncommittedEnvironments.length === 0 || applyingEnvironments}
            sx={{ fontSize: '0.78rem', textTransform: 'none', fontWeight: 600 }}
            startIcon={applyingEnvironments ? <CircularProgress size={12} color="inherit" /> : null}
          >
            {applyingEnvironments ? 'Applying...' : `Apply (${uncommittedEnvironments.length})`}
          </Button>
        </Box>
        </Box>{/* end right column */}
      </Popover>

      {/* Customer Edit/Create Dialog — Edit (✏) opens with the loaded customer;
          Add (+, root only) opens with null data → CustomerEditDialog create mode. */}
      <CustomerEditDialog
        open={customerEditDialogOpen}
        onClose={() => { setCustomerEditDialogOpen(false); setCustomerDialogMode('edit'); }}
        onSave={customerDialogMode === 'create' ? handleCustomerCreate : handleCustomerSave}
        customerData={customerDialogMode === 'create' ? (customerToEdit || null) : (customerToEdit || detailedCustomerData)}
        loading={accountLoading || accountSaving}
      />

      {/* Nodes Popover */}
      <Popover
        open={Boolean(nodesPopoverAnchor)}
        anchorEl={nodesPopoverAnchor}
        onClose={() => { setNodesPopoverAnchor(null); setExpandedNodeJson(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{
          '& .MuiPaper-root': {
            width: 220,
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            backgroundColor: 'var(--theme-bg-primary)',
            mt: 0.5,
          }
        }}
      >
        <Box sx={{ p: 1.5, borderBottom: '1px solid var(--border-light)' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 1 }}>
            Nodes ({orgNodes.length})
          </Typography>
        </Box>
        {orgNodes.filter(n => n.name).map((node) => (
          <Box key={node.uuid || node.id} sx={{ borderBottom: '1px solid var(--border-light)' }}>
            <Box sx={{ px: 1.5, py: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <StorageIcon sx={{ fontSize: 14, color: 'var(--theme-text-secondary)' }} />
                <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.name}
                </Typography>
              </Box>
              {node.type && (
                <Chip label={node.type} size="small" sx={{ height: 16, fontSize: '0.6rem', mb: 0.5, bgcolor: 'var(--theme-hover)' }} />
              )}
              {node.ip_address_internal && (
                <Typography sx={{ fontSize: '0.62rem', color: 'var(--theme-text-secondary)', fontFamily: 'monospace' }}>
                  {node.ip_address_internal}
                </Typography>
              )}
              {node.roles?.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.25, mt: 0.25, flexWrap: 'wrap' }}>
                  {node.roles.map(role => (
                    <Chip key={role} label={role} size="small" sx={{ height: 14, fontSize: '0.55rem', bgcolor: 'var(--theme-bg-secondary)' }} />
                  ))}
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 0.25, mt: 0.5 }}>
                <Tooltip title="JSON">
                  <IconButton size="small" onClick={() => setExpandedNodeJson(prev => prev === node.uuid ? null : node.uuid)} sx={{ p: 0.25 }}>
                    <CodeIcon sx={{ fontSize: 13, color: 'var(--theme-text-secondary)' }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Monitoring">
                  <IconButton size="small" onClick={() => { setNodesPopoverAnchor(null); navigate(`/monitoring?node=${encodeURIComponent(node.name)}`); }} sx={{ p: 0.25 }}>
                    <MonitorHeartIcon sx={{ fontSize: 13, color: 'var(--theme-text-secondary)' }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Logs">
                  <IconButton size="small" onClick={() => { setNodesPopoverAnchor(null); navigate(`/logs?host=${encodeURIComponent(node.name)}`); }} sx={{ p: 0.25 }}>
                    <TerminalIcon sx={{ fontSize: 13, color: 'var(--theme-text-secondary)' }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Node health (Gatus)">
                  <IconButton
                    size="small"
                    onClick={() => { setNodesPopoverAnchor(null); setHealthNode(node); setHealthDialogOpen(true); }}
                    sx={{ p: 0.25 }}
                  >
                    <CircleIcon sx={{ fontSize: 12, color: '#10b981' }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            {expandedNodeJson === node.uuid && (
              <Box sx={{ px: 1, pb: 1 }}>
                <Box sx={{ p: 0.75, bgcolor: 'var(--theme-bg-secondary)', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.62rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflow: 'auto', color: 'var(--theme-text-primary)' }}>
                  {JSON.stringify(node, null, 2)}
                </Box>
              </Box>
            )}
          </Box>
        ))}
      </Popover>

      {/* Notification Drawer */}
      <Drawer
        anchor="right"
        open={notificationDrawerOpen}
        onClose={handleNotificationDrawerClose}
        sx={{
          '& .MuiDrawer-paper': {
            width: { xs: '100%', sm: 400 },
            maxWidth: '100vw',
            backgroundColor: 'var(--theme-bg-primary)'
          }
        }}
      >
        <Box sx={{ p: 2, height: '100%', minHeight: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, flexShrink: 0 }}>
            {selectedNotification && <Button onClick={() => setSelectedNotification(null)}>Back to notifications</Button>}
            <IconButton aria-label="Close notifications" onClick={handleNotificationDrawerClose} sx={{ ml: 'auto' }}><CloseIcon /></IconButton>
          </Box>
          {notificationDrawerOpen && (selectedNotification ? (
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <NotificationPanel
                notification={selectedNotification}
                onClose={() => setSelectedNotification(null)}
                onMarkAsRead={notificationsApi.markRead}
                onDelete={async uuid => { await deleteNotification(uuid); setSelectedNotification(null); }}
                fetchNotificationDetails={fetchNotificationDetails}
              />
            </Box>
          ) : (
            <MonitoringSidebar notificationType="" onSelect={handleNotificationSelect} onCountChange={setBadgeCount} />
          ))}
        </Box>
      </Drawer>

      {/* Health Details Dialog */}
      <Dialog open={healthDialogOpen} onClose={() => { setHealthDialogOpen(false); setHealthNode(null); }} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircleIcon sx={{ fontSize: 20, color: (healthNode ? nodeHealth.isHealthy : healthStatus.isHealthy) ? '#4caf50' : '#f44336' }} />
          {healthNode ? `${healthNode.name} · Gatus health` : 'Health'}
        </DialogTitle>
        <DialogContent dividers>
          {/* Main icon: authenticated API detail. Node button: that node's
              Gatus relay over NATS. Keep both explicit and independently fast. */}
          {healthNode ? (
            <GatusHealthPanel
              endpoints={nodeHealth.endpoints}
              summary={nodeHealth.summary}
              loading={nodeHealth.loading}
              error={nodeHealth.error}
              title={`${healthNode.name} · Monitors`}
              detailApiBase={`/custom/nodes/${encodeURIComponent(healthNode.uuid || healthNode.id || healthNode.name)}/endpoints`}
            />
          ) : (
            healthDialogOpen && <ApiHealthPanel />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setHealthDialogOpen(false); setHealthNode(null); }}>Close</Button>
        </DialogActions>
      </Dialog>


      <ToolDialog title="Events" open={eventsModalOpen && canAccess('logs')} onClose={() => setEventsModalOpen(false)}>
        <Suspense fallback={<CircularProgress sx={{ m: 'auto' }} />}>
          <Events key={eventsModalParams} initialParams={eventsModalParams} />
        </Suspense>
      </ToolDialog>
      <ToolDialog
        key={activeTool || 'closed'}
        title={activeToolItem?.text || ''}
        open={Boolean(activeToolItem)}
        onClose={() => setActiveTool(null)}
        confirmClose={activeTool === '/providers' || activeTool === '/templates'}
      >
        {ActiveToolScreen && <Suspense fallback={<CircularProgress sx={{ m: 'auto' }} />}>
          <Box sx={{ flex: 1, minHeight: 0, height: '100%', overflow: 'auto', p: activeTool === '/nodes' ? 2 : 0 }}>
            <ActiveToolScreen />
          </Box>
        </Suspense>}
      </ToolDialog>

      {/* Wizard Modal — reuses the Schema screen for quick resource creation. */}
      <Dialog
        open={wizardModalOpen}
        onClose={() => setWizardModalOpen(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{ sx: { height: '90vh', display: 'flex', flexDirection: 'column' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5, pr: 1 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>Wizard</Typography>
          <Tooltip title="Open full page">
            <IconButton size="small" onClick={() => { setWizardModalOpen(false); navigate('/schema'); }}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={() => setWizardModalOpen(false)} sx={{ ml: 0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Box sx={{ flex: 1, overflow: 'auto', p: 0 }}>
          {wizardModalOpen && (
            <Suspense fallback={null}>
              <Schema />
            </Suspense>
          )}
        </Box>
      </Dialog>

      {/* Tickets Modal — full table + detail view with conversations */}
      <Dialog
        open={ticketsModalOpen}
        onClose={() => { setTicketsModalOpen(false); handleCloseTicketDetail(); }}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { height: '85vh', display: 'flex', flexDirection: 'column' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5, pr: 1 }}>
          <ConfirmationNumberIcon color="primary" sx={{ fontSize: 22 }} />
          <Typography variant="h6" sx={{ flex: 1 }}>Tickets</Typography>
          {/* Support widget — Zendesk's answer bot suggests Help Center
              articles first, and "Get in touch" opens a ticket that lands in
              this same list (tagged with the account's customer). */}
          <Button
            size="small"
            variant="outlined"
            startIcon={<AutoAwesomeIcon />}
            onClick={openZendeskWidget}
            sx={{ textTransform: 'none', fontSize: '0.8rem', mr: 1 }}
          >
            Get help
          </Button>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={handleTicketRefresh} disabled={ticketsLoading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open Zendesk">
            <IconButton size="small" component="a" href="https://voipappz.zendesk.com/agent" target="_blank">
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={() => { setTicketsModalOpen(false); handleCloseTicketDetail(); }} sx={{ ml: 0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        {/* Filter Chips — click to filter by status, click active chip to clear */}
        <Box sx={{ px: 3, pb: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { status: 'new', label: 'New', count: ticketStats.new, color: 'info' },
            { status: 'open', label: 'Open', count: ticketStats.open, color: 'warning' },
            { status: 'pending', label: 'Pending', count: ticketStats.pending, color: 'default' },
            { status: 'solved', label: 'Solved', count: ticketStats.solved, color: 'success' },
          ].map(({ status, label, count, color }) => (
            <Chip
              key={status}
              label={`${label}: ${count || 0}`}
              size="small"
              color={color}
              variant={ticketFilters.status === status ? 'filled' : 'outlined'}
              onClick={() => handleTicketFiltersChange({ status: ticketFilters.status === status ? '' : status })}
              sx={{ cursor: 'pointer' }}
            />
          ))}
          <Chip
            label={`Total: ${ticketStats.total || 0}`}
            size="small"
            variant={!ticketFilters.status ? 'filled' : 'outlined'}
            onClick={() => handleTicketFiltersChange({ status: '' })}
            sx={{ ml: 'auto', cursor: 'pointer' }}
          />
        </Box>

        {/* Content: Table + Detail View side by side or stacked */}
        <DialogContent sx={{ p: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Tickets Table */}
            <Box sx={{ flex: ticketDetailOpen ? '0 0 45%' : 1, overflow: 'auto', borderRight: ticketDetailOpen ? '1px solid var(--border-color, #e5e7eb)' : 'none' }}>
              <TableContainer>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width={70}>ID</TableCell>
                      <TableCell>
                        <TableSortLabel active={ticketSortBy === 'status'} direction={ticketSortBy === 'status' ? ticketSortOrder : 'asc'} onClick={() => handleTicketSortChange('status')}>
                          Status
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>Subject</TableCell>
                      <TableCell>
                        <TableSortLabel active={ticketSortBy === 'priority'} direction={ticketSortBy === 'priority' ? ticketSortOrder : 'asc'} onClick={() => handleTicketSortChange('priority')}>
                          Priority
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel active={ticketSortBy === 'updated_at'} direction={ticketSortBy === 'updated_at' ? ticketSortOrder : 'asc'} onClick={() => handleTicketSortChange('updated_at')}>
                          Updated
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel active={ticketSortBy === 'created_at'} direction={ticketSortBy === 'created_at' ? ticketSortOrder : 'asc'} onClick={() => handleTicketSortChange('created_at')}>
                          Created
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="center" width={70}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ticketsLoading && tickets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                          <CircularProgress size={28} />
                        </TableCell>
                      </TableRow>
                    ) : tickets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                          <Typography variant="body2" color="text.secondary">No tickets found</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      tickets.map((ticket) => {
                        const statusColor = { new: 'info', open: 'warning', pending: 'default', hold: 'secondary', solved: 'success', closed: 'default' }[ticket.status] || 'default';
                        const priorityColor = { urgent: 'error', high: 'warning', normal: 'primary', low: 'default' }[ticket.priority] || 'default';
                        const relTime = (d) => {
                          if (!d) return '-';
                          const ms = Date.now() - new Date(d).getTime();
                          const m = Math.floor(ms / 60000), h = Math.floor(m / 60), dy = Math.floor(h / 24);
                          if (m < 1) return 'just now';
                          if (m < 60) return `${m}m ago`;
                          if (h < 24) return `${h}h ago`;
                          if (dy < 7) return `${dy}d ago`;
                          return new Date(d).toLocaleDateString();
                        };
                        return (
                          <TableRow
                            key={ticket.id}
                            hover
                            selected={selectedTicket?.id === ticket.id}
                            sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: '#e3f2fd !important' } }}
                            onClick={() => handleOpenTicketDetail(ticket)}
                          >
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">#{ticket.id}</Typography>
                            </TableCell>
                            <TableCell>
                              <Chip label={ticket.status?.charAt(0).toUpperCase() + ticket.status?.slice(1) || 'Unknown'} size="small" color={statusColor} />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: ticketDetailOpen ? 200 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ticket.subject || 'No subject'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip label={ticket.priority?.charAt(0).toUpperCase() + ticket.priority?.slice(1) || 'Normal'} size="small" color={priorityColor} variant="outlined" />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">{relTime(ticket.updated_at)}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">{relTime(ticket.created_at)}</Typography>
                            </TableCell>
                            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                              <Tooltip title="View in Zendesk">
                                <IconButton size="small" component="a" href={`https://voipappz.zendesk.com/agent/tickets/${ticket.id}`} target="_blank">
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                component="div"
                count={ticketTotalCount}
                page={ticketPage}
                onPageChange={handleTicketPageChange}
                rowsPerPage={ticketRowsPerPage}
                onRowsPerPageChange={handleTicketRowsPerPageChange}
                rowsPerPageOptions={[10, 25, 50]}
                sx={{ borderTop: '1px solid var(--border-color, #e5e7eb)' }}
              />
            </Box>

            {/* Ticket Detail View — conversations, replies, status/priority editing */}
            {ticketDetailOpen && (
              <Box sx={{ flex: '0 0 55%', overflow: 'auto' }}>
                <TicketDetailView
                  ticket={selectedTicket}
                  comments={ticketComments}
                  loading={ticketsLoading}
                  onClose={handleCloseTicketDetail}
                  onUpdateTicket={handleUpdateTicket}
                  onAddComment={handleAddTicketComment}
                  onRefresh={fetchTicketDetailsForRefresh}
                />
              </Box>
            )}
          </Box>
        </DialogContent>
      </Dialog>


      {/* Account Dialogs */}
      <AccountDialog
        open={accountDialogOpen}
        onClose={() => setAccountDialogOpen(false)}
        onSave={handleAccountSave}
        onSignOut={() => { setAccountDialogOpen(false); logout(); navigate('/admin'); }}
        account={detailedAccountData || user || null}
        loading={accountLoading || accountSaving}
        environments={accountEnvironments}
        environmentsLoading={accountEnvironmentsLoading}
        acls={accountAcls}
        aclsLoading={accountAclsLoading}
      />
      <AccountCreateDialog
        open={accountCreateDialogOpen}
        onClose={handleCloseAccountCreateDialog}
        onSave={createAccount}
        loading={accountSaving}
        environments={accountEnvironments}
        environmentsLoading={accountEnvironmentsLoading}
        onSearchEnvironments={searchAccountEnvironments}
        acls={accountAcls}
        aclsLoading={accountAclsLoading}
      />
      {/* Command Palette — universal search. initialQuery lets page-level
          search inputs pre-seed the global palette when the user escalates. */}
      <CommandPalette
        open={resourceSearchOpen}
        onClose={() => { setResourceSearchOpen(false); setResourceSearchInitialQuery(''); }}
        initialQuery={resourceSearchInitialQuery}
      />

      {/* Info Popover (shared for environment rows) */}
      <InfoPopover
        anchorEl={infoPopover.anchorEl}
        onClose={handleInfoClose}
        title={infoPopover.title}
        entries={infoPopover.entries}
      />

      {/* Application live charts — call counts/durations per application,
          opened from the selector's Applications header */}
      <LiveDrawer
        open={envChartsOpen}
        onClose={() => setEnvChartsOpen(false)}
        title="Application Live Charts"
        icon={<ShowChartIcon sx={{ color: '#8b5cf6' }} />}
      >
        {envChartsOpen && <EnvironmentChartsPanel open={envChartsOpen} />}
      </LiveDrawer>

      {/* Environment Create/Edit Dialog */}
      <EnvironmentDialog
        open={envDialogOpen}
        onClose={() => { setEnvDialogOpen(false); setEnvDialogEnvironment(null); }}
        onSave={handleEnvSave}
        environment={envDialogEnvironment}
        loading={envSaving}
      />

      {/* Environment Delete Confirmation */}
      <ConfirmDialog
        open={envDeleteConfirmOpen}
        onClose={() => setEnvDeleteConfirmOpen(false)}
        onConfirm={handleEnvDelete}
        loading={envSaving}
        title="Delete Application"
        entityName={envToDelete?.name}
      />

    </>
  );
};

export default TopBar;
