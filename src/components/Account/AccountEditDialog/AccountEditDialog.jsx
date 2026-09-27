import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  IconButton,
  CircularProgress,
  Grid,
  Typography,
  Alert,
  Box,
  Tooltip
} from '@mui/material';
import { Close as CloseIcon, LockReset, Visibility, VisibilityOff, ContentCopy, VpnKey } from '@mui/icons-material';
import { useState, useEffect } from 'react';
import DynamicProfileEditor from '../../common/DynamicProfileEditor/DynamicProfileEditor';
import { accountsApi } from '../../../services/api/accountsApi';
import SecretField from '../../common/SecretField.jsx';

/**
 * AccountEditDialog Component
 * Dialog for editing account information following EDIT_DIALOG_COMPREHENSIVE_GUIDE.md
 * - Vertical layout (maxWidth="sm", direction="column")
 * - All relevant fields from GET /api/accounts/{uuid}
 * - Enhanced data sections with gray backgrounds
 */
const AccountEditDialog = ({
  open,
  onClose,
  onSave,
  accountData,
  loading
}) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    notes: '',
    uuid: '',
    created_at: '',
    updated_at: '',
    enabled: true,
    customer: null,
    acl: null,
    meta: null,
    profile: {}
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Reset password state
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showGeneratedPassword, setShowGeneratedPassword] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);

  // Basic auth token state
  const [basicAuthToken, setBasicAuthToken] = useState('');
  const [basicAuthLoading, setBasicAuthLoading] = useState(false);
  const [basicAuthError, setBasicAuthError] = useState('');
  const [basicAuthCopied, setBasicAuthCopied] = useState(false);

  // Initialize form data when accountData changes
  useEffect(() => {
    if (accountData) {
      setFormData({
        name: accountData.name || '',
        email: accountData.email || '',
        notes: accountData.notes || '',
        uuid: accountData.uuid || '',
        created_at: accountData.created_at || '',
        updated_at: accountData.updated_at || '',
        enabled: accountData.enabled !== undefined ? accountData.enabled : true,
        customer: accountData.customer || null,
        acl: accountData.acl || null,
        meta: accountData.meta || null,
        profile: accountData.profile || {}
      });
    } else {
      setFormData({
        name: '',
        email: '',
        notes: '',
        uuid: '',
        created_at: '',
        updated_at: '',
        enabled: true,
        customer: null,
        acl: null,
        meta: null,
        profile: {}
      });
    }
    setErrors({});
    setApiError('');
    setSuccessMessage('');
  }, [accountData, open]);

  const handleChange = (field, value) => {
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
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setApiError('');
    setSuccessMessage('');

    try {
      await onSave(formData);
      setSuccessMessage('Account updated successfully');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error saving account:', error);
      setApiError(error.message || 'Failed to save account');
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  // Handle reset password - auto-generate via API (inline display)
  const handleResetPassword = async () => {
    setResetPasswordLoading(true);
    setResetPasswordError('');
    setGeneratedPassword('');
    setPasswordCopied(false);
    try {
      const result = await accountsApi.generateAccountPassword(formData.uuid);
      setGeneratedPassword(result?.password || result?.data?.password || '');
    } catch (error) {
      setResetPasswordError(error.message || 'Failed to reset password');
    } finally {
      setResetPasswordLoading(false);
    }
  };

  // Copy generated password to clipboard
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

  // Handle generate basic auth token
  const handleGenerateBasicAuth = async () => {
    setBasicAuthLoading(true);
    setBasicAuthError('');
    setBasicAuthToken('');
    setBasicAuthCopied(false);
    try {
      const result = await accountsApi.generateBasicAuth(formData.uuid);
      setBasicAuthToken(result?.basic_auth || '');
    } catch (error) {
      setBasicAuthError(error.message || 'Failed to generate basic auth token');
    } finally {
      setBasicAuthLoading(false);
    }
  };

  const handleCopyBasicAuth = async () => {
    if (basicAuthToken) {
      try {
        await navigator.clipboard.writeText(basicAuthToken);
        setBasicAuthCopied(true);
        setTimeout(() => setBasicAuthCopied(false), 2000);
      } catch {
        console.error('Failed to copy basic auth token');
      }
    }
  };

  return (
    <>
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      data-testid="account-edit-dialog"
    >
      <DialogTitle sx={{ pr: 6 }}>
        Edit Account
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

        <Grid container spacing={3} direction="column">
          {/* Editable Fields Section */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Name"
              variant="outlined"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              error={!!errors.name}
              helperText={errors.name}
              disabled={loading}
              data-testid="account-name-input"
              required
            />
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              label="Email"
              variant="outlined"
              value={formData.email}
              disabled
              helperText="Email cannot be changed"
            />
          </Grid>

          {/* Reset Password & Basic Auth Buttons */}
          {formData.uuid && (
            <Grid size={12}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Tooltip title="Generate a new password for this account">
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={resetPasswordLoading ? <CircularProgress size={18} /> : <LockReset />}
                    onClick={handleResetPassword}
                    disabled={loading || resetPasswordLoading}
                    sx={{ textTransform: 'none' }}
                  >
                    Reset Password
                  </Button>
                </Tooltip>
                <Tooltip title="Reset password and generate a Basic Auth token (Base64 encoded email:password)">
                  <Button
                    variant="outlined"
                    color="info"
                    startIcon={basicAuthLoading ? <CircularProgress size={18} /> : <VpnKey />}
                    onClick={handleGenerateBasicAuth}
                    disabled={loading || basicAuthLoading}
                    sx={{ textTransform: 'none' }}
                  >
                    Generate Basic Auth Token
                  </Button>
                </Tooltip>
              </Box>

              {/* Generated Password (inline) */}
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

              {/* Basic Auth Token (inline) */}
              {basicAuthError && (
                <Alert severity="error" sx={{ mt: 1 }}>{basicAuthError}</Alert>
              )}
              {basicAuthToken && (
                <Box sx={{ mt: 1.5, p: 2, backgroundColor: 'var(--mui-palette-surface-muted)', borderRadius: 1, border: '1px solid var(--mui-palette-divider)' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    Basic Auth Token
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={basicAuthToken}
                    InputProps={{
                      readOnly: true,
                      sx: { fontFamily: 'monospace', fontSize: '0.8rem' },
                      endAdornment: (
                        <IconButton onClick={handleCopyBasicAuth} size="small" color={basicAuthCopied ? 'success' : 'default'}>
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      )
                    }}
                  />
                  {basicAuthCopied && (
                    <Typography variant="caption" color="success.main">Copied to clipboard!</Typography>
                  )}
                  <Alert severity="warning" sx={{ mt: 1, fontSize: '0.75rem' }}>
                    This resets the account password. Copy the token now — you won&apos;t see it again.
                  </Alert>
                </Box>
              )}
            </Grid>
          )}

          <Grid size={12}>
            <TextField
              fullWidth
              label="Notes"
              variant="outlined"
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              disabled={loading}
              multiline
              rows={3}
              placeholder="Add notes about this account..."
            />
          </Grid>

          {/* Profile Editor - Dynamic fields from API */}
          <Grid size={12}>
            <DynamicProfileEditor
              type="account"
              profile={formData.profile}
              onChange={(profile) => handleChange('profile', profile)}
              disabled={loading}
              title="Profile Properties"
            />
          </Grid>

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
          disabled={loading}
          data-testid="submit-account-button"
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          Update Account
        </Button>
      </DialogActions>
    </Dialog>

    </>
  );
};

export default AccountEditDialog;
