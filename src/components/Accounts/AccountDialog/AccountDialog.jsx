import {
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  IconButton,
  CircularProgress,
  Grid,
  Alert,
  FormControlLabel,
  Switch,
  InputAdornment,
  Autocomplete,
  Checkbox,
  Chip,
  Box,
  Typography,
  Popper,
  createFilterOptions,
  Tooltip
} from '@mui/material';
import { ResponsiveDialog as Dialog } from '../../ui'; // full screen on a phone
import {
  Close as CloseIcon,
  Visibility,
  VisibilityOff,
  CloudQueue as CloudIcon,
  CheckBoxOutlineBlank,
  CheckBox as CheckBoxIcon,
  LockReset,
  ContentCopy as CopyIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Logout as LogoutIcon,
  Translate as TranslateIcon,
  DarkModeOutlined as DarkModeIcon,
  LightModeOutlined as LightModeIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../../i18n/LocaleContext';
import { useThemeMode } from '../../../context/ThemeContext';
import { useState, useEffect, forwardRef } from 'react';
import { FixedSizeList } from 'react-window';
import { ACLSelect } from '../../common/ACLSelect';
import { accountsApi } from '../../../services/api/accountsApi';
import { parseServerErrors, is406Error } from '../../../utils/formValidation';
import SecretField from '../../common/SecretField.jsx';

const icon = <CheckBoxOutlineBlank fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

// Create filter options for better search/filter functionality
const filterOptions = createFilterOptions({
  matchFrom: 'any',
  stringify: (option) => option.name || ''
});

// Virtualized Listbox for large lists
const LISTBOX_PADDING = 8;
const ITEM_HEIGHT = 48;
const MAX_VISIBLE_ITEMS = 8;

const VirtualizedListbox = forwardRef(function VirtualizedListbox(props, ref) {
  const { children, ...other } = props;
  const itemData = children;
  const itemCount = itemData.length;
  const listHeight = Math.min(itemCount, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT + 2 * LISTBOX_PADDING;

  return (
    <div ref={ref} {...other}>
      <FixedSizeList
        height={listHeight}
        width="100%"
        itemSize={ITEM_HEIGHT}
        itemCount={itemCount}
        overscanCount={5}
      >
        {({ index, style }) => (
          <div style={{ ...style, top: style.top + LISTBOX_PADDING }}>
            {itemData[index]}
          </div>
        )}
      </FixedSizeList>
    </div>
  );
});

// Custom Popper for large lists
const VirtualizedPopper = (props) => {
  return <Popper {...props} placement="bottom-start" style={{ width: props.anchorEl?.clientWidth || 300 }} />;
};

/**
 * AccountDialog Component
 * Dialog for creating and editing accounts
 */
const AccountDialog = ({
  onSignOut = null, // present only when editing YOUR OWN account (topbar avatar)
  open,
  onClose,
  onSave,
  account,
  loading,
  environments = [],
  // Offered in the picker: the top bar's selection. The account's own
  // applications stay in the field even when not selected up there.
  selectableEnvironments = null,
  environmentsLoading,
  acls = [],
  aclsLoading,
  canWrite = true // defaults true so the self-profile path (topbar avatar) stays editable
}) => {
  const isEditMode = !!account;
  // Read-only view: no write permission → show details, disable inputs, hide write actions.
  const readOnly = !canWrite;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    selectedEnvironments: [],
    acl_uuid: '',
    enabled: true,
    notes: ''
  });
  const [metaFields, setMetaFields] = useState([]);

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  // Your own account (onSignOut set) also holds your appearance: language and theme.
  const { t } = useTranslation();
  const { language, setLanguage } = useLocale();
  const { isDarkMode, toggleTheme } = useThemeMode();
  const otherLanguage = language === 'he' ? 'en' : 'he';
  const [successMessage, setSuccessMessage] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [environmentSearchValue, setEnvironmentSearchValue] = useState('');

  // Reset password state
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);

  // Basic auth token state
  const [basicAuthDialogOpen, setBasicAuthDialogOpen] = useState(false);
  const [generatedBasicAuth, setGeneratedBasicAuth] = useState('');
  const [basicAuthLoading, setBasicAuthLoading] = useState(false);
  const [basicAuthError, setBasicAuthError] = useState('');
  const [basicAuthCopied, setBasicAuthCopied] = useState(false);

  // Initialize form data when account changes
  useEffect(() => {
    if (account) {
      // Get selected environments from account.resources
      const selectedEnvs = [];
      if (account.resources && Array.isArray(account.resources)) {
        const envUuids = new Set();
        account.resources.forEach(res => {
          if (res.type === 'environment' && res.type_uuid) {
            envUuids.add(res.type_uuid);
          }
        });
        envUuids.forEach(uuid => {
          const env = environments.find(e => e.uuid === uuid);
          if (env) {
            selectedEnvs.push(env);
          }
        });
      }

      setFormData({
        name: account.name || '',
        email: account.email || '',
        password: '', // Never populate password
        selectedEnvironments: selectedEnvs,
        acl_uuid: account.acl?.uuid || account.acl_uuid || '',
        enabled: account.enabled !== undefined ? account.enabled : true,
        notes: account.notes || '',
      });

      // Initialize meta fields from account data
      if (account.meta && typeof account.meta === 'object') {
        const metaArray = Object.entries(account.meta).map(([key, value]) => ({ key, value: String(value) }));
        setMetaFields(metaArray);
      } else {
        setMetaFields([]);
      }
    } else {
      setFormData({
        name: '',
        email: '',
        password: '',
        // Create: default to the applications picked in the top selector — the
        // `environments` prop IS the selector's current selection.
        selectedEnvironments: environments || [],
        acl_uuid: '',
        enabled: true,
        notes: '',
      });
      setMetaFields([]);
    }
    setErrors({});
    setApiError('');
    setSuccessMessage('');
    setSubmitAttempted(false);
    setEnvironmentSearchValue('');
  }, [account, open, environments]);

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

    // Password is required only for create mode
    if (!isEditMode) {
      if (!formData.password?.trim()) {
        newErrors.password = 'Password is required';
      } else if (formData.password.length < 6) {
        newErrors.password = 'Password must be at least 6 characters';
      }
    }

    if (formData.selectedEnvironments.length === 0) {
      newErrors.selectedEnvironments = 'At least one environment is required';
    }

    if (!formData.acl_uuid) {
      newErrors.acl_uuid = 'ACL is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    setApiError('');
    setSuccessMessage('');

    if (!validateForm()) {
      return;
    }

    try {
      // Extract environment UUIDs from selected environments
      // API expects 'environments' parameter as simple array of UUIDs for both CREATE and UPDATE
      const environmentUuids = formData.selectedEnvironments.map(env => env.uuid);

      // Build the data to save
      const dataToSave = {
        name: formData.name,
        email: formData.email,
        acl_uuid: formData.acl_uuid,
        enabled: formData.enabled ? 'true' : 'false',
        notes: formData.notes,
        environments: environmentUuids  // Simple array of environment UUIDs
      };

      // Convert meta fields to object
      if (metaFields.length > 0) {
        const meta = {};
        metaFields.forEach(field => {
          if (field.key.trim()) {
            meta[field.key] = field.value;
          }
        });
        dataToSave.meta = meta;
      }

      // Root is not editable: cross-tenant access comes from VA_ROOT on the API.

      // Only include password for create mode
      if (!isEditMode && formData.password) {
        dataToSave.password = formData.password;
      }

      await onSave(dataToSave);
      setSuccessMessage(isEditMode ? 'Account updated successfully' : 'Account created successfully');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error saving account:', error);
      // Parse 406 validation errors from server
      if (is406Error(error)) {
        const serverErrors = parseServerErrors(error);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(prev => ({ ...prev, ...serverErrors }));
        }
      }
      setApiError(error?.response?.data?.message || error?.message || 'Failed to save account');
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  // Password visibility toggle
  const handleTogglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
  };

  // Reset password dialog handlers
  const handleOpenResetPassword = async () => {
    setGeneratedPassword('');
    setResetPasswordError('');
    setPasswordCopied(false);
    setResetPasswordDialogOpen(true);
    setResetPasswordLoading(true);

    try {
      // Call API to generate new password
      const response = await accountsApi.generateAccountPassword(account.uuid || account.id);
      if (response && response.password) {
        setGeneratedPassword(response.password);
        setSuccessMessage('New password generated successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Error generating password:', error);
      setResetPasswordError(error.message || 'Failed to generate password');
      setResetPasswordDialogOpen(false);
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy password:', error);
      setResetPasswordError('Failed to copy password to clipboard');
    }
  };

  // Basic auth token handlers
  const handleGenerateBasicAuth = async () => {
    setGeneratedBasicAuth('');
    setBasicAuthError('');
    setBasicAuthCopied(false);
    setBasicAuthDialogOpen(true);
    setBasicAuthLoading(true);

    try {
      const response = await accountsApi.generateBasicAuth(account.uuid || account.id);
      if (response && response.basic_auth) {
        setGeneratedBasicAuth(response.basic_auth);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Error generating basic auth token:', error);
      setBasicAuthError(error.message || 'Failed to generate basic auth token');
      setBasicAuthDialogOpen(false);
    } finally {
      setBasicAuthLoading(false);
    }
  };

  const handleCopyBasicAuth = async () => {
    try {
      await navigator.clipboard.writeText(generatedBasicAuth);
      setBasicAuthCopied(true);
      setTimeout(() => setBasicAuthCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy basic auth token:', error);
      setBasicAuthError('Failed to copy to clipboard');
    }
  };

  // Get environment type color
  const getEnvironmentTypeColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'production':
        return 'success';
      case 'development':
        return 'info';
      case 'testing':
        return 'warning';
      default:
        return 'default';
    }
  };

  const pickerOptions = (() => {
    if (!selectableEnvironments) return environments || [];
    const byUuid = new Map(selectableEnvironments.map((e) => [e.uuid, e]));
    (formData.selectedEnvironments || []).forEach((e) => { if (e?.uuid && !byUuid.has(e.uuid)) byUuid.set(e.uuid, e); });
    return [...byUuid.values()];
  })();

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        data-testid="account-dialog"
      >
        <DialogTitle sx={{ pr: 6 }}>
          {readOnly ? 'Account Details' : isEditMode ? 'Edit Account' : 'Add New Account'}
          {onSignOut && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="account-dialog-identity">
              {t('signedInAs.admin')}{account?.email ? ` · ${account.email}` : ''}
            </Typography>
          )}
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
            {/* UUID Field - Read Only with copy (only shown in edit mode) */}
            {isEditMode && account?.uuid && (
              <Grid size={12}>
                <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 70, fontWeight: 600 }}>UUID</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{account.uuid}</Typography>
                    <Tooltip title="Copy UUID">
                      <IconButton size="small" onClick={() => navigator.clipboard?.writeText(account.uuid)} sx={{ p: 0.25 }}>
                        <CopyIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Grid>
            )}

            {/* Enabled + Root toggles */}
            <Grid size={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled}
                    onChange={(e) => handleChange('enabled', e.target.checked)}
                    disabled={loading || readOnly}
                  />
                }
                label="Enabled"
              />
            </Grid>

            <Grid size={12}>
              <TextField
                fullWidth
                label="Name"
                variant="outlined"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                error={!!errors.name || (submitAttempted && !formData.name?.trim())}
                helperText={errors.name || (submitAttempted && !formData.name?.trim() ? 'Name is required' : '')}
                disabled={loading || readOnly}
                required
                placeholder="Enter account name"
                autoFocus={!isEditMode}
              />
            </Grid>

            <Grid size={12}>
              <TextField
                fullWidth
                label="Email"
                variant="outlined"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                error={!!errors.email || (submitAttempted && !formData.email?.trim())}
                helperText={errors.email || (submitAttempted && !formData.email?.trim() ? 'Email is required' : '')}
                disabled={loading || readOnly}
                required
                placeholder="Enter email address"
              />
            </Grid>

            {/* Password field - only for create mode */}
            {!isEditMode && (
              <Grid size={12}>
                <SecretField
                  fullWidth
                  label="Password"
                  variant="outlined"
                  revealed={showPassword}
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  error={!!errors.password || (submitAttempted && !formData.password?.trim())}
                  helperText={errors.password || (submitAttempted && !formData.password?.trim() ? 'Password is required' : 'Minimum 6 characters')}
                  disabled={loading}
                  required
                  placeholder="Enter password"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={handleTogglePasswordVisibility}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />
              </Grid>
            )}

            {/* Reset Password & Generate Basic Auth - only for edit mode with write access */}
            {isEditMode && canWrite && (
              <Grid size={12}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Tooltip title="Change account password">
                    <Button
                      variant="outlined"
                      color="warning"
                      startIcon={<LockReset />}
                      onClick={handleOpenResetPassword}
                      disabled={loading}
                      sx={{ textTransform: 'none' }}
                    >
                      Change Password
                    </Button>
                  </Tooltip>
                  <Tooltip title="Generate a Basic Auth token (resets password)">
                    <Button
                      variant="outlined"
                      color="info"
                      startIcon={<CopyIcon />}
                      onClick={handleGenerateBasicAuth}
                      disabled={loading}
                      sx={{ textTransform: 'none' }}
                    >
                      Generate Basic Auth Token
                    </Button>
                  </Tooltip>
                </Box>
              </Grid>
            )}

            {/* Environments - Multi-select with search and virtualization */}
            <Grid size={12}>
              <Autocomplete
                multiple
                options={pickerOptions}
                value={formData.selectedEnvironments}
                onChange={(_event, newValue) => {
                  handleChange('selectedEnvironments', newValue);
                }}
                inputValue={environmentSearchValue}
                onInputChange={(_event, newInputValue) => {
                  setEnvironmentSearchValue(newInputValue);
                }}
                filterOptions={filterOptions}
                getOptionLabel={(option) => option.name || ''}
                isOptionEqualToValue={(option, value) => option.uuid === value.uuid}
                ListboxComponent={pickerOptions.length > 100 ? VirtualizedListbox : undefined}
                PopperComponent={environments?.length > 100 ? VirtualizedPopper : undefined}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={`Applications${environments?.length > 100 ? ` (${environments.length})` : ''}`}
                    placeholder="Type to search applications..."
                    variant="outlined"
                    required
                    error={!!errors.selectedEnvironments || (submitAttempted && formData.selectedEnvironments.length === 0)}
                    helperText={errors.selectedEnvironments || (submitAttempted && formData.selectedEnvironments.length === 0 ? 'At least one environment is required' : '')}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <CloudIcon sx={{ ml: 1, mr: 0.5, color: 'action.active' }} />
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                renderOption={(props, option, { selected }) => {
                  const { key, ...optionProps } = props;
                  return (
                    <li key={key || option.uuid} {...optionProps} style={{ ...optionProps.style, height: ITEM_HEIGHT, display: 'flex', alignItems: 'center' }}>
                      <Checkbox
                        icon={icon}
                        checkedIcon={checkedIcon}
                        style={{ marginRight: 8 }}
                        checked={selected}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
                        <Box sx={{ flex: 1, overflow: 'hidden' }}>
                          <Typography variant="body2" noWrap>{option.name}</Typography>
                        </Box>
                        {option.type && (
                          <Chip
                            label={option.type}
                            size="small"
                            color={getEnvironmentTypeColor(option.type)}
                            sx={{ ml: 1, flexShrink: 0 }}
                          />
                        )}
                      </Box>
                    </li>
                  );
                }}
                renderTags={(tagValue, getTagProps) => {
                  const numTags = tagValue.length;
                  const limitTags = 3;

                  return (
                    <>
                      {tagValue.slice(0, limitTags).map((option, index) => {
                        const { key, ...tagProps } = getTagProps({ index });
                        return (
                          <Chip
                            key={key || option.uuid}
                            label={option.name}
                            size="small"
                            {...tagProps}
                          />
                        );
                      })}

                      {numTags > limitTags && (
                        <Typography variant="body2" sx={{ ml: 1 }}>
                          +{numTags - limitTags} more
                        </Typography>
                      )}
                    </>
                  );
                }}
                disabled={loading || environmentsLoading || readOnly}
                disableCloseOnSelect
                limitTags={3}
              />
            </Grid>

            {/* ACL Field with inline Create/Edit */}
            <Grid size={12}>
              <ACLSelect
                value={formData.acl_uuid}
                onChange={(uuid) => handleChange('acl_uuid', uuid)}
                acls={acls}
                loading={aclsLoading}
                disabled={loading || readOnly}
                label="ACL (Role)"
                required
                error={!!errors.acl_uuid}
                helperText={errors.acl_uuid}
              />
            </Grid>

            {/* Meta Properties */}
            <Grid size={12}>
              <Box sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">Meta Properties</Typography>
                  {canWrite && (
                    <Button onClick={addMetaField} startIcon={<AddIcon />} variant="outlined" size="small">
                      Add Property
                    </Button>
                  )}
                </Box>
                {metaFields.map((field, index) => (
                  <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField
                      label="Key"
                      value={field.key}
                      onChange={(e) => updateMetaField(index, 'key', e.target.value)}
                      size="small"
                      disabled={loading || readOnly}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="Value"
                      value={field.value}
                      onChange={(e) => updateMetaField(index, 'value', e.target.value)}
                      size="small"
                      disabled={loading || readOnly}
                      sx={{ flex: 2 }}
                    />
                    {canWrite && (
                      <IconButton onClick={() => removeMetaField(index)} color="error" size="small">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                ))}
                {metaFields.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No meta properties defined.
                  </Typography>
                )}
              </Box>
            </Grid>

            {/* Notes Field - always last in the form body */}
            <Grid size={12}>
              <TextField
                fullWidth
                label="Notes"
                variant="outlined"
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                disabled={loading || readOnly}
                multiline
                rows={2}
                placeholder="Add notes about this account..."
              />
            </Grid>
          </Grid>

          {/* Your own account also holds this browser's appearance. Kept out of
              the button row below, which must fit on a phone. */}
          {onSignOut && (
            <Box
              data-testid="account-dialog-appearance"
              sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2, pt: 2, borderTop: '1px solid var(--mui-palette-divider)' }}
            >
              <Button
                variant="outlined"
                size="small"
                onClick={() => setLanguage(otherLanguage)}
                startIcon={<TranslateIcon />}
                aria-label={t('appearance.switchLanguage')}
                data-testid="account-dialog-language"
                sx={{ textTransform: 'none' }}
              >
                {t(`languageName.${otherLanguage}`)}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={toggleTheme}
                startIcon={isDarkMode ? <LightModeIcon /> : <DarkModeIcon />}
                data-testid="account-dialog-theme"
                sx={{ textTransform: 'none' }}
              >
                {t(isDarkMode ? 'appearance.lightMode' : 'appearance.darkMode')}
              </Button>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {onSignOut && (
            <>
              <Button
                onClick={onSignOut}
                color="error"
                variant="contained"
                disableElevation
                startIcon={<LogoutIcon />}
                sx={{ textTransform: 'none' }}
              >
                {t('accountDialog.signOut')}
              </Button>
              <Box sx={{ flex: 1 }} />
            </>
          )}
          <Button
            onClick={handleClose}
            disabled={loading}
            variant="outlined"
          >
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {canWrite && (
            <Button
              onClick={handleSubmit}
              variant="contained"
              color="primary"
              disabled={loading || environmentsLoading}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              {isEditMode ? 'Update Account' : 'Create Account'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Basic Auth Token Dialog */}
      <Dialog
        open={basicAuthDialogOpen}
        onClose={() => !basicAuthLoading && setBasicAuthDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CopyIcon color="info" />
            Basic Auth Token
          </Typography>
          <IconButton
            onClick={() => setBasicAuthDialogOpen(false)}
            size="small"
            disabled={basicAuthLoading}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {basicAuthError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {basicAuthError}
            </Alert>
          )}
          {basicAuthLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
              <Typography variant="body2" sx={{ ml: 2 }}>Generating basic auth token...</Typography>
            </Box>
          ) : generatedBasicAuth ? (
            <>
              <Alert severity="warning" sx={{ mb: 2 }}>
                This resets the account password. The previous password will no longer work.
              </Alert>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Copy this token and use it for API authentication. It will not be shown again.
              </Typography>
              <Box sx={{
                p: 2,
                backgroundColor: 'var(--mui-palette-surface-muted)',
                borderRadius: 1,
                border: '1px solid var(--mui-palette-divider)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                mb: 2
              }}>
                <Typography
                  variant="body2"
                  fontFamily="monospace"
                  sx={{
                    fontWeight: 600,
                    color: 'info.main',
                    wordBreak: 'break-all',
                    flex: 1
                  }}
                >
                  {generatedBasicAuth}
                </Typography>
                <Tooltip title={basicAuthCopied ? "Copied!" : "Copy to clipboard"}>
                  <IconButton
                    onClick={handleCopyBasicAuth}
                    color={basicAuthCopied ? "success" : "primary"}
                    size="small"
                    sx={{ flexShrink: 0 }}
                  >
                    <CopyIcon />
                  </IconButton>
                </Tooltip>
              </Box>
              {basicAuthCopied && (
                <Alert severity="success" sx={{ mb: 1 }}>
                  Token copied to clipboard!
                </Alert>
              )}
            </>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setBasicAuthDialogOpen(false)}
            variant="contained"
            disabled={basicAuthLoading}
            sx={{ textTransform: 'none' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={resetPasswordDialogOpen}
        onClose={() => !resetPasswordLoading && setResetPasswordDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockReset color="warning" />
            Reset Password
          </Typography>
          <IconButton
            onClick={() => setResetPasswordDialogOpen(false)}
            size="small"
            disabled={resetPasswordLoading}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {resetPasswordError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {resetPasswordError}
            </Alert>
          )}
          {resetPasswordLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
              <Typography variant="body2" sx={{ ml: 2 }}>Generating new password...</Typography>
            </Box>
          ) : generatedPassword ? (
            <>
              <Alert severity="success" sx={{ mb: 2 }}>
                A new password has been generated for this account
              </Alert>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Copy this password and share it securely with the user. This password will not be shown again.
              </Typography>
              <Box sx={{
                p: 2,
                backgroundColor: 'var(--mui-palette-surface-muted)',
                borderRadius: 1,
                border: '1px solid var(--mui-palette-divider)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2
              }}>
                <Typography
                  variant="h6"
                  fontFamily="monospace"
                  sx={{
                    letterSpacing: 2,
                    fontWeight: 600,
                    color: 'primary.main'
                  }}
                >
                  {generatedPassword}
                </Typography>
                <Tooltip title={passwordCopied ? "Copied!" : "Copy to clipboard"}>
                  <IconButton
                    onClick={handleCopyPassword}
                    color={passwordCopied ? "success" : "primary"}
                    size="small"
                  >
                    <CopyIcon />
                  </IconButton>
                </Tooltip>
              </Box>
              {passwordCopied && (
                <Alert severity="success" sx={{ mb: 1 }}>
                  Password copied to clipboard!
                </Alert>
              )}
            </>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setResetPasswordDialogOpen(false)}
            variant="contained"
            disabled={resetPasswordLoading}
            sx={{ textTransform: 'none' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AccountDialog;
