import {
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  IconButton,
  CircularProgress,
  Grid,
  Alert,
  Typography,
  Box,
  Tooltip
} from '@mui/material';
import { ResponsiveDialog as Dialog } from '../../ui'; // full screen on a phone
import { Close as CloseIcon, Add as AddIcon, Delete as DeleteIcon, ContentCopy as ContentCopyIcon } from '@mui/icons-material';
import { useState, useEffect } from 'react';
import DynamicProfileEditor from '../../common/DynamicProfileEditor/DynamicProfileEditor';
import { formatDate } from '../../../utils/dateUtils';
import { parseServerErrors, is406Error } from '../../../utils/formValidation';

/**
 * ProfileEditor Component
 * Key-value pairs editor for environment profile settings
 */
const ProfileEditor = ({ profile, onChange, disabled, title = "Profile Properties" }) => {
  const [profileItems, setProfileItems] = useState([]);

  useEffect(() => {
    // Convert profile object to array format for editing
    if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
      const items = Object.entries(profile).map(([key, value]) => ({
        key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value || '')
      }));
      setProfileItems(items.length > 0 ? items : [{ key: '', value: '' }]);
    } else if (typeof profile === 'string' && profile) {
      try {
        const parsed = JSON.parse(profile);
        const items = Object.entries(parsed).map(([key, value]) => ({
          key,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value || '')
        }));
        setProfileItems(items.length > 0 ? items : [{ key: '', value: '' }]);
      } catch {
        setProfileItems([{ key: '', value: '' }]);
      }
    } else {
      setProfileItems([{ key: '', value: '' }]);
    }
  }, [profile]);

  const handleProfileChange = (index, field, value) => {
    const updatedItems = [...profileItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setProfileItems(updatedItems);

    // Convert back to object format and call onChange
    const profileObject = {};
    updatedItems.forEach(item => {
      if (item.key.trim()) {
        profileObject[item.key.trim()] = item.value;
      }
    });
    onChange(profileObject);
  };

  const addProfileItem = () => {
    setProfileItems([...profileItems, { key: '', value: '' }]);
  };

  const removeProfileItem = (index) => {
    if (profileItems.length > 1) {
      const updatedItems = profileItems.filter((_, i) => i !== index);
      setProfileItems(updatedItems);

      // Update profile object
      const profileObject = {};
      updatedItems.forEach(item => {
        if (item.key.trim()) {
          profileObject[item.key.trim()] = item.value;
        }
      });
      onChange(profileObject);
    }
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ color: 'primary.main', mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Custom key-value pairs for this environment
      </Typography>
      <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1 }}>
        {profileItems.length === 0 || (profileItems.length === 1 && !profileItems[0].key) ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No {title.toLowerCase()} defined. Add custom key-value pairs as needed.
          </Typography>
        ) : null}

        {profileItems.map((item, index) => (
          <Grid container spacing={2} key={index} sx={{ mb: 1 }}>
            <Grid size={5}>
              <TextField
                label="Key"
                value={item.key}
                onChange={(e) => handleProfileChange(index, 'key', e.target.value)}
                size="small"
                disabled={disabled}
                fullWidth
                placeholder="e.g., timezone"
                autoComplete="off"
              />
            </Grid>
            <Grid size={5}>
              <TextField
                label="Value"
                value={item.value}
                onChange={(e) => handleProfileChange(index, 'value', e.target.value)}
                size="small"
                disabled={disabled}
                fullWidth
                placeholder="e.g., UTC"
                autoComplete="off"
              />
            </Grid>
            <Grid size={2}>
              <IconButton
                onClick={() => removeProfileItem(index)}
                disabled={disabled || profileItems.length === 1}
                size="small"
                color="error"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Grid>
          </Grid>
        ))}

        <Button
          startIcon={<AddIcon />}
          onClick={addProfileItem}
          disabled={disabled}
          size="small"
          sx={{ mt: 1 }}
        >
          Add Property
        </Button>
      </Box>
    </Box>
  );
};

/**
 * EnvironmentDialog Component
 * Dialog for creating and editing environments
 * Follows comprehensive edit dialog pattern from EDIT_DIALOG_COMPREHENSIVE_GUIDE.md
 */
const EnvironmentDialog = ({
  open,
  onClose,
  onSave,
  environment,
  loading,
  canWrite = true
}) => {
  const [formData, setFormData] = useState({
    name: '',
    notes: '',
    enabled: true,
    profile: {},
    meta: {}
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const isEdit = !!environment;

  // Initialize form data when environment changes
  useEffect(() => {
    if (environment) {
      setFormData({
        name: environment.name || '',
        notes: environment.notes || '',
        enabled: environment.enabled !== undefined ? environment.enabled : true,
        profile: environment.profile || {},
        meta: environment.meta || {}
      });
    } else {
      setFormData({
        name: '',
        notes: '',
        enabled: true,
        profile: {},
        meta: {}
      });
    }
    setErrors({});
    setApiError('');
    setSuccessMessage('');
    setSubmitAttempted(false);
  }, [environment, open]);

  const handleChange = (field, value) => {
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

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required';
    }

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
      // Prepare data for submission - pass profile and meta as objects
      // The API service will handle form URL encoding them properly
      const dataToSave = {
        ...formData
      };

      await onSave(dataToSave);
      setSuccessMessage(isEdit ? 'Application updated successfully' : 'Application created successfully');
    } catch (error) {
      console.error('Error saving environment:', error);
      // Parse 406 validation errors from server
      if (is406Error(error)) {
        const serverErrors = parseServerErrors(error);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(prev => ({ ...prev, ...serverErrors }));
        }
      }
      setApiError(error.message || 'Failed to save environment');
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
      maxWidth="sm"
      fullWidth
      data-testid="environment-dialog"
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 1
        }}
      >
        {isEdit ? 'Edit Application' : 'Create Application'}
        <IconButton
          edge="end"
          color="inherit"
          onClick={handleClose}
          aria-label="close"
          disabled={loading}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {apiError && (
          <Alert severity="error" sx={{ mb: 2 }} data-testid="error-message">
            {apiError}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }} data-testid="success-message">
            {successMessage}
          </Alert>
        )}

        <Box component="form" autoComplete="off" noValidate>
        <Grid container spacing={2} direction="column">
          {/* 1. UUID Field - Read Only with copy (only shown in edit mode) */}
          {isEdit && environment?.uuid && (
            <Grid size={12}>
              <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 70, fontWeight: 600 }}>UUID</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{environment.uuid}</Typography>
                  <Tooltip title="Copy UUID">
                    <IconButton size="small" onClick={() => navigator.clipboard?.writeText(environment.uuid)} sx={{ p: 0.25 }}>
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Grid>
          )}

          {/* 2. Enabled Toggle - right after UUID */}
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

          {/* 3. Name Field */}
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
              placeholder="Enter application name"
              autoComplete="off"
            />
          </Grid>

          {/* 4. Profile Properties Editor - Dynamic fields from API */}
          <Grid size={12}>
            <DynamicProfileEditor
              type="environment"
              profile={formData.profile}
              onChange={(profile) => handleChange('profile', profile)}
              disabled={loading}
              title="Profile Properties"
            />
            <Typography variant="caption" color="text.secondary">
              Dynamic configuration fields from API
            </Typography>
          </Grid>

          {/* 5. Meta Properties Editor */}
          <Grid size={12}>
            <ProfileEditor
              profile={formData.meta}
              onChange={(meta) => handleChange('meta', meta)}
              disabled={loading}
              title="Meta Properties"
            />
          </Grid>

          {/* Enhanced Data Sections (Read-Only - shown when editing) */}
          {isEdit && environment && (
            <>
              {/* Customer Information */}
              {environment.customer && (
                <Grid size={12}>
                  <Typography variant="h6" sx={{ color: 'primary.main', mb: 1 }}>
                    Customer Details
                  </Typography>
                  <Box sx={{ p: 2, backgroundColor: 'var(--mui-palette-surface-muted)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">Customer Name</Typography>
                        <Typography variant="body2" fontWeight={600}>{environment.customer.name || 'N/A'}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">Customer UUID</Typography>
                        <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                          {environment.customer.uuid || environment.customer_uuid || 'N/A'}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                </Grid>
              )}

              {/* Technical Configuration */}
              {(environment.domain || environment.wss_server || environment.timezone) && (
                <Grid size={12}>
                  <Typography variant="h6" sx={{ color: 'primary.main', mb: 1 }}>
                    Technical Configuration
                  </Typography>
                  <Box sx={{ p: 2, backgroundColor: 'var(--mui-palette-surface-muted)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                    <Grid container spacing={2}>
                      {environment.domain && (
                        <Grid size={{ xs: 12, sm: 4 }}>
                          <Typography variant="caption" color="text.secondary">Domain</Typography>
                          <Typography variant="body2" fontWeight={600}>{environment.domain}</Typography>
                        </Grid>
                      )}
                      {environment.wss_server && (
                        <Grid size={{ xs: 12, sm: 4 }}>
                          <Typography variant="caption" color="text.secondary">WSS Server</Typography>
                          <Typography variant="body2">{environment.wss_server}</Typography>
                        </Grid>
                      )}
                      {environment.timezone && (
                        <Grid size={{ xs: 12, sm: 4 }}>
                          <Typography variant="caption" color="text.secondary">Timezone</Typography>
                          <Typography variant="body2">{environment.timezone}</Typography>
                        </Grid>
                      )}
                    </Grid>
                  </Box>
                </Grid>
              )}

              {/* Environment Info */}
              <Grid size={12}>
                <Typography variant="h6" sx={{ color: 'primary.main', mb: 1 }}>
                  Environment Info
                </Typography>
                <Box sx={{ p: 2, backgroundColor: 'var(--mui-palette-surface-muted)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" color="text.secondary">UUID</Typography>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                        {environment.uuid || environment.id || 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" color="text.secondary">Created At</Typography>
                      <Typography variant="body2">
                        {formatDate(environment.created_at)}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" color="text.secondary">Updated At</Typography>
                      <Typography variant="body2">
                        {formatDate(environment.updated_at)}
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>
              </Grid>
            </>
          )}

          {/* Notes Field - always last in the form body */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Notes"
              variant="outlined"
              multiline
              rows={3}
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              disabled={loading}
              data-testid="notes-input"
              placeholder="Additional notes about this application"
              autoComplete="off"
            />
          </Grid>
        </Grid>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={handleClose}
          disabled={loading}
          sx={{ textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={!canWrite || loading}
          data-testid="submit-environment-button"
          startIcon={loading ? <CircularProgress size={20} /> : null}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            px: 3
          }}
        >
          {isEdit ? 'Update Application' : 'Create Application'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EnvironmentDialog;
