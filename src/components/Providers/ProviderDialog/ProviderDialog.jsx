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
  FormControlLabel,
  Switch,
  IconButton,
  CircularProgress,
  Grid,
  Typography,
  Alert,
  Box,
  Tooltip
} from '@mui/material';
import { Close as CloseIcon, ContentCopy as ContentCopyIcon } from '@mui/icons-material';
import { useState, useEffect } from 'react';
import { formatDate } from '../../../utils/dateUtils';
import { parseServerErrors, is406Error } from '../../../utils/formValidation';
import SecretField from '../../common/SecretField.jsx';
import { providersApi, getCreatableProviderTypes } from '../../../services/api/providersApi';

/**
 * Voice gender options for TTS providers
 */
const VOICE_GENDERS = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' }
];

/**
 * ProviderDialog Component
 * Dialog for creating and editing providers
 * Supports multiple provider types with dynamic fields
 */
const ProviderDialog = ({
  open,
  onClose,
  onSave,
  provider,
  loading,
  providerTypes: propTypes,
  llmServices: propLlmServices
}) => {
  const [serverTypes, setServerTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [typesError, setTypesError] = useState('');
  useEffect(() => {
    if (!open || propTypes != null) return;
    let cancelled = false;
    setServerTypes([]);
    setTypesLoading(true);
    setTypesError('');
    providersApi.getProviderTypes()
      .then((types) => { if (!cancelled) setServerTypes(types); })
      .catch(() => { if (!cancelled) setTypesError('Unable to load provider types. Close and reopen this dialog to retry.'); })
      .finally(() => { if (!cancelled) setTypesLoading(false); });
    return () => { cancelled = true; };
  }, [open, propTypes]);
  const availableTypes = propTypes ?? serverTypes;
  const PROVIDER_TYPES = (provider ? availableTypes : getCreatableProviderTypes(availableTypes)).map(t =>
    typeof t === 'string' ? { value: t, label: t.toUpperCase() } : t
  );
  const LLM_SERVICES = (propLlmServices || []).map(svc => ({
    value: svc.service || svc.value,
    label: svc.label,
    defaultModel: svc.default_model || svc.defaultModel || ''
  }));
  // Protocol options for SIP providers
  const protocolOptions = ['UDP', 'TCP', 'TLS'];

  // Default form data based on provider type
  const getDefaultFormData = (type = 'sip') => {
    const baseData = {
      name: '',
      type: type,
      enabled: true,
      description: ''
    };

    if (type === 'sip') {
      return {
        ...baseData,
        hostname: '',
        port: 5060,
        username: '',
        password: '',
        protocol: 'UDP'
      };
    } else if (type === 'tts') {
      return {
        ...baseData,
        profile: {
          // Individual Google Cloud credential fields
          project_id: '',
          private_key_id: '',
          private_key: '',
          client_email: '',
          client_id: '',
          voice_gender: 'FEMALE'
        }
      };
    } else if (type === 'llm') {
      return {
        ...baseData,
        profile: {
          service: 'openai',
          model: '',
          api_key: '',
          system_prompt: ''
        }
      };
    } else {
      // Generic provider (did, sms, gateway, webhook, caller_id_number)
      return {
        ...baseData,
        hostname: '',
        username: '',
        password: '',
        profile: {}
      };
    }
  };

  // Build Google credentials JSON from individual profile fields
  const buildCredentialsJson = (profile) => {
    if (!profile) return '';
    return JSON.stringify({
      type: 'service_account',
      project_id: profile.project_id || '',
      private_key_id: profile.private_key_id || '',
      private_key: profile.private_key || '',
      client_email: profile.client_email || '',
      client_id: profile.client_id || '',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: profile.client_email
        ? `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(profile.client_email)}`
        : ''
    });
  };

  // Parse credentials JSON into individual fields
  const parseCredentialsJson = (credentialsJson) => {
    if (!credentialsJson) return {};
    try {
      const creds = JSON.parse(credentialsJson);
      return {
        project_id: creds.project_id || '',
        private_key_id: creds.private_key_id || '',
        private_key: creds.private_key || '',
        client_email: creds.client_email || '',
        client_id: creds.client_id || ''
      };
    } catch {
      return {};
    }
  };

  const [formData, setFormData] = useState(getDefaultFormData(''));

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Initialize form data when provider changes
  useEffect(() => {
    if (provider) {
      const providerType = provider.type || 'sip';

      if (providerType === 'tts') {
        // TTS provider - parse credentials_json into individual fields
        const parsedCreds = parseCredentialsJson(provider.profile?.credentials_json);
        setFormData({
          name: provider.name || '',
          type: providerType,
          enabled: provider.enabled !== undefined ? provider.enabled : true,
          description: provider.description || '',
          profile: {
            project_id: parsedCreds.project_id || provider.profile?.project_id || '',
            private_key_id: parsedCreds.private_key_id || provider.profile?.private_key_id || '',
            private_key: parsedCreds.private_key || provider.profile?.private_key || '',
            client_email: parsedCreds.client_email || provider.profile?.client_email || '',
            client_id: parsedCreds.client_id || provider.profile?.client_id || '',
            voice_gender: provider.profile?.voice_gender || 'FEMALE'
          }
        });
      } else if (providerType === 'llm') {
        // LLM provider - profile-based fields
        setFormData({
          name: provider.name || '',
          type: providerType,
          enabled: provider.enabled !== undefined ? provider.enabled : true,
          description: provider.description || '',
          profile: {
            service: provider.profile?.service || 'openai',
            model: provider.profile?.model || '',
            api_key: provider.profile?.api_key || '',
            system_prompt: provider.profile?.system_prompt || ''
          }
        });
      } else if (providerType === 'sip') {
        // SIP provider - standard fields
        setFormData({
          name: provider.name || '',
          type: providerType,
          hostname: provider.hostname || '',
          port: provider.port || 5060,
          username: provider.username || '',
          password: provider.password || '',
          protocol: provider.protocol || 'UDP',
          enabled: provider.enabled !== undefined ? provider.enabled : true,
          description: provider.description || ''
        });
      } else {
        // Generic provider type
        setFormData({
          name: provider.name || '',
          type: providerType,
          hostname: provider.hostname || '',
          username: provider.username || '',
          password: provider.password || '',
          enabled: provider.enabled !== undefined ? provider.enabled : true,
          description: provider.description || '',
          profile: provider.profile || {}
        });
      }
    } else {
      setFormData(getDefaultFormData(''));
    }
    setErrors({});
    setApiError('');
    setSuccessMessage('');
    setSubmitAttempted(false);
  }, [provider, open]);

  const handleChange = (field, value) => {
    // Handle type change - reset form data with appropriate defaults
    if (field === 'type') {
      setFormData(prev => ({
        ...getDefaultFormData(value),
        name: prev.name, // Preserve name
        enabled: prev.enabled, // Preserve enabled
        description: prev.description // Preserve description
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  // Handle nested profile field changes (for TTS providers)
  const handleProfileChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      profile: {
        ...prev.profile,
        [field]: value
      }
    }));
    // Clear error for this field
    if (errors[`profile.${field}`]) {
      setErrors(prev => ({
        ...prev,
        [`profile.${field}`]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    const providerType = formData.type;
    if (!provider && !PROVIDER_TYPES.some((type) => type.value === providerType)) {
      newErrors.type = 'Choose an available provider type';
    }

    // Common validation - name is always required
    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required';
    }

    // Type-specific validation
    if (providerType === 'sip') {
      // SIP provider validation
      if (!formData.hostname?.trim()) {
        newErrors.hostname = 'Hostname is required';
      }
      if (!formData.port || formData.port < 1 || formData.port > 65535) {
        newErrors.port = 'Port must be between 1 and 65535';
      }
      if (!formData.username?.trim()) {
        newErrors.username = 'Username is required';
      }
      if (!formData.password?.trim()) {
        newErrors.password = 'Password is required';
      }
      if (!formData.protocol) {
        newErrors.protocol = 'Protocol is required';
      }
    } else if (providerType === 'tts') {
      // TTS provider validation - individual fields
      if (!formData.profile?.project_id?.trim()) {
        newErrors['profile.project_id'] = 'Project ID is required';
      }
      if (!formData.profile?.private_key_id?.trim()) {
        newErrors['profile.private_key_id'] = 'Private Key ID is required';
      }
      if (!formData.profile?.private_key?.trim()) {
        newErrors['profile.private_key'] = 'Private Key is required';
      }
      if (!formData.profile?.client_email?.trim()) {
        newErrors['profile.client_email'] = 'Client Email is required';
      }
      if (!formData.profile?.client_id?.trim()) {
        newErrors['profile.client_id'] = 'Client ID is required';
      }
      if (!formData.profile?.voice_gender) {
        newErrors['profile.voice_gender'] = 'Voice gender is required';
      }
    } else if (providerType === 'llm') {
      // LLM provider validation
      if (!formData.profile?.api_key?.trim()) {
        newErrors['profile.api_key'] = 'API Key is required';
      }
      if (!formData.profile?.service) {
        newErrors['profile.service'] = 'Service is required';
      }
    }
    // Generic providers (did, sms, gateway, webhook) - minimal validation
    // Only name is required

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    setApiError('');
    setSuccessMessage('');
    setSubmitAttempted(true);

    if (!validateForm()) {
      return;
    }

    try {
      // Prepare data for submission
      let dataToSave = { ...formData };

      // For TTS providers, build credentials_json from individual fields
      if (formData.type === 'tts' && formData.profile) {
        const credentialsJson = buildCredentialsJson(formData.profile);
        dataToSave = {
          ...formData,
          profile: {
            credentials_json: credentialsJson,
            voice_gender: formData.profile.voice_gender
          }
        };
      }

      await onSave(dataToSave);
      setSuccessMessage(provider ? 'Provider updated successfully' : 'Provider created successfully');
    } catch (error) {
      console.error('Error saving provider:', error);
      // Parse 406 validation errors from server
      if (is406Error(error)) {
        const serverErrors = parseServerErrors(error);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(prev => ({ ...prev, ...serverErrors }));
        }
      }
      setApiError(error.message || 'Failed to save provider');
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="md" 
      fullWidth
      data-testid="provider-dialog"
    >
      <DialogTitle sx={{ pr: 6 }}>
        {provider ? 'Edit Provider' : 'Create Provider'}
        <IconButton
          aria-label="close"
          onClick={handleClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
          disabled={loading}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers>
        {typesError && <Alert severity="error" sx={{ mb: 2 }}>{typesError}</Alert>}
        {apiError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {apiError}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {successMessage}
          </Alert>
        )}
        
        <Grid container spacing={2}>
          {/* 1. UUID Field - Read Only with copy (only shown in edit mode) */}
          {provider?.uuid && (
            <Grid size={12}>
              <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 70, fontWeight: 600 }}>UUID</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{provider.uuid}</Typography>
                  <Tooltip title="Copy UUID">
                    <IconButton size="small" onClick={() => navigator.clipboard?.writeText(provider.uuid)} sx={{ p: 0.25 }}>
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Grid>
          )}

          {/* 2. Enabled - right after UUID */}
          <Grid size={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => handleChange('enabled', e.target.checked)}
                  disabled={loading}
                  data-testid="enabled-toggle"
                />
              }
              label="Enabled"
            />
          </Grid>

          {/* 3. Type selector - only editable in create mode */}
          <Grid size={12}>
            <FormControl fullWidth required disabled={!!provider}>
              <InputLabel required>Provider Type</InputLabel>
              <Select
                value={formData.type || ''}
                onChange={(e) => handleChange('type', e.target.value)}
                label="Provider Type"
                disabled={loading || typesLoading || !!provider}
                data-testid="type-select"
              >
                {PROVIDER_TYPES.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
              {provider && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  Provider type cannot be changed after creation
                </Typography>
              )}
            </FormControl>
          </Grid>

          {/* 4. Name - always required */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Name"
              variant="outlined"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              error={!!errors.name || (submitAttempted && !formData.name?.trim())}
              helperText={errors.name || (submitAttempted && !formData.name?.trim() ? 'Name is required' : '')}
              disabled={loading}
              data-testid="name-input"
              required
            />
          </Grid>

          {/* ========== SIP Provider Fields ========== */}
          {formData.type === 'sip' && (
            <>
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Hostname"
                  variant="outlined"
                  value={formData.hostname || ''}
                  onChange={(e) => handleChange('hostname', e.target.value)}
                  error={!!errors.hostname || (submitAttempted && !formData.hostname?.trim())}
                  helperText={errors.hostname || (submitAttempted && !formData.hostname?.trim() ? 'Hostname is required' : '')}
                  disabled={loading}
                  data-testid="hostname-input"
                  required
                />
              </Grid>

              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Port"
                  type="number"
                  variant="outlined"
                  value={formData.port || 5060}
                  onChange={(e) => handleChange('port', parseInt(e.target.value) || '')}
                  error={!!errors.port || (submitAttempted && (!formData.port || formData.port < 1 || formData.port > 65535))}
                  helperText={errors.port || (submitAttempted && (!formData.port || formData.port < 1 || formData.port > 65535) ? 'Port must be between 1 and 65535' : '')}
                  disabled={loading}
                  data-testid="port-input"
                  inputProps={{ min: 1, max: 65535 }}
                  required
                />
              </Grid>

              <Grid size={12}>
                <FormControl fullWidth error={!!errors.protocol || (submitAttempted && !formData.protocol)} required>
                  <InputLabel required>Protocol</InputLabel>
                  <Select
                    value={formData.protocol || 'UDP'}
                    onChange={(e) => handleChange('protocol', e.target.value)}
                    label="Protocol"
                    disabled={loading}
                    data-testid="protocol-select"
                  >
                    {protocolOptions.map((protocol) => (
                      <MenuItem key={protocol} value={protocol}>
                        {protocol}
                      </MenuItem>
                    ))}
                  </Select>
                  {(errors.protocol || (submitAttempted && !formData.protocol)) && (
                    <Typography variant="caption" color="error" sx={{ ml: 2, mt: 0.5 }}>
                      {errors.protocol || 'Protocol is required'}
                    </Typography>
                  )}
                </FormControl>
              </Grid>

              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Username"
                  variant="outlined"
                  value={formData.username || ''}
                  onChange={(e) => handleChange('username', e.target.value)}
                  error={!!errors.username || (submitAttempted && !formData.username?.trim())}
                  helperText={errors.username || (submitAttempted && !formData.username?.trim() ? 'Username is required' : '')}
                  disabled={loading}
                  data-testid="username-input"
                  required
                />
              </Grid>

              <Grid size={12}>
                <SecretField
                  fullWidth
                  label="Password"
                  variant="outlined"
                  value={formData.password || ''}
                  onChange={(e) => handleChange('password', e.target.value)}
                  error={!!errors.password || (submitAttempted && !formData.password?.trim())}
                  helperText={errors.password || (submitAttempted && !formData.password?.trim() ? 'Password is required' : '')}
                  disabled={loading}
                  data-testid="password-input"
                  required
                />
              </Grid>
            </>
          )}

          {/* ========== TTS Provider Fields ========== */}
          {formData.type === 'tts' && (
            <>
              <Grid size={12}>
                <Alert severity="info" sx={{ mb: 1 }}>
                  <Typography variant="body2">
                    To use Google Text-to-Speech, you need a Google Cloud service account with the Text-to-Speech API enabled.
                    Enter the credentials from your service account JSON file below.
                  </Typography>
                </Alert>
              </Grid>

              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Project ID"
                  variant="outlined"
                  value={formData.profile?.project_id || ''}
                  onChange={(e) => handleProfileChange('project_id', e.target.value)}
                  error={!!errors['profile.project_id']}
                  helperText={errors['profile.project_id'] || 'Google Cloud project ID'}
                  disabled={loading}
                  data-testid="project-id-input"
                  required
                  placeholder="my-project-123456"
                />
              </Grid>

              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Private Key ID"
                  variant="outlined"
                  value={formData.profile?.private_key_id || ''}
                  onChange={(e) => handleProfileChange('private_key_id', e.target.value)}
                  error={!!errors['profile.private_key_id']}
                  helperText={errors['profile.private_key_id']}
                  disabled={loading}
                  data-testid="private-key-id-input"
                  required
                  placeholder="abc123def456..."
                  InputProps={{
                    sx: { fontFamily: 'monospace', fontSize: '0.85rem' }
                  }}
                />
              </Grid>

              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Private Key"
                  variant="outlined"
                  multiline
                  rows={4}
                  value={formData.profile?.private_key || ''}
                  onChange={(e) => handleProfileChange('private_key', e.target.value)}
                  error={!!errors['profile.private_key']}
                  helperText={errors['profile.private_key'] || 'The RSA private key (including BEGIN/END markers)'}
                  disabled={loading}
                  data-testid="private-key-input"
                  required
                  placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
                  InputProps={{
                    sx: { fontFamily: 'monospace', fontSize: '0.75rem' }
                  }}
                />
              </Grid>

              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Client Email"
                  variant="outlined"
                  value={formData.profile?.client_email || ''}
                  onChange={(e) => handleProfileChange('client_email', e.target.value)}
                  error={!!errors['profile.client_email']}
                  helperText={errors['profile.client_email'] || 'Service account email address'}
                  disabled={loading}
                  data-testid="client-email-input"
                  required
                  placeholder="service-account@project.iam.gserviceaccount.com"
                />
              </Grid>

              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Client ID"
                  variant="outlined"
                  value={formData.profile?.client_id || ''}
                  onChange={(e) => handleProfileChange('client_id', e.target.value)}
                  error={!!errors['profile.client_id']}
                  helperText={errors['profile.client_id']}
                  disabled={loading}
                  data-testid="client-id-input"
                  required
                  placeholder="123456789012345678901"
                  InputProps={{
                    sx: { fontFamily: 'monospace', fontSize: '0.85rem' }
                  }}
                />
              </Grid>

              <Grid size={12}>
                <FormControl fullWidth error={!!errors['profile.voice_gender']} required>
                  <InputLabel required>Voice Gender</InputLabel>
                  <Select
                    value={formData.profile?.voice_gender || 'FEMALE'}
                    onChange={(e) => handleProfileChange('voice_gender', e.target.value)}
                    label="Voice Gender"
                    disabled={loading}
                    data-testid="voice-gender-select"
                  >
                    {VOICE_GENDERS.map((gender) => (
                      <MenuItem key={gender.value} value={gender.value}>
                        {gender.label}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors['profile.voice_gender'] && (
                    <Typography variant="caption" color="error" sx={{ ml: 2, mt: 0.5 }}>
                      {errors['profile.voice_gender']}
                    </Typography>
                  )}
                </FormControl>
              </Grid>
            </>
          )}

          {/* ========== LLM Provider Fields ========== */}
          {formData.type === 'llm' && (
            <>
              <Grid size={12}>
                <Alert severity="info" sx={{ mb: 1 }}>
                  <Typography variant="body2">
                    Configure an AI/LLM provider for chat, text generation, and AI-powered features.
                    Supports OpenAI, Anthropic, Google Gemini, and DeepSeek.
                  </Typography>
                </Alert>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth required error={!!errors['profile.service']}>
                  <InputLabel required>Service</InputLabel>
                  <Select
                    value={formData.profile?.service || 'openai'}
                    onChange={(e) => handleProfileChange('service', e.target.value)}
                    label="Service"
                    disabled={loading}
                    data-testid="llm-service-select"
                  >
                    {LLM_SERVICES.map((svc) => (
                      <MenuItem key={svc.value} value={svc.value}>
                        {svc.label}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors['profile.service'] && (
                    <Typography variant="caption" color="error" sx={{ ml: 2, mt: 0.5 }}>
                      {errors['profile.service']}
                    </Typography>
                  )}
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Model"
                  variant="outlined"
                  value={formData.profile?.model || ''}
                  onChange={(e) => handleProfileChange('model', e.target.value)}
                  error={!!errors['profile.model']}
                  helperText={errors['profile.model'] || `Leave empty for default: ${LLM_SERVICES.find(s => s.value === (formData.profile?.service || 'openai'))?.defaultModel || ''}`}
                  disabled={loading}
                  data-testid="llm-model-input"
                  placeholder={LLM_SERVICES.find(s => s.value === (formData.profile?.service || 'openai'))?.defaultModel || ''}
                />
              </Grid>

              <Grid size={12}>
                <SecretField
                  fullWidth
                  label="API Key"
                  variant="outlined"
                  value={formData.profile?.api_key || ''}
                  onChange={(e) => handleProfileChange('api_key', e.target.value)}
                  error={!!errors['profile.api_key']}
                  helperText={errors['profile.api_key'] || 'Your API key for the selected service'}
                  disabled={loading}
                  data-testid="llm-api-key-input"
                  required
                  placeholder="sk-..."
                  InputProps={{
                    sx: { fontFamily: 'monospace', fontSize: '0.85rem' }
                  }}
                />
              </Grid>

              <Grid size={12}>
                <TextField
                  fullWidth
                  label="System Prompt"
                  variant="outlined"
                  multiline
                  rows={4}
                  value={formData.profile?.system_prompt || ''}
                  onChange={(e) => handleProfileChange('system_prompt', e.target.value)}
                  error={!!errors['profile.system_prompt']}
                  helperText={errors['profile.system_prompt'] || 'Default system prompt for this provider (optional)'}
                  disabled={loading}
                  data-testid="llm-system-prompt-input"
                  placeholder="You are a helpful assistant..."
                />
              </Grid>
            </>
          )}

          {/* ========== Generic Provider Fields (DID, SMS, Gateway, Webhook, Caller ID) ========== */}
          {!['sip', 'tts', 'llm'].includes(formData.type) && (
            <>
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Hostname/URL"
                  variant="outlined"
                  value={formData.hostname || ''}
                  onChange={(e) => handleChange('hostname', e.target.value)}
                  error={!!errors.hostname}
                  helperText={errors.hostname || 'API endpoint or hostname (optional)'}
                  disabled={loading}
                  data-testid="hostname-input"
                />
              </Grid>

              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Username/API Key"
                  variant="outlined"
                  value={formData.username || ''}
                  onChange={(e) => handleChange('username', e.target.value)}
                  error={!!errors.username}
                  helperText={errors.username || 'Authentication username or API key (optional)'}
                  disabled={loading}
                  data-testid="username-input"
                />
              </Grid>

              <Grid size={12}>
                <SecretField
                  fullWidth
                  label="Password/Secret"
                  variant="outlined"
                  value={formData.password || ''}
                  onChange={(e) => handleChange('password', e.target.value)}
                  error={!!errors.password}
                  helperText={errors.password || 'Authentication password or secret (optional)'}
                  disabled={loading}
                  data-testid="password-input"
                />
              </Grid>

              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600, mb: 1 }}>
                  Profile (JSON)
                </Typography>
                <TextField
                  fullWidth
                  label="Profile"
                  variant="outlined"
                  multiline
                  rows={6}
                  value={typeof formData.profile === 'object' ? JSON.stringify(formData.profile, null, 2) : (formData.profile || '{}')}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      handleChange('profile', parsed);
                      if (errors.profile) setErrors(prev => ({ ...prev, profile: null }));
                    } catch {
                      // Keep raw value so user can keep typing
                      handleChange('profile', e.target.value);
                    }
                  }}
                  error={!!errors.profile}
                  helperText={errors.profile || 'Provider-specific configuration as JSON'}
                  disabled={loading}
                  data-testid="profile-input"
                  InputProps={{
                    sx: { fontFamily: 'monospace', fontSize: '0.8rem' }
                  }}
                />
              </Grid>
            </>
          )}

          {/* ========== SIP Provider Profile ========== */}
          {formData.type === 'sip' && provider?.profile && Object.keys(provider.profile).length > 0 && (
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600, mb: 1, mt: 1 }}>
                Profile
              </Typography>
              <Box sx={{ p: 2, backgroundColor: 'var(--mui-palette-surface-muted)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(provider.profile, null, 2)}
                </Typography>
              </Box>
            </Grid>
          )}

          {/* Description - always shown at the end */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Description"
              variant="outlined"
              multiline
              rows={3}
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              error={!!errors.description}
              helperText={errors.description}
              disabled={loading}
              data-testid="description-input"
            />
          </Grid>

          {/* Enhanced Data Sections (Read-Only - shown when editing) */}
          {provider && (
            <>
              {/* Customer Details */}
              {provider.customer && (
                <Grid size={12}>
                  <Typography variant="h6" sx={{ color: 'primary.main', mb: 1, mt: 2 }}>
                    Customer Details
                  </Typography>
                  <Box sx={{ p: 2, backgroundColor: 'var(--mui-palette-surface-muted)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Typography variant="caption" color="text.secondary">Customer Name</Typography>
                        <Typography variant="body2" fontWeight={600}>{provider.customer.name || 'N/A'}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Typography variant="caption" color="text.secondary">Customer UUID</Typography>
                        <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                          {provider.customer.uuid || provider.customer_uuid || 'N/A'}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                </Grid>
              )}

              {/* Provider Info */}
              <Grid size={12}>
                <Typography variant="h6" sx={{ color: 'primary.main', mb: 1, mt: 2 }}>
                  Provider Information
                </Typography>
                <Box sx={{ p: 2, backgroundColor: 'var(--mui-palette-surface-muted)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" color="text.secondary">Provider UUID</Typography>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                        {provider.uuid || provider.id || 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" color="text.secondary">Created At</Typography>
                      <Typography variant="body2">
                        {formatDate(provider.created_at)}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" color="text.secondary">Updated At</Typography>
                      <Typography variant="body2">
                        {formatDate(provider.updated_at)}
                      </Typography>
                    </Grid>
                    {provider.tariff && (
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Typography variant="caption" color="text.secondary">Default Tariff</Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {provider.tariff.name || provider.tariff_uuid || 'None'}
                        </Typography>
                      </Grid>
                    )}
                    {provider.status && (
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Typography variant="caption" color="text.secondary">Status</Typography>
                        <Typography variant="body2" color={provider.status === 'active' ? 'success.main' : 'text.secondary'}>
                          {provider.status}
                        </Typography>
                      </Grid>
                    )}
                    {provider.call_count !== undefined && (
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Typography variant="caption" color="text.secondary">Total Calls</Typography>
                        <Typography variant="body2">{provider.call_count}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              </Grid>
            </>
          )}
        </Grid>
      </DialogContent>
      
      <DialogActions>
        <Button 
          onClick={handleClose} 
          disabled={loading}
          variant="outlined"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={loading || (!provider && (typesLoading || !PROVIDER_TYPES.some((type) => type.value === formData.type)))}
          data-testid="submit-provider-button"
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {provider ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderDialog;
