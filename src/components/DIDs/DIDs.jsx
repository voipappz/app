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
  ButtonBase,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Skeleton,
  TableSortLabel
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Phone as PhoneIcon,
  Upload as UploadIcon,
  Add as AddIcon,
  ContentCopy as DuplicateIcon,
  EventNote as EventsIcon,
  AccountTree as RoutingIcon
} from '@mui/icons-material';
import { ConfirmDialog } from '../ui';
import MetaTagChips from '../common/MetaTagChips/MetaTagChips';
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { useDIDs } from './DIDs';
import { usePermissions } from '../../hooks/usePermissions';
import RowEventsButton from '../shared/RowEventsButton/RowEventsButton.jsx';
import ToolDialog from '../TopBar/ToolDialog.jsx';
import HubIcon from '@mui/icons-material/Hub';

// Providers are what routes send calls to and receive them from, so the
// Providers screen opens from here rather than from the top bar.
const Providers = lazy(() => import('../Providers/Providers.jsx'));
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import useCentralizedSearch from '../../hooks/useCentralizedSearch';
import { useCallNumber } from '../../hooks/useCallNumber';
import { orEmpty, stripedTableRowSx } from '../shared/tableTheme.jsx';
import DIDWizard, { useWizard } from './DIDWizard/DIDWizard.jsx';
import ImportCSVDialog from '../common/ImportCSVDialog/ImportCSVDialog';
import DuplicateDIDDialog from './DuplicateDIDDialog/DuplicateDIDDialog';
import { didsApi } from '../../services/api/routesApi';
import { providersApi } from '../../services/api/providersApi';
import { voipResourcesApi } from '../../services/api/voipResourcesApi';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { formatDate } from '../../utils/dateUtils';
import { getEnabledChipProps, getTypeChipColor } from '../../utils/chipStyles';
import useEnvironmentEdit from '../../hooks/useEnvironmentEdit';
import EntityLink from '../common/EntityLink/EntityLink.jsx';
import EventsCountBadge from '../common/EventsCountBadge/EventsCountBadge.jsx';
import EnvironmentDialog from '../Environments/EnvironmentDialog/EnvironmentDialog';
import './DIDs.css';


/**
 * DIDs Component
 * Main component for DIDs management with sidebar list and wide table
 *
 * @param {boolean} portalMode - Render for the end-user portal (`/my-dids`)
 *   rather than the account console. Same screen, same CRUD, same wizard: the
 *   flag only drops the affordances that deep-link into admin-only routes
 *   (/logs, /providers, the environments editor) or admin-only bulk paths (CSV
 *   import). Everything a customer manages about their own numbers stays.
 */
const DIDs = ({ portalMode = false }) => {
  const navigate = useNavigate();
  const { can, canAccess } = usePermissions();
  const [providersOpen, setProvidersOpen] = useState(false);
  // Portal users' ACLs carry no dids entry, so can('dids','write') is false for
  // all of them — the screen would render as a read-only table with no Add,
  // Edit, Duplicate or Delete. Portal access is granted at the route instead
  // (DualProtectedRoute in App.jsx); the API still enforces its own rules on
  // every request. The console keeps the real ACL check.
  const canWrite = portalMode ? true : can('dids', 'write');
  const callNumber = useCallNumber();

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Get environments from context
  const { environments, selectedEnvironments } = useCustomerEnvironment();
  const { registerScreen, unregisterScreen } = useGlobalSearch();
  const {
    envDialogOpen, envDialogEnvironment, envDialogLoading,
    handleEnvEdit, handleEnvSave, handleEnvClose
  } = useEnvironmentEdit();

  const {
    dids,
    loading,
    selectedDID,
    dialogOpen,
    deleteDialogOpen,
    didToDelete,
    duplicateDialogOpen,
    didToDuplicate,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    bridgeTypes,
    bridgeResources,
    didTypes,
    handleOpenDialog,
    handleCloseDialog,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteDID,
    handleOpenDuplicateDialog,
    handleCloseDuplicateDialog,
    handleDuplicateDID,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    fetchDIDs,
    fetchBridgeResources
  } = useDIDs();

  // Wizard state
  const wizardState = useWizard();

  // Bridge from useDIDs dialog state → wizard
  // When handleOpenDialog finishes (sets dialogOpen=true, selectedDID),
  // open the wizard and clear the hook's dialog state.
  useEffect(() => {
    if (dialogOpen) {
      const did = selectedDID;
      wizardState.open({
        type: 'did',
        mode: did ? 'edit' : 'create',
        data: did,
        label: did ? `DID: ${did.name || did.number}` : 'Route: (new)',
        environmentUuid: did?.environment_uuid || '',
      });
      handleCloseDialog(); // Clear hook state; wizard manages its own open/close
    }
  }, [dialogOpen, selectedDID, wizardState, handleCloseDialog]);

  // Custom save handler for the wizard (can't use hook's handleSaveDID
  // because handleCloseDialog clears selectedDID which it needs for create vs edit)
  const handleWizardSaveDID = useCallback(async (didData) => {
    const rootView = wizardState.viewStack[0];
    const existingDid = rootView?.data;
    const didUuid = existingDid?.uuid || existingDid?.id;

    const didDataWithEnv = {
      ...didData,
      environment_uuid: didData.environment_uuid || selectedEnvironments?.[0]?.uuid
    };

    if (didUuid) {
      await didsApi.updateDID(didUuid, didDataWithEnv);
    } else {
      await didsApi.createDID(didDataWithEnv);
    }

    fetchDIDs();
  }, [wizardState.viewStack, fetchDIDs, selectedEnvironments]);

  const [selectedDIDId, setSelectedDIDId] = useState(null);

  // Fetch providers for filter dropdown
  const [providers, setProviders] = useState([]);
  useEffect(() => {
    // Providers are an account-console concept; a portal user has no ACL for
    // them, so this would be a guaranteed 403 on every load. The Provider
    // filter segment simply carries no options there.
    if (portalMode) return;
    providersApi.getProviders({ per_page: 200 })
      .then(data => setProviders(Array.isArray(data) ? data : data?.data || []))
      .catch(() => setProviders([]));
  }, [portalMode]);

  // CentralizedSearch state and handlers
  const centralizedSearch = useCentralizedSearch({
    onFiltersChange: handleFiltersChange,
    onResetFilters: () => handleFiltersChange({}),
    onRefresh: fetchDIDs,
  });

  // Register search segments with GlobalSearchContext
  const didSegments = useMemo(() => [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'number', label: 'Number', type: 'string' },
    { name: 'type', label: 'Type', type: 'select', data: [{ uuid: 'sip', name: 'SIP' }, { uuid: 'pstn', name: 'PSTN' }, { uuid: 'toll_free', name: 'Toll Free' }] },
    { name: 'bridge_type', label: 'Bridge Type', type: 'select', data: (bridgeTypes || []).map(bt => ({ uuid: bt, name: bt })) },
    { name: 'enabled', label: 'Status', type: 'select', data: [{ uuid: 'true', name: 'Enabled' }, { uuid: 'false', name: 'Disabled' }] },
    // A portal user has one environment, their own: nothing to filter by.
    ...(portalMode ? [] : [{ name: 'environment_uuid', label: 'Application', type: 'select', data: (environments || []).map(e => ({ uuid: e.uuid, name: e.name })) }]),
    // Provider options never load in the portal (no ACL), and a select with no
    // options degrades to a free-text box — a filter that can't be filled.
    ...(portalMode ? [] : [{ name: 'provider_uuid', label: 'Provider', type: 'select', data: (providers || []).map(p => ({ uuid: p.uuid, name: p.name })) }]),
    { name: 'meta', label: 'Tag', type: 'tag', url: '/api/routes?action=meta_keys' },
  ], [bridgeTypes, environments, providers, portalMode]);

  useEffect(() => {
    // Each surface registers under its own name. It is the search box's
    // heading AND the key GlobalSearchContext persists filters under, so the
    // two must differ: they show different segments, and a provider filter
    // restored on the portal can't be cleared there. The words match what each
    // surface calls the screen — the admin's Routes, the portal's Numbers.
    registerScreen(portalMode ? 'Numbers' : 'Routes', didSegments, {
      onSearch: (params) => {
        const newFilters = {};
        Object.entries(params).forEach(([key, value]) => {
          if (key === 'search[text]') {
            newFilters.search = value;
          } else {
            const match = key.match(/search\[(\w+)\]/);
            if (match) newFilters[match[1]] = value;
          }
        });
        handleFiltersChange(newFilters);
      },
      onClear: () => {
        handleFiltersChange({ search: '', type: '', bridge_type: '', enabled: '', environment_uuid: '' });
      },
    });
    return () => unregisterScreen();
  }, [didSegments, registerScreen, unregisterScreen, handleFiltersChange, portalMode]);

  // Listen for environment change events to refresh data
  useEffect(() => {
    const handleEnvironmentChange = () => fetchDIDs();

    window.addEventListener('environmentChanged', handleEnvironmentChange);

    return () => {
      window.removeEventListener('environmentChanged', handleEnvironmentChange);
    };
  }, [fetchDIDs]);

  const handleSelectDID = (didId) => {
    setSelectedDIDId(didId);
  };

  /**
   * Edit bridge inline via DIDWizard.
   * Opens the wizard with the DID at level 1, then pushes the bridge as level 2.
   */
  const handleEditBridge = useCallback(async (did) => {
    if (!did.bridge || !did.bridge_type) return;

    const bridgeUuid = did.bridge.uuid || did.bridge.id;
    if (!bridgeUuid) return;

    // Ensure bridge types and resources are loaded
    try {
      const [btResponse] = await Promise.allSettled([
        bridgeTypes.length === 0
          ? voipResourcesApi.getBridgeTypes()
          : Promise.resolve(bridgeTypes),
      ]);
      if (btResponse.status === 'fulfilled' && Array.isArray(btResponse.value)) {
        // bridgeTypes already available from hook
      }
    } catch { /* non-critical */ }

    // Fetch full bridge data
    let fullBridgeData = did.bridge;
    try {
      const resources = await voipResourcesApi.getResourcesByBridgeType(did.bridge_type, {
        environment_uuid: did.environment_uuid,
      });
      const found = (Array.isArray(resources) ? resources : []).find(r => r.uuid === bridgeUuid);
      if (found) fullBridgeData = found;
    } catch { /* fall back to did.bridge */ }

    // Open wizard with DID at level 1
    wizardState.open({
      type: 'did',
      mode: 'edit',
      data: did,
      label: `DID: ${did.name || did.number}`,
      environmentUuid: did.environment_uuid || '',
    });

    // Push bridge view at level 2
    const typeName = did.bridge_type === 'call_condition' ? 'Call Condition' : did.bridge_type.toUpperCase();
    wizardState.pushView({
      type: did.bridge_type,
      mode: 'edit',
      label: `${typeName}: ${fullBridgeData.name || bridgeUuid}`,
      data: { ...fullBridgeData, environment_uuid: did.environment_uuid },
      environmentUuid: did.environment_uuid || '',
      onResult: async () => {
        fetchDIDs();
      },
    });
  }, [bridgeTypes, wizardState, fetchDIDs]);

  // Import handlers
  const handleOpenImportDialog = useCallback(() => {
    setImportDialogOpen(true);
  }, []);

  const handleCloseImportDialog = useCallback(() => {
    setImportDialogOpen(false);
  }, []);

  const handleImportCSV = useCallback(async (file, environmentUuid) => {
    return didsApi.importCSV(file, environmentUuid);
  }, []);

  const handleImportSuccess = useCallback(() => {
    fetchDIDs();
  }, [fetchDIDs]);

  // Currently unused - status chip functionality not yet implemented
  // const getStatusChipColor = (status) => {
  //   const colorMap = {
  //     active: 'success',
  //     suspended: 'warning',
  //     cancelled: 'error',
  //     pending: 'info'
  //   };
  //   return colorMap[status] || 'default';
  // };

  return (
    <Box
      className="dids-container"
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
            segments={didSegments}
            currentSearchParams={centralizedSearch.currentSearchParams}
            onFilterChange={centralizedSearch.handleFilterChange}
            onQuickSearch={centralizedSearch.handleQuickSearch}
            onClearAllFilters={centralizedSearch.handleClearAllFilters}
            dateRange={centralizedSearch.dateRange}
            onDateRangeChange={centralizedSearch.handleDateRangeChange}
            onRefresh={centralizedSearch.handleRefresh}
            quickSearchText={centralizedSearch.quickSearchText}
            onQuickSearchChange={centralizedSearch.handleQuickSearchChange}
            placeholder="Search by name, or use field:value (e.g. enabled:true)"
          />
        </Box>
        {!portalMode && canAccess('providers') && (
          <Tooltip title="Providers">
            <IconButton size="small" aria-label="Providers" onClick={() => setProvidersOpen(true)}>
              <HubIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {canWrite && !portalMode && (
          <Tooltip title="Import CSV">
            <IconButton
              size="small"
              onClick={handleOpenImportDialog}
            >
              <UploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {canWrite && (
          <Tooltip title="Add Route">
            <IconButton
              size="small"
              onClick={() => handleOpenDialog()}
              disabled={loading}
              color="primary"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* DIDs Table Area - Full width, no sidebar */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' }}>
        {/* DIDs Table */}
        <Paper
          className="dids-content"
          elevation={3}
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0
          }}
        >
          {/* DIDs Table */}
          <Box sx={{ flexGrow: 1, overflow: 'auto' }} data-tour="did-list">
            <TableContainer>
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
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'name'}
                      direction={sortBy === 'name' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('name')}
                    >
                      Name
                    </TableSortLabel>
                  </TableCell>
                  {/* A portal user sees only their own environment: no column. */}
                  {!portalMode && (
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'environment_name'}
                      direction={sortBy === 'environment_name' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('environment_name')}
                    >
                      Application
                    </TableSortLabel>
                  </TableCell>
                  )}
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'type'}
                      direction={sortBy === 'type' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('type')}
                    >
                      Type
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortBy === 'number'}
                      direction={sortBy === 'number' ? sortOrder : 'asc'}
                      onClick={() => handleSortChange('number')}
                    >
                      Number
                    </TableSortLabel>
                  </TableCell>
                  {/* Bridge is polymorphic (queue/ivr/announcement/...) — no
                      single server-side column to order by, so no sort here. */}
                  <TableCell>Bridge</TableCell>
                  <TableCell>Provider</TableCell>
                  <TableCell>Tags</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && dids.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: portalMode ? 10 : 11 }).map((__, j) => (
                        <TableCell key={j}><Skeleton height={20} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : dids.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={portalMode ? 10 : 11} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No DIDs found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  dids.map((did) => {
                    const didId = did.id || did.uuid;
                    const isSelected = selectedDIDId === didId;

                    return (
                      <TableRow
                        key={didId}
                        hover
                        selected={isSelected}
                        sx={{
                          ...stripedTableRowSx,
                          cursor: 'pointer',
                          '&.Mui-selected': {
                            bgcolor: '#e3f2fd !important'
                          }
                        }}
                        onClick={() => handleSelectDID(didId)}
                      >
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(did.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(did.updated_at)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip {...getEnabledChipProps(did.enabled)} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {orEmpty(did.name)}
                          </Typography>
                        </TableCell>
                        {!portalMode && (
                        <TableCell>
                          <EntityLink
                            name={did.environment?.name || did.environment_name}
                            ariaLabel={`Edit application ${did.environment?.name || did.environment_name || ''}`}
                            onEdit={(did.environment?.uuid || did.environment_uuid) && canWrite ? () => handleEnvEdit({
                              uuid: did.environment?.uuid || did.environment_uuid,
                              name: did.environment?.name || did.environment_name,
                            }) : undefined}
                          />
                        </TableCell>
                        )}
                        <TableCell>
                          <Chip
                            label={did.type?.toUpperCase() || 'SIP'}
                            size="small"
                            color={getTypeChipColor(did.type || 'sip')}
                          />
                        </TableCell>
                        <TableCell>
                          {/* The number opens the phone with it (right-hand sidebar). */}
                          <Tooltip title={`Call ${did.number}`}>
                            <ButtonBase
                              onClick={(e) => { e.stopPropagation(); callNumber(did.number); }}
                              aria-label={`Call ${did.number}`}
                              sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: 1, px: 0.5, mx: -0.5, '&:hover': { bgcolor: 'action.hover' } }}
                            >
                              <PhoneIcon fontSize="small" color="primary" />
                              <Typography variant="body2" fontWeight={600}>
                                {did.number}
                              </Typography>
                            </ButtonBase>
                          </Tooltip>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {did.bridge && did.bridge_type && did.bridge_type !== 'number' ? (
                            // All bridge types except number support edit mode (write only)
                            canWrite && ['ivr', 'queue', 'announcement', 'vml', 'call_condition', 'bot', 'workflow'].includes(did.bridge_type) ? (
                              <Typography
                                variant="body2"
                                sx={{
                                  borderBottom: '1px dotted grey',
                                  cursor: 'pointer',
                                  display: 'inline-block',
                                  maxWidth: 200,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  '&:hover': {
                                    color: 'primary.main'
                                  }
                                }}
                                onClick={() => handleEditBridge(did)}
                              >
                                {orEmpty(did.bridge.name || did.bridge.number)}
                              </Typography>
                            ) : (
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                {orEmpty(did.bridge.name || did.bridge.number)}
                              </Typography>
                            )
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              {did.bridge_type === 'number' ? 'Number' : '-'}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {did.provider ? (
                            <Chip
                              label={did.provider.name}
                              size="small"
                              variant="outlined"
                              // The portal has no /providers screen to land on,
                              // so the chip is just a label there.
                              onClick={portalMode ? undefined : (e) => { e.stopPropagation(); navigate(`/providers?id=${did.provider.uuid}`); }}
                              sx={portalMode
                                ? { maxWidth: 120 }
                                : { cursor: 'pointer', maxWidth: 120, '&:hover': { borderColor: 'primary.main' } }}
                            />
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <MetaTagChips meta={did.meta} />
                        </TableCell>
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                            {canWrite && (
                              // Admin edits a Route on the routing canvas. The
                              // portal opens the wizard instead — a customer
                              // editing their own number wants the fields, and
                              // reaches the canvas through the Routing action
                              // beside this one when they want the flow.
                              <Tooltip title={portalMode ? 'Edit Number' : 'Edit Route — opens its visual routing flow'}>
                                <IconButton
                                  data-testid="edit-did-button"
                                  size="small"
                                  onClick={() => portalMode
                                    ? handleOpenDialog(did)
                                    : navigate(`/routes?did=${did.uuid || did.id}`)}
                                  disabled={loading}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canWrite && portalMode && (
                              <Tooltip title="Call routing — visual flow">
                                <IconButton
                                  data-testid="routing-did-button"
                                  size="small"
                                  onClick={() => navigate(`/routes?did=${did.uuid || did.id}`)}
                                  disabled={loading}
                                >
                                  <RoutingIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canWrite && (
                              <Tooltip title="Duplicate Route">
                                <IconButton
                                  data-testid="duplicate-did-button"
                                  size="small"
                                  onClick={() => handleOpenDuplicateDialog(did)}
                                  disabled={loading}
                                >
                                  <DuplicateIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <RowEventsButton subject="did" uuid={did.uuid} />
                            {canWrite && (
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  onClick={() => handleOpenDeleteDialog(did)}
                                  disabled={loading}
                                  color="error"
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={handlePageChange}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={[10, 25, 50, 100]}
            sx={{ borderTop: '1px solid var(--mui-palette-divider)' }}
          />
        </Box>
      </Paper>
      </Box>

      {/* DID Wizard — replaces DIDDialog for create/edit */}
      <DIDWizard
        bridgeTypes={bridgeTypes}
        bridgeResources={bridgeResources}
        didTypes={didTypes}
        onFetchBridgeResources={fetchBridgeResources}
        onSaveDID={handleWizardSaveDID}
        onClose={() => fetchDIDs()}
        loading={loading}
        wizardState={wizardState}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteDID}
        loading={loading}
        title="Delete Route"
        message={<Typography>Are you sure you want to delete DID{' '}
          <strong>{(didToDelete)?.number}</strong>?</Typography>}
        description="This action cannot be undone and will affect call routing."
      />

      {/* Duplicate DID Dialog */}
      <DuplicateDIDDialog
        open={duplicateDialogOpen}
        onClose={handleCloseDuplicateDialog}
        onDuplicate={handleDuplicateDID}
        did={didToDuplicate}
        loading={loading}
      />

      {/* Environment Edit Dialog (shared hook) — console only: a portal user
          edits numbers, not the application they live in. */}
      {!portalMode && (
        <EnvironmentDialog
          open={envDialogOpen}
          onClose={handleEnvClose}
          onSave={handleEnvSave}
          environment={envDialogEnvironment}
          loading={envDialogLoading}
        />
      )}

      {!portalMode && (
        <ToolDialog title="Providers" open={providersOpen} onClose={() => setProvidersOpen(false)} confirmClose>
          <Suspense fallback={<CircularProgress sx={{ m: 'auto' }} />}>
            <Box sx={{ flex: 1, minHeight: 0, height: '100%', overflow: 'auto' }}>
              <Providers />
            </Box>
          </Suspense>
        </ToolDialog>
      )}

      {/* Import CSV Dialog */}
      {/* Admin-only: bulk import is not a portal affordance. */}
      {!portalMode && (
        <ImportCSVDialog
          open={importDialogOpen}
          onClose={handleCloseImportDialog}
          onImport={handleImportCSV}
          title="Import Routes from CSV"
          entityName="Routes"
          environments={environments}
          requireEnvironment={true}
          onSuccess={handleImportSuccess}
        />
      )}

    </Box>
  );
};

export default DIDs;