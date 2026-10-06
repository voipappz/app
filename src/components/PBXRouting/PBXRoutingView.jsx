import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import ReactFlow, {
  Controls,
  MiniMap,
  Background,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  TextField,
  Popover,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Close as CloseIcon,
  AccountTree as AccountTreeIcon,
  Phone as PhoneIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Dns as DnsIcon,
} from '@mui/icons-material';

import { ConfirmDialog } from '../ui';
import { didsApi } from '../../services/api/routesApi';
import { providersApi } from '../../services/api/providersApi';
import { voipResourcesApi } from '../../services/api/voipResourcesApi';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { usePermissions } from '../../hooks/usePermissions';
import { usePBXRoutingTopology } from './usePBXRoutingTopology';
import ScreenReports from '../Reports/ReportsPanel/ScreenReports.jsx';
import LiveChartsPopout from '../Live/LiveChartsPopout.jsx';
import { QueueChartsPanel } from '../Live/panels/EntityChartsPanels.jsx';
import DIDNode from './nodes/DIDNode';
import QueueNode from './nodes/QueueNode';
import IVRNode from './nodes/IVRNode';
import CallConditionNode from './nodes/CallConditionNode';
import SimpleNode from './nodes/SimpleNode';
import ProviderNode from './nodes/ProviderNode';
import SubscriptionNode from './nodes/SubscriptionNode';
import TariffNode from './nodes/TariffNode';

// Bridge editor components (reused from QueuesTopology pattern)
import { QueueBridge } from '../Bridges/QueueBridge/QueueBridge.jsx';
import { IVRBridge } from '../Bridges/IVRBridge/IVRBridge.jsx';
import { CallConditionBridge } from '../Bridges/CallConditionBridge/CallConditionBridge.jsx';
import { AnnouncementBridge } from '../Bridges/AnnouncementBridge/AnnouncementBridge.jsx';
import { VMLBridge } from '../Bridges/VMLBridge/VMLBridge.jsx';
import { BotBridge } from '../Bridges/BotBridge/BotBridge.jsx';
import { ExtensionBridge } from '../Bridges/ExtensionBridge/ExtensionBridge.jsx';

// DID Wizard for create/edit
import DIDWizard, { useWizard } from '../DIDs/DIDWizard/DIDWizard.jsx';
// DID Form for side-panel editing
import DIDForm from '../DIDs/DIDDialog/DIDForm.jsx';
// Provider dialog for create/edit
import ProviderDialog from '../Providers/ProviderDialog/ProviderDialog.jsx';

import { useNotification } from '../../context/NotificationContext';
import './PBXRoutingView.css';

/**
 * Custom node type wrappers for ReactFlow.
 */
const AnnouncementNode = (props) => <SimpleNode {...props} type="announcement" />;
const VMLNodeWrapper = (props) => <SimpleNode {...props} type="vml" />;
const BotNodeWrapper = (props) => <SimpleNode {...props} type="bot" />;
const ExtensionNodeWrapper = (props) => <SimpleNode {...props} type="extension" />;
const NumberNodeWrapper = (props) => <SimpleNode {...props} type="number" />;
const ConferenceNodeWrapper = (props) => <SimpleNode {...props} type="conference" />;
const UserLoginNodeWrapper = (props) => <SimpleNode {...props} type="user_login" />;
const nodeTypes = {
  did: DIDNode,
  queue: QueueNode,
  ivr: IVRNode,
  call_condition: CallConditionNode,
  announcement: AnnouncementNode,
  vml: VMLNodeWrapper,
  bot: BotNodeWrapper,
  extension: ExtensionNodeWrapper,
  number: NumberNodeWrapper,
  conference: ConferenceNodeWrapper,
  user_login: UserLoginNodeWrapper,
  provider: ProviderNode,
  subscription: SubscriptionNode,
  tariff: TariffNode,
};

import PBXEdge from './edges/PBXEdge';

const edgeTypes = {
  pbxEdge: PBXEdge,
};

const EDITABLE_TYPES = new Set([
  'queue', 'ivr', 'call_condition', 'announcement', 'vml', 'bot', 'extension', 'did',
]);

/**
 * Side-panel bridge editor (reused from QueuesTopology pattern).
 * Includes onDrillDown support so DID bridge create/edit buttons work.
 */
const BridgeEditor = ({ node, onClose, onSave, bridgeTypes, bridgeResources, didTypes, onFetchBridgeResources, onDIDSave }) => {
  const [bridgeDialogType, setBridgeDialogType] = useState(null);
  const [bridgeDialogMode, setBridgeDialogMode] = useState('create');
  const [bridgeDialogData, setBridgeDialogData] = useState(null);
  const [bridgeDialogEnvUuid, setBridgeDialogEnvUuid] = useState('');
  const onResultRef = useRef(null);

  if (!node) return null;
  const { type, data } = node;

  const commonProps = {
    open: true,
    onClose,
    onSave,
    containerMode: 'panel',
    mode: 'edit',
    hideEnvironment: true,
  };

  const handleDrillDown = ({ type: drillType, mode, data: drillData, environmentUuid, onResult }) => {
    setBridgeDialogType(drillType);
    setBridgeDialogMode(mode);
    setBridgeDialogData(drillData);
    setBridgeDialogEnvUuid(environmentUuid);
    onResultRef.current = onResult;
  };

  const handleBridgeSave = async (savedData) => {
    if (onResultRef.current) {
      await onResultRef.current(savedData);
      onResultRef.current = null;
    }
    setBridgeDialogType(null);
    setBridgeDialogData(null);
  };

  const handleBridgeClose = () => {
    setBridgeDialogType(null);
    setBridgeDialogData(null);
    onResultRef.current = null;
  };

  const bridgeDialogs = (
    <>
      {bridgeDialogType === 'announcement' && (
        <AnnouncementBridge
          open={true}
          onClose={handleBridgeClose}
          onSave={handleBridgeSave}
          environmentUuid={bridgeDialogEnvUuid}
          announcement={bridgeDialogData}
          editMode={bridgeDialogMode}
          hideEnvironment={true}
        />
      )}
      {bridgeDialogType === 'vml' && (
        <VMLBridge
          open={true}
          onClose={handleBridgeClose}
          onSave={handleBridgeSave}
          environmentUuid={bridgeDialogEnvUuid}
          vml={bridgeDialogData}
          mode={bridgeDialogMode}
          hideEnvironment={true}
        />
      )}
      {bridgeDialogType === 'call_condition' && (
        <CallConditionBridge
          open={true}
          onClose={handleBridgeClose}
          onSave={handleBridgeSave}
          environmentUuid={bridgeDialogEnvUuid}
          callCondition={bridgeDialogData}
          mode={bridgeDialogMode}
          hideEnvironment={true}
        />
      )}
      {bridgeDialogType === 'queue' && (
        <QueueBridge
          open={true}
          onClose={handleBridgeClose}
          onSave={handleBridgeSave}
          environmentUuid={bridgeDialogEnvUuid}
          queue={bridgeDialogData}
          mode={bridgeDialogMode}
          hideEnvironment={true}
        />
      )}
      {bridgeDialogType === 'ivr' && (
        <IVRBridge
          open={true}
          onClose={handleBridgeClose}
          onSave={handleBridgeSave}
          environmentUuid={bridgeDialogEnvUuid}
          ivr={bridgeDialogData}
          mode={bridgeDialogMode}
          hideEnvironment={true}
        />
      )}
      {bridgeDialogType === 'bot' && (
        <BotBridge
          open={true}
          onClose={handleBridgeClose}
          onSave={handleBridgeSave}
          environmentUuid={bridgeDialogEnvUuid}
          bot={bridgeDialogData}
          mode={bridgeDialogMode}
          hideEnvironment={true}
        />
      )}
    </>
  );

  switch (type) {
    case 'did':
      return (
        <>
          <DIDForm
            did={data}
            bridgeTypes={bridgeTypes}
            bridgeResources={bridgeResources}
            didTypes={didTypes}
            onFetchBridgeResources={onFetchBridgeResources}
            onSave={onDIDSave}
            onCancel={onClose}
            onDrillDown={handleDrillDown}
          />
          {bridgeDialogs}
        </>
      );
    case 'queue':
      return <QueueBridge {...commonProps} queue={data} />;
    case 'ivr':
      return <IVRBridge {...commonProps} ivr={data} />;
    case 'call_condition':
      return <CallConditionBridge {...commonProps} callCondition={data} />;
    case 'announcement':
      return <AnnouncementBridge {...commonProps} announcement={data} editMode="edit" />;
    case 'vml':
      return <VMLBridge {...commonProps} vml={data} />;
    case 'bot':
      return <BotBridge {...commonProps} bot={data} />;
    case 'extension':
      return <ExtensionBridge {...commonProps} extension={data} />;
    default:
      return (
        <Box sx={{ p: 2 }}>
          <Typography color="text.secondary">No editor for type &ldquo;{type}&rdquo;</Typography>
        </Box>
      );
  }
};

/**
 * PBXRoutingView — Self-contained Twilio Studio-style routing builder.
 * DID selection via top-bar Autocomplete; full-width canvas for flow visualization.
 * Includes full DID CRUD + Provider management via popover.
 *
 * @param {string}   didUuid      - Initial DID to visualize (optional)
 * @param {object}   didInfo      - Optional { number, name } for initial toolbar display
 * @param {Array}    dids         - Optional pre-loaded DIDs (will fetch its own if empty)
 * @param {function} onClose      - Called when the close button is clicked
 */
const PBXRoutingViewInner = ({ didUuid: initialDidUuid, didInfo: _didInfo, dids: didsFromProps, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { selectedEnvironments } = useCustomerEnvironment();
  const { can } = usePermissions();
  const canWrite = can('routes', 'write');
  const [activeDid, setActiveDid] = useState(initialDidUuid || null);

  // --- DID data (drives the top-bar DID label; the browse list panel was removed) ---
  const [allDids, setAllDids] = useState([]);
  const [didsLoading, setDidsLoading] = useState(false);

  const {
    nodes,
    edges,
    loading,
    error,
    selectedNode,
    setSelectedNode,
    refresh,
  } = usePBXRoutingTopology(activeDid);

  const { showSuccess, showError } = useNotification();

  // --- DID Wizard state ---
  const wizardState = useWizard();
  const [bridgeTypes, setBridgeTypes] = useState([]);
  const [bridgeResources, setBridgeResources] = useState({});
  const [didTypes, setDidTypes] = useState([]);
  const [didCrudLoading] = useState(false);

  // --- Provider dialog state ---
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providers, setProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerTypes, setProviderTypes] = useState([]);
  const [llmServices, setLlmServices] = useState([]);
  const [providerSaving, setProviderSaving] = useState(false);

  // --- Providers popover state ---
  const [providersAnchorEl, setProvidersAnchorEl] = useState(null);
  const providersPopoverOpen = Boolean(providersAnchorEl);

  // --- Delete confirmation state ---
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: null, item: null });
  const [deleteLoading, setDeleteLoading] = useState(false);

  // --- DID list fetching (hoisted from DIDSidebar) ---

  const fetchDids = useCallback(async () => {
    setDidsLoading(true);
    try {
      // Standard admin list params — same shape as the DIDs screen (page +
      // per_page 25 + search[environment_uuid]). This used to be
      // page=1&per_page=9999 (unscoped without a selected environment), which
      // pulled EVERY DID in the account on mount on large tenants. The panel
      // is a quick switcher; the DIDs screen is where the full list lives.
      const params = { page: 1, per_page: 25 };
      if (selectedEnvironments?.length > 0) {
        params['search[environment_uuid]'] = selectedEnvironments[0].uuid;
      }
      const response = await didsApi.getDIDs(params);
      const list = Array.isArray(response) ? response : (response?.data || []);
      setAllDids(list);
    } catch (err) {
      console.error('PBX Routing: Failed to fetch Routes:', err);
      setAllDids([]);
    } finally {
      setDidsLoading(false);
    }
  }, [selectedEnvironments]);

  // Listen for refresh events
  useEffect(() => {
    const handler = () => fetchDids();
    window.addEventListener('pbx-routing-refresh-dids', handler);
    return () => window.removeEventListener('pbx-routing-refresh-dids', handler);
  }, [fetchDids]);

  // Initial load: use props DIDs if provided, otherwise fetch
  useEffect(() => {
    if (didsFromProps && didsFromProps.length > 0) {
      setAllDids(didsFromProps);
    } else {
      fetchDids();
    }
  }, [didsFromProps, fetchDids]);

  // Re-fetch when environment changes
  useEffect(() => {
    const handler = () => fetchDids();
    window.addEventListener('environmentChanged', handler);
    return () => window.removeEventListener('environmentChanged', handler);
  }, [fetchDids]);

  // Compute the selected DID object for the Autocomplete
  const selectedDidObj = useMemo(() => {
    if (!activeDid) return null;
    return allDids.find((d) => (d.uuid || d.id) === activeDid) || null;
  }, [activeDid, allDids]);

  // --- Fetch helper functions ---

  const fetchBridgeTypes = useCallback(async () => {
    if (bridgeTypes.length > 0) return;
    try {
      const response = await voipResourcesApi.getBridgeTypes();
      const types = Array.isArray(response) ? response : (response?.data || []);
      setBridgeTypes(types);
    } catch (err) {
      console.error('Error fetching bridge types:', err);
    }
  }, [bridgeTypes.length]);

  const fetchDIDTypes = useCallback(async () => {
    if (didTypes.length > 0) return;
    try {
      const response = await didsApi.getTypes();
      const types = Array.isArray(response) ? response : (response?.data || []);
      setDidTypes(types);
    } catch (err) {
      console.error('Error fetching Route types:', err);
    }
  }, [didTypes.length]);

  const fetchBridgeResources = useCallback(async (bridgeType, environmentUuid = null) => {
    if (!bridgeType) return [];
    if (bridgeResources[bridgeType]) return bridgeResources[bridgeType];
    try {
      const params = environmentUuid ? { environment_uuid: environmentUuid } : {};
      const response = await voipResourcesApi.getResourcesByBridgeType(bridgeType, params);
      const resources = Array.isArray(response) ? response : (response?.data || []);
      setBridgeResources(prev => ({ ...prev, [bridgeType]: resources }));
      return resources;
    } catch (err) {
      console.error(`Error fetching ${bridgeType} resources:`, err);
      return [];
    }
  }, [bridgeResources]);

  const fetchProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const response = await providersApi.getProviders();
      const list = Array.isArray(response) ? response : (response?.data || []);
      setProviders(list);
    } catch {
      setProviders([]);
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  const fetchProviderTypes = useCallback(async () => {
    if (providerTypes.length > 0) return;
    try {
      const types = await providersApi.getProviderTypes();
      if (Array.isArray(types)) setProviderTypes(types);
    } catch (err) {
      console.error('Failed to fetch provider types:', err);
    }
  }, [providerTypes.length]);

  const fetchLlmServices = useCallback(async () => {
    if (llmServices.length > 0) return;
    try {
      const services = await providersApi.getLLMServices();
      if (Array.isArray(services)) setLlmServices(services);
    } catch (err) {
      console.error('Failed to fetch LLM services:', err);
    }
  }, [llmServices.length]);

  // Fetch providers on mount
  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // --- DID CRUD handlers ---

  const refreshDids = useCallback(() => {
    window.dispatchEvent(new Event('pbx-routing-refresh-dids'));
  }, []);

  const openDIDWizardForCreate = useCallback(() => {
    setBridgeResources({}); // Clear cache
    Promise.all([fetchBridgeTypes(), fetchDIDTypes()]).catch(() => {});
    wizardState.open({
      type: 'did',
      mode: 'create',
      data: null,
      label: 'Route: (new)',
      environmentUuid: selectedEnvironments?.[0]?.uuid || '',
    });
  }, [fetchBridgeTypes, fetchDIDTypes, wizardState, selectedEnvironments]);

  const openDIDWizardForEdit = useCallback(async (did) => {
    setBridgeResources({}); // Clear cache
    Promise.all([fetchBridgeTypes(), fetchDIDTypes()]).catch(() => {});

    const didId = did.uuid || did.id;
    wizardState.open({
      type: 'did',
      mode: 'edit',
      data: did,
      label: `DID: ${did.name || did.number}`,
      environmentUuid: did.environment_uuid || selectedEnvironments?.[0]?.uuid || '',
    });

    // Fetch full data in background and update
    try {
      const fullDID = await didsApi.getDID(didId);
      wizardState.open({
        type: 'did',
        mode: 'edit',
        data: fullDID,
        label: `DID: ${fullDID.name || fullDID.number}`,
        environmentUuid: fullDID.environment_uuid || selectedEnvironments?.[0]?.uuid || '',
      });
    } catch (err) {
      console.error('Error loading full Route:', err);
    }
  }, [fetchBridgeTypes, fetchDIDTypes, wizardState, selectedEnvironments]);

  const handleWizardSaveDID = useCallback(async (didData) => {
    const rootView = wizardState.viewStack[0];
    const existingDid = rootView?.data;
    const didUuid = existingDid?.uuid || existingDid?.id;

    const didDataWithEnv = {
      ...didData,
      environment_uuid: didData.environment_uuid || selectedEnvironments?.[0]?.uuid,
    };

    try {
      if (didUuid) {
        await didsApi.updateDID(didUuid, didDataWithEnv);
        showSuccess('Route updated');
      } else {
        await didsApi.createDID(didDataWithEnv);
        showSuccess('Route created');
      }

      refreshDids();
      if (didUuid && didUuid === activeDid) {
        refresh();
      }
    } catch (err) {
      showError(`Failed to save DID: ${err.message}`);
    }
  }, [wizardState.viewStack, selectedEnvironments, showSuccess, showError, refreshDids, activeDid, refresh]);

  const handleWizardClose = useCallback(() => {
    refreshDids();
  }, [refreshDids]);

  // --- DID Delete ---

  const openDeleteDIDDialog = useCallback((did) => {
    setDeleteDialog({ open: true, type: 'did', item: did });
  }, []);

  const openDeleteProviderDialog = useCallback((provider) => {
    setDeleteDialog({ open: true, type: 'provider', item: provider });
  }, []);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialog({ open: false, type: null, item: null });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const { type, item } = deleteDialog;
    if (!item) return;

    setDeleteLoading(true);
    try {
      const itemId = item.uuid || item.id;
      if (type === 'did') {
        await didsApi.deleteDID(itemId);
        showSuccess('Route deleted');
        refreshDids();
        if (itemId === activeDid) {
          setActiveDid(null);
        }
      } else if (type === 'provider') {
        await providersApi.deleteProvider(itemId);
        showSuccess('Provider deleted');
        fetchProviders();
      }
      handleCloseDeleteDialog();
    } catch (err) {
      showError(`Failed to delete: ${err.message}`);
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteDialog, showSuccess, showError, refreshDids, activeDid, fetchProviders, handleCloseDeleteDialog]);

  // --- Provider CRUD handlers ---

  const openProviderDialogForCreate = useCallback(() => {
    setSelectedProvider(null);
    setProviderDialogOpen(true);
    fetchProviderTypes();
    fetchLlmServices();
  }, [fetchProviderTypes, fetchLlmServices]);

  const openProviderDialogForEdit = useCallback(async (provider) => {
    fetchProviderTypes();
    fetchLlmServices();
    const providerId = provider.uuid || provider.id;
    try {
      const fullProvider = await providersApi.getProvider(providerId);
      setSelectedProvider(fullProvider);
    } catch {
      setSelectedProvider(provider);
    }
    setProviderDialogOpen(true);
  }, [fetchProviderTypes, fetchLlmServices]);

  const handleProviderSave = useCallback(async (providerData) => {
    setProviderSaving(true);
    try {
      if (selectedProvider) {
        const providerId = selectedProvider.uuid || selectedProvider.id;
        await providersApi.updateProvider(providerId, providerData);
        showSuccess('Provider updated');
      } else {
        await providersApi.createProvider(providerData);
        showSuccess('Provider created');
      }
      setProviderDialogOpen(false);
      setSelectedProvider(null);
      fetchProviders();
      if (activeDid) refresh();
    } finally {
      setProviderSaving(false);
    }
  }, [selectedProvider, showSuccess, fetchProviders, activeDid, refresh]);

  const handleProviderDialogClose = useCallback(() => {
    setProviderDialogOpen(false);
    setSelectedProvider(null);
  }, []);

  // --- Event handlers ---

  const handleSelectDID = useCallback((did) => {
    if (!did) {
      setActiveDid(null);
      setSelectedNode(null);
      return;
    }
    const uuid = did.uuid || did.id;
    setActiveDid(uuid);
    setSelectedNode(null);
  }, [setSelectedNode]);

  const handleNodeClick = useCallback(
    (_event, node) => {
      if (EDITABLE_TYPES.has(node.type)) {
        // Bridge/DID node editing persists changes — write permission required.
        if (!canWrite) return;
        if (node.type === 'did') {
          setBridgeResources({});
          Promise.all([fetchBridgeTypes(), fetchDIDTypes()]).catch(() => {});
        }
        setSelectedNode(node);
      } else if (node.type === 'provider') {
        openProviderDialogForEdit(node.data);
      }
    },
    [canWrite, setSelectedNode, openProviderDialogForEdit, fetchBridgeTypes, fetchDIDTypes]
  );

  const handleEditorSave = useCallback(() => {
    setSelectedNode(null);
    showSuccess('Saved');
    refresh();
  }, [setSelectedNode, showSuccess, refresh]);

  const handleDIDPanelSave = useCallback(async (didData) => {
    const didUuid = selectedNode?.data?.uuid || selectedNode?.data?.id;
    const didDataWithEnv = {
      ...didData,
      environment_uuid: didData.environment_uuid || selectedEnvironments?.[0]?.uuid,
    };

    try {
      if (didUuid) {
        await didsApi.updateDID(didUuid, didDataWithEnv);
        showSuccess('Route updated');
      } else {
        await didsApi.createDID(didDataWithEnv);
        showSuccess('Route created');
      }
      setSelectedNode(null);
      refreshDids();
      refresh();
    } catch (err) {
      showError(`Failed to save DID: ${err.message}`);
    }
  }, [selectedNode, selectedEnvironments, showSuccess, showError, setSelectedNode, refreshDids, refresh]);

  const handleEditorClose = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar with DID Autocomplete */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 0.5 : 1,
          px: isMobile ? 1 : 2,
          py: 0.75,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          flexShrink: 0,
          flexWrap: 'nowrap',
        }}
      >
        <AccountTreeIcon color="primary" sx={{ fontSize: 20, flexShrink: 0 }} />
        {!isMobile && !initialDidUuid && (
          <Typography variant="subtitle1" fontWeight={600} sx={{ fontSize: '0.9rem', flexShrink: 0 }}>
            Routing
          </Typography>
        )}

        {/* DID selector — only in the global topology view. When routing a
            specific DID (edit mode), the DID is fixed, so show it as static text
            rather than a switcher that lets you navigate away. */}
        {initialDidUuid ? (
          <Typography
            variant="body2"
            fontWeight={600}
            noWrap
            sx={{ fontSize: '0.85rem', flexShrink: 1, minWidth: 0, ml: 0.5 }}
          >
            {selectedDidObj?.number || selectedDidObj?.name || 'Route'}
          </Typography>
        ) : (
        <Autocomplete
          size="small"
          options={allDids}
          loading={didsLoading}
          value={selectedDidObj}
          onChange={(_e, newVal) => handleSelectDID(newVal)}
          getOptionLabel={(option) => {
            const parts = [];
            if (option.number) parts.push(option.number);
            if (option.name) parts.push(option.name);
            return parts.join(' - ') || 'Unnamed Route';
          }}
          isOptionEqualToValue={(option, value) =>
            (option.uuid || option.id) === (value.uuid || value.id)
          }
          renderOption={(props, option) => {
            const { key: _key, ...restProps } = props;
            return (
              <Box
                component="li"
                key={option.uuid || option.id}
                {...restProps}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, px: 1 }}
              >
                <PhoneIcon sx={{ fontSize: 14, color: option.enabled ? 'primary.main' : 'text.disabled', flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                    {option.number || 'No number'}
                  </Typography>
                  {option.name && (
                    <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.68rem', display: 'block' }}>
                      {option.name}
                    </Typography>
                  )}
                </Box>
                {option.bridge_type && (
                  <Chip
                    label={option.bridge_type}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.55rem', flexShrink: 0 }}
                  />
                )}
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Select a Route..."
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <>
                    <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary', ml: 0.5, mr: 0.5 }} />
                    {params.InputProps.startAdornment}
                  </>
                ),
              }}
            />
          )}
          sx={{
            width: isMobile ? 200 : 320,
            flexShrink: 1,
            minWidth: 160,
            '& .MuiInputBase-root': { fontSize: '0.8rem', height: 36 },
          }}
          noOptionsText="No Routes found"
          loadingText="Loading Routes..."
        />
        )}

        {/* Add DID button */}
        {canWrite && (
          <Tooltip title="Add Route">
            <IconButton size="small" onClick={openDIDWizardForCreate} sx={{ flexShrink: 0 }}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Edit active DID button */}
        {selectedDidObj && canWrite && (
          <Tooltip title="Edit Route">
            <IconButton size="small" onClick={() => openDIDWizardForEdit(selectedDidObj)} sx={{ flexShrink: 0 }}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Delete active DID button */}
        {selectedDidObj && canWrite && (
          <Tooltip title="Delete Route">
            <IconButton size="small" onClick={() => openDeleteDIDDialog(selectedDidObj)} sx={{ flexShrink: 0 }}>
              <DeleteIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            </IconButton>
          </Tooltip>
        )}

        {/* Separator */}
        <Box sx={{ width: 1, height: 24, bgcolor: 'divider', mx: 0.5, flexShrink: 0 }} />

        {/* Providers button */}
        <Tooltip title="Providers">
          <IconButton
            size="small"
            onClick={(e) => {
              setProvidersAnchorEl(e.currentTarget);
              if (providers.length === 0) fetchProviders();
            }}
            sx={{ flexShrink: 0 }}
          >
            <DnsIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        {/* Queue reports pop-out (queries.yml :category: queue) — queues have
            no screen of their own; they're managed here on Routing. */}
        {!isMobile && <ScreenReports category="queue" title="Queue Reports" />}
        {/* Queue live charts (relocated from the removed Home screen) */}
        {!isMobile && <LiveChartsPopout title="Queue Live Charts" Panel={QueueChartsPanel} />}

        {/* Refresh */}
        {activeDid && (
          <Tooltip title="Refresh routing">
            <IconButton size="small" onClick={refresh} disabled={loading} sx={{ flexShrink: 0 }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Close */}
        {onClose && (
          <Tooltip title="Close">
            <IconButton size="small" onClick={onClose} sx={{ flexShrink: 0 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Providers Popover */}
      <Popover
        open={providersPopoverOpen}
        anchorEl={providersAnchorEl}
        onClose={() => setProvidersAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 320, maxHeight: 400 } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <DnsIcon sx={{ fontSize: 16, color: 'primary.main', mr: 1 }} />
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1, fontSize: '0.82rem' }}>
            Providers
          </Typography>
          <Tooltip title="Add Provider">
            <IconButton size="small" onClick={() => { setProvidersAnchorEl(null); openProviderDialogForCreate(); }}>
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={fetchProviders} disabled={providersLoading}>
              <RefreshIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ overflow: 'auto', maxHeight: 340 }}>
          {providersLoading && providers.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <CircularProgress size={16} />
            </Box>
          ) : providers.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                No providers found
              </Typography>
            </Box>
          ) : (
            providers.map((provider) => {
              const providerId = provider.uuid || provider.id;
              return (
                <Box
                  key={providerId}
                  className="pbx-provider-row"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.5,
                    py: 0.75,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:hover .provider-row-actions': { opacity: 1 },
                  }}
                >
                  <DnsIcon
                    sx={{
                      fontSize: 14,
                      color: provider.enabled ? 'primary.main' : 'text.disabled',
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 500, fontSize: '0.78rem' }}>
                      {provider.name || 'Unnamed'}
                    </Typography>
                    {provider.type && (
                      <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.62rem', display: 'block' }}>
                        {provider.type}
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    label={provider.enabled ? 'On' : 'Off'}
                    size="small"
                    color={provider.enabled ? 'success' : 'default'}
                    variant={provider.enabled ? 'filled' : 'outlined'}
                    sx={{ height: 18, fontSize: '0.55rem', flexShrink: 0 }}
                  />
                  <Box className="provider-row-actions" sx={{ display: 'flex', gap: 0, opacity: 0, transition: 'opacity 0.15s' }}>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setProvidersAnchorEl(null); openProviderDialogForEdit(provider); }}
                        sx={{ p: 0.25 }}
                      >
                        <EditIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setProvidersAnchorEl(null); openDeleteProviderDialog(provider); }}
                        sx={{ p: 0.25 }}
                      >
                        <DeleteIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </Popover>

      {/* Main content: Canvas + Editor */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* No DID selected */}
        {!activeDid && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, p: 2 }}>
            <Box sx={{ textAlign: 'center' }}>
              <AccountTreeIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">
                Select a DID from the dropdown above to view its routing chain.
              </Typography>
            </Box>
          </Box>
        )}

        {/* Loading */}
        {activeDid && loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading routing chain...
            </Typography>
          </Box>
        )}

        {/* Error */}
        {activeDid && !loading && error && (
          <Box sx={{ p: 2, flex: 1 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}

        {/* Empty routing */}
        {activeDid && !loading && !error && nodes.length === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <Typography color="text.secondary">No routing data found for this Route.</Typography>
          </Box>
        )}

        {/* Canvas + Editor */}
        {activeDid && !loading && !error && nodes.length > 0 && (
          <>
            {/* ReactFlow Canvas — full width */}
            <Box className="pbx-routing-canvas" dir="ltr" sx={{ flex: 1, minHeight: 0 }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodeClick={handleNodeClick}
                onPaneClick={handlePaneClick}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={true}
                fitView
                fitViewOptions={{ padding: isMobile ? 0.3 : 0.2 }}
                minZoom={0.15}
                maxZoom={1.5}
              >
                <Controls showInteractive={false} />
                {!isMobile && (
                  <MiniMap
                    nodeStrokeWidth={2}
                    zoomable
                    pannable
                    style={{ height: 80, width: 120 }}
                  />
                )}
                <Background variant="dots" gap={16} size={1} />
              </ReactFlow>
            </Box>

            {/* Side editor panel -- Dialog on mobile, side panel on desktop */}
            {selectedNode && !isMobile && (
              <Paper
                elevation={2}
                className="pbx-routing-editor"
                sx={{
                  width: 'min(600px, 45vw)',
                  minWidth: 400,
                  p: 2,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
                  <IconButton size="small" onClick={handleEditorClose}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
                <BridgeEditor
                  node={selectedNode}
                  onClose={handleEditorClose}
                  onSave={handleEditorSave}
                  bridgeTypes={bridgeTypes}
                  bridgeResources={bridgeResources}
                  didTypes={didTypes}
                  onFetchBridgeResources={fetchBridgeResources}
                  onDIDSave={handleDIDPanelSave}
                />
              </Paper>
            )}
            {selectedNode && isMobile && (
              <Dialog
                open
                fullScreen
                onClose={handleEditorClose}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
                    Edit {selectedNode.type}
                  </Typography>
                  <IconButton size="small" onClick={handleEditorClose}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                  <BridgeEditor
                    node={selectedNode}
                    onClose={handleEditorClose}
                    onSave={handleEditorSave}
                    bridgeTypes={bridgeTypes}
                    bridgeResources={bridgeResources}
                    didTypes={didTypes}
                    onFetchBridgeResources={fetchBridgeResources}
                    onDIDSave={handleDIDPanelSave}
                  />
                </Box>
              </Dialog>
            )}
          </>
        )}
      </Box>

      {/* DID Wizard -- rendered as portal Dialog */}
      <DIDWizard
        bridgeTypes={bridgeTypes}
        bridgeResources={bridgeResources}
        didTypes={didTypes}
        onFetchBridgeResources={fetchBridgeResources}
        onSaveDID={handleWizardSaveDID}
        onClose={handleWizardClose}
        loading={didCrudLoading}
        wizardState={wizardState}
      />

      {/* Provider Dialog */}
      <ProviderDialog
        open={providerDialogOpen}
        onClose={handleProviderDialogClose}
        onSave={handleProviderSave}
        provider={selectedProvider}
        loading={providerSaving}
        providerTypes={providerTypes}
        llmServices={llmServices}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
        title={<>Delete {(deleteDialog.type) === 'provider' ? 'Provider' : 'Route'}</>}
        message={<Typography>Are you sure you want to delete {(deleteDialog.type) === 'provider' ? 'provider' : 'Route'}{' '}
        <strong>{(deleteDialog.type) === 'provider' ? (deleteDialog.item)?.name : (deleteDialog.item)?.number}</strong>?</Typography>}
        description={<>{(deleteDialog.type) === 'provider'
          ? 'This will remove the provider and may affect Routes using it.'
          : 'This action cannot be undone and will affect call routing.'}</>}
      />
    </Box>
  );
};

/**
 * Wrapped in ReactFlowProvider as required by ReactFlow.
 */
const PBXRoutingView = (props) => {
  // When opened as the /routing route, accept ?did=<uuid> so the DIDs list
  // "Edit Route" action can deep-link straight into that DID's routing flow.
  const [searchParams] = useSearchParams();
  const didUuid = props.didUuid || searchParams.get('did') || null;
  return (
    <ReactFlowProvider>
      <PBXRoutingViewInner {...props} didUuid={didUuid} />
    </ReactFlowProvider>
  );
};

export default PBXRoutingView;
