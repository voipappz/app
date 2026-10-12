import { useState, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import {
  useMediaQuery,
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
import { ResponsiveDialog as Dialog } from '../../ui'; // full screen on a phone
import {
  Phone as PhoneIcon,
  Close as CloseIcon,
  Visibility,
  VisibilityOff,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
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
// One empty list for every render: a fresh `[]` each time made the effect
// below see a "new" list, reset the form, render again -- forever.
const NO_ENVIRONMENTS = [];

export const ExtensionBridge = ({
  open,
  onClose,
  onSave,
  environmentUuid = null,
  extension = null,
  environments = NO_ENVIRONMENTS,
  mode = 'edit',
  hideEnvironment = true,
  handleApiInternally = true,
  loading: externalLoading = false,
  containerMode = 'dialog',
  zLayer = null,           // Optional z-index layer override (e.g. Z.L3 when nested)
  onDrillDown // eslint-disable-line @typescript-eslint/no-unused-vars
}) => {
  const { t } = useTranslation('bridges');
  const userSession = useIsUserSession();
  const layer = zLayer || Z.L2;
  const theme = useTheme();
  // A phone has no room to spare for the device's internal id.
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
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
    const errors = deviceErrors(formData, { requirePassword: !isEditMode, t });

    // Environment required if shown
    if (!hideEnvironment && !formData.environment_uuid) {
      errors.environment_uuid = t('device.errors.application');
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
        setError(err.message || (isEditMode ? t('device.errors.updateFailed') : t('device.errors.createFailed')));
      } finally {
        setInternalLoading(false);
      }
    } else {
      // Delegate to parent - parent handles API and error handling
      try {
        await onSave(submitData);
      } catch (err) {
        setError(err.message || (isEditMode ? t('device.errors.updateFailed') : t('device.errors.createFailed')));
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
        {/* Extension UUID (read-only, edit mode only, not on a phone) */}
        {extension?.uuid && !isPhone && (
          <Grid size={12}>
            <TextField
              label={t('device.uuid')}
              fullWidth
              value={extension.uuid}
              slotProps={{ htmlInput: { dir: 'ltr' } }}
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
              <InputLabel>{t('device.application')}</InputLabel>
              <Select
                value={formData.environment_uuid}
                label={t('device.application')}
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
                <Typography variant="caption" color="error" sx={{ mt: 0.5, ms: 1.5 }}>
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
            label={t('device.name')}
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
            fullWidth
            error={!!formErrors.name}
            helperText={formErrors.name || t('device.nameHelp')}
            placeholder={t('device.namePlaceholder')}
            disabled={loading}
          />
        </Grid>

        {/* Username (Device Number) */}
        <Grid size={12}>
          <TextField
            label={t('device.number')}
            value={formData.username}
            onChange={(e) => handleChange('username', e.target.value)}
            slotProps={{ htmlInput: { dir: 'ltr' } }}
            required
            fullWidth
            error={!!formErrors.username}
            helperText={formErrors.username || t('device.numberHelp')}
            placeholder={t('device.numberPlaceholder')}
            disabled={loading}
          />
        </Grid>

        {/* Password (SIP Password) */}
        <Grid size={12}>
          <SecretField
            label={t('device.password')}
            value={formData.password}
            onChange={(e) => handleChange('password', e.target.value)}
            fullWidth
            required={!isEditMode}
            revealed={showPassword}
            error={!!formErrors.password}
            helperText={formErrors.password || (isEditMode ? t('device.passwordKeepHelp') : t('device.passwordRequiredHelp'))}
            placeholder={isEditMode ? t('device.passwordKeepPlaceholder') : t('device.passwordPlaceholder')}
            disabled={loading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={showPassword ? t('device.hidePassword') : t('device.showPassword')}>
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('device.copyPassword')}>
                    <IconButton
                      onClick={copyPassword}
                      edge="end"
                      size="small"
                      disabled={!formData.password}
                    >
                      <CopyIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('device.generatePassword')}>
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
            label={t('device.enabled')}
          />
        </Grid>

        {/* Notes */}
        <Grid size={12}>
          <TextField
            label={t('device.notes')}
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder={t('device.notesPlaceholder')}
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
            title={t('device.profile')}
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
        {t('device.cancel')}
      </Button>
      <Button
        onClick={handleSubmit}
        variant="contained"
        disabled={!isFormValid || loading}
        startIcon={loading ? <CircularProgress size={20} /> : <PhoneIcon />}
      >
        {loading
          ? (isEditMode ? t('device.updating') : t('device.creating'))
          : (isEditMode ? t('device.update') : t('device.create'))
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
            {isEditMode ? t('device.titleEdit') : t('device.titleCreate')}
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
            <Typography variant="h6">{isEditMode ? t('device.titleEdit') : t('device.titleCreate')}</Typography>
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
