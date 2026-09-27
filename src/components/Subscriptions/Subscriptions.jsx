import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Chip,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Skeleton,
  TableSortLabel,
  TextField,
  Badge,
  Menu,
  MenuItem
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  MoreVert as MoreVertIcon,
  Cancel as CancelIcon,
  Stop as TerminateIcon,
  ContentCopy as DuplicateIcon,
  EventNote as EventsIcon,
  Add as AddIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
} from '@mui/icons-material';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ConfirmDialog } from '../ui';
import { useSubscriptions } from './Subscriptions.js';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import { usePermissions } from '../../hooks/usePermissions';
import SubscriptionDialog from './SubscriptionDialog/SubscriptionDialog';
import { PlanBridge } from '../Bridges/PlanBridge/PlanBridge.jsx';
import { TariffBridge } from '../Bridges/TariffBridge/TariffBridge.jsx';
import { plansApi } from '../../services/api/plansApi';
import { tariffsApi } from '../../services/api/tariffsApi';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import AddBalanceDialog from './AddBalanceDialog.jsx';
import SubscriptionTransactionsDialog from './SubscriptionTransactionsDialog.jsx';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useNotification } from '../../context/NotificationContext';
import useCentralizedSearch from '../../hooks/useCentralizedSearch';
import { orEmpty, stripedTableRowSx } from '../shared/tableTheme.jsx';
import MetaTagChips from '../common/MetaTagChips/MetaTagChips';
import { getEnabledChipProps, getStatusChipProps } from '../../utils/chipStyles';
import HelpButton from '../common/HelpButton';
import { GUIDE_URLS } from '../../utils/guides';
import './Subscriptions.css';

/**
 * ActionConfirmDialog Component
 * Confirmation dialog for special actions (cancel, terminate)
 */
const ActionConfirmDialog = ({ open, onClose, onConfirm, subscription, action, loading }) => {
  // Optional reason, sent with PATCH ?action=cancel.
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);

  const actionLabels = {
    cancel: 'Cancel',
    terminate: 'Terminate'
  };

  const actionDescriptions = {
    cancel: 'This will schedule the subscription for cancellation at the next billing period.',
    terminate: 'This will immediately terminate the subscription. This action cannot be undone.'
  };

  const actionColors = {
    cancel: 'warning',
    terminate: 'error'
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{actionLabels[action]} Subscription</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to {action} subscription{' '}
          <strong>{subscription?.name}</strong>?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {actionDescriptions[action]}
        </Typography>
        {action === 'cancel' && (
          <TextField
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            size="small"
            sx={{ mt: 2 }}
            placeholder="Why is this subscription being cancelled?"
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(reason)}
          variant="contained"
          color={actionColors[action]}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {actionLabels[action]}
        </Button>
      </DialogActions>
    </Dialog>
  );
};


// The table carries 15 columns, so it always scrolls horizontally on a normal
// screen — and Actions, the only interactive column, sat past the right edge:
// every row was unreachable without scrolling through 14 columns first. Pin it
// to the right instead. The cell needs an OPAQUE background or rows scroll
// visibly underneath it; row state (striping/hover/selection) is layered back
// on via stickyActionsRowSx below, with the translucent hover tint composited
// over the opaque base as a gradient.
const STICKY_ACTIONS_CLASS = 'subscriptions-sticky-actions';

const stickyActionsCellSx = {
  position: 'sticky',
  right: 0,
  zIndex: 1,
  backgroundColor: 'var(--theme-bg-primary)',
  borderLeft: '1px solid var(--theme-border, #e5e7eb)',
};

// Header corner: sticky in both axes, above the other sticky header cells.
const stickyActionsHeadSx = {
  ...stickyActionsCellSx,
  zIndex: 3,
};

const stickyActionsRowSx = {
  [`&:nth-of-type(even) .${STICKY_ACTIONS_CLASS}`]: {
    backgroundColor: 'var(--theme-bg-secondary)',
  },
  [`&:hover .${STICKY_ACTIONS_CLASS}`]: {
    backgroundImage: 'linear-gradient(var(--theme-hover), var(--theme-hover))',
  },
  [`&.Mui-selected .${STICKY_ACTIONS_CLASS}`]: {
    backgroundColor: '#e3f2fd',
  },
};

/**
 * Subscriptions Component
 * Main component for subscriptions management with full-width table layout
 */
const Subscriptions = () => {
  const { can } = usePermissions();
  const canWrite = can('subscriptions', 'write');
  const { registerScreen, unregisterScreen } = useGlobalSearch();

  const {
    subscriptions,
    loading,
    dialogLoading,
    selectedSubscription,
    dialogOpen,
    deleteDialogOpen,
    subscriptionToDelete,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    plans,
    plansLoading,
    tariffs,
    statuses,
    environments,
    handleOpenDialog,
    handleCloseDialog,
    handleSaveSubscription,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteSubscription,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    handleResetFilters,
    fetchSubscriptions,
    fetchPlans, // For PlanSelect to refresh after create/edit
    // Special Actions
    handleCancelSubscription,
    handleTerminateSubscription,
    handleDuplicateSubscription,
  } = useSubscriptions();


  // Per-row "N events" badge — one counts call for the whole list.

  // Menu state for more actions
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [menuSubscription, setMenuSubscription] = useState(null);
  
  // Action confirmation dialogs
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState(null);
  const [actionSubscription, setActionSubscription] = useState(null);
  
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState(null);

  // Add-balance dialog (tops up subscription.balance).
  const { showSuccess, showError } = useNotification();
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceSub, setBalanceSub] = useState(null);
  // Transactions dialog — the subscription's per-period ledger from the list
  // (same gesture as the old wallets view).
  const [txOpen, setTxOpen] = useState(false);
  const [txSub, setTxSub] = useState(null);

  // Inline plan / tariff edit dialogs — plan and tariff names in the table link here.
  const [planEdit, setPlanEdit] = useState(null);     // full plan object being edited
  const [tariffEdit, setTariffEdit] = useState(null); // full tariff object being edited

  const openPlanEdit = useCallback(async (planUuid) => {
    if (!planUuid) return;
    try {
      const plan = await plansApi.getPlan(planUuid);
      setPlanEdit(plan?.data || plan);
    } catch (err) {
      console.error('Failed to load plan for edit:', err);
      showError('Failed to load plan');
    }
  }, [showError]);

  const openTariffEdit = useCallback(async (tariffUuid) => {
    if (!tariffUuid) return;
    try {
      const tariff = await tariffsApi.getTariff(tariffUuid);
      setTariffEdit(tariff?.data || tariff);
    } catch (err) {
      console.error('Failed to load tariff for edit:', err);
      showError('Failed to load tariff');
    }
  }, [showError]);

  // Register search segments with GlobalSearchContext
  const subscriptionSegments = useMemo(() => [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'plan_uuid', label: 'Plan', type: 'select', data: (plans || []).map(p => ({ uuid: p.uuid, name: p.name })) },
    { name: 'environment_uuid', label: 'Application', type: 'select', data: (environments || []).map(e => ({ uuid: e.uuid, name: e.name })) },
    { name: 'status', label: 'Status', type: 'select', data: [{ uuid: 'active', name: 'Active' }, { uuid: 'suspended', name: 'Suspended' }, { uuid: 'cancelled', name: 'Cancelled' }] },
    { name: 'type', label: 'Type', type: 'select', data: [{ uuid: 'prepaid', name: 'Prepaid' }, { uuid: 'postpaid', name: 'Postpaid' }] },
    { name: 'balance', label: 'Balance', type: 'numeric' },
    { name: 'begins_at', label: 'Start Date', type: 'date' },
    { name: 'ends_at', label: 'End Date', type: 'date' },
    { name: 'enabled', label: 'Enabled', type: 'select', data: [{ uuid: 'true', name: 'Yes' }, { uuid: 'false', name: 'No' }] },
    { name: 'recurring', label: 'Recurring', type: 'select', data: [{ uuid: 'true', name: 'Yes' }, { uuid: 'false', name: 'No' }] },
    { name: 'meta', label: 'Tag', type: 'tag', url: '/api/subscription?action=meta_keys' },
  ], [plans, environments]);

  // CentralizedSearch hook - bridges CentralizedSearch events to subscription filters
  const handleCentralizedFiltersChange = useCallback((parsedFilters) => {
    const remapped = { ...parsedFilters };
    // 'search' from quick-search text maps to 'name' filter
    if ('search' in remapped) {
      remapped.name = remapped.search;
      delete remapped.search;
    }
    handleFiltersChange(remapped);
  }, [handleFiltersChange]);

  const {
    dateRange,
    quickSearchText,
    currentSearchParams,
    handleFilterChange,
    handleQuickSearch,
    handleQuickSearchChange,
    handleClearAllFilters,
    handleDateRangeChange,
    handleRefresh,
  } = useCentralizedSearch({
    onFiltersChange: handleCentralizedFiltersChange,
    onResetFilters: handleResetFilters,
    onRefresh: fetchSubscriptions,
  });

  useEffect(() => {
    registerScreen('subscriptions', subscriptionSegments, {
      onSearch: (params) => {
        const newFilters = {};
        Object.entries(params).forEach(([key, value]) => {
          if (key === 'search[text]') {
            newFilters.name = value;
          } else {
            const match = key.match(/search\[(\w+)\]/);
            if (match) newFilters[match[1]] = value;
          }
        });
        handleFiltersChange(newFilters);
      },
      onClear: () => {
        handleResetFilters();
      },
    });
    return () => unregisterScreen();
  }, [subscriptionSegments, registerScreen, unregisterScreen, handleFiltersChange, handleResetFilters]);

  // Listen for environment change events to refresh data
  useEffect(() => {
    const handleEnvironmentChange = () => {
      console.log('🔄 Environment changed, refreshing Subscriptions data...');
      fetchSubscriptions();
    };

    window.addEventListener('environmentChanged', handleEnvironmentChange);

    return () => {
      window.removeEventListener('environmentChanged', handleEnvironmentChange);
    };
  }, [fetchSubscriptions]);

  const handleSelectSubscription = (subscriptionId) => {
    setSelectedSubscriptionId(subscriptionId);
  };

  // Menu handlers
  const handleMenuOpen = (event, subscription) => {
    setMenuAnchorEl(event.currentTarget);
    setMenuSubscription(subscription);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuSubscription(null);
  };

  // Action dialog handlers
  const handleOpenActionDialog = (subscription, action) => {
    setActionSubscription(subscription);
    setActionType(action);
    setActionDialogOpen(true);
    handleMenuClose();
  };

  const handleCloseActionDialog = () => {
    setActionDialogOpen(false);
    setActionSubscription(null);
    setActionType(null);
  };

  const handleConfirmAction = async (reason = '') => {
    if (!actionSubscription || !actionType) return;

    try {
      switch (actionType) {
        case 'cancel':
          await handleCancelSubscription(actionSubscription, reason);
          break;
        case 'terminate':
          await handleTerminateSubscription(actionSubscription);
          break;
        default:
          break;
      }
      handleCloseActionDialog();
    } catch (error) {
      // Error handling is done in the hook
      console.error('Action failed:', error);
    }
  };

  // Balance is integer units (prepaid: remaining credit; postpaid: period usage).
  const formatBalance = (amount) => new Intl.NumberFormat('en-US').format(amount || 0);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Box
      className="subscriptions-container"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        px: { xs: 0.5, sm: 1.5 },
        py: { xs: 0.5, sm: 1 },
        height: '100%',
        width: '100%'
      }}
    >
      {/* Header: Search + Add Button on one line */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CentralizedSearch
            segments={subscriptionSegments}
            currentSearchParams={currentSearchParams}
            onFilterChange={handleFilterChange}
            onQuickSearch={handleQuickSearch}
            onClearAllFilters={handleClearAllFilters}
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            onRefresh={handleRefresh}
            quickSearchText={quickSearchText}
            onQuickSearchChange={handleQuickSearchChange}
            placeholder="Search by name, or use field:value (e.g. enabled:true)"
          />
        </Box>
        {canWrite && (
          <Tooltip title="Add Subscription">
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleOpenDialog(null)}
              disabled={loading}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>


      {/* Billing report charts — fixed Events-style strip with report swap */}

      {/* Subscriptions Table Area - Full width, no sidebar */}
      <Paper
        className="subscriptions-content"
        elevation={1}
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          borderRadius: 2,
        }}
      >
        {/* Subscriptions Table */}
        {/* ONE scroll container for both axes. Previously an outer Box scrolled
            as well, so the sticky header and the pinned Actions column resolved
            against different scrollers (and pagination scrolled out of reach). */}
        <TableContainer sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'created_at'}
                      direction={sortBy === 'created_at' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('created_at')}
                    >
                      Created At
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'updated_at'}
                      direction={sortBy === 'updated_at' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('updated_at')}
                    >
                      Updated At
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center">
                    <TableSortLabel
                      active={sortBy === 'enabled'}
                      direction={sortBy === 'enabled' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('enabled')}
                    >
                      Enabled
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>
                    <TableSortLabel
                      active={sortBy === 'name'}
                      direction={sortBy === 'name' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('name')}
                    >
                      Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 160 }}>
                    <TableSortLabel
                      active={sortBy === 'plan_name'}
                      direction={sortBy === 'plan_name' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('plan_name')}
                    >
                      Plan
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 180 }}>
                    <TableSortLabel
                      active={sortBy === 'environment_name'}
                      direction={sortBy === 'environment_name' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('environment_name')}
                    >
                      Application
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'status'}
                      direction={sortBy === 'status' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('status')}
                    >
                      Status
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 160 }}>Tariff</TableCell>
                  <TableCell align="center">
                    <TableSortLabel
                      active={sortBy === 'type'}
                      direction={sortBy === 'type' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('type')}
                    >
                      Type
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortBy === 'balance'}
                      direction={sortBy === 'balance' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('balance')}
                    >
                      Balance
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="center">Recurring</TableCell>
                  <TableCell>Begins At</TableCell>
                  <TableCell>Ends At</TableCell>
                  <TableCell>Tags</TableCell>
                  <TableCell align="center" className={STICKY_ACTIONS_CLASS} sx={stickyActionsHeadSx}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && subscriptions.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 15 }).map((__, j) => (
                        <TableCell key={j}><Skeleton height={20} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : subscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No subscriptions found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  subscriptions.map((subscription) => {
                    const subscriptionId = subscription.id || subscription.uuid;
                    const isSelected = selectedSubscriptionId === subscriptionId;

                    return (
                      <TableRow
                        key={subscriptionId}
                        hover
                        selected={isSelected}
                        sx={{
                          ...stripedTableRowSx,
                          ...stickyActionsRowSx,
                          cursor: 'pointer',
                          '&.Mui-selected': {
                            bgcolor: '#e3f2fd !important'
                          }
                        }}
                        onClick={() => handleSelectSubscription(subscriptionId)}
                      >
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(subscription.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(subscription.updated_at)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip {...getEnabledChipProps(subscription.enabled)} />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>
                          <Tooltip title={subscription.name || ''} placement="top-start">
                            <Typography variant="body2" fontWeight={600} noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {orEmpty(subscription.name)}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 160 }}>
                          {/* Plan name links to the plan edit dialog */}
                          {(subscription.plan?.name || subscription.plan_name) ? (
                            <Tooltip title="Edit plan" placement="top-start">
                              <Typography
                                variant="body2"
                                noWrap
                                onClick={(e) => { e.stopPropagation(); openPlanEdit(subscription.plan?.uuid || subscription.plan_uuid); }}
                                sx={{
                                  overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer',
                                  color: 'primary.main', '&:hover': { textDecoration: 'underline' },
                                }}
                              >
                                {subscription.plan?.name || subscription.plan_name}
                              </Typography>
                            </Tooltip>
                          ) : (
                            <Typography variant="body2" noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {orEmpty(null)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 180 }}>
                          <Tooltip title={subscription.environment?.name || ''} placement="top-start">
                            <Typography variant="body2" noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {orEmpty(subscription.environment?.name)}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Chip {...getStatusChipProps(subscription.status || 'active')} />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 160 }}>
                          {/* Tariff name links to the tariff edit dialog. The list
                              API returns tariff_uuid only, so resolve the name from
                              the loaded tariffs when the nested object is absent. */}
                          {(() => {
                            const tariffUuid = subscription.tariff?.uuid || subscription.tariff_uuid;
                            const tariffName = subscription.tariff?.name
                              || (tariffs || []).find((t) => t.uuid === tariffUuid)?.name;
                            return tariffUuid && tariffName ? (
                              <Tooltip title="Edit tariff" placement="top-start">
                                <Typography
                                  variant="body2"
                                  noWrap
                                  onClick={(e) => { e.stopPropagation(); openTariffEdit(tariffUuid); }}
                                  sx={{
                                    overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer',
                                    color: 'primary.main', '&:hover': { textDecoration: 'underline' },
                                  }}
                                >
                                  {tariffName}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography variant="body2" noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {orEmpty(null)}
                              </Typography>
                            );
                          })()}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={subscription.type || 'postpaid'}
                            size="small"
                            color={subscription.type === 'prepaid' ? 'info' : 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip
                            title={subscription.type === 'prepaid'
                              ? 'Remaining credit (units)'
                              : 'Current-period usage (units)'}
                            placement="top"
                          >
                            <Typography variant="body2" fontWeight={600}>
                              {formatBalance(subscription.balance)}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={subscription.recurring ? 'Yes' : 'No'}
                            size="small"
                            color={subscription.recurring ? 'primary' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(subscription.begins_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(subscription.ends_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <MetaTagChips meta={subscription.meta} />
                        </TableCell>
                        <TableCell
                          align="center"
                          className={STICKY_ACTIONS_CLASS}
                          sx={stickyActionsCellSx}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                            {canWrite && (
                              <Tooltip
                                title="Add balance"
                              >
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={() => { setBalanceSub(subscription); setBalanceOpen(true); }}
                                    disabled={loading}
                                  >
                                    <AccountBalanceWalletIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            <Tooltip title="Transactions (period invoices)">
                              <IconButton
                                size="small"
                                onClick={() => { setTxSub(subscription); setTxOpen(true); }}
                                disabled={loading}
                              >
                                <ReceiptLongIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {canWrite && (
                              <Tooltip title="Edit subscription">
                                <IconButton
                                  size="small"
                                  onClick={() => handleOpenDialog(subscription)}
                                  disabled={loading}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canWrite && (
                              <Tooltip title="Delete subscription">
                                <IconButton
                                  size="small"
                                  onClick={() => handleOpenDeleteDialog(subscription)}
                                  disabled={loading}
                                  color="error"
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="More actions">
                              <IconButton
                                size="small"
                                onClick={(event) => handleMenuOpen(event, subscription)}
                                disabled={loading}
                              >
                                <MoreVertIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
        </TableContainer>

          {/* Pagination — outside the scroller so it stays visible */}
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={handlePageChange}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={[10, 25, 50, 100]}
            sx={{ borderTop: '1px solid var(--mui-palette-divider)', flexShrink: 0 }}
          />
      </Paper>

      {/* Context Menu for More Actions */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        MenuListProps={{
          'aria-labelledby': 'more-actions-button',
        }}
      >
        {canWrite && (
          <MenuItem onClick={() => handleOpenActionDialog(menuSubscription, 'cancel')}>
            <CancelIcon fontSize="small" sx={{ mr: 1 }} />
            Cancel Subscription
          </MenuItem>
        )}
        {canWrite && (
          <MenuItem onClick={() => handleOpenActionDialog(menuSubscription, 'terminate')}>
            <TerminateIcon fontSize="small" sx={{ mr: 1 }} />
            Terminate Subscription
          </MenuItem>
        )}
        {canWrite && (
          <MenuItem onClick={() => {
            handleDuplicateSubscription(menuSubscription);
            handleMenuClose();
          }}>
            <DuplicateIcon fontSize="small" sx={{ mr: 1 }} />
            Duplicate Subscription
          </MenuItem>
        )}
      </Menu>

      {/* Create/Edit Dialog */}
      <SubscriptionDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveSubscription}
        subscription={selectedSubscription}
        loading={dialogLoading}
        plans={plans}
        plansLoading={plansLoading}
        statuses={statuses}
        environments={environments}
        tariffs={tariffs}
        onRefreshPlans={fetchPlans}
        canWrite={canWrite}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteSubscription}
        loading={dialogLoading}
        title="Delete Subscription"
        message={<Typography>Are you sure you want to delete subscription{' '}
          <strong>{(subscriptionToDelete)?.name}</strong>?</Typography>}
        description="This action cannot be undone and will affect billing."
      />

      {/* Action Confirmation Dialog */}
      <ActionConfirmDialog
        open={actionDialogOpen}
        onClose={handleCloseActionDialog}
        onConfirm={handleConfirmAction}
        subscription={actionSubscription}
        action={actionType}
        loading={dialogLoading}
      />

      {/* Plan edit — opened from the plan name link in the table */}
      <PlanBridge
        open={Boolean(planEdit)}
        onClose={() => setPlanEdit(null)}
        onSave={() => { setPlanEdit(null); fetchPlans(); fetchSubscriptions(); }}
        plan={planEdit}
        mode="edit"
      />

      {/* Tariff edit — opened from the tariff name link in the table */}
      <TariffBridge
        open={Boolean(tariffEdit)}
        onClose={() => setTariffEdit(null)}
        onSave={() => { setTariffEdit(null); fetchSubscriptions(); }}
        tariff={tariffEdit}
        mode="edit"
      />

      {/* Add Balance — tops up the subscription's balance field */}
      {/* Transactions — per-period ledger, the old wallets gesture */}
      <SubscriptionTransactionsDialog
        open={txOpen}
        subscription={txSub}
        onClose={() => { setTxOpen(false); setTxSub(null); }}
      />

      <AddBalanceDialog
        open={balanceOpen}
        subscription={balanceSub}
        onClose={() => setBalanceOpen(false)}
        onSuccess={(added, newBalance) => {
          showSuccess(`Balance updated: ${added > 0 ? '+' : ''}${added} (now ${newBalance})`);
          fetchSubscriptions();
        }}
      />
    </Box>
  );
};

export default Subscriptions;