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
  Tabs,
  Tab,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Collapse
} from '@mui/material';
import {
  RecordVoiceOver as AnnouncementIcon,
  Close as CloseIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  VolumeUp as VolumeIcon,
  CloudUpload as UploadIcon,
  Refresh as RefreshIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import { useAnnouncement } from './AnnouncementBridge.js';
import { FileUploadZone } from './FileUploadZone.jsx';
import { TTSGenerator } from './TTSGenerator.jsx';
import { bridgeApi } from '../../../services/api/bridgeApi';
import { Z } from '../../../utils/zIndex.js';
import { useIsUserSession } from '../../../hooks/useIsUserSession';

/**
 * AnnouncementBridge Component
 * Dialog for creating announcements via file upload or text-to-speech
 *
 * Based on legacy AngularJS patterns from:
 * - /opt/src/va-voipbox-admin/src/views/announcements/new.html
 * - /opt/src/va-voipbox-admin/src/scripts/controllers/announcements/new.js
 *
 * Features:
 * - Dual mode: file upload or TTS
 * - File upload with drag-drop and progress
 * - TTS generation with preview
 * - Environment scoping
 * - containerMode prop: 'dialog' (default) renders in a Dialog wrapper;
 *   'panel' renders the form content directly in a Box (for use in wizard panels)
 */
export const AnnouncementBridge = ({
  open,
  onClose,
  onSave,
  environmentUuid = null,
  announcement = null,       // Existing announcement data for edit mode
  editMode = 'create',       // 'create' or 'edit'
  hideEnvironment = false,   // Hide environment field when creating from DID/IVR (inherited)
  containerMode = 'dialog',  // 'dialog' (default) | 'panel'
  zLayer = null,             // Optional z-index layer override (e.g. Z.L3 when nested inside another L2 bridge)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDrillDown                // Optional — reserved for wizard navigation (unused here, leaf component)
}) => {
  const userSession = useIsUserSession();
  const layer = zLayer || Z.L2;
  const { selectedEnvironments } = useCustomerEnvironment();

  // Use announcement hook
  const {
    mode,
    setMode,
    file,
    uploadProgress,
    uploadStatus,
    handleFileSelect,
    suggestedName,
    ttsPreviewUrl,
    generatingTTS,
    handleTTSGenerate,
    loading,
    error,
    clearError,
    saveAnnouncement,
    reset
  } = useAnnouncement();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    environment_uuid: '',
    enabled: true,
    notes: ''
  });

  const [formErrors, setFormErrors] = useState({});
  const [showReplaceFile, setShowReplaceFile] = useState(false);
  const [audioRef, setAudioRef] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fullAnnouncement, setFullAnnouncement] = useState(null);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [builtins, setBuiltins] = useState([]);
  const [builtin, setBuiltin] = useState('');

  // Built-in announcements (MOH / RINGING / SILENCE) for the third tab.
  useEffect(() => {
    if (!open || editMode === 'edit') return;
    let live = true;
    import('../../../services/api/announcementsApi.js')
      .then(({ getBuiltins }) => getBuiltins())
      .then((list) => { if (live) setBuiltins(list); });
    return () => { live = false; };
  }, [open, editMode]);

  // Picking a built-in names the announcement after it (MOH, RINGING,
  // SILENCE); the API keeps one per application and plays its own file.
  const pickBuiltin = (name) => {
    setBuiltin(name);
    setFormData(prev => ({ ...prev, name }));
    setFormErrors(prev => ({ ...prev, builtin: undefined, name: undefined }));
  };

  // Audio URL from full announcement details (fetched) or passed-in data
  const existingAudioUrl = fullAnnouncement?.path || announcement?.path || null;

  // Fetch full announcement details in edit mode (list API may not include path)
  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || editMode !== 'edit' || !announcement?.uuid) {
        setFullAnnouncement(null);
        return;
      }

      // If we already have the path, no need to fetch
      if (announcement.path) {
        setFullAnnouncement(announcement);
        return;
      }

      setFetchingDetails(true);
      try {
        const details = await bridgeApi.getBridgeResource('announcement', announcement.uuid);
        setFullAnnouncement(details);
      } catch (err) {
        console.error('Error fetching announcement details:', err);
        setFullAnnouncement(null);
      } finally {
        setFetchingDetails(false);
      }
    };

    fetchDetails();
  }, [open, editMode, announcement]);

  // Initialize form data
  useEffect(() => {
    if (open) {
      const envUuid = environmentUuid || selectedEnvironments?.[0]?.uuid || '';
      // Use full details if available, fall back to passed-in data
      const ann = fullAnnouncement || announcement;

      if (editMode === 'edit' && ann) {
        // Edit mode - load existing announcement data
        setFormData({
          name: ann.name || '',
          environment_uuid: ann.environment_uuid || envUuid,
          enabled: ann.enabled !== undefined ? ann.enabled : true,
          notes: ann.notes || ''
        });
      } else if (editMode !== 'edit') {
        // Create mode
        setFormData(prev => ({ ...prev, environment_uuid: envUuid }));
      }
    }
  }, [open, environmentUuid, selectedEnvironments, editMode, announcement, fullAnnouncement]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      reset();
      setBuiltin('');
      setFormData({
        name: '',
        environment_uuid: '',
        enabled: true,
        notes: ''
      });
      setFormErrors({});
      setShowReplaceFile(false);
      setIsPlaying(false);
      setFullAnnouncement(null);
    }
  }, [open, reset]);

  // Handle play/pause for existing audio
  const handlePlayPause = () => {
    if (audioRef) {
      if (isPlaying) {
        audioRef.pause();
      } else {
        audioRef.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Reset playing state when audio ends
  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  // Handle audio errors
  const handleAudioError = (e) => {
    console.error('Audio playback error:', {
      error: e.target.error,
      src: e.target.src,
      networkState: e.target.networkState,
      readyState: e.target.readyState
    });
    setIsPlaying(false);
  };

  // Auto-set name from filename when file is selected (only if name is empty)
  useEffect(() => {
    if (suggestedName && editMode !== 'edit' && !formData.name) {
      setFormData(prev => ({ ...prev, name: suggestedName }));
    }
  }, [suggestedName, editMode, formData.name]);

  // Handle form field change
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: null }));
    }
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

    // File/TTS validation only required for create mode
    if (editMode !== 'edit') {
      if (mode === 'file' && !file) {
        errors.file = 'Please select a file to upload';
      }

      if (mode === 'tts' && !ttsPreviewUrl) {
        errors.tts = 'Please generate audio preview before creating';
      }

      if (mode === 'builtin') {
        if (!builtin) {
          errors.builtin = 'Please choose music on hold, ringing or silence';
        }
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      let result;
      if (editMode === 'edit' && announcement) {
        // Edit mode - update announcement
        const { updateAnnouncement, updateFile } = await import('../../../services/api/announcementsApi.js');

        if (showReplaceFile && file) {
          // File + metadata in a single PATCH (same as legacy admin)
          result = await updateFile(announcement.uuid, file, formData, (progress) => {
            console.log('Upload progress:', progress);
          });
        } else {
          // Metadata-only update (no file change)
          result = await updateAnnouncement(announcement.uuid, formData);
        }
      } else {
        // Create mode
        result = await saveAnnouncement(formData);
      }
      onSave(result);
      onClose();
    } catch (err) {
      // Error is handled by hook
      console.error('Submit error:', err);
    }
  };

  // Check if form is valid
  const isFormValid = formData.name && formData.environment_uuid && (
    editMode === 'edit' || (mode === 'file' && file) || (mode === 'tts' && ttsPreviewUrl) ||
    (mode === 'builtin' && builtin)
  );

  // ---------------------------------------------------------------------------
  // Shared form content (rendered inside either Dialog or panel Box)
  // ---------------------------------------------------------------------------
  const formContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: containerMode === 'panel' ? 0 : 2 }}>
      {/* UUID - Read Only (edit mode only) */}
      {editMode === 'edit' && announcement?.uuid && (
        <TextField
          label="UUID"
          fullWidth
          value={announcement.uuid}
          disabled
          InputProps={{
            readOnly: true,
            sx: { fontFamily: 'monospace', backgroundColor: 'action.hover' }
          }}
          size="small"
        />
      )}

      {/* Mode Tabs - Only show in create mode */}
      {editMode !== 'edit' && (
        <>
          <Paper sx={{ p: 0 }}>
            <Tabs
              value={mode}
              onChange={(e, newValue) => {
                setMode(newValue);
                clearError();
              }}
              variant="fullWidth"
            >
              <Tab label="Upload File" value="file" />
              <Tab label="Text-to-Speech" value="tts" />
              <Tab label="Music on hold / Ringing / Silence" value="builtin" />
            </Tabs>
          </Paper>

          {/* Built-in Tab: MOH / RINGING / SILENCE, played from the API's local files */}
          {mode === 'builtin' && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>Built-in audio</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No upload needed: the platform plays its own file for this announcement.
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={builtin}
                onChange={(e, value) => value && pickBuiltin(value)}
                aria-label="Built-in audio"
              >
                {builtins.map(b => (
                  <ToggleButton key={b.name} value={b.name}>{b.label}</ToggleButton>
                ))}
              </ToggleButtonGroup>
              {formErrors.builtin && (
                <Alert severity="error" sx={{ mt: 2 }}>{formErrors.builtin}</Alert>
              )}
            </Paper>
          )}

          {/* File Upload Tab */}
          {mode === 'file' && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Upload Audio File</Typography>
              <FileUploadZone
                onFileSelect={handleFileSelect}
                uploadProgress={uploadProgress}
                uploadStatus={uploadStatus}
                errorMessage={error}
                disabled={loading}
              />
              {formErrors.file && (
                <Alert severity="error" sx={{ mt: 2 }}>{formErrors.file}</Alert>
              )}
            </Paper>
          )}

          {/* TTS Tab */}
          {mode === 'tts' && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Text-to-Speech</Typography>
              <TTSGenerator
                onGenerate={handleTTSGenerate}
                previewUrl={ttsPreviewUrl}
                generating={generatingTTS}
                error={error}
                disabled={loading}
              />
              {formErrors.tts && (
                <Alert severity="error" sx={{ mt: 2 }}>{formErrors.tts}</Alert>
              )}
            </Paper>
          )}
        </>
      )}

      {/* Audio Player for Edit Mode */}
      {editMode === 'edit' && (
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <VolumeIcon color="primary" />
              <Typography variant="h6">Current Audio</Typography>
            </Box>
            <Button
              size="small"
              startIcon={showReplaceFile ? <ExpandLessIcon /> : <UploadIcon />}
              onClick={() => setShowReplaceFile(!showReplaceFile)}
              disabled={loading}
            >
              {showReplaceFile ? 'Cancel Replace' : 'Replace Audio'}
            </Button>
          </Box>

          {/* Loading state while fetching audio details */}
          {fetchingDetails && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">Loading audio...</Typography>
            </Box>
          )}

          {/* Audio Player */}
          {!fetchingDetails && existingAudioUrl && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 2,
                  bgcolor: 'background.default',
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider'
                }}
              >
                <Tooltip title={isPlaying ? 'Pause' : 'Play'}>
                  <IconButton
                    onClick={handlePlayPause}
                    color="primary"
                    sx={{
                      bgcolor: 'primary.main',
                      color: 'white',
                      '&:hover': { bgcolor: 'primary.dark' }
                    }}
                  >
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                  </IconButton>
                </Tooltip>

                <Box sx={{ flex: 1 }}>
                  <audio
                    ref={setAudioRef}
                    src={existingAudioUrl}
                    onEnded={handleAudioEnded}
                    onPause={() => setIsPlaying(false)}
                    onPlay={() => setIsPlaying(true)}
                    onError={handleAudioError}
                    controls
                    style={{ width: '100%' }}
                  />
                </Box>
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Play the current audio to verify. Click "Replace Audio" to upload a new file.
              </Typography>
            </>
          )}

          {/* No audio available */}
          {!fetchingDetails && !existingAudioUrl && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No audio file available. Upload a new file below.
            </Typography>
          )}

          {/* File Upload for Replacement */}
          <Collapse in={showReplaceFile || (!fetchingDetails && !existingAudioUrl)}>
            <Box sx={{ mt: 2, pt: 2, borderTop: existingAudioUrl ? 1 : 0, borderColor: 'divider' }}>
              {existingAudioUrl && (
                <Typography variant="subtitle2" color="warning.main" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <RefreshIcon fontSize="small" />
                  Upload new audio to replace the existing file
                </Typography>
              )}
              <FileUploadZone
                onFileSelect={handleFileSelect}
                uploadProgress={uploadProgress}
                uploadStatus={uploadStatus}
                errorMessage={error}
                disabled={loading}
              />
            </Box>
          </Collapse>
        </Paper>
      )}

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
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
            fullWidth
            error={!!formErrors.name}
            helperText={formErrors.name}
            placeholder="Enter announcement name"
            disabled={loading}
          />

          {/* Environment - Hidden when inherited from parent (DID/IVR) */}
          {/* A portal user has one environment, their own: never a choice. */}
          {!hideEnvironment && !userSession && (
            <FormControl fullWidth required error={!!formErrors.environment_uuid} disabled={loading}>
              <InputLabel>Application</InputLabel>
              <Select
                value={formData.environment_uuid}
                label="Application"
                onChange={(e) => handleChange('environment_uuid', e.target.value)}
              >
                {selectedEnvironments?.map(env => (
                  <MenuItem key={env.uuid} value={env.uuid}>{env.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>

        {/* Notes */}
        <TextField
          label="Notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          fullWidth
          multiline
          rows={2}
          placeholder="Optional notes or description"
          disabled={loading}
        />
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={clearError}>
          {error}
        </Alert>
      )}
    </Box>
  );

  // ---------------------------------------------------------------------------
  // Shared action buttons
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
        startIcon={loading ? <CircularProgress size={20} /> : <AnnouncementIcon />}
      >
        {loading
          ? (editMode === 'edit' ? 'Updating...' : 'Creating...')
          : (editMode === 'edit' ? 'Update Announcement' : 'Create Announcement')}
      </Button>
    </>
  );

  // ---------------------------------------------------------------------------
  // Panel mode — render form directly in a Box (no Dialog wrapper)
  // ---------------------------------------------------------------------------
  if (containerMode === 'panel') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Panel title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AnnouncementIcon />
          <Typography variant="h6">
            {editMode === 'edit' ? 'Edit Announcement' : 'Create Announcement'}
          </Typography>
        </Box>

        {/* Scrollable form body */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {formContent}
        </Box>

        {/* Action buttons pinned at the bottom */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1,
            pt: 2,
            mt: 2,
            borderTop: 1,
            borderColor: 'divider'
          }}
        >
          {actionButtons}
        </Box>
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // Dialog mode (default) — existing Dialog wrapper behavior unchanged
  // ---------------------------------------------------------------------------
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{ zIndex: layer.DIALOG }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AnnouncementIcon />
            <Typography variant="h6">{editMode === 'edit' ? 'Edit Announcement' : 'Create Announcement'}</Typography>
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
  );
};

export default AnnouncementBridge;
