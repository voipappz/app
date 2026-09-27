import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Divider,
  Alert,
  Card,
  CardContent,
  Grid,
  Chip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Delete as DeleteIcon,
  LockReset as LockResetIcon,
  Edit as EditIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import { formatDate } from '../../../utils/dateUtils';
import { usersApi } from '../../../services/api/usersApi';

/**
 * UserDetails Component
 * Displays and allows editing of user details
 */
const UserDetails = ({
  user,
  loading,
  error,
  onSave,
  onDelete,
  onResetPassword,
  isNew = false,
}) => {
  const [isEditing, setIsEditing] = useState(isNew);
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    role: 'user', // Keep role for now, va-voipbox-admin had it commented out but nimbus has it.
    acl_uuid: '', // New field for ACL
    status_uuid: '', // New field for Status
    phone: '',
    department: '',
  });

  const [acls, setAcls] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [aclsLoading, setAclsLoading] = useState(false);
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [aclsError, setAclsError] = useState(null);
  const [statusesError, setStatusesError] = useState(null);

  useEffect(() => {
    // Fetch ACLs
    const fetchAcls = async () => {
      setAclsLoading(true);
      try {
        const response = await usersApi.getAcls();
        setAcls(response);
      } catch (err) {
        console.error("Failed to fetch ACLs:", err);
        setAclsError("Failed to load ACLs.");
      } finally {
        setAclsLoading(false);
      }
    };

    // Fetch Statuses
    const fetchStatuses = async () => {
      setStatusesLoading(true);
      try {
        const response = await usersApi.getStatuses();
        setStatuses(response);
      } catch (err) {
        console.error("Failed to fetch statuses:", err);
        setStatusesError("Failed to load statuses.");
      } finally {
        setStatusesLoading(false);
      }
    };

    fetchAcls();
    fetchStatuses();
  }, []); // Run only on mount

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        role: user.role || 'user',
        acl_uuid: user.acl_uuid || '', // Initialize new field
        status_uuid: user.status_uuid || '', // Initialize new field
        phone: user.phone || '',
        department: user.department || '',
      });
      if (!isNew) {
        setIsEditing(false);
      }
    } else if (isNew) {
      setFormData({
        email: '',
        first_name: '',
        last_name: '',
        role: 'user',
        acl_uuid: '',
        status_uuid: '',
        phone: '',
        department: '',
      });
      setIsEditing(true);
    }
  }, [user, isNew]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(formData);
    if (!isNew) {
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    if (isNew) {
      // Reset form for new user
      setFormData({
        email: '',
        first_name: '',
        last_name: '',
        role: 'user',
        acl_uuid: '',
        status_uuid: '',
        phone: '',
        department: '',
      });
    } else {
      // Restore original user data
      setFormData({
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        role: user.role || 'user',
        acl_uuid: user.acl_uuid || '',
        status_uuid: user.status_uuid || '',
        phone: user.phone || '',
        department: user.department || '',
      });
      setIsEditing(false);
    }
  };

  const isFormValid = formData.email && formData.first_name && formData.last_name && formData.acl_uuid && formData.status_uuid;

  if (!user && !isNew) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          width: '100%',
        }}
      >
        <Typography variant="h6" color="text.secondary">
          Select a user from the list to view details
        </Typography>
      </Box>
    );
  }

  if (loading || aclsLoading || statusesLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading user details and options...</Typography>
      </Box>
    );
  }

  if (error || aclsError || statusesError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || aclsError || statusesError}</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: { xs: 1, sm: 2, md: 3 },
        height: '100%',
        overflow: 'auto',
        bgcolor: 'var(--mui-palette-background-paper)',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">
          {isNew ? 'New User' : isEditing ? 'Edit User' : 'User Details'}
        </Typography>
        {!isNew && !isEditing && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={() => setIsEditing(true)}
              disabled={loading}
            >
              Edit
            </Button>
            <Button
              variant="outlined"
              startIcon={<LockResetIcon />}
              onClick={() => onResetPassword(user)}
              disabled={loading}
            >
              Reset Password
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => onDelete(user)}
              disabled={loading}
            >
              Delete
            </Button>
          </Box>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* User Form */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Basic Information
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                <TextField
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                  fullWidth
                  disabled={!isEditing || (!isNew && user)}
                  helperText={!isNew ? 'Email cannot be changed' : ''}
                />
                <TextField
                  label="First Name"
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  required
                  fullWidth
                  disabled={!isEditing}
                />
                <TextField
                  label="Last Name"
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  required
                  fullWidth
                  disabled={!isEditing}
                />
                <TextField
                  label="Phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  fullWidth
                  disabled={!isEditing}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Role & Access
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                <FormControl fullWidth disabled={!isEditing || aclsLoading}>
                  <InputLabel id="acl-select-label">ACL</InputLabel>
                  <Select
                    labelId="acl-select-label"
                    value={acls?.some(acl => acl.uuid === formData.acl_uuid) ? formData.acl_uuid : ''}
                    label="ACL"
                    onChange={(e) => handleChange('acl_uuid', e.target.value)}
                    required
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {acls.map((acl) => (
                      <MenuItem key={acl.uuid} value={acl.uuid}>
                        {acl.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {aclsError && <Typography color="error">{aclsError}</Typography>}
                </FormControl>

                <TextField
                  label="Department"
                  value={formData.department}
                  onChange={(e) => handleChange('department', e.target.value)}
                  fullWidth
                  disabled={!isEditing}
                />
                <FormControl fullWidth disabled={!isEditing}>
                  <InputLabel>Role</InputLabel>
                  <Select
                    value={formData.role}
                    label="Role"
                    onChange={(e) => handleChange('role', e.target.value)}
                  >
                    <MenuItem value="user">User</MenuItem>
                    <MenuItem value="admin">Admin</MenuItem>
                    <MenuItem value="superadmin">Super Admin</MenuItem>
                    <MenuItem value="agent">Agent</MenuItem>
                    <MenuItem value="manager">Manager</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth disabled={!isEditing || statusesLoading}>
                  <InputLabel id="status-select-label">Status</InputLabel>
                  <Select
                    labelId="status-select-label"
                    value={statuses?.some(status => status.uuid === formData.status_uuid) ? formData.status_uuid : ''}
                    label="Status"
                    onChange={(e) => handleChange('status_uuid', e.target.value)}
                    required
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {statuses.map((status) => (
                      <MenuItem key={status.uuid} value={status.uuid}>
                        {status.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {statusesError && <Typography color="error">{statusesError}</Typography>}
                </FormControl>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {!isNew && !isEditing && (
          <Grid size={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Additional Information
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      User ID
                    </Typography>
                    <Typography variant="body2">{user.id || user.uuid || '-'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Status
                    </Typography>
                    <Box>
                      <Chip
                        label={user.status_name || user.status_uuid || '-'} // This will be replaced by user.status_name
                        size="small"
                        color={user.status_name === 'Active' ? 'success' : 'default'} // This will be dynamic based on status
                      />
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Created At
                    </Typography>
                    <Typography variant="body2">{formatDate(user.created_at)}</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Action Buttons */}
      {isEditing && (
        <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            startIcon={<CancelIcon />}
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={!isFormValid || loading}
          >
            {isNew ? 'Create User' : 'Save Changes'}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default UserDetails;
