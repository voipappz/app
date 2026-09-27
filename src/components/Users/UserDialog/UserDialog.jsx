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
  Tooltip,
  InputAdornment,
  Tabs,
  Tab,
  Snackbar
} from '@mui/material';
import { Close as CloseIcon, QrCode2, Phone as PhoneIcon, LockReset, Visibility, VisibilityOff, Download, ContentCopy, Refresh as RefreshIcon } from '@mui/icons-material';
import { useState, useEffect, useCallback } from 'react';
import DynamicProfileEditor from '../../common/DynamicProfileEditor/DynamicProfileEditor';
import { ACLSelect } from '../../common/ACLSelect';
import { StatusSelect } from '../../common/StatusSelect';
import SkillEditor from '../../common/SkillEditor/SkillEditor.jsx';
import { parseServerErrors, is406Error } from '../../../utils/formValidation';
import { customersApi } from '../../../services/api/customersApi';
import { extensionsApi } from '../../../services/api/extensionsApi';
import ResourcesManager from '../ResourcesManager/ResourcesManager';
import { useOpenPhoneAs } from '../../../hooks/useCallNumber';
import { liveApi } from '../../../services/api/liveApi';
import { queuesApi } from '../../../services/api/queuesApi';
import SecretField from '../../common/SecretField.jsx';

/**
 * UserDialog Component
 * Dialog for creating and editing users — tabbed layout
 */
const UserDialog = ({ open, onClose, onSave, onResetPassword, user, loading, environments, acls, statuses, embedded = false, onDirty, canWrite = true }) => {
  const openPhoneAs = useOpenPhoneAs();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    environment_uuid: '',
    acl_uuid: '',
    status_uuid: '',
    enabled: true,
    notes: '',
    profile: {},
    skills: [],
    resources: []
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState(null);
  const [qrError, setQrError] = useState('');

  // Tab state
  const [tabValue, setTabValue] = useState(0);

  // Reset password state
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showGeneratedPassword, setShowGeneratedPassword] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);

  // Extension auto-generation state
  const [extensionUsername, setExtensionUsername] = useState('');
  const [extensionAutoGenerate, setExtensionAutoGenerate] = useState(true);
  const [extensionValidation, setExtensionValidation] = useState({ valid: true, message: '' });
  const [isGeneratingExtension, setIsGeneratingExtension] = useState(false);
  const [validationTimeout, setValidationTimeout] = useState(null);

  // Agent tab state
  const [agentStates, setAgentStates] = useState([]);
  const [agentStatesLoading, setAgentStatesLoading] = useState(false);
  const [agentStatusSnackbar, setAgentStatusSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [settingAgentStatus, setSettingAgentStatus] = useState(false);

  const isEdit = !!user;
  // Full-screen (embedded) editor: pair fields side-by-side on wide screens;
  // the modal keeps its single column.
  const half = embedded ? { xs: 12, md: 6 } : { xs: 12 };

  // Initialize form data when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        password: '',
        environment_uuid: user.environment?.uuid || user.environment_uuid || '',
        acl_uuid: user.acl?.uuid || user.acl_uuid || '',
        status_uuid: user.status?.uuid || user.status_uuid || '',
        enabled: user.enabled !== undefined ? user.enabled : true,
        notes: user.notes || '',
        profile: user.profile || {},
        skills: user.skills || [],
        resources: user.resources || []
      });
      const existingUsername = user.extension?.username || user.username || '';
      setExtensionUsername(existingUsername);
      setExtensionAutoGenerate(false);
      if (existingUsername) {
        setExtensionValidation({ valid: true, message: 'Current username' });
      }
    } else {
      setFormData({
        name: '',
        email: '',
        password: generateRandomPassword(12),
        environment_uuid: '',
        acl_uuid: '',
        status_uuid: '',
        enabled: true,
        notes: '',
        profile: {},
        skills: [],
        resources: []
      });
    }
    setErrors({});
    setApiError('');
    setSuccessMessage('');
    setSubmitAttempted(false);
    setTabValue(0);
  }, [user, open]);

  // Fetch agent states when Agent tab is opened
  useEffect(() => {
    if (tabValue === 2 && isEdit && agentStates.length === 0 && !agentStatesLoading) {
      setAgentStatesLoading(true);
      liveApi.getAgentStates()
        .then((data) => {
          setAgentStates(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          setAgentStates([]);
        })
        .finally(() => {
          setAgentStatesLoading(false);
        });
    }
  }, [tabValue, isEdit, agentStates.length, agentStatesLoading]);

  const handleChange = (field, value) => {
    onDirty?.(); // let embedded hosts (edit tabs) track unsaved changes
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
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
    if (!formData.email?.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!user && !formData.password) {
      newErrors.password = 'Password is required for new users';
    }
    if (!formData.environment_uuid) {
      newErrors.environment_uuid = 'Application is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    setApiError('');
    setSuccessMessage('');
    setSubmitAttempted(true);

    if (!validateForm()) {
      return;
    }

    if (!isEdit) {
      if (!extensionUsername) {
        setApiError('Device number is required');
        return;
      }
      if (!extensionValidation.valid) {
        setApiError('Device number is not available');
        return;
      }
    }

    const dataToSave = { ...formData };
    if (!dataToSave.password) {
      delete dataToSave.password;
    }

    if (dataToSave.skills && Array.isArray(dataToSave.skills)) {
      dataToSave.skills = dataToSave.skills.map(skill => skill.uuid);
    }

    const extensionData = !isEdit ? { username: extensionUsername } : null;

    if (isEdit && extensionUsername) {
      dataToSave.username = extensionUsername;
    }

    try {
      await onSave(dataToSave, extensionData);
      setSuccessMessage(
        isEdit
          ? 'User updated successfully!'
          : `User created successfully with device ${extensionUsername}`
      );
    } catch (error) {
      console.error('Save error:', error);
      if (is406Error(error)) {
        const serverErrors = parseServerErrors(error);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(prev => ({ ...prev, ...serverErrors }));
        }
      }
      if (error?.response?.data?.message) {
        setApiError(error.response.data.message);
      } else if (typeof error === 'string') {
        setApiError(error);
      } else {
        setApiError(isEdit ? 'Failed to update user' : 'Failed to create user');
      }
    }
  };

  const hasExtension = !!user?.extension?.uuid;

  const getLoginUrl = () => {
    // Display/enable only — the real phone open mints a short-lived token.
    return user?.extension?.login_address || (hasExtension ? `/tasks/webrtc?extension_uuid=${user.extension.uuid}` : null);
  };

  // QR is now token-gated (it expires); mint a token, then open the dialog
  // with a tokenized image URL.
  const handleOpenQrDialog = async () => {
    if (!hasExtension) return;
    setQrError('');
    try {
      const res = await extensionsApi.getWebrtcToken(user.extension.uuid);
      if (!res?.token) throw new Error('no token');
      setQrImageUrl(`/tasks/qrcode_extension/${user.extension.uuid}.png?va_token=${encodeURIComponent(res.token)}`);
      setQrDialogOpen(true);
    } catch {
      setQrError('Could not authorize the QR code. Please try again.');
      setQrDialogOpen(true);
    }
  };

  // The phone opens in the right-hand sidebar, signed in as this user's
  // device. The dialog closes first: it is modal, and would sit over it.
  const handleOpenPhone = () => {
    if (!user?.extension?.uuid) return;
    onClose?.();
    openPhoneAs({ ...user.extension, name: user.extension.name || user.name });
  };

  const handleDownloadQRCode = async () => {
    const qrUrl = qrImageUrl;
    if (!qrUrl) return;
    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `${user?.name || 'user'}-qrcode.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      window.URL.revokeObjectURL(url);
    } catch {
      const downloadLink = document.createElement('a');
      downloadLink.href = qrUrl;
      downloadLink.download = `${user?.name || 'user'}-qrcode.png`;
      downloadLink.target = '_blank';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  const [qrCopied, setQrCopied] = useState(false);
  const handleCopyQRCode = async () => {
    const qrUrl = qrImageUrl;
    if (!qrUrl) return;
    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setQrCopied(true);
      setTimeout(() => setQrCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(window.location.origin + qrUrl);
        setQrCopied(true);
        setTimeout(() => setQrCopied(false), 2000);
      } catch {
        console.error('Failed to copy QR code');
      }
    }
  };

  const handleResetPassword = async () => {
    setResetPasswordLoading(true);
    setResetPasswordError('');
    setGeneratedPassword('');
    setPasswordCopied(false);
    try {
      if (onResetPassword) {
        const result = await onResetPassword(user.uuid);
        setGeneratedPassword(result?.password || result?.data?.password || '');
      }
    } catch (error) {
      setResetPasswordError(error.message || 'Failed to reset password');
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const handleCopyPassword = async () => {
    if (generatedPassword) {
      try {
        await navigator.clipboard.writeText(generatedPassword);
        setPasswordCopied(true);
        setTimeout(() => setPasswordCopied(false), 2000);
      } catch {
        console.error('Failed to copy password');
      }
    }
  };

  const generateRandomPassword = (length) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleGenerateExtension = useCallback(async () => {
    if (!formData.environment_uuid) {
      setExtensionValidation({ valid: false, message: 'Select application first' });
      return;
    }
    setIsGeneratingExtension(true);
    try {
      const result = await customersApi.getNextExtension(formData.environment_uuid);
      setExtensionUsername(result.extension_number || result.username || result);
      setExtensionValidation({ valid: true, message: 'Available' });
    } catch (error) {
      console.error('Extension generation failed:', error);
      setExtensionValidation({ valid: false, message: 'Generation failed' });
    } finally {
      setIsGeneratingExtension(false);
    }
  }, [formData.environment_uuid]);

  const handleExtensionUsernameChange = async (value) => {
    setExtensionUsername(value);
    if (!value || !formData.environment_uuid) {
      if (!value) {
        setExtensionValidation({ valid: false, message: 'Device number is required' });
      }
      return;
    }
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }
    const timeout = setTimeout(async () => {
      try {
        const result = await customersApi.validateExtensionUsername(value, formData.environment_uuid);
        setExtensionValidation({
          valid: result.available,
          message: result.available ? 'Available' : result.message
        });
      } catch {
        setExtensionValidation({ valid: false, message: 'Validation failed' });
      }
    }, 500);
    setValidationTimeout(timeout);
  };

  const handleSetAgentStatus = async (stateName) => {
    if (!user?.uuid) return;
    setSettingAgentStatus(true);
    try {
      await queuesApi.setAgentStatus(user.uuid, stateName);
      setAgentStatusSnackbar({ open: true, message: `Agent status set to "${stateName}"`, severity: 'success' });
    } catch (error) {
      setAgentStatusSnackbar({ open: true, message: error?.message || 'Failed to set agent status', severity: 'error' });
    } finally {
      setSettingAgentStatus(false);
    }
  };

  useEffect(() => {
    if (extensionAutoGenerate && formData.environment_uuid && !isEdit) {
      handleGenerateExtension();
    }
  }, [formData.environment_uuid, extensionAutoGenerate, isEdit, handleGenerateExtension]);

  useEffect(() => {
    if (!open) {
      setExtensionUsername('');
      setExtensionAutoGenerate(true);
      setExtensionValidation({ valid: true, message: '' });
      setIsGeneratingExtension(false);
    }
  }, [open]);

  const editBody = (
    <>
        <DialogTitle
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}
        >
          {isEdit ? 'Edit User' : 'Create New User'}
          <IconButton
            edge="end"
            color="inherit"
            onClick={onClose}
            aria-label="close"
            disabled={loading}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
          {/* Alerts above tabs */}
          {(successMessage || apiError) && (
            <Box sx={{ px: 3, pt: 2 }}>
              {successMessage && (
                <Alert severity="success" sx={{ mb: 1 }} data-testid="success-message">
                  {successMessage}
                </Alert>
              )}
              {apiError && (
                <Alert severity="error" sx={{ mb: 1 }} data-testid="error-message">
                  {apiError}
                </Alert>
              )}
            </Box>
          )}

          {/* Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
            <Tabs
              value={tabValue}
              onChange={(_, newValue) => setTabValue(newValue)}
              aria-label="user dialog tabs"
            >
              <Tab label="Profile" />
              <Tab label="Resources & Skills" />
              {isEdit && <Tab label="Agent" />}
            </Tabs>
          </Box>

          {/* Tab 0: Profile */}
          {tabValue === 0 && (
            <Box sx={{ px: 3, py: 2 }}>
              <Box component="form" autoComplete="off" noValidate>
                <Grid container spacing={3} direction={embedded ? 'row' : 'column'}>
                  {/* Enabled — leads the form */}
                  <Grid size={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          data-testid="enabled-toggle"
                          checked={formData.enabled}
                          onChange={(e) => handleChange('enabled', e.target.checked)}
                          disabled={loading}
                        />
                      }
                      label="Enabled"
                    />
                  </Grid>

                  {/* Name */}
                  <Grid size={half}>
                    <TextField
                      label="Name"
                      fullWidth
                      required
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      error={!!errors.name || (submitAttempted && !formData.name?.trim())}
                      helperText={errors.name || (submitAttempted && !formData.name?.trim() ? 'Name is required' : '')}
                      disabled={loading}
                      placeholder="Full name"
                      autoComplete="off"
                      inputProps={{ 'data-testid': 'name-input', autoComplete: 'off' }}
                    />
                  </Grid>

                  {/* Email */}
                  <Grid size={half}>
                    <TextField
                      label="Email"
                      fullWidth
                      required
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      error={!!errors.email || (submitAttempted && !formData.email?.trim())}
                      helperText={errors.email || (submitAttempted && !formData.email?.trim() ? 'Email is required' : '')}
                      disabled={loading}
                      autoComplete="off"
                      inputProps={{ 'data-testid': 'email-input', autoComplete: 'off' }}
                    />
                  </Grid>

                  {/* Password - create only */}
                  {!isEdit && (
                    <Grid size={half}>
                      <SecretField
                        label="Password"
                        fullWidth
                        required
                        value={formData.password}
                        onChange={(e) => handleChange('password', e.target.value)}
                        error={!!errors.password || (submitAttempted && !formData.password)}
                        helperText={errors.password || (submitAttempted && !formData.password ? 'Password is required for new users' : 'Must have at least 4 characters')}
                        disabled={loading}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <Tooltip title="Generate secure password">
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={() => handleChange('password', generateRandomPassword(12))}
                                  disabled={loading}
                                  sx={{ textTransform: 'none', minWidth: 'auto', px: 2 }}
                                >
                                  Generate
                                </Button>
                              </Tooltip>
                            </InputAdornment>
                          )
                        }}
                        inputProps={{ 'data-testid': 'password-input' }}
                      />
                    </Grid>
                  )}

                  {/* Environment */}
                  <Grid size={half}>
                    <FormControl
                      fullWidth
                      disabled={loading}
                      required
                      error={!!errors.environment_uuid || (submitAttempted && !formData.environment_uuid)}
                    >
                      <InputLabel required>Application</InputLabel>
                      <Select
                        value={environments?.some(env => env.uuid === formData.environment_uuid) ? formData.environment_uuid : ''}
                        onChange={(e) => handleChange('environment_uuid', e.target.value)}
                        label="Application"
                        data-testid="environment-select"
                      >
                        <MenuItem value="">Select Application...</MenuItem>
                        {environments?.map((env) => (
                          <MenuItem key={env.uuid} value={env.uuid} data-testid="environment-option">
                            {env.name}
                          </MenuItem>
                        ))}
                      </Select>
                      {(errors.environment_uuid || (submitAttempted && !formData.environment_uuid)) && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                          {errors.environment_uuid || 'Application is required'}
                        </Typography>
                      )}
                    </FormControl>
                  </Grid>

                  {/* Extension Details — header only on create (explains auto-gen);
                      on edit the Username field sits inline for an even 2-col grid. */}
                  {!isEdit && (
                    <Grid size={12}>
                      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600, mt: 1 }}>
                        Device Details
                      </Typography>
                    </Grid>
                  )}

                  {/* Auto-generate toggle - create only */}
                  {!isEdit && (
                    <Grid size={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={extensionAutoGenerate}
                            onChange={(e) => setExtensionAutoGenerate(e.target.checked)}
                            disabled={loading || !formData.environment_uuid}
                          />
                        }
                        label="Auto-generate device number"
                      />
                    </Grid>
                  )}

                  {/* Extension Username */}
                  <Grid size={half}>
                    <TextField
                      label={isEdit ? 'Username (Device Number)' : 'Device Number'}
                      value={extensionUsername}
                      onChange={(e) => handleExtensionUsernameChange(e.target.value)}
                      disabled={(!isEdit && extensionAutoGenerate) || loading || !formData.environment_uuid}
                      required={!isEdit}
                      fullWidth
                      error={!isEdit && (!extensionValidation.valid || (submitAttempted && !extensionUsername))}
                      helperText={
                        isEdit
                          ? (extensionValidation.message || 'SIP device for phone registration')
                          : (!extensionValidation.valid
                              ? extensionValidation.message
                              : (submitAttempted && !extensionUsername ? 'Device number is required' : extensionValidation.message || 'Will use the same password as the user account.'))
                      }
                      placeholder={isEdit ? 'Enter username' : 'e.g., 1001'}
                      InputProps={{
                        endAdornment: !isEdit && extensionAutoGenerate && formData.environment_uuid && (
                          <InputAdornment position="end">
                            <Tooltip title="Generate new device number">
                              <IconButton
                                onClick={handleGenerateExtension}
                                size="small"
                                disabled={isGeneratingExtension || loading}
                              >
                                {isGeneratingExtension ? <CircularProgress size={20} /> : <RefreshIcon />}
                              </IconButton>
                            </Tooltip>
                          </InputAdornment>
                        )
                      }}
                      inputProps={{
                        'data-testid': 'extension-username-input',
                        pattern: '[0-9]*',
                        inputMode: 'numeric'
                      }}
                    />
                  </Grid>

                  {/* ACL */}
                  <Grid size={half}>
                    <ACLSelect
                      value={formData.acl_uuid}
                      onChange={(uuid) => handleChange('acl_uuid', uuid)}
                      acls={acls}
                      disabled={loading}
                      label="ACL"
                      helperText="Access control list defining user permissions"
                    />
                  </Grid>

                  {/* Status */}
                  <Grid size={half}>
                    <StatusSelect
                      value={formData.status_uuid}
                      onChange={(uuid) => handleChange('status_uuid', uuid)}
                      statuses={statuses}
                      disabled={loading}
                      label="Status"
                      helperText="User account status"
                    />
                  </Grid>

                  {/* User Actions - edit only */}
                  {isEdit && (
                    <Grid size={12}>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Tooltip title="Generate a new password for this user">
                          <Button
                            variant="outlined"
                            color="warning"
                            startIcon={resetPasswordLoading ? <CircularProgress size={18} /> : <LockReset />}
                            onClick={handleResetPassword}
                            disabled={loading || resetPasswordLoading}
                            sx={{ textTransform: 'none', minWidth: 150 }}
                          >
                            Reset Password
                          </Button>
                        </Tooltip>
                        {user?.extension && (
                          <Tooltip title="Open the phone as this user's device">
                            <Button
                              variant="outlined"
                              startIcon={<PhoneIcon />}
                              onClick={handleOpenPhone}
                              disabled={!hasExtension}
                              sx={{ textTransform: 'none', minWidth: 150 }}
                            >
                              Open phone
                            </Button>
                          </Tooltip>
                        )}
                        {user?.extension && (
                          <Tooltip title="Show QR code for WebRTC login">
                            <Button
                              variant="outlined"
                              startIcon={<QrCode2 />}
                              onClick={handleOpenQrDialog}
                              disabled={!getLoginUrl()}
                              sx={{ textTransform: 'none', minWidth: 150 }}
                            >
                              QR Code
                            </Button>
                          </Tooltip>
                        )}
                      </Box>

                      {resetPasswordError && (
                        <Alert severity="error" sx={{ mt: 1 }}>{resetPasswordError}</Alert>
                      )}
                      {generatedPassword && (
                        <Box sx={{ mt: 1.5, p: 2, backgroundColor: 'var(--mui-palette-surface-muted)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                            Generated Password
                          </Typography>
                          <SecretField
                            fullWidth
                            size="small"
                            value={generatedPassword}
                            revealed={showGeneratedPassword}
                            InputProps={{
                              readOnly: true,
                              sx: { fontFamily: 'monospace', fontSize: '0.9rem' },
                              endAdornment: (
                                <Box sx={{ display: 'flex' }}>
                                  <IconButton onClick={() => setShowGeneratedPassword(!showGeneratedPassword)} size="small">
                                    {showGeneratedPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                  </IconButton>
                                  <IconButton onClick={handleCopyPassword} size="small" color={passwordCopied ? 'success' : 'default'}>
                                    <ContentCopy fontSize="small" />
                                  </IconButton>
                                </Box>
                              )
                            }}
                          />
                          {passwordCopied && (
                            <Typography variant="caption" color="success.main">Copied to clipboard!</Typography>
                          )}
                          <Alert severity="warning" sx={{ mt: 1, fontSize: '0.75rem' }}>
                            Copy this password now — you won&apos;t see it again.
                          </Alert>
                        </Box>
                      )}
                    </Grid>
                  )}

                  {/* UUID — subtle read-only footer (edit only) */}
                  {isEdit && user?.uuid && (
                    <Grid size={12}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>UUID</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{user.uuid}</Typography>
                        <Tooltip title="Copy UUID">
                          <IconButton size="small" onClick={() => navigator.clipboard?.writeText(user.uuid)} sx={{ p: 0.25 }}>
                            <ContentCopy sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Box>
            </Box>
          )}

          {/* Tab 1: Resources & Skills */}
          {tabValue === 1 && (
            <Box sx={{ px: 3, py: 2 }}>
              <ResourcesManager
                resources={formData.resources}
                environmentUuid={formData.environment_uuid}
                onChange={(resources) => handleChange('resources', resources)}
                disabled={loading}
              />
              <Box sx={{ mt: 3 }}>
                <SkillEditor
                  entityType="user"
                  entityUuid={user?.uuid}
                  skills={formData.skills}
                  onSkillsChange={(skills) => handleChange('skills', skills)}
                  skillTypeFilter="user"
                  allowInlineCreate={true}
                  disabled={loading}
                  maxHeight={200}
                />
              </Box>
              <Box sx={{ mt: 3 }}>
                <TextField
                  label="Notes"
                  fullWidth
                  multiline
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  disabled={loading}
                  placeholder="Optional notes about this user..."
                  autoComplete="off"
                />
              </Box>
            </Box>
          )}

          {/* Tab 2: Agent (edit only) */}
          {tabValue === 2 && isEdit && (
            <Box sx={{ px: 3, py: 2 }}>
              {/* Current State */}
              {user?.state && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Current State
                  </Typography>
                  <Box sx={{ p: 2, backgroundColor: 'var(--mui-palette-surface-muted)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Typography variant="caption" color="text.secondary">State</Typography>
                        <Typography variant="body2" fontWeight={600}>{user.state.state}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Typography variant="caption" color="text.secondary">Status</Typography>
                        <Typography variant="body2" color="success.main">{user.state.status}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Typography variant="caption" color="text.secondary">Logged In</Typography>
                        <Typography variant="body2">{user.state.logged_in ? 'Yes' : 'No'}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">Total Calls</Typography>
                        <Typography variant="body2">{user.state.call_counter}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">Successful Calls</Typography>
                        <Typography variant="body2">{user.state.success_call_counter}</Typography>
                      </Grid>
                    </Grid>
                  </Box>
                </Box>
              )}

              {/* Set Agent Status */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Set Agent Status
                </Typography>
                {agentStatesLoading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">Loading states...</Typography>
                  </Box>
                ) : agentStates.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No agent states available.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {agentStates.map((state) => {
                      const stateName = typeof state === 'string' ? state : state.name || state.state || String(state);
                      return (
                        <Button
                          key={stateName}
                          variant="outlined"
                          size="small"
                          onClick={() => handleSetAgentStatus(stateName)}
                          disabled={settingAgentStatus}
                          sx={{ textTransform: 'none' }}
                        >
                          {stateName}
                        </Button>
                      );
                    })}
                  </Box>
                )}
              </Box>

              {/* Profile Properties */}
              <DynamicProfileEditor
                type="user"
                profile={formData.profile}
                onChange={(profile) => handleChange('profile', profile)}
                disabled={loading}
                title="Profile Properties"
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={loading} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          {canWrite && (
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : null}
              sx={{ textTransform: 'none', fontWeight: 600, px: 3 }}
              data-testid="submit-user-button"
            >
              {isEdit ? 'Update User' : 'Create User'}
            </Button>
          )}
        </DialogActions>
    </>
  );

  return (
    <>
      {embedded ? (
        <Box
          data-testid="user-edit-panel"
          sx={{
            flex: 1,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            bgcolor: 'var(--theme-bg-primary)',
          }}
        >
          {/* Full-width: the form uses the whole screen; content scrolls, the
              title and Save/Cancel footer stay pinned. */}
          <Box
            sx={{
              width: '100%',
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              '& .MuiDialogContent-root': { flex: 1, minHeight: 0 },
            }}
          >
            {editBody}
          </Box>
        </Box>
      ) : (
        <Dialog
          open={open}
          onClose={onClose}
          maxWidth="sm"
          fullWidth
          PaperProps={{ sx: { borderRadius: 2 } }}
        >
          {editBody}
        </Dialog>
      )}

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onClose={() => { setQrDialogOpen(false); setQrImageUrl(null); setQrError(''); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <QrCode2 color="primary" />
            QR Code - {user?.name}
          </Typography>
          <IconButton onClick={() => setQrDialogOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3 }}>
          {qrError && (
            <Alert severity="error" sx={{ width: '100%' }}>{qrError}</Alert>
          )}
          {qrImageUrl && (
            <>
              <Box sx={{ p: 2, bgcolor: 'var(--mui-palette-background-paper)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                <img
                  src={qrImageUrl}
                  alt={`QR Code for ${user?.name}`}
                  style={{ width: 200, height: 200, display: 'block' }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    if (e.target.nextSibling) {
                      e.target.nextSibling.style.display = 'block';
                    }
                  }}
                />
                <Typography
                  variant="body2"
                  color="error"
                  sx={{ display: 'none', textAlign: 'center', p: 2 }}
                >
                  Failed to load QR code
                </Typography>
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 2, textAlign: 'center', wordBreak: 'break-all', maxWidth: 280 }}
              >
                {getLoginUrl()}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={handleCopyQRCode}
            startIcon={<ContentCopy />}
            color={qrCopied ? 'success' : 'primary'}
            sx={{ textTransform: 'none' }}
          >
            {qrCopied ? 'Copied!' : 'Copy'}
          </Button>
          <Button
            variant="contained"
            onClick={handleDownloadQRCode}
            startIcon={<Download />}
            sx={{ textTransform: 'none' }}
          >
            Download
          </Button>
        </DialogActions>
      </Dialog>

      {/* Agent status snackbar */}
      <Snackbar
        open={agentStatusSnackbar.open}
        autoHideDuration={3000}
        onClose={() => setAgentStatusSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setAgentStatusSnackbar(prev => ({ ...prev, open: false }))}
          severity={agentStatusSnackbar.severity}
          sx={{ width: '100%' }}
        >
          {agentStatusSnackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default UserDialog;
