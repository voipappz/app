import React, { useState, useEffect } from 'react';
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
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Grid
} from '@mui/material';
import {
  SmartToy as BotIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import { botsApi } from '../../../services/api/botsApi';
import { bridgeApi } from '../../../services/api/bridgeApi';
import { AnnouncementBridge } from '../AnnouncementBridge/AnnouncementBridge.jsx';
import { Z } from '../../../utils/zIndex.js';
import { useIsUserSession } from '../../../hooks/useIsUserSession';

/**
 * BotBridge Component
 * Dialog for creating Bots from DID edit dialog
 *
 * Similar pattern to IVRBridge - simplified Bot creation
 * for use as a bridge destination in DIDs
 *
 * Props:
 *   containerMode - 'dialog' (default) wraps content in MUI Dialog.
 *                   'panel' renders form content directly in a Box with its own action buttons.
 *   onDrillDown   - Optional callback. When provided, clicking "Create New Announcement"
 *                   calls onDrillDown({ type, mode, data, environmentUuid, onResult })
 *                   instead of opening the inline AnnouncementBridge dialog.
 */
export const BotBridge = ({
  open,
  onClose,
  onSave,
  environmentUuid = null,
  bot = null,              // Existing bot data for edit mode
  mode = 'create',         // 'create' or 'edit'
  hideEnvironment = false, // Hide environment field when inherited from parent (e.g., DID dialog)
  containerMode = 'dialog', // 'dialog' | 'panel'
  zLayer = null,           // Optional z-index layer override (e.g. Z.L3 when nested)
  onDrillDown = null       // Optional drill-down handler for nested resource creation
}) => {
  const userSession = useIsUserSession();
  const layer = zLayer || Z.L2;
  const { selectedEnvironments } = useCustomerEnvironment();

  // Form state - same fields as IVR
  const [formData, setFormData] = useState({
    name: '',
    environment_uuid: '',
    announcement_uuid: '',
    timeout: 10,
    enabled: true
  });

  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false);

  // Initialize form data
  useEffect(() => {
    if (open) {
      const envUuid = environmentUuid || selectedEnvironments?.[0]?.uuid || '';

      if (mode === 'edit' && bot) {
        // Edit mode - load existing bot data
        setFormData({
          name: bot.name || '',
          environment_uuid: bot.environment_uuid || envUuid,
          announcement_uuid: bot.announcement_uuid || '',
          timeout: bot.timeout || 10,
          enabled: bot.enabled !== undefined ? bot.enabled : true
        });
      } else {
        // Create mode
        setFormData(prev => ({ ...prev, environment_uuid: envUuid }));
      }
    }
  }, [open, environmentUuid, selectedEnvironments, mode, bot]);

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
      loadAnnouncements();
    }
  }, [open, formData.environment_uuid]);

  // Handle create new announcement click
  const handleCreateNewAnnouncement = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (onDrillDown) {
      onDrillDown({
        type: 'announcement',
        mode: 'create',
        data: null,
        environmentUuid: formData.environment_uuid,
        onResult: async (savedData) => {
          // Handle the result - set announcement_uuid and reload announcements
          const uuid = savedData.uuid || savedData.id;
          handleChange('announcement_uuid', uuid);
          // Reload announcements list
          try {
            const response = await bridgeApi.getBridgeResources('announcement', formData.environment_uuid);
            setAnnouncements(Array.isArray(response) ? response : []);
          } catch (err) {
            console.error('Error reloading announcements after drill-down creation:', err);
          }
        }
      });
    } else {
      // Legacy: open announcement dialog inline
      console.log('Opening announcement creation dialog from Bot');
      setAnnouncementDialogOpen(true);
    }
  };

  // Handle announcement save - reload announcements
  const handleAnnouncementSave = async (announcementData) => {
    console.log('New announcement created:', announcementData);
    const uuid = announcementData.uuid || announcementData.id;

    // Close the announcement dialog
    setAnnouncementDialogOpen(false);

    // Reload announcements
    try {
      const response = await bridgeApi.getBridgeResources('announcement', formData.environment_uuid);
      const updatedAnnouncements = Array.isArray(response) ? response : (response?.data || []);
      setAnnouncements(updatedAnnouncements);

      // Auto-select the newly created announcement
      if (uuid) {
        setFormData(prev => ({
          ...prev,
          announcement_uuid: uuid
        }));
      }
    } catch (err) {
      console.error('Error reloading announcements after creation:', err);
    }
  };

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFormData({
        name: '',
        environment_uuid: '',
        announcement_uuid: '',
        timeout: 10,
        enabled: true
      });
      setFormErrors({});
      setError(null);
      setAnnouncements([]);
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

  // Handle environment change - reset announcement
  const handleEnvironmentChange = (envUuid) => {
    setFormData(prev => ({
      ...prev,
      environment_uuid: envUuid,
      announcement_uuid: ''
    }));
  };

  // Validate form
  const validateForm = () => {
    const errors = {};

    if (!formData.name?.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.environment_uuid) {
      errors.environment_uuid = 'Application is required';
    }

    // Announcement is optional for bots
    // if (!formData.announcement_uuid) {
    //   errors.announcement_uuid = 'Announcement is required';
    // }

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
      if (mode === 'edit' && bot) {
        result = await botsApi.updateBot(bot.uuid, formData);
      } else {
        result = await botsApi.createBot(formData);
      }
      const botData = result.data || result;
      onSave(botData);
      onClose();
    } catch (err) {
      console.error(`Bot ${mode} error:`, err);
      setError(err.message || `Failed to ${mode} bot`);
    } finally {
      setLoading(false);
    }
  };

  // Check if form is valid
  const isFormValid = formData.name && formData.environment_uuid;

  // ---------------------------------------------------------------------------
  // Shared form body (used in both dialog and panel modes)
  // ---------------------------------------------------------------------------
  const formContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: containerMode === 'panel' ? 0 : 2 }}>
      {/* Basic Information */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Basic Information</Typography>

        {/* Enabled Switch */}
        <FormControlLabel
          control={
            <Switch
              checked={formData.enabled}
              onChange={(e) => handleChange('enabled', e.target.checked)}
              disabled={loading}
            />
          }
          label="Enabled"
          sx={{ mb: 2 }}
        />

        {/* Name and Environment */}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: hideEnvironment ? 12 : 6 }}>
            <TextField
              label="Name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              fullWidth
              error={!!formErrors.name}
              helperText={formErrors.name}
              placeholder="Enter bot name"
              disabled={loading}
            />
          </Grid>

          {!hideEnvironment && (
            <Grid size={{ xs: 12, md: 6 }}>
              {/* A portal user has one environment, their own: never a choice. */}
              {!userSession && (
              <FormControl fullWidth required error={!!formErrors.environment_uuid} disabled={loading}>
                <InputLabel>Application</InputLabel>
                <Select
                  value={formData.environment_uuid}
                  label="Application"
                  onChange={(e) => handleEnvironmentChange(e.target.value)}
                >
                  {selectedEnvironments?.map(env => (
                    <MenuItem key={env.uuid} value={env.uuid}>{env.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              )}
            </Grid>
          )}

          <Grid size={{ xs: 12, md: 6 }}>
            <FormControl fullWidth disabled={loading || announcementsLoading}>
              <InputLabel>Announcement (Optional)</InputLabel>
              <Select
                value={formData.announcement_uuid}
                label="Announcement (Optional)"
                onChange={(e) => handleChange('announcement_uuid', e.target.value)}
              >
                {[
                  <MenuItem key="none" value="">
                    <em>None</em>
                  </MenuItem>,
                  <MenuItem
                    key="add_new"
                    onMouseDown={handleCreateNewAnnouncement}
                    sx={{ color: 'primary.main', fontWeight: 'bold' }}
                  >
                    + Create New Announcement
                  </MenuItem>,
                  ...(announcementsLoading ? [
                    <MenuItem key="loading" disabled>Loading...</MenuItem>
                  ] : announcements.map(announcement => (
                    <MenuItem key={announcement.uuid} value={announcement.uuid}>
                      {announcement.name}
                    </MenuItem>
                  )))
                ]}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              label="Timeout (seconds)"
              type="number"
              value={formData.timeout}
              onChange={(e) => handleChange('timeout', parseInt(e.target.value) || 10)}
              fullWidth
              disabled={loading}
              inputProps={{ min: 1, max: 60 }}
              helperText="How long to wait for response"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Help text */}
      <Alert severity="info">
        This creates a basic Bot. You can configure advanced options by editing the Bot later.
      </Alert>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Box>
  );

  // ---------------------------------------------------------------------------
  // Shared action buttons (used in both dialog and panel modes)
  // ---------------------------------------------------------------------------
  const actionButtons = (
    <>
      <Button onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button
        onClick={handleSubmit}
        variant="contained"
        disabled={!isFormValid || loading}
        startIcon={loading ? <CircularProgress size={20} /> : <BotIcon />}
      >
        {loading ? (mode === 'edit' ? 'Updating...' : 'Creating...') : (mode === 'edit' ? 'Update Bot' : 'Create Bot')}
      </Button>
    </>
  );

  // ---------------------------------------------------------------------------
  // AnnouncementBridge dialog - only rendered when onDrillDown is NOT provided
  // (both in dialog mode and panel mode for backward compatibility)
  // ---------------------------------------------------------------------------
  const announcementBridgeDialog = !onDrillDown ? (
    <AnnouncementBridge
      open={announcementDialogOpen}
      onClose={() => setAnnouncementDialogOpen(false)}
      onSave={handleAnnouncementSave}
      environmentUuid={formData.environment_uuid}
      hideEnvironment={true}
      zLayer={Z.L3}
    />
  ) : null;

  // ---------------------------------------------------------------------------
  // Panel mode - render form content directly in a Box (no Dialog wrapper)
  // ---------------------------------------------------------------------------
  if (containerMode === 'panel') {
    return (
      <>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Panel title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BotIcon />
            <Typography variant="h6">{mode === 'edit' ? 'Edit Bot' : 'Create Bot'}</Typography>
          </Box>

          {/* Form body */}
          {formContent}

          {/* Action buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 1 }}>
            {actionButtons}
          </Box>
        </Box>

        {/* Inline announcement dialog (only when onDrillDown is absent) */}
        {announcementBridgeDialog}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Dialog mode (default) - existing Dialog wrapper unchanged
  // ---------------------------------------------------------------------------
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
            <BotIcon />
            <Typography variant="h6">{mode === 'edit' ? 'Edit Bot' : 'Create Bot'}</Typography>
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

    {/* Announcement Creation Dialog */}
    {announcementBridgeDialog}
    </>
  );
};

export default BotBridge;
