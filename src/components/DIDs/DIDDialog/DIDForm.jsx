import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import { useIsUserSession } from '../../../hooks/useIsUserSession';
import { NumberSelector } from '../../Bridges/NumberBridge/NumberSelector.jsx';
import RoutingChain from './RoutingChain.jsx';
import SipProviderQuickCreate from './SipProviderQuickCreate.jsx';
import { didsApi } from '../../../services/api/routesApi';
import { providersApi } from '../../../services/api/providersApi';
import { parseServerErrors, is406Error } from '../../../utils/formValidation';
import { Z, menuProps } from '../../../utils/zIndex.js';
import './DIDForm.css';

/** Dashed section divider with centered label */
const FormSection = ({ label }) => (
  <div className="did-form-section">
    <span className="did-form-section-text">{label}</span>
  </div>
);

// A trunk route (API Did::TRUNK) is how a phone calls out. `number` is a dial
// PREFIX and `replace` what takes its place (optional): 0 + 972 turns
// 0501234567 into 972501234567. Every feature:* route matches the same way
// (API Did.match!, prefix_range), and the API rejects a regex on save.
// The provider is optional: with one the call goes there (bridge_type
// sip_provider — kept out of /api/assets/bridge_types on purpose, since IVRs
// share that list); without one the carrier is chosen by rate and no bridge
// is sent.
const TRUNK = 'feature:trunk';
const TRUNK_BRIDGE = 'sip_provider';
const PREFIX_FORMAT = /^[0-9+*#]+$/;
const REPLACE_FORMAT = /^[0-9+*#]*$/;
const EXAMPLE_REST = '501234567';

// The type decides every field below it, so it is chosen first and named in
// words, not as the raw API value.
// Every type /api/routes?action=types answers (API Did::TYPES + FEATURES).
const TYPE_LABELS = {
  [TRUNK]: 'Trunk – outgoing calls',
  dst: 'Incoming number',
  src: 'Caller number',
  feature: 'Feature (generic)',
  'feature:user.login': 'Feature – agent log in',
  'feature:user.logout': 'Feature – agent log out',
  'feature:user.available': 'Feature – agent available',
  'feature:user.break': 'Feature – agent on break',
  'feature:user.logged_out': 'Feature – agent logged out',
  'feature:spy': 'Feature – listen in (spy)',
  'feature:pickup': 'Feature – pick up (group)',
  'feature:pickup_extension': 'Feature – pick up a device',
  'feature:follow_me': 'Feature – call forwarding on',
  'feature:follow_me_disable': 'Feature – call forwarding off',
  'feature:caller_id_replace': 'Feature – caller ID replace',
};
const TYPE_HINTS = {
  [TRUNK]: 'Dialed numbers that start with a prefix are sent out, with the prefix rewritten.',
  dst: 'Calls arriving on this number are routed to a destination.',
  src: 'Calls from this caller number are routed to a destination.',
  'feature:user.login': 'A code the agent dials to log in, e.g. *40 followed by the user.',
  'feature:user.logout': 'A code the agent dials to log out.',
  'feature:user.available': 'A code the agent dials to become available.',
  'feature:user.break': 'A code the agent dials to go on break.',
  'feature:user.logged_out': 'A code the agent dials to set logged out.',
  'feature:spy': 'A code followed by a device, to listen in on its call.',
  'feature:pickup': 'A code that picks up a call ringing in the group.',
  'feature:pickup_extension': 'A code followed by a device, to pick up its ringing call.',
  'feature:follow_me': 'A code followed by a number, to forward this device to it.',
  'feature:follow_me_disable': 'A code that turns call forwarding off.',
  'feature:caller_id_replace': 'A code followed by a number, dialed with a replaced caller ID.',
};
const typeLabel = (type) => TYPE_LABELS[type] || (type.startsWith('feature:')
  ? `Feature – ${type.slice(8).replace(/[._]/g, ' ')}`
  : type.replace(/_/g, ' '));

/**
 * DIDForm Component
 * Pure form content for creating/editing DIDs.
 * No Dialog wrapper — used by both DIDDialog (legacy) and DIDWizard.
 * Bridge create/edit is delegated to the onDrillDown callback.
 */
const DIDForm = forwardRef(({
  did,
  loading,
  bridgeTypes = [],
  bridgeResources = {},
  didTypes = [],
  onFetchBridgeResources,
  onSave,
  onCancel,
  onDrillDown,
  showActions = true,
}, ref) => {
  const { selectedEnvironments } = useCustomerEnvironment();
  // A portal user has one environment, their own: it is set, never a field.
  const userSession = useIsUserSession();
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [apiError, setApiError] = useState('');
  const [environments, setEnvironments] = useState([]);
  const [metaFields, setMetaFields] = useState([]);
  const [providers, setProviders] = useState([]);
  const [sipProviders, setSipProviders] = useState([]);
  const [creatingSipProvider, setCreatingSipProvider] = useState(false);

  const isTrunk = formData.type === TRUNK;
  // Every feature:* route matches a dial prefix (see TRUNK above).
  const isFeature = (formData.type || '').startsWith('feature:');
  // What a dialed example turns into, shown under the rule.
  const prefix = (formData.number || '').trim();
  const preview = isFeature && PREFIX_FORMAT.test(prefix) && REPLACE_FORMAT.test(formData.replace || '')
    ? { dialed: `${prefix}${EXAMPLE_REST}`, sent: `${formData.replace || ''}${EXAMPLE_REST}` }
    : null;

  // Initialize form data
  useEffect(() => {
    if (did) {
      const environmentUuid = did.environment_uuid ||
        (did.environment && did.environment.uuid) || '';

      setFormData({
        name: did.name || '',
        number: did.number || '',
        replace: did.replace || '',
        environment_uuid: environmentUuid,
        type: did.type || '',
        provider_uuid: did.provider_uuid || '',
        bridge_type: did.bridge_type || '',
        bridge_uuid: did.bridge_uuid || (did.bridge && did.bridge.uuid) || '',
        enabled: did.enabled !== undefined ? did.enabled : true,
        notes: did.notes || ''
      });

      if (did.meta) {
        if (typeof did.meta === 'object') {
          setMetaFields(Object.entries(did.meta).map(([key, value]) => ({ key, value })));
        } else {
          try {
            const parsed = JSON.parse(did.meta);
            setMetaFields(Object.entries(parsed).map(([key, value]) => ({ key, value })));
          } catch {
            setMetaFields([]);
          }
        }
      } else {
        setMetaFields([]);
      }
    } else {
      setFormData({
        name: '',
        number: '',
        replace: '',
        environment_uuid: selectedEnvironments?.[0]?.uuid || '',
        type: '',
        provider_uuid: '',
        bridge_type: '',
        bridge_uuid: '',
        enabled: true,
        notes: ''
      });
      setMetaFields([]);
    }
    setErrors({});
    setSubmitAttempted(false);
    setApiError('');
  }, [did, selectedEnvironments]);

  // Load environments
  useEffect(() => {
    let envList = selectedEnvironments ? [...selectedEnvironments] : [];

    if (did) {
      const didEnvUuid = did.environment_uuid || did.environment?.uuid;
      const didEnvName = did.environment?.name || did.environment_name;
      if (didEnvUuid && !envList.find(e => e.uuid === didEnvUuid)) {
        envList.push({
          uuid: didEnvUuid,
          name: didEnvName || `Application (${didEnvUuid.slice(0, 8)}...)`,
        });
      }
    }

    setEnvironments(envList);
  }, [selectedEnvironments, did]);

  // Fetch available DID providers
  useEffect(() => {
    didsApi.getProviders()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.data || []);
        setProviders(list);
      })
      .catch(() => setProviders([]));
  }, []);

  // A trunk bridges to one of the customer's sip providers
  useEffect(() => {
    if (!isTrunk) return;
    providersApi.getProviders({ per_page: 100, 'search[type]': 'sip' })
      .then((data) => setSipProviders(Array.isArray(data) ? data : (data?.data || [])))
      .catch(() => setSipProviders([]));
  }, [isTrunk]);

  // Fetch bridge resources when DID has existing bridge_type
  useEffect(() => {
    if (onFetchBridgeResources) {
      const environmentUuid = did?.environment_uuid || did?.environment?.uuid;
      if (did?.bridge_type && !['number', TRUNK_BRIDGE].includes(did.bridge_type) && environmentUuid) {
        onFetchBridgeResources(did.bridge_type, environmentUuid);
      }
    }
  }, [did?.bridge_type, did?.environment_uuid, did?.environment?.uuid, onFetchBridgeResources]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleBridgeTypeChange = async (bridgeType) => {
    setFormData(prev => ({
      ...prev,
      bridge_type: bridgeType,
      bridge_uuid: ''
    }));
    if (bridgeType && bridgeType !== 'number' && onFetchBridgeResources) {
      await onFetchBridgeResources(bridgeType, formData.environment_uuid);
    }
  };

  const handleTypeChange = (type) => {
    setFormData(prev => {
      if (type === TRUNK) return { ...prev, type, bridge_type: '', bridge_uuid: '' };
      if (prev.bridge_type === TRUNK_BRIDGE) return { ...prev, type, bridge_type: '', bridge_uuid: '' };
      return { ...prev, type };
    });
    if (errors.type) setErrors(prev => ({ ...prev, type: null }));
  };

  const handleEnvironmentChange = (envUuid) => {
    setFormData(prev => ({
      ...prev,
      environment_uuid: envUuid,
      bridge_type: '',
      bridge_uuid: '',
    }));
  };

  // Meta field management
  const addMetaField = () => {
    setMetaFields(prev => [...prev, { key: '', value: '' }]);
  };

  const removeMetaField = (index) => {
    setMetaFields(prev => prev.filter((_, i) => i !== index));
  };

  const updateMetaField = (index, field, value) => {
    setMetaFields(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  // Bridge selection — detect inline creation
  const handleBridgeChange = (value) => {
    if (value === 'add_new') {
      if (onDrillDown) {
        onDrillDown({
          type: formData.bridge_type,
          mode: 'create',
          data: null,
          environmentUuid: formData.environment_uuid,
          onResult: async (savedData) => {
            const uuid = savedData.uuid || savedData.id;
            handleChange('bridge_uuid', uuid);
            if (onFetchBridgeResources) {
              await onFetchBridgeResources(formData.bridge_type, formData.environment_uuid, true);
            }
          }
        });
      }
    } else {
      handleChange('bridge_uuid', value);
    }
  };

  // Validation
  const validateForm = () => {
    const newErrors = {};
    if (!formData.name?.trim()) newErrors.name = 'Name is required';
    if (!formData.number?.trim()) newErrors.number = isFeature ? 'Prefix is required' : 'Number is required';
    else if (isFeature && !PREFIX_FORMAT.test(formData.number.trim())) {
      newErrors.number = 'Only digits, + * # (a prefix, not a pattern)';
    }
    if (isFeature && !REPLACE_FORMAT.test(formData.replace || '')) {
      newErrors.replace = 'Only digits, + * #';
    }
    if (!formData.environment_uuid) newErrors.environment_uuid = 'Application is required';
    if (!formData.type) newErrors.type = 'Type is required';
    if (!isTrunk && !formData.bridge_type) newErrors.bridge_type = 'Bridge type is required';
    if (!isTrunk && formData.bridge_type && !formData.bridge_uuid) {
      newErrors.bridge_uuid = formData.bridge_type === 'number'
        ? 'Destination number is required'
        : 'Bridge is required';
    }

    const metaKeys = metaFields.map(f => f.key).filter(k => k.trim());
    const duplicateKeys = metaKeys.filter((k, i) => metaKeys.indexOf(k) !== i);
    if (duplicateKeys.length > 0) {
      newErrors.meta = 'Duplicate meta keys are not allowed';
      duplicateKeys.forEach(k => { newErrors[`meta_${k}`] = 'Duplications are not allowed'; });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    setApiError('');
    if (!validateForm()) return;

    const submitData = { ...formData };
    if (isFeature) submitData.number = submitData.number.trim();
    // A trunk's bridge follows its provider: none = carrier chosen by rate.
    if (isTrunk) {
      submitData.bridge_type = submitData.bridge_uuid ? TRUNK_BRIDGE : null;
      submitData.provider_uuid = '';
    }

    delete submitData.number_bridge;
    if (!submitData.bridge_uuid || submitData.bridge_uuid === '') {
      submitData.bridge_uuid = null;
    }

    if (metaFields.length > 0) {
      const meta = {};
      metaFields.forEach(f => {
        if (f.key.trim() && f.value.trim()) meta[f.key] = f.value;
      });
      submitData.meta = meta;
    }

    try {
      await onSave(submitData);
    } catch (error) {
      console.error('Save error:', error);
      if (is406Error(error)) {
        const serverErrors = parseServerErrors(error);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(prev => ({ ...prev, ...serverErrors }));
        }
      }
      setApiError(error?.response?.data?.message || error?.message || 'Failed to save Route');
    }
  };

  // Expose submit to parent via ref
  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
  }));

  const isFormValid = formData.name && formData.number && formData.environment_uuid && formData.type
    && (isTrunk || formData.bridge_type);

  // Helper: get human-readable bridge type label
  const getBridgeTypeLabel = (type) => {
    const labels = {
      queue: 'Queue', ivr: 'IVR', vml: 'VML Script',
      call_condition: 'Call Condition', bot: 'Bot',
      announcement: 'Announcement', extension: 'Device'
    };
    return labels[type] || type?.charAt(0).toUpperCase() + type?.slice(1);
  };

  return (
    <Box className="did-form" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {apiError && (
        <Alert severity="error" onClose={() => setApiError('')}>
          {apiError}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Enabled first: whether this Route takes calls at all. A disabled
              route is skipped by every lookup; the API honours enabled=false
              on create too (it used to force every new row live). */}
          <FormControlLabel
            control={
              <Switch
                checked={!!formData.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                inputProps={{ 'aria-label': 'Enabled' }}
              />
            }
            label="Enabled"
          />

          {/* ── Type first: it decides every field below ── */}
          <FormSection label="Route Type" />
          <FormControl fullWidth required error={!!errors.type || (submitAttempted && !formData.type)}>
            <InputLabel required>Route Type</InputLabel>
            <Select
              value={formData.type || ''}
              label="Route Type"
              onChange={(e) => handleTypeChange(e.target.value)}
              MenuProps={menuProps(Z.L1)}
            >
              {didTypes.map(type => (
                <MenuItem key={type} value={type}>{typeLabel(type)}</MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {errors.type || (submitAttempted && !formData.type)
                ? (errors.type || 'Type is required')
                : (TYPE_HINTS[formData.type] || 'What this Route does')}
            </FormHelperText>
          </FormControl>

          {/* ── Details ── */}
          <FormSection label="Details" />
          <div className="did-form-row">
            <TextField
              label="Name"
              value={formData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              fullWidth
              error={!!errors.name || (submitAttempted && !formData.name?.trim())}
              helperText={errors.name || (submitAttempted && !formData.name?.trim() ? 'Name is required' : 'A friendly name to identify this Route')}
              placeholder={isTrunk ? 'e.g. Israel mobiles' : 'e.g. Main Office Line'}
            />
            {/* An account's choice; a portal user's is their own. */}
            {!userSession && (
            <FormControl fullWidth required error={!!errors.environment_uuid || (submitAttempted && !formData.environment_uuid)}>
              <InputLabel required>Application</InputLabel>
              <Select
                value={formData.environment_uuid || ''}
                label="Application"
                onChange={(e) => handleEnvironmentChange(e.target.value)}
                MenuProps={menuProps(Z.L1)}
              >
                {environments.map(env => (
                  <MenuItem key={env.uuid} value={env.uuid}>{env.name}</MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {errors.environment_uuid || (submitAttempted && !formData.environment_uuid)
                  ? (errors.environment_uuid || 'Application is required')
                  : 'The application this Route belongs to'}
              </FormHelperText>
            </FormControl>
            )}
          </div>

          {isFeature ? (
            <>
              {/* ── Dialing rule: prefix -> replacement, with what it does ── */}
              <FormSection label="Dialing Rule" />
              <div className="did-form-row">
                <TextField
                  label="Prefix"
                  value={formData.number || ''}
                  onChange={(e) => handleChange('number', e.target.value)}
                  required
                  fullWidth
                  error={!!errors.number || (submitAttempted && !formData.number?.trim())}
                  helperText={errors.number || (submitAttempted && !formData.number?.trim()
                    ? 'Prefix is required' : 'What the dialed number starts with: digits, + * #')}
                  placeholder={isTrunk ? '0' : '*50'}
                  inputProps={{ inputMode: 'tel' }}
                />
                <TextField
                  label="Replace with"
                  value={formData.replace || ''}
                  onChange={(e) => handleChange('replace', e.target.value)}
                  fullWidth
                  error={!!errors.replace}
                  helperText={errors.replace || 'Takes the prefix\'s place. Leave empty to remove it'}
                  placeholder={isTrunk ? '972' : ''}
                  inputProps={{ inputMode: 'tel' }}
                />
              </div>
              {preview && (
                <Typography variant="body2" color="text.secondary" data-testid="did-rule-preview">
                  Dialing <strong>{preview.dialed}</strong> sends <strong>{preview.sent || '(nothing)'}</strong>
                </Typography>
              )}
            </>
          ) : (
            <TextField
              label="Phone Number"
              value={formData.number || ''}
              onChange={(e) => handleChange('number', e.target.value)}
              required
              fullWidth
              error={!!errors.number || (submitAttempted && !formData.number?.trim())}
              helperText={errors.number || (submitAttempted && !formData.number?.trim()
                ? 'Number is required' : 'E.164 format, e.g. +14155551234')}
              placeholder="+14155551234"
            />
          )}

          {/* Provider that delivers an incoming number — not an outgoing route's */}
          {!isTrunk && providers.length > 0 && (
            <FormControl fullWidth>
              <InputLabel>Provider</InputLabel>
              <Select
                value={formData.provider_uuid || ''}
                label="Provider"
                onChange={(e) => handleChange('provider_uuid', e.target.value)}
                MenuProps={menuProps(Z.L1)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {providers.map(p => (
                  <MenuItem key={p.uuid} value={p.uuid}>
                    {p.name}{p.type ? ` (${p.type.toUpperCase()})` : ''}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                SIP trunk / provider that delivers calls to this DID
              </FormHelperText>
            </FormControl>
          )}

          {isTrunk ? (
            <>
              {/* ── Send to: a provider, or the carrier the rate picks ── */}
              <FormSection label="Send To" />
              <FormControl fullWidth>
                <InputLabel shrink>Send to</InputLabel>
                <Select
                  value={formData.bridge_uuid || ''}
                  label="Send to"
                  displayEmpty
                  notched
                  onChange={(e) => (e.target.value === 'add_new'
                    ? setCreatingSipProvider(true)
                    : handleChange('bridge_uuid', e.target.value))}
                  MenuProps={menuProps(Z.L1)}
                >
                  <MenuItem value="add_new" sx={{ color: 'primary.main', fontWeight: 600 }}>
                    + Create New SIP Provider
                  </MenuItem>
                  <MenuItem value="">Carrier chosen by rate</MenuItem>
                  {sipProviders.map(p => (
                    <MenuItem key={p.uuid} value={p.uuid}>{p.name}</MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  A SIP provider (another PBX, a carrier), or the carrier your tariff picks
                </FormHelperText>
              </FormControl>
              <Alert severity="info" variant="outlined">
                Billed as usual: the tariff needs a rate for the rewritten number.
              </Alert>
              <SipProviderQuickCreate
                open={creatingSipProvider}
                onClose={() => setCreatingSipProvider(false)}
                onCreated={(provider) => {
                  setCreatingSipProvider(false);
                  if (!provider?.uuid) return;
                  setSipProviders(prev => [...prev.filter(p => p.uuid !== provider.uuid), provider]);
                  handleChange('bridge_uuid', provider.uuid);
                }}
              />
            </>
          ) : (
            <>
          {/* ── Call Routing Section ── */}
          <FormSection label="Call Routing" />

          {/* Bridge Type */}
          <FormControl fullWidth required error={!!errors.bridge_type || (submitAttempted && !formData.bridge_type)} data-tour="did-bridge">
            <InputLabel required>Bridge Type</InputLabel>
            <Select
              value={formData.bridge_type || ''}
              label="Bridge Type"
              onChange={(e) => handleBridgeTypeChange(e.target.value)}
              MenuProps={menuProps(Z.L1)}
            >
              {bridgeTypes.map(type => (
                <MenuItem key={type} value={type}>{type.replace('_', ' ').toUpperCase()}</MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {(errors.bridge_type || (submitAttempted && !formData.bridge_type))
                ? (errors.bridge_type || 'Bridge type is required')
                : 'How incoming calls are routed — IVR, Queue, Announcement, etc.'}
            </FormHelperText>
          </FormControl>

          {/* Destination */}
          {formData.bridge_type === 'number' ? (
            <NumberSelector
              value={formData.bridge_uuid || ''}
              onChange={(uuid) => handleChange('bridge_uuid', uuid || '')}
              environmentUuid={formData.environment_uuid}
              label="Destination Number"
              placeholder="Search phone numbers..."
              required
              error={errors.bridge_uuid}
              helperText="Search for an existing number or create a new one"
            />
          ) : formData.bridge_type ? (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
              <FormControl
                fullWidth
                required
                error={!!errors.bridge_uuid}
                disabled={!formData.bridge_type}
              >
                <InputLabel>Destination</InputLabel>
                <Select
                  value={formData.bridge_uuid || ''}
                  label="Destination"
                  onChange={(e) => handleBridgeChange(e.target.value)}
                  MenuProps={menuProps(Z.L1)}
                >
                  {['announcement', 'vml', 'call_condition', 'queue', 'ivr', 'bot'].includes(formData.bridge_type) && (
                    <MenuItem value="add_new" sx={{ color: 'primary.main', fontWeight: 600 }}>
                      + Create New {getBridgeTypeLabel(formData.bridge_type)}
                    </MenuItem>
                  )}
                  {(!bridgeResources[formData.bridge_type] || bridgeResources[formData.bridge_type].length === 0) && (
                    <MenuItem disabled>No {formData.bridge_type}s available</MenuItem>
                  )}
                  {(bridgeResources[formData.bridge_type] || []).map(option => (
                    <MenuItem key={option.uuid} value={option.uuid}>{option.name}</MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {errors.bridge_uuid || 'Select an existing resource or create a new one'}
                </FormHelperText>
              </FormControl>
              {formData.bridge_uuid && onDrillDown && (
                <Tooltip title={`Edit ${getBridgeTypeLabel(formData.bridge_type)}`}>
                  <IconButton
                    size="small"
                    color="primary"
                    sx={{ mt: 1 }}
                    onClick={() => {
                      const selected = (bridgeResources[formData.bridge_type] || []).find(r => r.uuid === formData.bridge_uuid);
                      onDrillDown({
                        type: formData.bridge_type,
                        mode: 'edit',
                        data: selected || { uuid: formData.bridge_uuid },
                        environmentUuid: formData.environment_uuid,
                        onResult: async () => {
                          if (onFetchBridgeResources) {
                            await onFetchBridgeResources(formData.bridge_type, formData.environment_uuid, true);
                          }
                        }
                      });
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                </Tooltip>
              )}
              {onDrillDown && ['announcement', 'vml', 'call_condition', 'queue', 'ivr', 'bot'].includes(formData.bridge_type) && (
                <Tooltip title={`Create New ${getBridgeTypeLabel(formData.bridge_type)}`}>
                  <IconButton
                    size="small"
                    color="primary"
                    sx={{ mt: 1 }}
                    onClick={() => {
                      onDrillDown({
                        type: formData.bridge_type,
                        mode: 'create',
                        data: null,
                        environmentUuid: formData.environment_uuid,
                        onResult: async (savedData) => {
                          const uuid = savedData.uuid || savedData.id;
                          handleChange('bridge_uuid', uuid);
                          if (onFetchBridgeResources) {
                            await onFetchBridgeResources(formData.bridge_type, formData.environment_uuid, true);
                          }
                        }
                      });
                    }}
                  >
                    <AddIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ) : null}
            </>
          )}

          {/* Routing Chain — below destination select */}
          {formData.bridge_type && formData.bridge_uuid && !['number', TRUNK_BRIDGE].includes(formData.bridge_type) && (
            <div className="did-form-routing-container">
              <RoutingChain
                bridgeType={formData.bridge_type}
                bridgeUuid={formData.bridge_uuid}
                environmentUuid={formData.environment_uuid}
                onEditBridge={onDrillDown ? (type, data) => {
                  onDrillDown({
                    type,
                    mode: 'edit',
                    data,
                    environmentUuid: formData.environment_uuid,
                    onResult: async () => {
                      if (onFetchBridgeResources) {
                        await onFetchBridgeResources(formData.bridge_type, formData.environment_uuid, true);
                      }
                    }
                  });
                } : null}
              />
            </div>
          )}

          {/* ── Additional Section ── */}
          <FormSection label="Additional" />

          {/* Notes */}
          <TextField
            label="Notes"
            value={formData.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Optional notes about this Route"
          />

          {/* Meta Properties */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography className="did-form-section-label">Meta Properties</Typography>
            <Button
              onClick={addMetaField}
              startIcon={<AddIcon />}
              variant="outlined"
              size="small"
              className="did-form-add-meta-btn"
            >
              Add
            </Button>
          </Box>

          {errors.meta && (
            <Alert severity="error">{errors.meta}</Alert>
          )}

          {metaFields.map((field, index) => (
            <Box key={index} className="did-form-meta-row">
              <TextField
                label="Key"
                value={field.key}
                onChange={(e) => updateMetaField(index, 'key', e.target.value)}
                error={!!errors[`meta_${field.key}`]}
                helperText={errors[`meta_${field.key}`] || ''}
                fullWidth
                size="small"
                placeholder="e.g. department"
              />
              <TextField
                label="Value"
                value={field.value}
                onChange={(e) => updateMetaField(index, 'value', e.target.value)}
                fullWidth
                size="small"
                placeholder="e.g. sales"
              />
              <IconButton onClick={() => removeMetaField(index)} color="error" size="small" sx={{ mt: 0.5 }}>
                <DeleteIcon />
              </IconButton>
            </Box>
          ))}

          {metaFields.length === 0 && (
            <Typography className="did-form-meta-empty">
              No meta properties. Click &quot;Add&quot; to create key-value pairs.
            </Typography>
          )}

          {/* ── Action Buttons (used by WizardViewRenderer) ── */}
          {showActions && (
            <Box className="did-form-actions" sx={{ mt: 1 }}>
              <Button onClick={onCancel} className="did-form-cancel-btn">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                variant="contained"
                disabled={!isFormValid || loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                className="did-form-save-btn"
              >
                {did ? 'Update Route' : 'Create Route'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
});

DIDForm.displayName = 'DIDForm';

export default DIDForm;
