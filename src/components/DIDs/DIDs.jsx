import {
  Box,
  Paper,
  IconButton,
  Tooltip,
  Typography,
  CircularProgress,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Upload as UploadIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { Trans, useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../ui';
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { useDIDs } from './DIDs';
import { usePermissions } from '../../hooks/usePermissions';
import ResponsiveTable from '../shared/ResponsiveTable/ResponsiveTable.jsx';
import { buildRouteColumns } from './routeColumns.jsx';
import RouteDetails from './RouteDetails/RouteDetails.jsx';
import { useRouteDetails } from './RouteDetails/useRouteDetails';
import ToolDialog from '../TopBar/ToolDialog.jsx';
import HubIcon from '@mui/icons-material/Hub';

// Providers are what routes send calls to and receive them from, so the
// Providers screen opens from here rather than from the top bar.
const Providers = lazy(() => import('../Providers/Providers.jsx'));
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import useCentralizedSearch from '../../hooks/useCentralizedSearch';
import { useCallNumber } from '../../hooks/useCallNumber';
import Bdi from '../../i18n/Bdi';
import DIDWizard, { useWizard } from './DIDWizard/DIDWizard.jsx';
import ImportCSVDialog from '../common/ImportCSVDialog/ImportCSVDialog';
import DuplicateDIDDialog from './DuplicateDIDDialog/DuplicateDIDDialog';
import { didsApi } from '../../services/api/routesApi';
import { providersApi } from '../../services/api/providersApi';
import { voipResourcesApi } from '../../services/api/voipResourcesApi';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import useEnvironmentEdit from '../../hooks/useEnvironmentEdit';
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
  const { t } = useTranslation('routes');
  const navigate = useNavigate();
  const theme = useTheme();
  // On a phone the workflow diagram is never offered: a route opens as a
  // details page, and is edited in the full-screen form.
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  const { can, canAccess, canRouteType } = usePermissions();
  const [providersOpen, setProvidersOpen] = useState(false);
  // Both sessions follow their ACL's `routes` grant (`dids` in older
  // documents). A user's ACL may also limit the route types: a route of any
  // other type is shown read-only. The API enforces the same on every request.
  const canWrite = can('routes', 'write');
  const canWriteRoute = useCallback((did) => canRouteType(did.type, 'write'), [canRouteType]);
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
  const routeDetails = useRouteDetails(dids);

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
    { name: 'name', label: t('search.name'), type: 'string' },
    { name: 'number', label: t('search.number'), type: 'string' },
    { name: 'type', label: t('search.type'), type: 'select', data: [{ uuid: 'sip', name: 'SIP' }, { uuid: 'pstn', name: 'PSTN' }, { uuid: 'toll_free', name: t('search.tollFree') }] },
    { name: 'bridge_type', label: t('search.bridgeType'), type: 'select', data: (bridgeTypes || []).map(bt => ({ uuid: bt, name: bt })) },
    { name: 'enabled', label: t('search.status'), type: 'select', data: [{ uuid: 'true', name: t('search.enabled') }, { uuid: 'false', name: t('search.disabled') }] },
    // A portal user has one environment, their own: nothing to filter by.
    ...(portalMode ? [] : [{ name: 'environment_uuid', label: t('search.application'), type: 'select', data: (environments || []).map(e => ({ uuid: e.uuid, name: e.name })) }]),
    // Provider options never load in the portal (no ACL), and a select with no
    // options degrades to a free-text box — a filter that can't be filled.
    ...(portalMode ? [] : [{ name: 'provider_uuid', label: t('search.provider'), type: 'select', data: (providers || []).map(p => ({ uuid: p.uuid, name: p.name })) }]),
    { name: 'meta', label: t('search.tag'), type: 'tag', url: '/api/routes?action=meta_keys' },
  ], [t, bridgeTypes, environments, providers, portalMode]);

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
   * Edit one bridge on a route's path via DIDWizard: the DID at level 1, the
   * bridge pushed as level 2. The details page passes any bridge it previews
   * (an IVR key's queue, a fallback...), already fetched in full.
   */
  const openBridgeEditor = useCallback((did, bridgeType, bridgeData) => {
    wizardState.open({
      type: 'did',
      mode: 'edit',
      data: did,
      label: `DID: ${did.name || did.number}`,
      environmentUuid: did.environment_uuid || '',
    });
    const typeName = bridgeType === 'call_condition' ? 'Call Condition' : bridgeType.toUpperCase();
    wizardState.pushView({
      type: bridgeType,
      mode: 'edit',
      label: `${typeName}: ${bridgeData.name || bridgeData.uuid}`,
      data: { ...bridgeData, environment_uuid: did.environment_uuid },
      environmentUuid: did.environment_uuid || '',
      onResult: async () => {
        fetchDIDs();
      },
    });
  }, [wizardState, fetchDIDs]);

  /**
   * Edit the route's own bridge (the list's Bridge link).
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

    openBridgeEditor(did, did.bridge_type, { uuid: bridgeUuid, ...fullBridgeData });
  }, [bridgeTypes, openBridgeEditor]);

  // A deleted route has no details left to show.
  const handleConfirmDelete = useCallback(async () => {
    const deleting = didToDelete;
    await handleDeleteDID();
    if (deleting && routeDetails.uuid === (deleting.uuid || deleting.id)) routeDetails.close();
  }, [didToDelete, handleDeleteDID, routeDetails]);

  const columns = useMemo(() => buildRouteColumns({
    t,
    portalMode,
    isPhone,
    loading,
    canWriteRoute,
    actions: {
      onCall: callNumber,
      onEditApplication: handleEnvEdit,
      onEditBridge: handleEditBridge,
      onOpenProvider: (provider) => navigate(`/providers?id=${provider.uuid}`),
      // Admin edits a Route on the routing canvas; the portal opens the wizard.
      onEdit: (did) => (portalMode ? handleOpenDialog(did) : navigate(`/routes?did=${did.uuid || did.id}`)),
      onDuplicate: handleOpenDuplicateDialog,
      onDelete: handleOpenDeleteDialog,
    },
  }), [t, portalMode, isPhone, loading, canWriteRoute, callNumber, handleEnvEdit, handleEditBridge, navigate,
    handleOpenDialog, handleOpenDuplicateDialog, handleOpenDeleteDialog]);

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
          {/* No room for the date presets on a phone; the cards carry no dates either. */}
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
            placeholder={t('search.placeholder')}
            hideDateRange={isPhone}
          />
        </Box>
        {!portalMode && canAccess('providers') && (
          <Tooltip title={t('toolbar.providers')}>
            <IconButton size="small" aria-label={t('toolbar.providers')} onClick={() => setProvidersOpen(true)}>
              <HubIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {canWrite && !portalMode && (
          <Tooltip title={t('toolbar.importCsv')}>
            <IconButton
              size="small"
              onClick={handleOpenImportDialog}
            >
              <UploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {canWrite && (
          <Tooltip title={t('toolbar.addRoute')}>
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
            <ResponsiveTable
              columns={columns}
              rows={dids}
              getRowId={(did) => did.id || did.uuid}
              onRowClick={(did) => (isPhone ? routeDetails.open(did) : handleSelectDID(did.id || did.uuid))}
              selectedRowId={selectedDIDId}
              rowSx={{ '&.Mui-selected': { bgcolor: '#e3f2fd !important' } }}
              loading={loading}
              emptyMessage={t('table.empty')}
              sortBy={sortBy}
              sortDirection={sortOrder}
              onSort={handleSortChange}
              page={page}
              rowsPerPage={rowsPerPage}
              count={totalCount}
              onPageChange={handlePageChange}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
              data-testid="routes-table"
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

      {/* A route's details on a phone, in place of the workflow diagram. */}
      <RouteDetails
        open={Boolean(routeDetails.uuid)}
        did={routeDetails.did}
        missing={routeDetails.missing}
        portalMode={portalMode}
        canWrite={Boolean(routeDetails.did) && canWriteRoute(routeDetails.did)}
        loading={loading}
        onClose={routeDetails.close}
        onEdit={handleOpenDialog}
        onDuplicate={handleOpenDuplicateDialog}
        onDelete={handleOpenDeleteDialog}
        onEditBridge={(bridgeType, bridgeData) => openBridgeEditor(routeDetails.did, bridgeType, bridgeData)}
        onOpenProvider={(provider) => navigate(`/providers?id=${provider.uuid}`)}
        onCall={callNumber}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleConfirmDelete}
        loading={loading}
        title={t('delete.title')}
        message={<Typography><Trans t={t} i18nKey="delete.message"
          components={{ number: <strong><Bdi>{(didToDelete)?.number}</Bdi></strong> }} /></Typography>}
        description={t('delete.description')}
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
        <ToolDialog title={t('toolbar.providers')} open={providersOpen} onClose={() => setProvidersOpen(false)} confirmClose>
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
          title={t('import.title')}
          entityName={t('import.entityName')}
          environments={environments}
          requireEnvironment={true}
          onSuccess={handleImportSuccess}
        />
      )}

    </Box>
  );
};

export default DIDs;
