import React, { useState, useEffect, useRef } from 'react';
import {
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  IconButton
} from '@mui/material';
import {
  Menu as IVRIcon,
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog as Dialog } from '../../ui'; // full screen on a phone
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import { ivrApi } from '../../../services/api/ivrApi';
import { bridgeApi } from '../../../services/api/bridgeApi';
import { queuesApi } from '../../../services/api/queuesApi';
import { botsApi } from '../../../services/api/botsApi';
import { getAnnouncement } from '../../../services/api/announcementsApi';
import { getVML } from '../../../services/api/vmlsApi';
import { getCallCondition } from '../../../services/api/callConditionsApi';
import { AnnouncementBridge } from '../AnnouncementBridge/AnnouncementBridge.jsx';
import AnnouncementActions from '../shared/AnnouncementActions.jsx';
import { Z } from '../../../utils/zIndex.js';
import { QueueBridge } from '../QueueBridge/QueueBridge.jsx';
import { VMLBridge } from '../VMLBridge/VMLBridge.jsx';
import { CallConditionBridge } from '../CallConditionBridge/CallConditionBridge.jsx';
import { BotBridge } from '../BotBridge/BotBridge.jsx';
import { useIsUserSession } from '../../../hooks/useIsUserSession';

// An IVR entry: key, name, type, destination and actions in one row from `sm`
// up; on a phone key, name and actions share the first line and the two
// selects take a line each.
const ENTRY_GRID = {
  display: 'grid', gap: 1, alignItems: 'center', mb: 1,
  gridTemplateColumns: { xs: '40px minmax(0, 1fr) auto', sm: '60px 1fr 1fr 1fr 80px' },
  gridTemplateAreas: { xs: '"key name actions" "type type type" "bridge bridge bridge"', sm: '"key name type bridge actions"' },
};

/**
 * IVRBridge Component
 * Dialog for creating/editing IVRs from DID edit dialog
 *
 * Similar pattern to AnnouncementBridge - simplified IVR creation/editing
 * for use as a bridge destination in DIDs
 *
 * Props:
 *   containerMode: 'dialog' (default) | 'panel'
 *     - 'dialog': renders inside a MUI Dialog wrapper (existing behavior)
 *     - 'panel': renders form content directly in a Box, no Dialog wrapper
 *   onDrillDown: optional function called instead of opening nested dialogs
 *     - Signature: onDrillDown({ type, mode, data, environmentUuid, onResult })
 */
export const IVRBridge = ({
  open,
  onClose,
  onSave,
  environmentUuid = null,
  ivr = null,              // Existing IVR data for edit mode
  mode = 'create',         // 'create' or 'edit'
  hideEnvironment = false, // Hide environment field when creating from DID (inherited)
  containerMode = 'dialog', // 'dialog' or 'panel'
  zLayer = null,           // Optional z-index layer override (e.g. Z.L3 when nested)
  onDrillDown = null        // optional drilldown handler for panel mode
}) => {
  const { t } = useTranslation('bridges');
  const userSession = useIsUserSession();
  const layer = zLayer || Z.L2;
  const { selectedEnvironments } = useCustomerEnvironment();

  // Form state - includes timeout_bridge and invalid_bridge per old admin
  const [formData, setFormData] = useState({
    name: '',
    environment_uuid: '',
    announcement_uuid: '',
    timeout: 10,
    timeout_bridge_type: '',
    timeout_bridge_uuid: '',
    invalid: 3,
    invalid_bridge_type: '',
    invalid_bridge_uuid: '',
    enabled: true,
    entries: {}  // Menu entries: { '1': { bridge_type: 'queue', bridge_uuid: 'xxx' }, '2': {...} }
  });

  // Menu entries state
  const [newEntryNumber, setNewEntryNumber] = useState('');

  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [timeoutBridgeResources, setTimeoutBridgeResources] = useState([]);
  const [timeoutBridgeLoading, setTimeoutBridgeLoading] = useState(false);
  const [invalidBridgeResources, setInvalidBridgeResources] = useState([]);
  const [invalidBridgeLoading, setInvalidBridgeLoading] = useState(false);
  // Cache for entry bridge resources by bridge type
  const [entryBridgeResourcesCache, setEntryBridgeResourcesCache] = useState({});

  // Announcement dialog state
  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false);

  // Inline bridge creation dialogs state
  const [inlineDialogOpen, setInlineDialogOpen] = useState(null); // 'queue', 'ivr', 'vml', 'call_condition', 'bot'
  const [inlineDialogTarget, setInlineDialogTarget] = useState(null); // 'timeout', 'invalid', or entry key like '1', '2'

  // Bridge edit mode state
  const [inlineEditMode, setInlineEditMode] = useState('create'); // 'create' or 'edit'
  const [bridgeToEdit, setBridgeToEdit] = useState(null); // Full bridge data for editing

  // Ref to track initial load and prevent duplicate fetches
  const initialLoadDone = useRef(false);
  const lastEnvironmentUuid = useRef(null);

  // Bridge types - fetched from server
  const [bridgeTypes, setBridgeTypes] = useState([]);
  const [, setBridgeTypesLoading] = useState(false); // Loading state available if needed

  // Determine whether the component is "active" — in panel mode it is always active;
  // in dialog mode it is active only when open === true.
  const isActive = containerMode === 'panel' ? true : open;

  // Fetch bridge types from server
  useEffect(() => {
    const fetchBridgeTypes = async () => {
      if (bridgeTypes.length > 0) return; // Already loaded
      setBridgeTypesLoading(true);
      try {
        const types = await bridgeApi.getBridgeTypes();
        // Convert to label/value format for Select component
        const formattedTypes = types.map(type => ({
          value: type,
          label: type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        }));
        setBridgeTypes(formattedTypes);
      } catch (err) {
        console.error('Error fetching bridge types:', err);
        // Fallback to basic types
        setBridgeTypes([
          { value: 'extension', label: 'Device' },
          { value: 'queue', label: 'Queue' },
          { value: 'ivr', label: 'IVR' },
          { value: 'number', label: 'Number' }
        ]);
      } finally {
        setBridgeTypesLoading(false);
      }
    };
    if (isActive) {
      fetchBridgeTypes();
    }
  }, [isActive, bridgeTypes.length]);

  // Initialize environment UUID and load existing IVR data for edit mode
  useEffect(() => {
    if (isActive) {
      const envUuid = environmentUuid || selectedEnvironments?.[0]?.uuid || '';

      console.log('IVR Dialog opened. Environment UUID:', envUuid);

      // If edit mode and IVR data provided, load it
      if (mode === 'edit' && ivr) {
        console.log('Edit mode: Loading IVR data', ivr);
        setFormData({
          name: ivr.name || '',
          environment_uuid: ivr.environment_uuid || envUuid,
          announcement_uuid: ivr.announcement_uuid || '',
          timeout: ivr.timeout || 10,
          timeout_bridge_type: ivr.timeout_bridge_type || '',
          timeout_bridge_uuid: ivr.timeout_bridge_uuid || '',
          invalid: ivr.invalid || 3,
          invalid_bridge_type: ivr.invalid_bridge_type || '',
          invalid_bridge_uuid: ivr.invalid_bridge_uuid || '',
          enabled: ivr.enabled !== undefined ? ivr.enabled : true,
          entries: ivr.entries || {}
        });

        // Load all initial resources for edit mode
        const loadEditModeResources = async () => {
          const currentEnvUuid = ivr.environment_uuid || envUuid;

          // Mark initial load as done
          lastEnvironmentUuid.current = currentEnvUuid;
          initialLoadDone.current = true;

          // Load announcements FIRST
          if (currentEnvUuid) {
            console.log('IVR: Loading announcements for edit mode. Environment:', currentEnvUuid);
            setAnnouncementsLoading(true);
            try {
              const response = await bridgeApi.getBridgeResources('announcement', currentEnvUuid);
              console.log('IVR: Announcements loaded:', response);
              setAnnouncements(Array.isArray(response) ? response : []);
            } catch (err) {
              console.error('Error loading announcements:', err);
              setAnnouncements([]);
            } finally {
              setAnnouncementsLoading(false);
            }
          }

          // Load timeout bridge resources
          if (ivr.timeout_bridge_type && ivr.timeout_bridge_type !== 'number') {
            console.log('Loading timeout bridge resources for edit mode:', ivr.timeout_bridge_type);
            try {
              const response = await bridgeApi.getBridgeResources(ivr.timeout_bridge_type, currentEnvUuid);
              setTimeoutBridgeResources(Array.isArray(response) ? response : []);
            } catch (err) {
              console.error('Error loading timeout bridge resources in edit mode:', err);
            }
          }

          // Load invalid bridge resources
          if (ivr.invalid_bridge_type && ivr.invalid_bridge_type !== 'number') {
            console.log('Loading invalid bridge resources for edit mode:', ivr.invalid_bridge_type);
            try {
              const response = await bridgeApi.getBridgeResources(ivr.invalid_bridge_type, currentEnvUuid);
              setInvalidBridgeResources(Array.isArray(response) ? response : []);
            } catch (err) {
              console.error('Error loading invalid bridge resources in edit mode:', err);
            }
          }
        };

        loadEditModeResources();
      } else {
        // Create mode - set environment and load announcements
        setFormData(prev => ({ ...prev, environment_uuid: envUuid, entries: {} }));

        // Load announcements for create mode
        if (envUuid) {
          console.log('IVR: Loading announcements for create mode. Environment:', envUuid);
          lastEnvironmentUuid.current = envUuid;
          initialLoadDone.current = true;
          setAnnouncementsLoading(true);
          bridgeApi.getBridgeResources('announcement', envUuid)
            .then(response => {
              setAnnouncements(Array.isArray(response) ? response : []);
            })
            .catch(err => {
              console.error('Error loading announcements:', err);
              setAnnouncements([]);
            })
            .finally(() => {
              setAnnouncementsLoading(false);
            });
        } else {
          console.log('IVR: No environment UUID available for loading announcements');
        }
      }
    } else {
      // Dialog closed - reset refs
      initialLoadDone.current = false;
      lastEnvironmentUuid.current = null;
    }
  }, [isActive, environmentUuid, selectedEnvironments, mode, ivr]);

  // Load announcements when environment changes (AFTER initial load)
  useEffect(() => {
    // Skip if not active or no environment
    if (!isActive || !formData.environment_uuid) {
      return;
    }

    // Skip if this is the initial load (already handled by first useEffect)
    // Only run if environment actually changed from the last loaded value
    if (lastEnvironmentUuid.current === formData.environment_uuid) {
      console.log('IVR: Skipping duplicate announcement load for same environment:', formData.environment_uuid);
      return;
    }

    // This useEffect handles environment changes AFTER the dialog is already open
    // Initial load is handled in the main initialization useEffect above
    const loadAnnouncements = async () => {
      console.log('IVR: Environment changed, reloading announcements for:', formData.environment_uuid);
      lastEnvironmentUuid.current = formData.environment_uuid;
      setAnnouncementsLoading(true);
      try {
        const response = await bridgeApi.getBridgeResources('announcement', formData.environment_uuid);
        console.log('IVR: Announcements reloaded:', response);
        setAnnouncements(Array.isArray(response) ? response : []);
      } catch (err) {
        console.error('Error reloading announcements:', err);
        setAnnouncements([]);
      } finally {
        setAnnouncementsLoading(false);
      }
    };

    loadAnnouncements();
  }, [isActive, formData.environment_uuid]);

  // Load timeout bridge resources when type changes
  useEffect(() => {
    const loadTimeoutBridgeResources = async () => {
      if (!formData.timeout_bridge_type || !formData.environment_uuid) {
        setTimeoutBridgeResources([]);
        return;
      }

      setTimeoutBridgeLoading(true);
      try {
        const response = await bridgeApi.getBridgeResources(formData.timeout_bridge_type, formData.environment_uuid);
        setTimeoutBridgeResources(Array.isArray(response) ? response : []);
      } catch (err) {
        console.error('Error loading timeout bridge resources:', err);
        setTimeoutBridgeResources([]);
      } finally {
        setTimeoutBridgeLoading(false);
      }
    };

    if (isActive && formData.timeout_bridge_type) {
      loadTimeoutBridgeResources();
    }
  }, [isActive, formData.timeout_bridge_type, formData.environment_uuid]);

  // Load invalid bridge resources when type changes
  useEffect(() => {
    const loadInvalidBridgeResources = async () => {
      if (!formData.invalid_bridge_type || !formData.environment_uuid) {
        setInvalidBridgeResources([]);
        return;
      }

      setInvalidBridgeLoading(true);
      try {
        const response = await bridgeApi.getBridgeResources(formData.invalid_bridge_type, formData.environment_uuid);
        setInvalidBridgeResources(Array.isArray(response) ? response : []);
      } catch (err) {
        console.error('Error loading invalid bridge resources:', err);
        setInvalidBridgeResources([]);
      } finally {
        setInvalidBridgeLoading(false);
      }
    };

    if (isActive && formData.invalid_bridge_type) {
      loadInvalidBridgeResources();
    }
  }, [isActive, formData.invalid_bridge_type, formData.environment_uuid]);

  // Reset on close (dialog mode only — panel mode does not close)
  useEffect(() => {
    if (!open && containerMode === 'dialog') {
      setFormData({
        name: '',
        environment_uuid: '',
        announcement_uuid: '',
        timeout: 10,
        timeout_bridge_type: '',
        timeout_bridge_uuid: '',
        invalid: 3,
        invalid_bridge_type: '',
        invalid_bridge_uuid: '',
        enabled: true,
        entries: {}
      });
      setFormErrors({});
      setError(null);
      setNewEntryNumber('');
      setAnnouncements([]);
      setTimeoutBridgeResources([]);
      setInvalidBridgeResources([]);
      setEntryBridgeResourcesCache({});
    }
  }, [open, containerMode]);

  // Preload bridge resources for existing entries (edit mode) - only once on open
  useEffect(() => {
    if (isActive && mode === 'edit' && ivr && ivr.entries) {
      // Get unique bridge types from entries
      const bridgeTypesInEntries = [...new Set(
        Object.values(ivr.entries)
          .map(entry => entry.bridge_type)
          .filter(bt => bt && bt !== 'number')
      )];

      // Load resources for each bridge type
      bridgeTypesInEntries.forEach(bridgeType => {
        loadEntryBridgeResources(bridgeType);
      });
    }
  }, [isActive, mode, ivr]);

  // Handle form field change
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  // Handle environment change - reset all dependent fields
  const handleEnvironmentChange = (envUuid) => {
    setFormData(prev => ({
      ...prev,
      environment_uuid: envUuid,
      announcement_uuid: '',
      timeout_bridge_uuid: '',
      invalid_bridge_uuid: ''
    }));
  };

  // Handle announcement change - detect inline creation
  const handleAnnouncementChange = (value) => {
    console.log('Announcement dropdown changed to:', value);
    console.log('Setting announcement_uuid to:', value);
    handleChange('announcement_uuid', value);
  };

  // Handle create new announcement button click
  const handleCreateNewAnnouncement = (event) => {
    event.preventDefault(); // Prevent default MenuItem behavior
    event.stopPropagation(); // Prevent the Select from closing/changing
    console.log('Opening announcement creation dialog');

    if (onDrillDown) {
      onDrillDown({
        type: 'announcement',
        mode: 'create',
        data: null,
        environmentUuid: formData.environment_uuid,
        onResult: async (savedData) => {
          await handleAnnouncementSave(savedData);
        }
      });
    } else {
      setAnnouncementDialogOpen(true);
    }
  };

  // Handle new announcement creation
  const handleAnnouncementSave = async (announcementData) => {
    console.log('New announcement created:', announcementData);

    // Set the new announcement as selected
    const newAnnouncementUuid = announcementData.uuid || announcementData.id;
    console.log('Setting new announcement UUID:', newAnnouncementUuid);
    handleChange('announcement_uuid', newAnnouncementUuid);

    // Close dialog (only relevant when not using onDrillDown)
    setAnnouncementDialogOpen(false);

    // Reload announcements to include the new one
    try {
      console.log('Reloading announcements after creation...');
      const response = await bridgeApi.getBridgeResources('announcement', formData.environment_uuid);
      console.log('Announcements reloaded:', response);
      setAnnouncements(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Error reloading announcements after creation:', err);
    }
  };

  // Handle timeout bridge type change
  const handleTimeoutBridgeTypeChange = (bridgeType) => {
    setFormData(prev => ({
      ...prev,
      timeout_bridge_type: bridgeType,
      timeout_bridge_uuid: ''
    }));
  };

  // Handle invalid bridge type change
  const handleInvalidBridgeTypeChange = (bridgeType) => {
    setFormData(prev => ({
      ...prev,
      invalid_bridge_type: bridgeType,
      invalid_bridge_uuid: ''
    }));
  };

  // Open inline bridge creation dialog
  const handleOpenInlineCreate = (bridgeType, target) => {
    if (onDrillDown) {
      onDrillDown({
        type: bridgeType,
        mode: 'create',
        data: null,
        environmentUuid: formData.environment_uuid,
        onResult: async (savedData) => {
          // Temporarily set inlineDialogOpen/target so handleInlineBridgeSave works correctly
          // We call a targeted save directly rather than relying on state
          const newUuid = savedData.uuid || savedData.id;

          if (target === 'announcement') {
            handleChange('announcement_uuid', newUuid);
            try {
              const response = await bridgeApi.getBridgeResources('announcement', formData.environment_uuid);
              setAnnouncements(Array.isArray(response) ? response : []);
            } catch (err) {
              console.error('Error reloading announcements:', err);
            }
          } else if (target === 'timeout') {
            setFormData(prev => ({ ...prev, timeout_bridge_uuid: newUuid }));
            try {
              const response = await bridgeApi.getBridgeResources(bridgeType, formData.environment_uuid);
              setTimeoutBridgeResources(Array.isArray(response) ? response : []);
            } catch (err) {
              console.error('Error reloading timeout bridge resources:', err);
            }
          } else if (target === 'invalid') {
            setFormData(prev => ({ ...prev, invalid_bridge_uuid: newUuid }));
            try {
              const response = await bridgeApi.getBridgeResources(bridgeType, formData.environment_uuid);
              setInvalidBridgeResources(Array.isArray(response) ? response : []);
            } catch (err) {
              console.error('Error reloading invalid bridge resources:', err);
            }
          } else {
            // Entry key (e.g., '1', '2', '*')
            setFormData(prev => ({
              ...prev,
              entries: {
                ...prev.entries,
                [target]: {
                  ...prev.entries[target],
                  bridge_uuid: newUuid
                }
              }
            }));
            try {
              const response = await bridgeApi.getBridgeResources(bridgeType, formData.environment_uuid);
              setEntryBridgeResourcesCache(prev => ({
                ...prev,
                [bridgeType]: Array.isArray(response) ? response : []
              }));
            } catch (err) {
              console.error('Error reloading entry bridge resources:', err);
            }
          }
        }
      });
    } else {
      setInlineDialogOpen(bridgeType);
      setInlineDialogTarget(target);
    }
  };

  // Close inline bridge creation dialog
  const handleCloseInlineCreate = () => {
    setInlineDialogOpen(null);
    setInlineDialogTarget(null);
    setInlineEditMode('create');
    setBridgeToEdit(null);
  };

  // Handle save from inline bridge creation
  const handleInlineBridgeSave = async (bridgeData) => {
    const newUuid = bridgeData.uuid || bridgeData.id;
    const bridgeType = inlineDialogOpen;
    const target = inlineDialogTarget;

    // Update the appropriate field based on target
    if (target === 'announcement') {
      setFormData(prev => ({ ...prev, announcement_uuid: newUuid }));
      // Reload announcements
      try {
        const response = await bridgeApi.getBridgeResources('announcement', formData.environment_uuid);
        setAnnouncements(Array.isArray(response) ? response : []);
      } catch (err) {
        console.error('Error reloading announcements:', err);
      }
    } else if (target === 'timeout') {
      setFormData(prev => ({ ...prev, timeout_bridge_uuid: newUuid }));
      // Reload timeout bridge resources
      try {
        const response = await bridgeApi.getBridgeResources(bridgeType, formData.environment_uuid);
        setTimeoutBridgeResources(Array.isArray(response) ? response : []);
      } catch (err) {
        console.error('Error reloading timeout bridge resources:', err);
      }
    } else if (target === 'invalid') {
      setFormData(prev => ({ ...prev, invalid_bridge_uuid: newUuid }));
      // Reload invalid bridge resources
      try {
        const response = await bridgeApi.getBridgeResources(bridgeType, formData.environment_uuid);
        setInvalidBridgeResources(Array.isArray(response) ? response : []);
      } catch (err) {
        console.error('Error reloading invalid bridge resources:', err);
      }
    } else {
      // Entry key (e.g., '1', '2', '*')
      setFormData(prev => ({
        ...prev,
        entries: {
          ...prev.entries,
          [target]: {
            ...prev.entries[target],
            bridge_uuid: newUuid
          }
        }
      }));
      // Reload entry bridge resources cache
      try {
        const response = await bridgeApi.getBridgeResources(bridgeType, formData.environment_uuid);
        setEntryBridgeResourcesCache(prev => ({
          ...prev,
          [bridgeType]: Array.isArray(response) ? response : []
        }));
      } catch (err) {
        console.error('Error reloading entry bridge resources:', err);
      }
    }

    handleCloseInlineCreate();
  };

  // Get label for inline creation button based on bridge type
  const getCreateLabel = (bridgeType) => {
    return t(`ivr.createNew.${bridgeType}`, { defaultValue: t('ivr.createNew.other', { type: bridgeType }) });
  };

  // Handle edit bridge - fetch full bridge data and open edit dialog (or drilldown)
  const handleEditBridge = async (bridgeType, bridgeUuid, target) => {
    if (!bridgeUuid) return;

    console.log(`Attempting to load ${bridgeType} with UUID:`, bridgeUuid);

    try {
      let bridgeData;

      // Fetch full bridge data from API based on bridge type
      switch (bridgeType) {
        case 'queue': {
          console.log('Fetching queue data...');
          const queueResponse = await queuesApi.getQueue(bridgeUuid);
          console.log('Queue response:', queueResponse);
          bridgeData = queueResponse.data || queueResponse;
          break;
        }
        case 'ivr': {
          console.log('Fetching IVR data...');
          const ivrResponse = await ivrApi.getIVR(bridgeUuid);
          console.log('IVR response:', ivrResponse);
          bridgeData = ivrResponse.data || ivrResponse;
          break;
        }
        case 'announcement': {
          console.log('Fetching announcement data...');
          const announcementResponse = await getAnnouncement(bridgeUuid);
          console.log('Announcement response:', announcementResponse);
          bridgeData = announcementResponse.data || announcementResponse;
          break;
        }
        case 'vml': {
          console.log('Fetching VML data...');
          const vmlResponse = await getVML(bridgeUuid);
          console.log('VML response:', vmlResponse);
          bridgeData = vmlResponse.data || vmlResponse;
          break;
        }
        case 'call_condition': {
          console.log('Fetching call condition data...');
          const callConditionResponse = await getCallCondition(bridgeUuid);
          console.log('Call condition response:', callConditionResponse);
          bridgeData = callConditionResponse.data || callConditionResponse;
          break;
        }
        case 'bot': {
          console.log('Fetching bot data...');
          const botResponse = await botsApi.getBot(bridgeUuid);
          console.log('Bot response:', botResponse);
          bridgeData = botResponse.data || botResponse;
          break;
        }
        default:
          console.error('Edit not supported for bridge type:', bridgeType);
          return;
      }

      console.log(`Successfully loaded ${bridgeType} data:`, bridgeData);

      if (onDrillDown) {
        onDrillDown({
          type: bridgeType,
          mode: 'edit',
          data: bridgeData,
          environmentUuid: formData.environment_uuid,
          onResult: async (savedData) => {
            const newUuid = savedData.uuid || savedData.id;

            if (target === 'announcement') {
              setFormData(prev => ({ ...prev, announcement_uuid: newUuid }));
              try {
                const response = await bridgeApi.getBridgeResources('announcement', formData.environment_uuid);
                setAnnouncements(Array.isArray(response) ? response : []);
              } catch (err) {
                console.error('Error reloading announcements after edit:', err);
              }
            } else if (target === 'timeout') {
              setFormData(prev => ({ ...prev, timeout_bridge_uuid: newUuid }));
              try {
                const response = await bridgeApi.getBridgeResources(bridgeType, formData.environment_uuid);
                setTimeoutBridgeResources(Array.isArray(response) ? response : []);
              } catch (err) {
                console.error('Error reloading timeout bridge resources after edit:', err);
              }
            } else if (target === 'invalid') {
              setFormData(prev => ({ ...prev, invalid_bridge_uuid: newUuid }));
              try {
                const response = await bridgeApi.getBridgeResources(bridgeType, formData.environment_uuid);
                setInvalidBridgeResources(Array.isArray(response) ? response : []);
              } catch (err) {
                console.error('Error reloading invalid bridge resources after edit:', err);
              }
            } else {
              // Entry key
              setFormData(prev => ({
                ...prev,
                entries: {
                  ...prev.entries,
                  [target]: {
                    ...prev.entries[target],
                    bridge_uuid: newUuid
                  }
                }
              }));
              try {
                const response = await bridgeApi.getBridgeResources(bridgeType, formData.environment_uuid);
                setEntryBridgeResourcesCache(prev => ({
                  ...prev,
                  [bridgeType]: Array.isArray(response) ? response : []
                }));
              } catch (err) {
                console.error('Error reloading entry bridge resources after edit:', err);
              }
            }
          }
        });
      } else {
        setBridgeToEdit(bridgeData);
        setInlineEditMode('edit');
        setInlineDialogOpen(bridgeType);
        setInlineDialogTarget(target);
      }
    } catch (err) {
      console.error(`Error loading ${bridgeType} for edit:`, err);
      const errorMessage = err?.response?.data?.message || err?.message || t('ivr.errors.loadForEdit', { type: t(`typeNouns.${bridgeType}`, { defaultValue: bridgeType }) });
      setError(errorMessage);

      // Display error for 5 seconds then auto-clear
      setTimeout(() => setError(null), 5000);
    }
  };

  // Check if bridge type supports inline creation
  // Note: IVR can bridge to itself - useful for sub-menus
  const supportsInlineCreate = (bridgeType) => {
    return ['queue', 'ivr', 'vml', 'call_condition', 'bot'].includes(bridgeType);
  };

  // Add entry to IVR menu
  const handleAddEntry = () => {
    if (!newEntryNumber || !newEntryNumber.trim()) {
      return;
    }

    // Validate entry number (should be 0-9, *, #)
    const validPattern = /^[0-9*#]{1}$/;
    if (!validPattern.test(newEntryNumber)) {
      setError(t('ivr.errors.entryFormat'));
      return;
    }

    // Check if entry already exists
    if (formData.entries[newEntryNumber]) {
      setError(t('ivr.errors.entryExists', { key: newEntryNumber }));
      return;
    }

    // Add new entry with empty bridge configuration
    setFormData(prev => ({
      ...prev,
      entries: {
        ...prev.entries,
        [newEntryNumber]: {
          name: `Entry ${newEntryNumber}`,  // Default name
          bridge_type: '',
          bridge_uuid: ''
        }
      }
    }));

    setNewEntryNumber('');
    setError(null);
  };

  // Remove entry from IVR menu
  const handleRemoveEntry = (entryNumber) => {
    const newEntries = { ...formData.entries };
    delete newEntries[entryNumber];
    setFormData(prev => ({ ...prev, entries: newEntries }));
  };

  // Update entry bridge configuration
  const handleUpdateEntry = (entryNumber, field, value) => {
    setFormData(prev => ({
      ...prev,
      entries: {
        ...prev.entries,
        [entryNumber]: {
          ...prev.entries[entryNumber],
          [field]: value,
          // Reset bridge_uuid when bridge_type changes
          ...(field === 'bridge_type' ? { bridge_uuid: '' } : {})
        }
      }
    }));

    // Clear entry-specific errors
    const errorKey = `entry_${entryNumber}_${field}`;
    if (formErrors[errorKey]) {
      setFormErrors(prev => ({ ...prev, [errorKey]: null }));
    }

    // Load bridge resources when bridge_type changes
    if (field === 'bridge_type' && value && value !== 'number') {
      loadEntryBridgeResources(value);
    }
  };

  // Load bridge resources for entry bridge types
  const loadEntryBridgeResources = async (bridgeType) => {
    if (!bridgeType || bridgeType === 'number') return;

    // Check if already cached
    if (entryBridgeResourcesCache[bridgeType]) {
      return;
    }

    try {
      console.log(`Loading bridge resources for type: ${bridgeType}`);
      const response = await bridgeApi.getBridgeResources(bridgeType, formData.environment_uuid);
      const resources = Array.isArray(response) ? response : [];

      console.log(`Loaded ${resources.length} ${bridgeType} resources`);
      setEntryBridgeResourcesCache(prev => ({
        ...prev,
        [bridgeType]: resources
      }));
    } catch (err) {
      console.error(`Error loading ${bridgeType} resources for entry:`, err);
    }
  };

  // Validate form
  const validateForm = () => {
    const errors = {};

    if (!formData.name?.trim()) {
      errors.name = t('ivr.errors.name');
    }

    if (!formData.environment_uuid) {
      errors.environment_uuid = t('ivr.errors.application');
    }

    if (!formData.announcement_uuid) {
      errors.announcement_uuid = t('ivr.errors.announcement');
    }

    if (!formData.timeout_bridge_type) {
      errors.timeout_bridge_type = t('ivr.errors.timeoutType');
    }

    if (formData.timeout_bridge_type && !formData.timeout_bridge_uuid) {
      errors.timeout_bridge_uuid = t('ivr.errors.timeoutBridge');
    }

    if (!formData.invalid_bridge_type) {
      errors.invalid_bridge_type = t('ivr.errors.invalidType');
    }

    if (formData.invalid_bridge_type && !formData.invalid_bridge_uuid) {
      errors.invalid_bridge_uuid = t('ivr.errors.invalidBridge');
    }

    // Validate entries - each entry must have bridge_type and bridge_uuid
    if (formData.entries && Object.keys(formData.entries).length > 0) {
      Object.entries(formData.entries).forEach(([key, entry]) => {
        if (!entry.bridge_type) {
          errors[`entry_${key}_bridge_type`] = t('ivr.errors.entryType');
        }
        if (entry.bridge_type && entry.bridge_type !== 'number' && !entry.bridge_uuid) {
          errors[`entry_${key}_bridge_uuid`] = t('ivr.errors.entryBridge');
        }
      });
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let result;
      if (mode === 'edit' && ivr) {
        // UPDATE existing IVR
        result = await ivrApi.updateIVR(ivr.uuid, formData);
      } else {
        // CREATE new IVR
        result = await ivrApi.createIVR(formData);
      }
      const ivrData = result.data || result;
      onSave(ivrData);
      onClose();
    } catch (err) {
      console.error(`IVR ${mode} error:`, err);
      setError(err.message || (mode === 'edit' ? t('ivr.errors.updateFailed') : t('ivr.errors.createFailed')));
    } finally {
      setLoading(false);
    }
  };

  // Check if form is valid
  const isFormValid = formData.name && formData.environment_uuid && formData.announcement_uuid &&
    formData.timeout_bridge_type && formData.timeout_bridge_uuid &&
    formData.invalid_bridge_type && formData.invalid_bridge_uuid;

  // --------------------------------------------------------------------------
  // Shared form content (used in both dialog and panel modes)
  // --------------------------------------------------------------------------
  const formContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: containerMode === 'panel' ? 1 : 2 }}>
      {/* UUID - Read Only (edit mode only) */}
      {ivr?.uuid && (
        <TextField
          label={t('ivr.uuid')}
          fullWidth
          value={ivr.uuid}
          slotProps={{ htmlInput: { dir: 'ltr' } }}
          disabled
          InputProps={{
            readOnly: true,
            sx: { fontFamily: 'monospace', backgroundColor: 'action.hover' }
          }}
          size="small"
        />
      )}

      {/* Enabled Switch */}
      <FormControlLabel
        control={
          <Switch
            checked={formData.enabled}
            onChange={(e) => handleChange('enabled', e.target.checked)}
            disabled={loading}
          />
        }
        label={t('ivr.enabled')}
      />

      {/* Name */}
      <TextField
        label={t('ivr.name')}
        value={formData.name}
        onChange={(e) => handleChange('name', e.target.value)}
        required
        fullWidth
        size="small"
        error={!!formErrors.name}
        helperText={formErrors.name}
        placeholder={t('ivr.namePlaceholder')}
        disabled={loading}
      />

      {/* Environment - Hidden when inherited from DID */}
      {/* A portal user has one environment, their own: never a choice. */}
      {!hideEnvironment && !userSession && (
        <FormControl fullWidth required size="small" error={!!formErrors.environment_uuid} disabled={loading}>
          <InputLabel>{t('ivr.application')}</InputLabel>
          <Select
            value={formData.environment_uuid}
            label={t('ivr.application')}
            onChange={(e) => handleEnvironmentChange(e.target.value)}
          >
            {selectedEnvironments?.map(env => (
              <MenuItem key={env.uuid} value={env.uuid}>{env.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Announcement - with inline creation and editing */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <FormControl fullWidth required size="small" error={!!formErrors.announcement_uuid} disabled={loading || announcementsLoading}>
          <InputLabel>{t('ivr.announcement')}</InputLabel>
          <Select
            value={formData.announcement_uuid}
            label={t('ivr.announcement')}
            onChange={(e) => handleAnnouncementChange(e.target.value)}
          >
            {announcementsLoading ? (
              <MenuItem disabled>{t('ivr.loading')}</MenuItem>
            ) : [
              <MenuItem
                key="add_new"
                onMouseDown={handleCreateNewAnnouncement}
                sx={{ color: 'primary.main', fontWeight: 'bold' }}
              >
                {t('ivr.createNew.announcement')}
              </MenuItem>,
              ...(announcements.length === 0 ? [
                <MenuItem key="no_items" disabled>{t('ivr.noAnnouncements')}</MenuItem>
              ] : announcements.map(announcement => (
                <MenuItem key={announcement.uuid} value={announcement.uuid}>
                  {announcement.name}
                </MenuItem>
              )))
            ]}
          </Select>
        </FormControl>
        {/* Hear / edit the announcement */}
        <AnnouncementActions
          uuid={formData.announcement_uuid}
          onEdit={loading ? null : (uuid) => handleEditBridge('announcement', uuid, 'announcement')}
        />
      </Box>

      {/* Timeout - Row with 3 fields + Edit button */}
      {/* One line while all fit; on a narrow screen the selects wrap to lines of their own. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          label={t('ivr.timeout')}
          type="number"
          value={formData.timeout}
          onChange={(e) => handleChange('timeout', parseInt(e.target.value) || 10)}
          size="small"
          disabled={loading}
          inputProps={{ min: 1, max: 60 }}
          sx={{ flex: '1 1 160px', maxWidth: { sm: 160 } }}
        />
        <FormControl required size="small" error={!!formErrors.timeout_bridge_type} disabled={loading} sx={{ flex: '1 1 10rem', minWidth: 0 }}>
          <InputLabel>{t('ivr.pleaseSelect')}</InputLabel>
          <Select
            value={formData.timeout_bridge_type}
            label={t('ivr.pleaseSelect')}
            onChange={(e) => handleTimeoutBridgeTypeChange(e.target.value)}
          >
            {bridgeTypes.map(bt => (
              <MenuItem key={bt.value} value={bt.value}>{t(`types.${bt.value}`, { defaultValue: bt.label })}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl required size="small" error={!!formErrors.timeout_bridge_uuid} disabled={loading || timeoutBridgeLoading || !formData.timeout_bridge_type} sx={{ flex: '1 1 10rem', minWidth: 0 }}>
          <InputLabel>{t('ivr.pleaseSelect')}</InputLabel>
          <Select
            value={formData.timeout_bridge_uuid}
            label={t('ivr.pleaseSelect')}
            onChange={(e) => handleChange('timeout_bridge_uuid', e.target.value)}
          >
            {timeoutBridgeLoading ? (
              <MenuItem disabled>{t('ivr.loading')}</MenuItem>
            ) : [
              // "+ Create New" option for supported bridge types
              ...(supportsInlineCreate(formData.timeout_bridge_type) ? [
                <MenuItem
                  key="create_new"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpenInlineCreate(formData.timeout_bridge_type, 'timeout');
                  }}
                  sx={{ color: 'primary.main', fontWeight: 'bold' }}
                >
                  {getCreateLabel(formData.timeout_bridge_type)}
                </MenuItem>
              ] : []),
              // Existing resources
              ...(timeoutBridgeResources.length === 0 ? [
                <MenuItem key="no_resources" disabled>{t('ivr.noResources')}</MenuItem>
              ] : timeoutBridgeResources.map(r => (
                <MenuItem key={r.uuid} value={r.uuid}>{r.name}</MenuItem>
              )))
            ]}
          </Select>
        </FormControl>
        {/* Edit Bridge Button */}
        {formData.timeout_bridge_uuid && supportsInlineCreate(formData.timeout_bridge_type) && (
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleEditBridge(formData.timeout_bridge_type, formData.timeout_bridge_uuid, 'timeout')}
            disabled={loading}
            sx={{ mt: 0.5, flexShrink: 0 }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Invalid Attempts - Row with 3 fields + Edit button */}
      {/* One line while all fit; on a narrow screen the selects wrap to lines of their own. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          label={t('ivr.invalidAttempts')}
          type="number"
          value={formData.invalid}
          onChange={(e) => handleChange('invalid', parseInt(e.target.value) || 3)}
          size="small"
          required
          disabled={loading}
          inputProps={{ min: 1, max: 10 }}
          sx={{ flex: '1 1 160px', maxWidth: { sm: 160 } }}
        />
        <FormControl required size="small" error={!!formErrors.invalid_bridge_type} disabled={loading} sx={{ flex: '1 1 10rem', minWidth: 0 }}>
          <InputLabel>{t('ivr.pleaseSelect')}</InputLabel>
          <Select
            value={formData.invalid_bridge_type}
            label={t('ivr.pleaseSelect')}
            onChange={(e) => handleInvalidBridgeTypeChange(e.target.value)}
          >
            {bridgeTypes.map(bt => (
              <MenuItem key={bt.value} value={bt.value}>{t(`types.${bt.value}`, { defaultValue: bt.label })}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl required size="small" error={!!formErrors.invalid_bridge_uuid} disabled={loading || invalidBridgeLoading || !formData.invalid_bridge_type} sx={{ flex: '1 1 10rem', minWidth: 0 }}>
          <InputLabel>{t('ivr.pleaseSelect')}</InputLabel>
          <Select
            value={formData.invalid_bridge_uuid}
            label={t('ivr.pleaseSelect')}
            onChange={(e) => handleChange('invalid_bridge_uuid', e.target.value)}
          >
            {invalidBridgeLoading ? (
              <MenuItem disabled>{t('ivr.loading')}</MenuItem>
            ) : [
              // "+ Create New" option for supported bridge types
              ...(supportsInlineCreate(formData.invalid_bridge_type) ? [
                <MenuItem
                  key="create_new"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpenInlineCreate(formData.invalid_bridge_type, 'invalid');
                  }}
                  sx={{ color: 'primary.main', fontWeight: 'bold' }}
                >
                  {getCreateLabel(formData.invalid_bridge_type)}
                </MenuItem>
              ] : []),
              // Existing resources
              ...(invalidBridgeResources.length === 0 ? [
                <MenuItem key="no_resources" disabled>{t('ivr.noResources')}</MenuItem>
              ] : invalidBridgeResources.map(r => (
                <MenuItem key={r.uuid} value={r.uuid}>{r.name}</MenuItem>
              )))
            ]}
          </Select>
        </FormControl>
        {/* Edit Bridge Button */}
        {formData.invalid_bridge_uuid && supportsInlineCreate(formData.invalid_bridge_type) && (
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleEditBridge(formData.invalid_bridge_type, formData.invalid_bridge_uuid, 'invalid')}
            disabled={loading}
            sx={{ mt: 0.5, flexShrink: 0 }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Add Entries Section */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('ivr.entries.add')}</Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            label="#"
            value={newEntryNumber}
            onChange={(e) => setNewEntryNumber(e.target.value)}
            size="small"
            placeholder={t('ivr.entries.keyPlaceholder')}
            sx={{ width: '100px' }}
            disabled={loading}
            inputProps={{ maxLength: 1 }}
          />
          <IconButton
            onClick={handleAddEntry}
            color="primary"
            disabled={loading || !newEntryNumber}
            size="small"
            sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
          >
            <AddIcon />
          </IconButton>
        </Box>

        {/* Entries Table */}
        {Object.keys(formData.entries).length > 0 && (
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Typography variant="caption" fontWeight="bold" sx={{ display: 'block', mb: 1 }}>
              {t('ivr.entries.profile')}
            </Typography>
            {/* Column names from `sm` up; on a phone each entry is a small card (ENTRY_GRID). */}
            <Box sx={{ ...ENTRY_GRID, display: { xs: 'none', sm: 'grid' } }}>
              <Typography variant="caption" fontWeight="bold">{t('ivr.entries.key')}</Typography>
              <Typography variant="caption" fontWeight="bold">{t('ivr.entries.name')}</Typography>
              <Typography variant="caption" fontWeight="bold">{t('ivr.entries.bridgeType')}</Typography>
              <Typography variant="caption" fontWeight="bold">{t('ivr.entries.bridge')}</Typography>
              <Typography variant="caption" fontWeight="bold">{t('ivr.entries.actions')}</Typography>
            </Box>
            {Object.entries(formData.entries).map(([key, entry]) => (
              <Box key={key} sx={{ ...ENTRY_GRID, pb: { xs: 1, sm: 0 }, borderBottom: { xs: 1, sm: 0 }, borderColor: 'divider' }}>
                <Typography variant="body2" sx={{ gridArea: 'key' }}>{key}</Typography>
                <TextField
                  size="small"
                  sx={{ gridArea: 'name' }}
                  value={entry.name || ''}
                  onChange={(e) => handleUpdateEntry(key, 'name', e.target.value)}
                  placeholder={t('ivr.entries.namePlaceholder')}
                />
                <FormControl size="small" fullWidth error={!!formErrors[`entry_${key}_bridge_type`]} sx={{ gridArea: 'type' }}>
                  <Select
                    inputProps={{ 'aria-label': t('ivr.entries.bridgeType') }}
                    value={entry.bridge_type || ''}
                    onChange={(e) => handleUpdateEntry(key, 'bridge_type', e.target.value)}
                    displayEmpty
                  >
                    <MenuItem value="">{t('ivr.entries.select')}</MenuItem>
                    {bridgeTypes.map(bt => (
                      <MenuItem key={bt.value} value={bt.value}>{t(`types.${bt.value}`, { defaultValue: bt.label })}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth disabled={!entry.bridge_type} error={!!formErrors[`entry_${key}_bridge_uuid`]} sx={{ gridArea: 'bridge' }}>
                  <Select
                    inputProps={{ 'aria-label': t('ivr.entries.bridge') }}
                    value={entry.bridge_uuid || ''}
                    onChange={(e) => handleUpdateEntry(key, 'bridge_uuid', e.target.value)}
                    displayEmpty
                  >
                    {/* "+ Create New" option for supported bridge types */}
                    {entry.bridge_type && supportsInlineCreate(entry.bridge_type) && (
                      <MenuItem
                        key="create_new"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleOpenInlineCreate(entry.bridge_type, key);
                        }}
                        sx={{ color: 'primary.main', fontWeight: 'bold' }}
                      >
                        {getCreateLabel(entry.bridge_type)}
                      </MenuItem>
                    )}
                    <MenuItem value="">{t('ivr.entries.select')}</MenuItem>
                    {entry.bridge_type && entryBridgeResourcesCache[entry.bridge_type]?.map(resource => (
                      <MenuItem key={resource.uuid} value={resource.uuid}>
                        {resource.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box sx={{ gridArea: 'actions', display: 'flex', gap: 0.5 }}>
                  {/* Edit Bridge Button */}
                  {entry.bridge_uuid && supportsInlineCreate(entry.bridge_type) && (
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleEditBridge(entry.bridge_type, entry.bridge_uuid, key)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                  {/* Delete Entry Button */}
                  <IconButton size="small" onClick={() => handleRemoveEntry(key)} color="error">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))}
          </Paper>
        )}
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Box>
  );

  // --------------------------------------------------------------------------
  // Shared action buttons (used in both dialog and panel modes)
  // --------------------------------------------------------------------------
  const actionButtons = (
    <>
      <Button onClick={onClose} disabled={loading}>
        {t('ivr.cancel')}
      </Button>
      <Button
        onClick={handleSubmit}
        variant="contained"
        disabled={!isFormValid || loading}
        startIcon={loading ? <CircularProgress size={20} /> : <IVRIcon />}
      >
        {loading ? (mode === 'edit' ? t('ivr.updating') : t('ivr.creating')) : mode === 'edit' ? t('ivr.update') : t('ivr.create')}
      </Button>
    </>
  );

  // --------------------------------------------------------------------------
  // Nested bridge dialogs - only rendered when NOT using onDrillDown
  // In panel mode with onDrillDown: parent handles nested bridge rendering
  // In panel mode without onDrillDown OR in dialog mode: render inline dialogs
  // --------------------------------------------------------------------------
  const shouldRenderNestedDialogs = !onDrillDown;

  const nestedDialogs = shouldRenderNestedDialogs ? (
    <>
      {/* Inline Announcement Creation/Editing Dialog */}
      <AnnouncementBridge
        open={announcementDialogOpen || (inlineDialogOpen === 'announcement')}
        onClose={() => {
          setAnnouncementDialogOpen(false);
          if (inlineDialogOpen === 'announcement') handleCloseInlineCreate();
        }}
        onSave={async (data) => {
          if (inlineDialogOpen === 'announcement') {
            await handleInlineBridgeSave(data);
          } else {
            await handleAnnouncementSave(data);
          }
        }}
        environmentUuid={formData.environment_uuid}
        hideEnvironment={true}
        editMode={inlineDialogOpen === 'announcement' ? inlineEditMode : 'create'}
        announcement={inlineDialogOpen === 'announcement' ? bridgeToEdit : null}
        zLayer={Z.L3}
      />

      {/* Inline Bridge Creation/Editing Dialogs */}
      {inlineDialogOpen === 'queue' && (
        <QueueBridge
          open={true}
          onClose={handleCloseInlineCreate}
          onSave={handleInlineBridgeSave}
          environmentUuid={formData.environment_uuid}
          hideEnvironment={true}
          mode={inlineEditMode}
          queue={bridgeToEdit}
          zLayer={Z.L3}
        />
      )}
      {inlineDialogOpen === 'ivr' && (
        <IVRBridge
          open={true}
          onClose={handleCloseInlineCreate}
          onSave={handleInlineBridgeSave}
          environmentUuid={formData.environment_uuid}
          hideEnvironment={true}
          mode={inlineEditMode}
          ivr={bridgeToEdit}
          zLayer={Z.L3}
        />
      )}
      {inlineDialogOpen === 'vml' && (
        <VMLBridge
          open={true}
          onClose={handleCloseInlineCreate}
          onSave={handleInlineBridgeSave}
          environmentUuid={formData.environment_uuid}
          hideEnvironment={true}
          mode={inlineEditMode}
          vml={bridgeToEdit}
          zLayer={Z.L3}
        />
      )}
      {inlineDialogOpen === 'call_condition' && (
        <CallConditionBridge
          open={true}
          onClose={handleCloseInlineCreate}
          onSave={handleInlineBridgeSave}
          environmentUuid={formData.environment_uuid}
          hideEnvironment={true}
          mode={inlineEditMode}
          callCondition={bridgeToEdit}
          zLayer={Z.L3}
        />
      )}
      {inlineDialogOpen === 'bot' && (
        <BotBridge
          open={true}
          onClose={handleCloseInlineCreate}
          onSave={handleInlineBridgeSave}
          environmentUuid={formData.environment_uuid}
          hideEnvironment={true}
          mode={inlineEditMode}
          bot={bridgeToEdit}
          zLayer={Z.L3}
        />
      )}
    </>
  ) : null;

  // --------------------------------------------------------------------------
  // Panel mode rendering
  // --------------------------------------------------------------------------
  if (containerMode === 'panel') {
    return (
      <>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Panel title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <IVRIcon fontSize="small" />
            <Typography variant="h6">
              {mode === 'edit' ? t('ivr.titleEdit') : t('ivr.titleCreate')}
            </Typography>
          </Box>

          {/* Scrollable form area */}
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {formContent}
          </Box>

          {/* Action buttons pinned to bottom */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2, borderTop: 1, borderColor: 'divider', mt: 2 }}>
            {actionButtons}
          </Box>
        </Box>

        {nestedDialogs}
      </>
    );
  }

  // --------------------------------------------------------------------------
  // Dialog mode rendering (default / existing behavior)
  // --------------------------------------------------------------------------
  return (
    <>
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      sx={{ zIndex: layer.DIALOG }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IVRIcon />
            <Typography variant="h6">{mode === 'edit' ? t('ivr.titleEdit') : t('ivr.titleCreate')}</Typography>
          </Box>
          <Button onClick={onClose} size="small" sx={{ minWidth: 'auto' }}>
            <CloseIcon />
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent>
        {formContent}
      </DialogContent>

      <DialogActions>
        {actionButtons}
      </DialogActions>
    </Dialog>

    {nestedDialogs}
    </>
  );
};

export default IVRBridge;
