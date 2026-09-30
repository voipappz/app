import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Grid,
  IconButton,
  FormControlLabel,
  Switch,
  InputAdornment,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Phone as PhoneIcon,
  Close as CloseIcon,
  Visibility,
  VisibilityOff,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';
import { extensionsApi } from '../../../services/api/extensionsApi';
import DynamicProfileEditor from '../../common/DynamicProfileEditor/DynamicProfileEditor';
import { Z } from '../../../utils/zIndex.js';
import { useIsUserSession } from '../../../hooks/useIsUserSession';
import { deviceErrors, generateDevicePassword } from './deviceRules';
import SecretField from '../../common/SecretField.jsx';

/**
 * ExtensionBridge Component
 * Shared dialog for creating/editing extensions
 *
 * Used by:
 * - DIDs screen (edit extension as bridge)
 * - Users screen (edit user's extension resource)
 * - Extensions screen (standalone extension management)
 *
 * Props:
 * - open: boolean - Dialog open state
 * - onClose: function - Close handler
 * - onSave: function - Called with extension data on save
 * - extension: object - Existing extension for edit mode (null for create)
 * - environmentUuid: string - Environment UUID for create mode
 * - environments: array - List of environments for dropdown (optional)
 * - mode: 'create' | 'edit' - Operation mode
 * - hideEnvironment: boolean - Hide environment field (default: true)
 * - handleApiInternally: boolean - If true, calls API directly. If false, delegates to onSave (default: true)
 * - loading: boolean - External loading state (for handleApiInternally=false)
 * - containerMode: 'dialog' | 'panel' - Render as Dialog wrapper or inline Box (default: 'dialog')
 * - onDrillDown: function - Optional drill-down handler (unused; ExtensionBridge is a leaf component)
 */
export const ExtensionBridge = ({
  open,
  onClose,
  onSave,
  environmentUuid = null,
  extension = null,
  environments = [],
  mode = 'edit',
  hideEnvironment = true,
  handleApiInternally = true,
  loading: externalLoading = false,
  containerMode = 'dialog',
  zLayer = null,           // Optional z-index layer override (e.g. Z.L3 when nested)
  onDrillDown // eslint-disable-line @typescript-eslint/no-unused-vars
}) => {
  const userSession = useIsUserSession();
  const layer = zLayer || Z.L2;
  // Determine if we're in create or edit mode
  const isEditMode = mode === 'edit' && extension !== null;

  // Form state - all fields supported by the API
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    notes: '',
    enabled: true,
    environment_uuid: '',
    meta: {},
    profile: {}
  });

  const [formErrors, setFormErrors] = useState({});
  const [internalLoading, setInternalLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const loading = handleApiInternally ? internalLoading : externalLoading;

  // Initialize form data when extension changes or dialog opens
  useEffect(() => {
    if (open) {
      if (extension) {
        // Edit mode - load extension data
        setFormData({
          name: extension.name || '',
          username: extension.username || '',
          password: extension.password || '',
          notes: extension.notes || '',
          enabled: extension.enabled !== undefined ? extension.enabled : true,
          environment_uuid: extension.environment_uuid || extension.environment?.uuid || environmentUuid || '',
          meta: extension.meta || {},
          profile: extension.profile || {}
        });
      } else {
        // Create mode - reset form with defaults
        const defaultEnvUuid = environmentUuid || (environments.length > 0 ? environments[0].uuid : '');
        setFormData({
          name: '',
          username: '',
          password: '',
          notes: '',
          enabled: true,
          environment_uuid: defaultEnvUuid,
          meta: {},
          profile: {}
        });
        // Auto-generate password for new extensions
        generatePasswordSilent();
      }
      setFormErrors({});
      setError(null);
      setShowPassword(false);
    }
  }, [open, extension, environmentUuid, environments]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFormData({
        name: '',
        username: '',
        password: '',
        notes: '',
        enabled: true,
        environment_uuid: '',
        meta: {},
        profile: {}
      });
      setFormErrors({});
      setError(null);
      setShowPassword(false);
    }
  }, [open]);

  // Handle form field change
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  // Validate form
  const validateForm = () => {
    // Same rules as the CSV import (deviceRules.js); a password only for a new device.
    const errors = deviceErrors(formData, { requirePassword: !isEditMode });

    // Environment required if shown
    if (!hideEnvironment && !formData.environment_uuid) {
      errors.environment_uuid = 'Application is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Generate random password (with UI update)
  const generatePassword = () => {
    handleChange('password', generateDevicePassword());
    setShowPassword(true);
  };

  // Generate password without showing it (for initial create mode)
  const generatePasswordSilent = () => {
    setFormData(prev => ({ ...prev, password: generateDevicePassword() }));
  };

  // Copy password to clipboard
  const copyPassword = async () => {
    if (formData.password) {
      try {
        await navigator.clipboard.writeText(formData.password);
      } catch (err) {
        console.error('Failed to copy password:', err);
      }
    }
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    // Build submit data
    const submitData = {
      name: formData.name,
      username: formData.username,
      enabled: formData.enabled,
      notes: formData.notes,
      profile: formData.profile,
      meta: formData.meta
    };

    // Include password if provided
    if (formData.password) {
      submitData.password = formData.password;
    }

    // Include environment_uuid
    if (formData.environment_uuid) {
      submitData.environment_uuid = formData.environment_uuid;
    } else if (environmentUuid) {
      submitData.environment_uuid = environmentUuid;
    }

    if (handleApiInternally) {
      // Handle API calls internally
      setInternalLoading(true);
      setError(null);

      try {
        let result;
        if (isEditMode) {
          result = await extensionsApi.updateExtension(extension.uuid, submitData);
        } else {
          result = await extensionsApi.createExtension(submitData);
        }

        const extensionData = result.data || result;
        onSave(extensionData);
        onClose();
      } catch (err) {
        console.error('Extension operation error:', err);
        setError(err.message || (isEditMode ? 'Failed to update device' : 'Failed to create device'));
      } finally {
        setInternalLoading(false);
      }
    } else {
      // Delegate to parent - parent handles API and error handling
      try {
        await onSave(submitData);
      } catch (err) {
        setError(err.message || (isEditMode ? 'Failed to update device' : 'Failed to create device'));
      }
    }
  };

  // Check if form is valid
  const isFormValid = formData.name && formData.username &&
    (hideEnvironment || formData.environment_uuid) &&
    (isEditMode || formData.password);

  // --- Extracted: form body ---
  const formContent = (
    <Box component="form" autoComplete="off" noValidate>
      <Grid container spacing={3} direction="column">
        {/* Extension UUID (read-only, edit mode only) */}
        {extension?.uuid && (
          <Grid size={12}>
            <TextField
              label="UUID"
              fullWidth
              value={extension.uuid}
              disabled
              InputProps={{
                readOnly: true,
                sx: {
                  fontFamily: 'monospace',
                  backgroundColor: 'action.hover'
                }
              }}
              size="small"
            />
          </Grid>
        )}

        {/* Environment - shown when hideEnvironment is false */}
        {!hideEnvironment && environments.length > 0 && (
          <Grid size={12}>
            {/* A portal user has one environment, their own: never a choice. */}
            {!userSession && (
            <FormControl fullWidth required error={!!formErrors.environment_uuid}>
              <InputLabel>Application</InputLabel>
              <Select
                value={formData.environment_uuid}
                label="Application"
                onChange={(e) => handleChange('environment_uuid', e.target.value)}
                disabled={loading || isEditMode}
                MenuProps={{ style: { zIndex: layer.MENU }, PaperProps: { sx: { zIndex: layer.MENU } } }}
              >
                {environments.map((env) => (
                  <MenuItem key={env.uuid || env.id} value={env.uuid || env.id}>
                    {env.name}
                  </MenuItem>
                ))}
              </Select>
              {formErrors.environment_uuid && (
                <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                  {formErrors.environment_uuid}
                </Typography>
              )}
            </FormControl>
            )}
          </Grid>
        )}

        {/* Name */}
        <Grid size={12}>
          <TextField
            label="Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
            fullWidth
            error={!!formErrors.name}
            helperText={formErrors.name || 'Display name for the device'}
            placeholder="e.g., John Smith"
            disabled={loading}
          />
        </Grid>

        {/* Username (Device Number) */}
        <Grid size={12}>
          <TextField
            label="Device Number"
            value={formData.username}
            onChange={(e) => handleChange('username', e.target.value)}
            required
            fullWidth
            error={!!formErrors.username}
            helperText={formErrors.username || 'Device number (e.g., 1001)'}
            placeholder="e.g., 1001"
            disabled={loading}
          />
        </Grid>

        {/* Password (SIP Password) */}
        <Grid size={12}>
          <SecretField
            label="SIP Password"
            value={formData.password}
            onChange={(e) => handleChange('password', e.target.value)}
            fullWidth
            required={!isEditMode}
            revealed={showPassword}
            error={!!formErrors.password}
            helperText={formErrors.password || (isEditMode ? 'Leave empty to keep current password' : 'Required for new devices')}
            placeholder={isEditMode ? 'Leave empty to keep current' : 'Enter SIP password'}
            disabled={loading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={showPassword ? 'Hide password' : 'Show password'}>
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Copy password">
                    <IconButton
                      onClick={copyPassword}
                      edge="end"
                      size="small"
                      disabled={!formData.password}
                    >
                      <CopyIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Generate password">
                    <IconButton
                      onClick={generatePassword}
                      edge="end"
                      size="small"
                      disabled={loading}
                    >
                      <RefreshIcon />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              )
            }}
          />
        </Grid>

        {/* Enabled Toggle */}
        <Grid size={12}>
          <FormControlLabel
            control={
              <Switch
                checked={formData.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                disabled={loading}
              />
            }
            label="Enabled"
          />
        </Grid>

        {/* Notes */}
        <Grid size={12}>
          <TextField
            label="Notes"
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Optional notes about this device"
            disabled={loading}
          />
        </Grid>

        {/* Profile Editor - Dynamic fields from API */}
        <Grid size={12}>
          <DynamicProfileEditor
            type="extension"
            profile={formData.profile}
            onChange={(profile) => handleChange('profile', profile)}
            disabled={loading}
            title="Device Profile"
            menuZIndex={layer.MENU}
          />
        </Grid>
      </Grid>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );

  // --- Extracted: action buttons ---
  const actionButtons = (
    <>
      <Button onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button
        onClick={handleSubmit}
        variant="contained"
        disabled={!isFormValid || loading}
        startIcon={loading ? <CircularProgress size={20} /> : <PhoneIcon />}
      >
        {loading
          ? (isEditMode ? 'Updating...' : 'Creating...')
          : (isEditMode ? 'Update Device' : 'Create Device')
        }
      </Button>
    </>
  );

  // --- Panel mode: render inline without Dialog wrapper ---
  if (containerMode === 'panel') {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <PhoneIcon color="primary" />
          <Typography variant="h6">
            {isEditMode ? 'Edit Device' : 'Create Device'}
          </Typography>
        </Box>

        {formContent}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          {actionButtons}
        </Box>
      </Box>
    );
  }

  // --- Dialog mode (default): original Dialog wrapper ---
  return (
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
            <PhoneIcon color="primary" />
            <Typography variant="h6">{isEditMode ? 'Edit Device' : 'Create Device'}</Typography>
          </Box>
          <IconButton onClick={onClose} size="small" disabled={loading}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {formContent}
      </DialogContent>

      <DialogActions>
        {actionButtons}
      </DialogActions>
    </Dialog>
  );
};

export default ExtensionBridge;
