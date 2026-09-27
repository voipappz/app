import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  IconButton,
  Divider,
  Tooltip,
  Chip,
  Checkbox
} from '@mui/material';
import {
  Queue as QueueIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Edit as EditIcon,
  RssFeed as RssFeedIcon
} from '@mui/icons-material';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import { queuesApi } from '../../../services/api/queuesApi';
import { bridgeApi } from '../../../services/api/bridgeApi';
import { extensionsApi } from '../../../services/api/extensionsApi';
import { usersApi } from '../../../services/api/usersApi';
import { AnnouncementBridge } from '../AnnouncementBridge/AnnouncementBridge.jsx';
import { Z, menuProps } from '../../../utils/zIndex.js';
import { useIsUserSession } from '../../../hooks/useIsUserSession';

/**
 * Pull a user's SIP extension username out of a user DETAIL response
 * (GET /api/users/<uuid>). The device lives in `resources` as a type 'extension'
 * entry; prefer its username, then its name, then any inline fields. Accepts the
 * raw response (handles the `{ data: {...} }` wrapper). Returns '' when none.
 */
export const extUsernameFromUserDetail = (detail) => {
  const u = detail?.data || detail || {};
  const res = Array.isArray(u.resources) ? u.resources : [];
  const ext = res.find(r => (r.type || '').toLowerCase() === 'extension');
  return ext?.username || ext?.name || u.extension?.username || u.username || '';
};

/**
 * QueueBridge Component
 * Dialog for creating/editing queues from DID edit dialog
 *
 * Similar pattern to IVRBridge - supports create and edit modes
 */
export const QueueBridge = ({
  open,
  onClose,
  onSave,
  environmentUuid = null,
  queue = null,              // Existing queue data for edit mode
  mode = 'create',           // 'create' or 'edit'
  hideEnvironment = false,   // Hide environment field when inherited
  containerMode = 'dialog',  // 'dialog' or 'panel'
  zLayer = null,             // Optional z-index layer override (e.g. Z.L3 when nested)
  onDrillDown                // Optional drill-down handler for nested creation
}) => {
  const userSession = useIsUserSession();
  const layer = zLayer || Z.L2;
  const { selectedEnvironments } = useCustomerEnvironment();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    environment_uuid: '',
    strategy: 'round_robin',
    max_wait_time: 300,
    max_wait_time_bridge_type: '',
    max_wait_time_bridge_uuid: '',
    hold_announcement_uuid: '',
    intro_announcement_uuid: '',
    enabled: true
  });

  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [bridgeResources, setBridgeResources] = useState([]);
  const [bridgeResourcesLoading, setBridgeResourcesLoading] = useState(false);
  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false);
  const [announcementEditMode, setAnnouncementEditMode] = useState('create');
  const [announcementToEdit, setAnnouncementToEdit] = useState(null);
  const [announcementTarget, setAnnouncementTarget] = useState('hold'); // 'intro' or 'hold'

  // Agents state
  const [allAgents, setAllAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  // SIP usernames currently registered (online), from /api/devices?action=live
  const [registeredUsers, setRegisteredUsers] = useState(() => new Set());
  // uuid -> the user's SIP extension username. The /api/users LIST omits a user's
  // resources, so we enrich from each user's DETAIL (GET /api/users/<uuid>).
  const [extByUser, setExtByUser] = useState(() => ({}));
  const [selectedAgents, setSelectedAgents] = useState([]); // {uuid, name, tier: {level, position}, state}
  const [agentSearch, setAgentSearch] = useState('');
  const [selectedForAdd, setSelectedForAdd] = useState(new Set()); // UUIDs checked in available panel

  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Guards to skip environment-change effects when edit mode already loads
  // these resources (avoids double-fetch on init).
  const editModeInitRef = useRef(false);
  const editModeAnnouncementsRef = useRef(false);
  const [strategies, setStrategies] = useState([]);
  const [strategiesLoading, setStrategiesLoading] = useState(false);

  // Bridge types - fetched from server
  const [bridgeTypes, setBridgeTypes] = useState([]);
  const [, setBridgeTypesLoading] = useState(false); // Loading state available if needed

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
    if (open) {
      fetchBridgeTypes();
    }
  }, [open, bridgeTypes.length]);

  // Tier levels and positions 1-10
  const TIER_OPTIONS = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

  // Default strategies fallback
  const DEFAULT_STRATEGIES = ['round_robin', 'least_recent', 'fewest_calls', 'random', 'ring_all', 'sequential'];

  // Fetch strategies from server when dialog opens
  useEffect(() => {
    const loadStrategies = async () => {
      if (!open) return;

      setStrategiesLoading(true);
      console.log('QueueBridge: Loading strategies from /api/assets/queue_strategies...');
      try {
        const response = await queuesApi.getStrategies();
        console.log('QueueBridge: Raw strategies response:', response);
        // API returns array of strategy strings like ['round_robin', 'least_recent', etc.]
        let strategiesData = [];
        if (Array.isArray(response)) {
          strategiesData = response;
        } else if (response?.data && Array.isArray(response.data)) {
          strategiesData = response.data;
        }
        console.log('QueueBridge: Strategies loaded:', strategiesData);
        // Use loaded strategies or fallback to defaults if empty
        setStrategies(strategiesData.length > 0 ? strategiesData : DEFAULT_STRATEGIES);
      } catch (err) {
        console.error('QueueBridge: Error loading strategies:', err);
        // Fallback to default strategies if API fails
        setStrategies(DEFAULT_STRATEGIES);
      } finally {
        setStrategiesLoading(false);
      }
    };

    loadStrategies();
  }, [open]);

  // Initialize environment UUID and load existing queue data for edit mode
  useEffect(() => {
    if (open) {
      const envUuid = environmentUuid || selectedEnvironments?.[0]?.uuid || '';

      // If edit mode and queue data provided, fetch full queue (with tiers) then load
      if (mode === 'edit' && queue) {
        const initEditMode = async () => {
          // Fetch full queue to get tiers (list view doesn't include them)
          let fullQueue = queue;
          if (queue.uuid) {
            try {
              const fetched = await queuesApi.getQueue(queue.uuid);
              fullQueue = fetched?.data || fetched || queue;
            } catch (err) {
              console.error('QueueBridge: Error fetching full queue:', err);
            }
          }

          setFormData({
            name: fullQueue.name || '',
            environment_uuid: fullQueue.environment?.uuid || fullQueue.environment_uuid || envUuid,
            strategy: fullQueue.strategy || 'round_robin',
            max_wait_time: fullQueue.max_wait_time || 300,
            max_wait_time_bridge_type: fullQueue.max_wait_time_bridge_type || '',
            max_wait_time_bridge_uuid: fullQueue.max_wait_time_bridge_uuid || '',
            hold_announcement_uuid: fullQueue.hold_announcement?.uuid || fullQueue.hold_announcement_uuid || '',
            intro_announcement_uuid: fullQueue.intro_announcement?.uuid || fullQueue.intro_announcement_uuid || '',
            enabled: fullQueue.enabled !== undefined ? fullQueue.enabled : true
          });

          // Load tiers from the full queue response.
          // Per voipappz-api Que#tiers, each tier is enriched with switch
          // data: contact, agent_status, agent_state.
          // The display name is resolved at render time from the allAgents
          // list (User lookup by uuid) — we don't cache it here to avoid
          // the stale-copy churn that used to cause an infinite render loop.
          if (fullQueue.tiers && Array.isArray(fullQueue.tiers)) {
            setSelectedAgents(fullQueue.tiers.map(tier => ({
              uuid: tier.agent,
              agent_name: tier.agent_name || '',
              tier: {
                level: String(tier.level || '1'),
                position: String(tier.position || '1')
              },
              state: tier.state || '',
              agent_status: tier.agent_status || '',
              agent_state: tier.agent_state || '',
              contact: tier.contact || ''
            })));
          }

          // Load resources for edit mode
          const currentEnvUuid = fullQueue.environment?.uuid || fullQueue.environment_uuid || envUuid;

          // Load announcements
          if (currentEnvUuid) {
            editModeAnnouncementsRef.current = true; // prevent env-change effect from double-loading
            setAnnouncementsLoading(true);
            try {
              const response = await bridgeApi.getBridgeResources('announcement', currentEnvUuid);
              const announcementList = Array.isArray(response) ? response : (response?.data || []);
              console.log('QueueBridge: Edit mode announcements loaded:', announcementList.length);
              setAnnouncements(announcementList);
            } catch (err) {
              console.error('QueueBridge: Error loading announcements in edit mode:', err);
              setAnnouncements([]);
            } finally {
              setAnnouncementsLoading(false);
            }
          }

          // Load agents/users (queue agents are users, not extensions)
          if (currentEnvUuid) {
            editModeInitRef.current = true; // prevent env-change effect from double-loading
            setAgentsLoading(true);
            try {
              const response = await bridgeApi.getBridgeResources('user', currentEnvUuid);
              const agentList = Array.isArray(response) ? response : (response?.data || []);
              console.log('QueueBridge: Edit mode agents loaded:', agentList.length);
              setAllAgents(agentList);
            } catch (err) {
              console.error('QueueBridge: Error loading agents in edit mode:', err);
              setAllAgents([]);
            } finally {
              setAgentsLoading(false);
            }
          }

          // Load max_wait_time bridge resources
          if (fullQueue.max_wait_time_bridge_type && fullQueue.max_wait_time_bridge_type !== 'number' && currentEnvUuid) {
            setBridgeResourcesLoading(true);
            try {
              const response = await bridgeApi.getBridgeResources(fullQueue.max_wait_time_bridge_type, currentEnvUuid);
              const resources = Array.isArray(response) ? response : (response?.data || []);
              setBridgeResources(resources);
            } catch (err) {
              console.error('QueueBridge: Error loading bridge resources in edit mode:', err);
              setBridgeResources([]);
            } finally {
              setBridgeResourcesLoading(false);
            }
          }
        };

        initEditMode();
      } else {
        // Create mode - set environment
        setFormData(prev => ({ ...prev, environment_uuid: envUuid }));
      }
    }
    // Depend on stable primitives only — `queue` and `selectedEnvironments`
    // are object/array references that can change identity on every parent
    // render, which would re-trigger initEditMode in an infinite loop.
  }, [open, environmentUuid, selectedEnvironments?.[0]?.uuid, mode, queue?.uuid]);

  // Load announcements when environment changes
  useEffect(() => {
    const loadAnnouncements = async () => {
      if (!formData.environment_uuid) {
        setAnnouncements([]);
        return;
      }

      setAnnouncementsLoading(true);
      try {
        const response = await bridgeApi.getBridgeResources('announcement', formData.environment_uuid);
        setAnnouncements(Array.isArray(response) ? response : (response?.data || []));
      } catch (err) {
        console.error('Error loading announcements:', err);
        setAnnouncements([]);
      } finally {
        setAnnouncementsLoading(false);
      }
    };

    if (open && formData.environment_uuid) {
      // Skip if edit-mode init already loaded announcements for this environment
      if (editModeAnnouncementsRef.current) {
        editModeAnnouncementsRef.current = false;
        return;
      }
      loadAnnouncements();
    }
  }, [open, formData.environment_uuid]);

  // Load agents/users when environment changes (queue agents are users, not extensions)
  useEffect(() => {
    const loadAgents = async () => {
      if (!formData.environment_uuid) {
        setAllAgents([]);
        return;
      }

      setAgentsLoading(true);
      try {
        console.log('QueueBridge: Loading users for environment:', formData.environment_uuid);
        const response = await bridgeApi.getBridgeResources('user', formData.environment_uuid);
        const agents = Array.isArray(response) ? response : (response?.data || []);
        setAllAgents(agents);
        // Which agents' extensions are registered (online) right now
        try {
          const regs = await extensionsApi.getLiveRegistrations();
          setRegisteredUsers(new Set((Array.isArray(regs) ? regs : []).map(r => r.reg_user).filter(Boolean)));
        } catch {
          setRegisteredUsers(new Set());
        }
        // The list endpoint omits each user's resources, so the SIP extension
        // username isn't here — enrich from the user DETAIL, where the device
        // lives in `resources` (type 'extension'). Batched to avoid a request storm.
        (async () => {
          const ids = agents.map(a => a.uuid).filter(Boolean);
          const map = {};
          for (let i = 0; i < ids.length; i += 8) {
            const slice = ids.slice(i, i + 8);
            const details = await Promise.all(slice.map(id => usersApi.getUser(id).catch(() => null)));
            details.forEach((d, k) => { map[slice[k]] = extUsernameFromUserDetail(d); });
          }
          setExtByUser(map);
        })();
      } catch (err) {
        console.error('QueueBridge: Error loading agents:', err);
        setAllAgents([]);
      } finally {
        setAgentsLoading(false);
      }
    };

    if (open && formData.environment_uuid) {
      // Skip if edit-mode init already loaded agents for this environment
      if (editModeInitRef.current) {
        editModeInitRef.current = false;
        return;
      }
      loadAgents();
    }
  }, [open, formData.environment_uuid]);

  // Agent display name is derived from allAgents at render time via
  // getAgentDisplayName(). No effect is needed here — caching the name
  // back into selectedAgents previously caused an infinite render loop
  // when a tier referenced an agent that wasn't in the loaded users list.

  // Build onResult callback for drill-down announcement saves
  const buildAnnouncementDrillDownResult = (target) => async (savedData) => {
    const uuid = savedData.uuid || savedData.id;
    // Reload announcements
    try {
      const response = await bridgeApi.getBridgeResources('announcement', formData.environment_uuid);
      const updatedAnnouncements = Array.isArray(response) ? response : (response?.data || []);
      setAnnouncements(updatedAnnouncements);
      // Auto-select for the target field
      if (uuid) {
        setFormData(prev => ({
          ...prev,
          [target === 'intro' ? 'intro_announcement_uuid' : 'hold_announcement_uuid']: uuid
        }));
      }
    } catch (err) {
      console.error('Error reloading announcements after drill-down save:', err);
    }
  };

  // Handle create new announcement click
  const handleCreateNewAnnouncement = (event, target = 'hold') => {
    event.preventDefault();
    event.stopPropagation();
    setAnnouncementTarget(target);

    if (onDrillDown) {
      onDrillDown({
        type: 'announcement',
        mode: 'create',
        data: null,
        environmentUuid: formData.environment_uuid,
        onResult: buildAnnouncementDrillDownResult(target)
      });
    } else {
      setAnnouncementEditMode('create');
      setAnnouncementToEdit(null);
      setAnnouncementDialogOpen(true);
    }
  };

  // Handle edit announcement click
  const handleEditAnnouncement = (target) => {
    const uuid = target === 'intro' ? formData.intro_announcement_uuid : formData.hold_announcement_uuid;
    const ann = announcements.find(a => a.uuid === uuid);

    if (onDrillDown) {
      onDrillDown({
        type: 'announcement',
        mode: 'edit',
        data: ann || null,
        environmentUuid: formData.environment_uuid,
        onResult: buildAnnouncementDrillDownResult(target)
      });
    } else {
      if (ann) {
        setAnnouncementTarget(target);
        setAnnouncementEditMode('edit');
        setAnnouncementToEdit(ann);
        setAnnouncementDialogOpen(true);
      }
    }
  };

  // Handle announcement save - reload announcements
  const handleAnnouncementSave = async (announcementData) => {
    const uuid = announcementData.uuid || announcementData.id;

    setAnnouncementDialogOpen(false);
    setAnnouncementToEdit(null);

    // Reload announcements
    try {
      const response = await bridgeApi.getBridgeResources('announcement', formData.environment_uuid);
      const updatedAnnouncements = Array.isArray(response) ? response : (response?.data || []);
      setAnnouncements(updatedAnnouncements);

      // Auto-select the newly created/edited announcement for the target field
      if (uuid) {
        setFormData(prev => ({
          ...prev,
          [announcementTarget === 'intro' ? 'intro_announcement_uuid' : 'hold_announcement_uuid']: uuid
        }));
      }
    } catch (err) {
      console.error('Error reloading announcements after save:', err);
    }
  };

  // Load bridge resources when bridge type changes
  useEffect(() => {
    const loadBridgeResources = async () => {
      if (!formData.max_wait_time_bridge_type || !formData.environment_uuid) {
        console.log('QueueBridge: Skipping bridge resource load - missing bridge type or environment', {
          bridgeType: formData.max_wait_time_bridge_type,
          environmentUuid: formData.environment_uuid
        });
        setBridgeResources([]);
        return;
      }

      console.log('QueueBridge: Loading bridge resources', {
        bridgeType: formData.max_wait_time_bridge_type,
        environmentUuid: formData.environment_uuid
      });
      setBridgeResourcesLoading(true);
      try {
        const response = await bridgeApi.getBridgeResources(formData.max_wait_time_bridge_type, formData.environment_uuid);
        const resources = Array.isArray(response) ? response : (response?.data || []);
        console.log('QueueBridge: Bridge resources loaded', {
          bridgeType: formData.max_wait_time_bridge_type,
          count: resources.length,
          resources: resources
        });
        setBridgeResources(resources);
      } catch (err) {
        console.error('QueueBridge: Error loading bridge resources:', err);
        setBridgeResources([]);
      } finally {
        setBridgeResourcesLoading(false);
      }
    };

    if (open && formData.max_wait_time_bridge_type) {
      loadBridgeResources();
    } else {
      console.log('QueueBridge: Not loading bridge resources', {
        open,
        bridgeType: formData.max_wait_time_bridge_type
      });
    }
  }, [open, formData.max_wait_time_bridge_type, formData.environment_uuid]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFormData({
        name: '',
        environment_uuid: '',
        strategy: 'round_robin',
        max_wait_time: 300,
        max_wait_time_bridge_type: '',
        max_wait_time_bridge_uuid: '',
        hold_announcement_uuid: '',
        intro_announcement_uuid: '',
        enabled: true
      });
      setFormErrors({});
      setError(null);
      setAnnouncements([]);
      setBridgeResources([]);
      setAllAgents([]);
      setSelectedAgents([]);
      setAgentSearch('');
      editModeInitRef.current = false;
      editModeAnnouncementsRef.current = false;
    }
  }, [open]);

  // Handle form field change
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  // Handle environment change - reset dependent fields
  const handleEnvironmentChange = (envUuid) => {
    setFormData(prev => ({
      ...prev,
      environment_uuid: envUuid,
      hold_announcement_uuid: '',
      intro_announcement_uuid: '',
      max_wait_time_bridge_uuid: ''
    }));
    setSelectedAgents([]); // Clear selected agents when environment changes
  };

  // Handle bridge type change - reset bridge uuid
  const handleBridgeTypeChange = (bridgeType) => {
    setFormData(prev => ({
      ...prev,
      max_wait_time_bridge_type: bridgeType,
      max_wait_time_bridge_uuid: ''
    }));
  };

  // Add agent to selected list
  const handleAddAgent = (agent) => {
    if (selectedAgents.find(a => a.uuid === agent.uuid)) return;
    setSelectedAgents(prev => [...prev, {
      uuid: agent.uuid,
      tier: { level: '1', position: String(prev.length + 1) },
      agent_status: '',
      agent_state: '',
      contact: ''
    }]);
  };

  // Resolve the display name for a selected agent by looking up the user
  // in the loaded allAgents list (authoritative source). Falls back to the
  // UUID prefix if the user isn't loaded yet or was deleted.
  const getAgentDisplayName = (agentUuid) => {
    const user = allAgents.find(u => u.uuid === agentUuid);
    if (user) return user.name || user.email || user.username || agentUuid.slice(0, 8);
    return agentUuid.slice(0, 8);
  };

  // The agent's SIP extension username (used as its presence/registration key).
  // Prefer the enriched map (from the user detail's resources); fall back to any
  // inline fields on the list object.
  const agentExtName = (agent) => extByUser[agent?.uuid] || agent?.extension?.username || agent?.username || '';
  const getAgentExtName = (agentUuid) => extByUser[agentUuid] || agentExtName(allAgents.find(u => u.uuid === agentUuid));
  const isExtRegistered = (extName) => !!extName && registeredUsers.has(extName);

  // Clear, labeled registration status for an agent's device (SIP extension).
  // Green "Registered" when the device is online in the live registration set,
  // grey "Offline" otherwise; "No ext" when the user has no extension resource.
  const RegBadge = ({ extName }) => {
    if (!extName) {
      return <Chip size="small" label="No ext" variant="outlined"
        sx={{ height: 19, fontSize: '0.62rem', color: 'text.disabled', '& .MuiChip-label': { px: 0.8 } }} />;
    }
    const reg = isExtRegistered(extName);
    return (
      <Tooltip title={`Ext ${extName} — ${reg ? 'Registered (online)' : 'Not registered (offline)'}`}>
        <Chip size="small" icon={<RssFeedIcon sx={{ fontSize: 12 }} />} label={reg ? 'Registered' : 'Offline'}
          sx={{ height: 19, fontSize: '0.62rem', fontWeight: 600,
            bgcolor: reg ? 'rgba(41,171,135,.14)' : 'rgba(0,0,0,.06)',
            color: reg ? '#1f8a6d' : 'text.secondary',
            '& .MuiChip-icon': { color: reg ? '#29AB87' : '#b0b0b0', ml: 0.6 },
            '& .MuiChip-label': { px: 0.7 } }} />
      </Tooltip>
    );
  };

  // Remove agent from selected list
  const handleRemoveAgent = (agentUuid) => {
    setSelectedAgents(prev => prev.filter(a => a.uuid !== agentUuid));
  };

  // Update agent tier level or position (local state + API call)
  const handleUpdateAgent = (agentUuid, field, value) => {
    setSelectedAgents(prev => prev.map(agent => {
      if (agent.uuid !== agentUuid) return agent;
      if (field === 'tier_level') return { ...agent, tier: { ...agent.tier, level: value } };
      if (field === 'tier_position') return { ...agent, tier: { ...agent.tier, position: value } };
      return agent;
    }));
    // If editing an existing queue, apply tier change to the switch immediately
    if (mode === 'edit' && queue?.uuid) {
      const tierKey = field === 'tier_level' ? 'level' : 'position';
      queuesApi.setTier(agentUuid, queue.uuid, tierKey, value).catch(err => {
        console.error('Failed to set tier:', err);
      });
    }
  };

  // (Runtime agent status / tier state controls were removed from the queue
  // editor to keep agent management simple — membership + tier priority only.
  // Live agent availability belongs in the monitoring/live view.)

  // Filter available agents (exclude already selected)
  const filteredAgents = allAgents.filter(agent => {
    const isSelected = selectedAgents.find(sa => sa.uuid === agent.uuid);
    if (isSelected) {
      return false; // Don't show already selected agents
    }

    const matchesSearch = !agentSearch ||
      agent.name?.toLowerCase().includes(agentSearch.toLowerCase()) ||
      agent.username?.toLowerCase().includes(agentSearch.toLowerCase()) ||
      agent.number?.toString().includes(agentSearch.toLowerCase()) ||
      agent.email?.toLowerCase().includes(agentSearch.toLowerCase());
    return matchesSearch;
  });

  // Validate form
  const validateForm = () => {
    const errors = {};

    if (!formData.name?.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.environment_uuid) {
      errors.environment_uuid = 'Application is required';
    }

    if (!formData.strategy) {
      errors.strategy = 'Strategy is required';
    }

    if (!formData.hold_announcement_uuid) {
      errors.hold_announcement_uuid = 'Hold Announcement is required';
    }

    if (!formData.max_wait_time_bridge_type) {
      errors.max_wait_time_bridge_type = 'Max Wait Time Bridge Type is required';
    }

    if (formData.max_wait_time_bridge_type && !formData.max_wait_time_bridge_uuid) {
      errors.max_wait_time_bridge_uuid = 'Max Wait Time Bridge is required';
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
      // Build tiers as hash keyed by position: tiers[1][uuid]=..., tiers[2][uuid]=...
      const tiersHash = {};
      selectedAgents.forEach(agent => {
        tiersHash[agent.tier.position] = {
          uuid: agent.uuid,
          level: agent.tier.level,
          position: agent.tier.position
        };
      });

      const submitData = {
        ...formData,
        tiers: tiersHash
      };

      let result;
      if (mode === 'edit' && queue) {
        // UPDATE existing queue
        result = await queuesApi.updateQueue(queue.uuid, submitData);
      } else {
        // CREATE new queue
        result = await queuesApi.createQueue(submitData);
      }

      const queueData = result.data || result;
      onSave(queueData);
      onClose();
    } catch (err) {
      console.error(`Queue ${mode} error:`, err);
      setError(err.message || `Failed to ${mode} queue`);
    } finally {
      setLoading(false);
    }
  };

  // Check if form is valid
  const isFormValid = formData.name && formData.environment_uuid && formData.strategy &&
    formData.hold_announcement_uuid && formData.max_wait_time_bridge_type && formData.max_wait_time_bridge_uuid;

  // Extract form content (shared between dialog and panel modes)
  const formContent = (
    <Box component="form" autoComplete="off" noValidate>
      <Grid container spacing={3} direction="column">
        {/* UUID - Read Only (edit mode only) */}
        {queue?.uuid && (
          <Grid size={12}>
            <TextField
              label="UUID"
              fullWidth
              value={queue.uuid}
              disabled
              InputProps={{
                readOnly: true,
                sx: { fontFamily: 'monospace', backgroundColor: 'action.hover' }
              }}
              size="small"
            />
          </Grid>
        )}

        {/* Enabled Toggle */}
        <Grid size={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body1">Enabled</Typography>
            <Switch
              checked={formData.enabled}
              onChange={(e) => handleChange('enabled', e.target.checked)}
              disabled={loading}
            />
          </Box>
        </Grid>

        {/* Name */}
        <Grid size={12}>
          <TextField
            label="Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
            fullWidth
            error={!!formErrors.name}
            helperText={formErrors.name}
            placeholder="Enter queue name"
            disabled={loading}
          />
        </Grid>

        {/* Strategy */}
        <Grid size={12}>
          <FormControl fullWidth disabled={loading || strategiesLoading} required error={!!formErrors.strategy}>
            <InputLabel required>Strategy</InputLabel>
            <Select
              value={formData.strategy}
              onChange={(e) => handleChange('strategy', e.target.value)}
              label="Strategy"
              MenuProps={menuProps(layer)}
            >
              <MenuItem value="">Select Strategy...</MenuItem>
              {strategiesLoading ? (
                <MenuItem disabled>Loading...</MenuItem>
              ) : strategies.length === 0 ? (
                <MenuItem disabled>No strategies available</MenuItem>
              ) : (
                strategies.map(strategy => (
                  <MenuItem key={strategy} value={strategy}>
                    {strategy.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        </Grid>

        {/* Environment */}
        {!hideEnvironment && (
          <Grid size={12}>
            {/* A portal user has one environment, their own: never a choice. */}
            {!userSession && (
            <FormControl fullWidth required error={!!formErrors.environment_uuid} disabled={loading}>
              <InputLabel required>Application</InputLabel>
              <Select
                value={formData.environment_uuid}
                onChange={(e) => handleEnvironmentChange(e.target.value)}
                label="Application"
                MenuProps={menuProps(layer)}
              >
                <MenuItem value="">Select Application...</MenuItem>
                {selectedEnvironments?.map(env => (
                  <MenuItem key={env.uuid} value={env.uuid}>{env.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            )}
          </Grid>
        )}

        {/* Intro Announcement */}
        <Grid size={12}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FormControl fullWidth disabled={loading || announcementsLoading}>
              <InputLabel>Intro Announcement</InputLabel>
              <Select
                value={formData.intro_announcement_uuid}
                onChange={(e) => handleChange('intro_announcement_uuid', e.target.value)}
                label="Intro Announcement"
                MenuProps={menuProps(layer)}
              >
                <MenuItem value="">None</MenuItem>
                <MenuItem onMouseDown={(e) => handleCreateNewAnnouncement(e, 'intro')} sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                  + Create New
                </MenuItem>
                {announcements.map(a => (
                  <MenuItem key={a.uuid} value={a.uuid}>{a.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {formData.intro_announcement_uuid && (
              <Tooltip title="Edit Announcement">
                <IconButton onClick={() => handleEditAnnouncement('intro')} size="small" color="primary">
                  <EditIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Grid>

        {/* Hold Announcement */}
        <Grid size={12}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FormControl fullWidth required error={!!formErrors.hold_announcement_uuid} disabled={loading || announcementsLoading}>
              <InputLabel required>Hold Announcement</InputLabel>
              <Select
                value={formData.hold_announcement_uuid}
                onChange={(e) => handleChange('hold_announcement_uuid', e.target.value)}
                label="Hold Announcement"
                MenuProps={menuProps(layer)}
              >
                <MenuItem value="">Select Announcement...</MenuItem>
                {announcementsLoading ? (
                  <MenuItem disabled>Loading...</MenuItem>
                    ) : [
                      <MenuItem key="add_new" onMouseDown={(e) => handleCreateNewAnnouncement(e, 'hold')} sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                        + Create New Announcement
                      </MenuItem>,
                      ...(announcements.length === 0 ? [
                        <MenuItem key="no_items" disabled>No announcements</MenuItem>
                      ] : announcements.map(a => (
                        <MenuItem key={a.uuid} value={a.uuid}>{a.name}</MenuItem>
                      )))
                    ]}
                  </Select>
                </FormControl>
                {formData.hold_announcement_uuid && (
                  <Tooltip title="Edit Announcement">
                    <IconButton onClick={() => handleEditAnnouncement('hold')} size="small" color="primary">
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Grid>

        {/* Max Wait Time Bridge Configuration */}
        <Grid size={12}>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'text.secondary' }}>
            Max Wait Time Bridge Configuration
          </Typography>
        </Grid>

        {/* Max Wait Time (seconds) */}
        <Grid size={12}>
          <TextField
            label="Max Wait Time (seconds)"
            type="number"
            value={formData.max_wait_time}
            onChange={(e) => handleChange('max_wait_time', parseInt(e.target.value) || 300)}
            fullWidth
            required
            disabled={loading}
            placeholder="Enter max wait time in seconds"
            inputProps={{ min: 1, max: 99999 }}
            helperText="Maximum time caller waits in queue before being bridged"
          />
        </Grid>

        {/* Bridge Type */}
        <Grid size={12}>
          <FormControl fullWidth required error={!!formErrors.max_wait_time_bridge_type} disabled={loading}>
            <InputLabel required>Bridge Type</InputLabel>
            <Select
              value={formData.max_wait_time_bridge_type}
              onChange={(e) => handleBridgeTypeChange(e.target.value)}
              label="Bridge Type"
              MenuProps={menuProps(layer)}
            >
              <MenuItem value="">Select Bridge Type...</MenuItem>
              {bridgeTypes.map(bt => (
                <MenuItem key={bt.value} value={bt.value}>{bt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* Bridge Destination */}
        <Grid size={12}>
          <FormControl fullWidth required error={!!formErrors.max_wait_time_bridge_uuid} disabled={loading || bridgeResourcesLoading || !formData.max_wait_time_bridge_type}>
            <InputLabel required>Bridge Destination</InputLabel>
            <Select
              value={formData.max_wait_time_bridge_uuid}
              onChange={(e) => handleChange('max_wait_time_bridge_uuid', e.target.value)}
              label="Bridge Destination"
              MenuProps={menuProps(layer)}
            >
              <MenuItem value="">Select Destination...</MenuItem>
              {bridgeResourcesLoading ? (
                <MenuItem disabled>Loading...</MenuItem>
              ) : bridgeResources.length === 0 ? (
                <MenuItem disabled>No {formData.max_wait_time_bridge_type || 'resources'} available</MenuItem>
              ) : (
                bridgeResources.map(r => (
                  <MenuItem key={r.uuid} value={r.uuid}>{r.name}</MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {/* Agents Management — simple: membership + tier priority, with a clear
          per-device (SIP extension) registration status. */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Queue Agents
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {allAgents.filter(a => isExtRegistered(agentExtName(a))).length} of {allAgents.length} registered
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>

          {/* Left: available agents — search, multi-select, add */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TextField
                placeholder="Search agents…"
                value={agentSearch}
                onChange={(e) => { setAgentSearch(e.target.value); setSelectedForAdd(new Set()); }}
                size="small"
                fullWidth
              />
              <Button
                variant="contained"
                size="small"
                disabled={selectedForAdd.size === 0}
                startIcon={<AddIcon />}
                onClick={() => {
                  filteredAgents.filter(a => selectedForAdd.has(a.uuid)).forEach(a => handleAddAgent(a));
                  setSelectedForAdd(new Set());
                }}
                sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Add {selectedForAdd.size > 0 ? `(${selectedForAdd.size})` : ''}
              </Button>
            </Box>
            <Paper variant="outlined" sx={{ height: 300, overflow: 'auto' }}>
              {agentsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>
              ) : filteredAgents.length === 0 ? (
                <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography variant="body2">No agents available</Typography>
                </Box>
              ) : (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.5, position: 'sticky', top: 0,
                    bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', zIndex: 1 }}>
                    <Checkbox size="small" sx={{ p: 0 }}
                      indeterminate={selectedForAdd.size > 0 && selectedForAdd.size < filteredAgents.length}
                      checked={filteredAgents.length > 0 && selectedForAdd.size === filteredAgents.length}
                      onChange={(e) => setSelectedForAdd(e.target.checked ? new Set(filteredAgents.map(a => a.uuid)) : new Set())}
                    />
                    <Typography variant="caption" color="text.secondary">Select all ({filteredAgents.length})</Typography>
                  </Box>
                  {filteredAgents.map(agent => {
                    const ext = agentExtName(agent);
                    const checked = selectedForAdd.has(agent.uuid);
                    return (
                      <Box key={agent.uuid}
                        onClick={() => setSelectedForAdd(prev => {
                          const next = new Set(prev);
                          if (next.has(agent.uuid)) next.delete(agent.uuid); else next.add(agent.uuid);
                          return next;
                        })}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.6, cursor: 'pointer',
                          bgcolor: checked ? 'action.selected' : 'transparent',
                          borderBottom: '1px solid', borderColor: 'divider',
                          '&:hover': { bgcolor: checked ? 'action.selected' : 'action.hover' } }}
                      >
                        <Checkbox size="small" checked={checked} tabIndex={-1} sx={{ p: 0 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography noWrap sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{agent.name || agent.username || '—'}</Typography>
                          <Typography noWrap sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{ext ? `Ext ${ext}` : 'No extension'}</Typography>
                        </Box>
                        <RegBadge extName={ext} />
                      </Box>
                    );
                  })}
                </>
              )}
            </Paper>
          </Box>

          {/* Right: assigned agents — registration + tier priority + remove */}
          <Box>
            <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
              Assigned ({selectedAgents.length})
            </Typography>
            <Paper variant="outlined" sx={{ height: 300, overflow: 'auto' }}>
              {selectedAgents.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography variant="body2">No agents assigned — pick from the left and click Add</Typography>
                </Box>
              ) : (
                selectedAgents.map(agent => {
                  const ext = getAgentExtName(agent.uuid);
                  return (
                    <Box key={agent.uuid}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.6,
                        borderBottom: '1px solid', borderColor: 'divider' }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{agent.agent_name || getAgentDisplayName(agent.uuid)}</Typography>
                        <Typography noWrap sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{ext ? `Ext ${ext}` : 'No extension'}</Typography>
                      </Box>
                      <RegBadge extName={ext} />
                      <Tooltip title="Priority level">
                        <Select value={agent.tier.level} size="small"
                          onChange={(e) => handleUpdateAgent(agent.uuid, 'tier_level', e.target.value)}
                          sx={{ fontSize: '0.72rem', '& .MuiSelect-select': { py: 0.25, pl: 0.75, pr: '20px !important' } }}>
                          {TIER_OPTIONS.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.78rem' }}>L{v}</MenuItem>)}
                        </Select>
                      </Tooltip>
                      <Tooltip title="Position within level">
                        <Select value={agent.tier.position} size="small"
                          onChange={(e) => handleUpdateAgent(agent.uuid, 'tier_position', e.target.value)}
                          sx={{ fontSize: '0.72rem', '& .MuiSelect-select': { py: 0.25, pl: 0.75, pr: '20px !important' } }}>
                          {TIER_OPTIONS.map(v => <MenuItem key={v} value={v} sx={{ fontSize: '0.78rem' }}>P{v}</MenuItem>)}
                        </Select>
                      </Tooltip>
                      <IconButton size="small" onClick={() => handleRemoveAgent(agent.uuid)} color="error" sx={{ p: 0.5 }}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  );
                })
              )}
            </Paper>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              L = priority level, P = position within the level.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Box>
  );

  // Extract action buttons (shared between dialog and panel modes)
  const actionButtons = (
    <>
      <Button onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button
        onClick={handleSubmit}
        variant="contained"
        disabled={!isFormValid || loading}
        startIcon={loading ? <CircularProgress size={20} /> : <QueueIcon />}
      >
        {loading ? `${mode === 'edit' ? 'Updating' : 'Creating'}...` : mode === 'edit' ? 'Update Queue' : 'Create Queue'}
      </Button>
    </>
  );

  // Determine whether to render the AnnouncementBridge dialog.
  // In panel mode with onDrillDown the parent handles nested creation; no local dialog needed.
  // In panel mode without onDrillDown OR in dialog mode: keep local AnnouncementBridge dialog.
  const shouldRenderAnnouncementDialog = !(containerMode === 'panel' && onDrillDown);

  if (containerMode === 'panel') {
    return (
      <>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <QueueIcon />
            <Typography variant="h6">{mode === 'edit' ? 'Edit Queue' : 'Create Queue'}</Typography>
          </Box>

          {formContent}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            {actionButtons}
          </Box>
        </Box>

        {/* Inline Announcement Create/Edit Dialog (only when no onDrillDown) */}
        {shouldRenderAnnouncementDialog && (
          <AnnouncementBridge
            open={announcementDialogOpen}
            onClose={() => { setAnnouncementDialogOpen(false); setAnnouncementToEdit(null); }}
            onSave={handleAnnouncementSave}
            environmentUuid={formData.environment_uuid}
            hideEnvironment={true}
            announcement={announcementToEdit}
            editMode={announcementEditMode}
            zLayer={Z.L3}
          />
        )}

      </>
    );
  }

  // Default: dialog mode
  return (
    <>
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      sx={{ zIndex: layer.DIALOG }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <QueueIcon />
            <Typography variant="h6">{mode === 'edit' ? 'Edit Queue' : 'Create Queue'}</Typography>
          </Box>
          <Button onClick={onClose} size="small" sx={{ minWidth: 'auto' }}>
            <CloseIcon />
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {formContent}
      </DialogContent>

      <DialogActions>
        {actionButtons}
      </DialogActions>
    </Dialog>

    {/* Inline Announcement Create/Edit Dialog */}
    <AnnouncementBridge
      open={announcementDialogOpen}
      onClose={() => { setAnnouncementDialogOpen(false); setAnnouncementToEdit(null); }}
      onSave={handleAnnouncementSave}
      environmentUuid={formData.environment_uuid}
      hideEnvironment={true}
      announcement={announcementToEdit}
      editMode={announcementEditMode}
      zLayer={Z.L3}
    />

    </>
  );
};

export default QueueBridge;
