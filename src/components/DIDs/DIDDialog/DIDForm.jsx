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
import { Trans, useTranslation } from 'react-i18next';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import { useIsUserSession } from '../../../hooks/useIsUserSession';
import { NumberSelector } from '../../Bridges/NumberBridge/NumberSelector.jsx';
import RoutingChain from './RoutingChain.jsx';
import SipProviderQuickCreate from './SipProviderQuickCreate.jsx';
import SipProviderEditDialog from './SipProviderEditDialog.jsx';
import { usePermissions } from '../../../hooks/usePermissions';
import { didsApi } from '../../../services/api/routesApi';
import { providersApi } from '../../../services/api/providersApi';
import { parseServerErrors, is406Error } from '../../../utils/formValidation';
import { Z, menuProps } from '../../../utils/zIndex.js';
import Bdi from '../../../i18n/Bdi';
import { routeTypeHint, routeTypeLabel } from '../routeTypes';
import { isolated } from '../isolated';
import './DIDForm.css';

// Bridge types the form names in words; any other shows its own value.
const BRIDGE_LABELS = ['queue', 'ivr', 'vml', 'call_condition', 'bot', 'announcement', 'extension'];
const BRIDGE_OPTIONS = ['number', 'announcement', 'vml', 'call_condition', 'que', 'queue', 'ivr', 'bot', 'extension', 'conference'];
const NO_RESOURCES = ['queue', 'ivr', 'announcement', 'vml', 'call_condition', 'bot'];
// Types the route wizard has an editor for, so a new one can be made from here.
const CREATABLE_BRIDGES = ['announcement', 'vml', 'call_condition', 'queue', 'ivr', 'bot'];

// The bridge type select's options, in capitals as ever.
const bridgeOptionLabel = (t, type) => (BRIDGE_OPTIONS.includes(type)
  ? t(`form.bridgeOption.${type}`)
  : type.replace('_', ' ').toUpperCase());

const noResourcesText = (t, type) => (NO_RESOURCES.includes(type)
  ? t(`form.noResources.${type}`)
  : t('form.noResources.other', { type }));

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
// words, not as the raw API value (see routeTypes.js; the API's list is
// /api/routes?action=types, Did::TYPES + FEATURES).

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
  const { t } = useTranslation('routes');
  const { selectedEnvironments } = useCustomerEnvironment();
  // A portal user has one environment, their own: it is set, never a field.
  const userSession = useIsUserSession();
  const { can } = usePermissions();
  const canEditProviders = can('providers', 'write');
  // Editing or making a destination: a user needs the ACL's write grant on
  // that type (an account's ACL names screens, not destination types).
  const canWriteBridge = (type) => !userSession || can(type, 'write');
  // A new one also needs an editor the route wizard can open.
  const canCreateBridge = (type) => CREATABLE_BRIDGES.includes(type) && canWriteBridge(type);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [apiError, setApiError] = useState('');
  const [environments, setEnvironments] = useState([]);
  const [metaFields, setMetaFields] = useState([]);
  const [providers, setProviders] = useState([]);
  const [sipProviders, setSipProviders] = useState([]);
  const [creatingSipProvider, setCreatingSipProvider] = useState(false);
  const [editingSipProvider, setEditingSipProvider] = useState(null);

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
          name: didEnvName || t('form.applicationFallback', { id: isolated(didEnvUuid.slice(0, 8)) }),
        });
      }
    }

    setEnvironments(envList);
  }, [selectedEnvironments, did, t]);

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
    if (!formData.name?.trim()) newErrors.name = t('form.error.nameRequired');
    if (!formData.number?.trim()) newErrors.number = isFeature ? t('form.error.prefixRequired') : t('form.error.numberRequired');
    else if (isFeature && !PREFIX_FORMAT.test(formData.number.trim())) {
      newErrors.number = t('form.error.prefixFormat');
    }
    if (isFeature && !REPLACE_FORMAT.test(formData.replace || '')) {
      newErrors.replace = t('form.error.replaceFormat');
    }
    if (!formData.environment_uuid) newErrors.environment_uuid = t('form.error.applicationRequired');
    if (!formData.type) newErrors.type = t('form.error.typeRequired');
    if (!isTrunk && !formData.bridge_type) newErrors.bridge_type = t('form.error.bridgeTypeRequired');
    if (!isTrunk && formData.bridge_type && !formData.bridge_uuid) {
      newErrors.bridge_uuid = formData.bridge_type === 'number'
        ? t('form.error.destinationNumberRequired')
        : t('form.error.bridgeRequired');
    }

    const metaKeys = metaFields.map(f => f.key).filter(k => k.trim());
    const duplicateKeys = metaKeys.filter((k, i) => metaKeys.indexOf(k) !== i);
    if (duplicateKeys.length > 0) {
      newErrors.meta = t('form.error.duplicateMeta');
      duplicateKeys.forEach(k => { newErrors[`meta_${k}`] = t('form.error.duplicateKey'); });
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
      setApiError(error?.response?.data?.message || error?.message || t('form.saveFailed'));
    }
  };

  // Expose submit to parent via ref
  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
  }));

  const isFormValid = formData.name && formData.number && formData.environment_uuid && formData.type
    && (isTrunk || formData.bridge_type);

  // Helper: get human-readable bridge type label
  const getBridgeTypeLabel = (type) => (BRIDGE_LABELS.includes(type)
    ? t(`form.bridgeLabel.${type}`)
    : type?.charAt(0).toUpperCase() + type?.slice(1));

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
                inputProps={{ 'aria-label': t('form.enabled') }}
              />
            }
            label={t('form.enabled')}
          />

          {/* ── Type first: it decides every field below ── */}
          <FormSection label={t('form.section.routeType')} />
          <FormControl fullWidth required error={!!errors.type || (submitAttempted && !formData.type)}>
            <InputLabel required>{t('form.routeType')}</InputLabel>
            <Select
              value={formData.type || ''}
              label={t('form.routeType')}
              onChange={(e) => handleTypeChange(e.target.value)}
              MenuProps={menuProps(Z.L1)}
            >
              {didTypes.map(type => (
                <MenuItem key={type} value={type}>{routeTypeLabel(t, type)}</MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {errors.type || (submitAttempted && !formData.type)
                ? (errors.type || t('form.error.typeRequired'))
                : (routeTypeHint(t, formData.type) || t('form.typeHelp'))}
            </FormHelperText>
          </FormControl>

          {/* ── Details ── */}
          <FormSection label={t('form.section.details')} />
          <div className="did-form-row">
            <TextField
              label={t('form.name')}
              value={formData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              fullWidth
              error={!!errors.name || (submitAttempted && !formData.name?.trim())}
              helperText={errors.name || (submitAttempted && !formData.name?.trim() ? t('form.error.nameRequired') : t('form.nameHelp'))}
              placeholder={isTrunk ? t('form.namePlaceholderTrunk') : t('form.namePlaceholder')}
            />
            {/* An account's choice; a portal user's is their own. */}
            {!userSession && (
            <FormControl fullWidth required error={!!errors.environment_uuid || (submitAttempted && !formData.environment_uuid)}>
              <InputLabel required>{t('form.application')}</InputLabel>
              <Select
                value={formData.environment_uuid || ''}
                label={t('form.application')}
                onChange={(e) => handleEnvironmentChange(e.target.value)}
                MenuProps={menuProps(Z.L1)}
              >
                {environments.map(env => (
                  <MenuItem key={env.uuid} value={env.uuid}>{env.name}</MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {errors.environment_uuid || (submitAttempted && !formData.environment_uuid)
                  ? (errors.environment_uuid || t('form.error.applicationRequired'))
                  : t('form.applicationHelp')}
              </FormHelperText>
            </FormControl>
            )}
          </div>

          {isFeature ? (
            <>
              {/* ── Dialing rule: prefix -> replacement, with what it does ── */}
              <FormSection label={t('form.section.dialingRule')} />
              <div className="did-form-row">
                <TextField
                  label={t('form.prefix')}
                  value={formData.number || ''}
                  onChange={(e) => handleChange('number', e.target.value)}
                  required
                  fullWidth
                  error={!!errors.number || (submitAttempted && !formData.number?.trim())}
                  helperText={errors.number || (submitAttempted && !formData.number?.trim()
                    ? t('form.error.prefixRequired') : t('form.prefixHelp'))}
                  placeholder={isTrunk ? '0' : '*50'}
                  inputProps={{ inputMode: 'tel' }}
                />
                <TextField
                  label={t('form.replaceWith')}
                  value={formData.replace || ''}
                  onChange={(e) => handleChange('replace', e.target.value)}
                  fullWidth
                  error={!!errors.replace}
                  helperText={errors.replace || t('form.replaceHelp')}
                  placeholder={isTrunk ? '972' : ''}
                  inputProps={{ inputMode: 'tel' }}
                />
              </div>
              {preview && (
                <Typography variant="body2" color="text.secondary" data-testid="did-rule-preview">
                  <Trans t={t} i18nKey="form.rulePreview" components={{
                    dialed: <strong><Bdi>{preview.dialed}</Bdi></strong>,
                    sent: <strong>{preview.sent ? <Bdi>{preview.sent}</Bdi> : t('form.nothing')}</strong>,
                  }} />
                </Typography>
              )}
            </>
          ) : (
            <TextField
              label={t('form.phoneNumber')}
              value={formData.number || ''}
              onChange={(e) => handleChange('number', e.target.value)}
              required
              fullWidth
              error={!!errors.number || (submitAttempted && !formData.number?.trim())}
              helperText={errors.number || (submitAttempted && !formData.number?.trim()
                ? t('form.error.numberRequired') : t('form.numberHelp', { example: isolated('+14155551234') }))}
              placeholder="+14155551234"
              inputProps={{ inputMode: 'tel' }}
            />
          )}

          {/* Provider that delivers an incoming number — not an outgoing route's */}
          {!isTrunk && providers.length > 0 && (
            <FormControl fullWidth>
              <InputLabel>{t('form.provider')}</InputLabel>
              <Select
                value={formData.provider_uuid || ''}
                label={t('form.provider')}
                onChange={(e) => handleChange('provider_uuid', e.target.value)}
                MenuProps={menuProps(Z.L1)}
              >
                <MenuItem value="">
                  <em>{t('form.none')}</em>
                </MenuItem>
                {providers.map(p => (
                  <MenuItem key={p.uuid} value={p.uuid}>
                    {p.name}{p.type ? ` (${p.type.toUpperCase()})` : ''}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {t('form.providerHelp')}
              </FormHelperText>
            </FormControl>
          )}

          {isTrunk ? (
            <>
              {/* ── Send to: a provider, or the carrier the rate picks ── */}
              <FormSection label={t('form.section.sendTo')} />
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
              <FormControl fullWidth>
                <InputLabel shrink>{t('form.sendToLabel')}</InputLabel>
                <Select
                  value={formData.bridge_uuid || ''}
                  label={t('form.sendToLabel')}
                  displayEmpty
                  notched
                  onChange={(e) => (e.target.value === 'add_new'
                    ? setCreatingSipProvider(true)
                    : handleChange('bridge_uuid', e.target.value))}
                  MenuProps={menuProps(Z.L1)}
                >
                  <MenuItem value="add_new" sx={{ color: 'primary.main', fontWeight: 600 }}>
                    {t('form.createSipProvider')}
                  </MenuItem>
                  <MenuItem value="">{t('form.carrierByRate')}</MenuItem>
                  {sipProviders.map(p => (
                    <MenuItem key={p.uuid} value={p.uuid}>{p.name}</MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {t('form.sendToHelp')}
                </FormHelperText>
              </FormControl>
              {formData.bridge_uuid && canEditProviders && (
                <Tooltip title={t('form.editSipProvider')}>
                  <IconButton aria-label={t('form.editSipProvider')} color="primary" size="small" sx={{ mt: 1 }}
                    onClick={() => setEditingSipProvider(formData.bridge_uuid)}>
                    <EditIcon />
                  </IconButton>
                </Tooltip>
              )}
              </Box>
              <Alert severity="info" variant="outlined">
                {t('form.billingNote')}
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
          <FormSection label={t('form.section.callRouting')} />

          {/* Bridge Type */}
          <FormControl fullWidth required error={!!errors.bridge_type || (submitAttempted && !formData.bridge_type)} data-tour="did-bridge">
            <InputLabel required>{t('form.bridgeType')}</InputLabel>
            <Select
              value={formData.bridge_type || ''}
              label={t('form.bridgeType')}
              onChange={(e) => handleBridgeTypeChange(e.target.value)}
              MenuProps={menuProps(Z.L1)}
            >
              {bridgeTypes.map(type => (
                <MenuItem key={type} value={type}>{bridgeOptionLabel(t, type)}</MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {(errors.bridge_type || (submitAttempted && !formData.bridge_type))
                ? (errors.bridge_type || t('form.error.bridgeTypeRequired'))
                : t('form.bridgeTypeHelp')}
            </FormHelperText>
          </FormControl>

          {/* Destination */}
          {formData.bridge_type === 'number' ? (
            <NumberSelector
              value={formData.bridge_uuid || ''}
              onChange={(uuid) => handleChange('bridge_uuid', uuid || '')}
              environmentUuid={formData.environment_uuid}
              label={t('form.destinationNumber')}
              placeholder={t('form.searchNumbers')}
              required
              error={errors.bridge_uuid}
              helperText={t('form.destinationNumberHelp')}
            />
          ) : formData.bridge_type ? (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
              <FormControl
                fullWidth
                required
                error={!!errors.bridge_uuid}
                disabled={!formData.bridge_type}
              >
                <InputLabel>{t('form.destination')}</InputLabel>
                <Select
                  value={formData.bridge_uuid || ''}
                  label={t('form.destination')}
                  onChange={(e) => handleBridgeChange(e.target.value)}
                  MenuProps={menuProps(Z.L1)}
                >
                  {canCreateBridge(formData.bridge_type) && (
                    <MenuItem value="add_new" sx={{ color: 'primary.main', fontWeight: 600 }}>
                      {t('form.createNew', { type: getBridgeTypeLabel(formData.bridge_type) })}
                    </MenuItem>
                  )}
                  {(!bridgeResources[formData.bridge_type] || bridgeResources[formData.bridge_type].length === 0) && (
                    <MenuItem disabled>{noResourcesText(t, formData.bridge_type)}</MenuItem>
                  )}
                  {(bridgeResources[formData.bridge_type] || []).map(option => (
                    <MenuItem key={option.uuid} value={option.uuid}>{option.name}</MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {errors.bridge_uuid || t('form.destinationHelp')}
                </FormHelperText>
              </FormControl>
              {formData.bridge_uuid && onDrillDown && canWriteBridge(formData.bridge_type) && (
                <Tooltip title={t('form.editType', { type: getBridgeTypeLabel(formData.bridge_type) })}>
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
              {onDrillDown && canCreateBridge(formData.bridge_type) && (
                <Tooltip title={t('form.createNewTooltip', { type: getBridgeTypeLabel(formData.bridge_type) })}>
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
          <FormSection label={t('form.section.additional')} />

          {/* Notes */}
          <TextField
            label={t('form.notes')}
            value={formData.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder={t('form.notesPlaceholder')}
          />

          {/* Meta Properties */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography className="did-form-section-label">{t('form.metaProperties')}</Typography>
            <Button
              onClick={addMetaField}
              startIcon={<AddIcon />}
              variant="outlined"
              size="small"
              className="did-form-add-meta-btn"
            >
              {t('form.add')}
            </Button>
          </Box>

          {errors.meta && (
            <Alert severity="error">{errors.meta}</Alert>
          )}

          {metaFields.map((field, index) => (
            <Box key={index} className="did-form-meta-row">
              <TextField
                label={t('form.key')}
                value={field.key}
                onChange={(e) => updateMetaField(index, 'key', e.target.value)}
                error={!!errors[`meta_${field.key}`]}
                helperText={errors[`meta_${field.key}`] || ''}
                fullWidth
                size="small"
                placeholder={t('form.keyPlaceholder')}
              />
              <TextField
                label={t('form.value')}
                value={field.value}
                onChange={(e) => updateMetaField(index, 'value', e.target.value)}
                fullWidth
                size="small"
                placeholder={t('form.valuePlaceholder')}
              />
              <IconButton onClick={() => removeMetaField(index)} color="error" size="small" sx={{ mt: 0.5 }}>
                <DeleteIcon />
              </IconButton>
            </Box>
          ))}

          {metaFields.length === 0 && (
            <Typography className="did-form-meta-empty">
              {t('form.noMeta')}
            </Typography>
          )}

          {/* ── Action Buttons (used by WizardViewRenderer) ── */}
          {showActions && (
            <Box className="did-form-actions" sx={{ mt: 1 }}>
              <Button onClick={onCancel} className="did-form-cancel-btn">
                {t('form.cancel')}
              </Button>
              <Button
                onClick={handleSubmit}
                variant="contained"
                disabled={!isFormValid || loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
                className="did-form-save-btn"
              >
                {did ? t('form.update') : t('form.create')}
              </Button>
            </Box>
          )}
        </>
      )}
      {editingSipProvider && (
        <SipProviderEditDialog key={editingSipProvider} providerUuid={editingSipProvider}
          canWrite={canEditProviders} onClose={() => setEditingSipProvider(null)}
          onSaved={(provider) => {
            setSipProviders(prev => [...prev.filter(p => p.uuid !== provider.uuid), provider]);
            setEditingSipProvider(null);
          }} />
      )}
    </Box>
  );
});

DIDForm.displayName = 'DIDForm';

export default DIDForm;
