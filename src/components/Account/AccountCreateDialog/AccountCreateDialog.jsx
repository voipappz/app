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
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  InputAdornment,
  Autocomplete,
  Checkbox,
  Chip,
  Box,
  Typography
} from '@mui/material';
import { Close as CloseIcon, Visibility, VisibilityOff, CloudQueue as CloudIcon, CheckBoxOutlineBlank, CheckBox as CheckBoxIcon } from '@mui/icons-material';
import { useState, useEffect } from 'react';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import SecretField from '../../common/SecretField.jsx';

const icon = <CheckBoxOutlineBlank fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

// No virtualized listbox here any more: the picker holds one searched page
// (100 rows), never the whole tenant, so there is nothing to virtualize.

/**
 * AccountCreateDialog Component
 * Dialog for creating new accounts (similar to Users creation)
 * Fields: name, email, password, resources (environments), acl_uuid, enabled
 */
const AccountCreateDialog = ({
  open,
  onClose,
  onSave,
  loading,
  environments,
  environmentsLoading,
  acls,
  aclsLoading,
  onSearchEnvironments
}) => {
  // Get currently selected environments from context to pre-select them
  const { selectedEnvironments } = useCustomerEnvironment();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    selectedEnvironments: [], // Array of environment objects
    acl_uuid: '',
    enabled: true
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [environmentSearchValue, setEnvironmentSearchValue] = useState('');

  // One request per pause in typing, not per keystroke.
  useEffect(() => {
    if (!open || !onSearchEnvironments) return undefined;
    const id = setTimeout(() => onSearchEnvironments(environmentSearchValue), 300);
    return () => clearTimeout(id);
  }, [open, environmentSearchValue, onSearchEnvironments]);

  // Reset form when dialog opens and pre-select currently selected environments
  useEffect(() => {
    if (open) {
      // Pre-select environments that are currently selected in the header
      const preSelectedEnvs = selectedEnvironments || [];

      setFormData({
        name: '',
        email: '',
        password: '',
        selectedEnvironments: preSelectedEnvs, // Pre-select current environments
        acl_uuid: '',
        enabled: true
      });
      setErrors({});
      setApiError('');
      setSuccessMessage('');
      setEnvironmentSearchValue('');
    }
  }, [open, selectedEnvironments]);

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

    if (!formData.email?.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.password?.trim()) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
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
    if (!validateForm()) {
      return;
    }

    setApiError('');
    setSuccessMessage('');

    try {
      // Build resources array from selected environments
      // Each environment gets two entries: "environment" and "environment_selected"
      const resources = [];
      formData.selectedEnvironments.forEach(env => {
        resources.push({
          type: 'environment',
          type_uuid: env.uuid
        });
        resources.push({
          type: 'environment_selected',
          type_uuid: env.uuid
        });
      });

      // Build the data to save
      const dataToSave = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        acl_uuid: formData.acl_uuid,
        enabled: formData.enabled,
        resources: resources
      };

      await onSave(dataToSave);
      setSuccessMessage('Account created successfully');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error creating account:', error);
      setApiError(error.message || 'Failed to create account');
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
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

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      data-testid="account-create-dialog"
    >
      <DialogTitle sx={{ pr: 6 }}>
        Add New Account
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
              required
              placeholder="Enter account name"
              autoFocus
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
              error={!!errors.email}
              helperText={errors.email}
              disabled={loading}
              required
              placeholder="Enter email address"
            />
          </Grid>

          <Grid size={12}>
            <SecretField
              fullWidth
              label="Password"
              variant="outlined"
              revealed={showPassword}
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              error={!!errors.password}
              helperText={errors.password || 'Minimum 6 characters'}
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

          {/* Environments - Multi-select with search and virtualization */}
          <Grid size={12}>
            <Autocomplete
              multiple
              options={environments || []}
              value={formData.selectedEnvironments}
              onChange={(_event, newValue) => {
                handleChange('selectedEnvironments', newValue);
              }}
              inputValue={environmentSearchValue}
              onInputChange={(_event, newInputValue) => {
                setEnvironmentSearchValue(newInputValue);
              }}
              filterOptions={(x) => x}
              getOptionLabel={(option) => option.name || ''}
              isOptionEqualToValue={(option, value) => option.uuid === value.uuid}
              loading={environmentsLoading}
              noOptionsText={environmentSearchValue ? 'No match' : 'Type to search applications'}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Applications"
                  placeholder="Type to search applications..."
                  variant="outlined"
                  required
                  error={!!errors.selectedEnvironments}
                  helperText={errors.selectedEnvironments || 'Type to search every application'}
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
                  <li key={key || option.uuid} {...optionProps} style={{ ...optionProps.style, display: 'flex', alignItems: 'center' }}>
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
              disabled={loading || environmentsLoading}
              disableCloseOnSelect
              limitTags={3}
            />
          </Grid>

          <Grid size={12}>
            <FormControl fullWidth required error={!!errors.acl_uuid}>
              <InputLabel>ACL (Role)</InputLabel>
              <Select
                value={formData.acl_uuid}
                label="ACL (Role)"
                onChange={(e) => handleChange('acl_uuid', e.target.value)}
                disabled={loading || aclsLoading}
              >
                {aclsLoading ? (
                  <MenuItem value="" disabled>
                    Loading ACLs...
                  </MenuItem>
                ) : (
                  acls?.map(acl => (
                    <MenuItem key={acl.uuid} value={acl.uuid}>
                      {acl.name}
                    </MenuItem>
                  ))
                )}
              </Select>
              {errors.acl_uuid && (
                <Alert severity="error" sx={{ mt: 1, py: 0 }}>
                  {errors.acl_uuid}
                </Alert>
              )}
            </FormControl>
          </Grid>

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
          disabled={loading || environmentsLoading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          Create Account
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AccountCreateDialog;
