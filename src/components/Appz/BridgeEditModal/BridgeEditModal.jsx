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
  FormHelperText,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  Paper,
  CircularProgress,
  IconButton,
  Alert,
  Chip,
  Grid
} from '@mui/material';
import {
  Extension as ExtensionIcon,
  Queue as QueueIcon,
  VoiceChat as IvrIcon,
  Settings as ConferenceIcon,
  RecordVoiceOver as AnnouncementIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import { apiService } from '../../../services/apiService';
import SecretField from '../../common/SecretField.jsx';

/**
 * Bridge Edit Modal Component
 * Modal for creating/editing bridge resources (extensions, queues, IVRs, conferences, announcements)
 * Based on legacy AngularJS patterns from va-voipbox-admin modals
 */
const BridgeEditModal = ({
  open,
  onClose,
  onSave,
  bridgeType,
  existingBridge = null,
  loading = false
}) => {
  const { selectedEnvironments } = useCustomerEnvironment();
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [metaFields, setMetaFields] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedAgents, setSelectedAgents] = useState([]);

  // Get bridge type configuration based on legacy patterns
  const getBridgeConfig = (type) => {
    const configs = {
      extension: {
        icon: ExtensionIcon,
        title: 'Device',
        fields: ['name', 'number', 'password', 'enabled', 'caller_id_name', 'caller_id_number'],
        hasProfile: true,
        hasAgents: false
      },
      queue: {
        icon: QueueIcon,
        title: 'Queue',
        fields: ['name', 'number', 'enabled', 'strategy', 'max_wait_time', 'caller_id_name'],
        hasProfile: true,
        hasAgents: true,
        hasAnnouncements: true
      },
      ivr: {
        icon: IvrIcon,
        title: 'IVR',
        fields: ['name', 'enabled', 'timeout', 'timeout_tries'],
        hasProfile: true,
        hasAgents: false,
        hasEntries: true
      },
      conference: {
        icon: ConferenceIcon,
        title: 'Conference',
        fields: ['name', 'number', 'enabled', 'pin', 'moderator_pin'],
        hasProfile: true,
        hasAgents: false
      },
      announcement: {
        icon: AnnouncementIcon,
        title: 'Announcement',
        fields: ['name', 'enabled', 'file_uuid'],
        hasProfile: false,
        hasAgents: false,
        hasFileUpload: true
      }
    };
    
    return configs[type] || configs.extension;
  };

  const config = getBridgeConfig(bridgeType);
  const IconComponent = config.icon;

  // Initialize form data based on bridge type and existing data
  useEffect(() => {
    if (open) {
      if (existingBridge) {
        // Edit mode - populate with existing data
        setFormData(existingBridge);
        
        // Handle meta fields for existing bridge
        if (existingBridge.meta && typeof existingBridge.meta === 'object') {
          const metaArray = Object.entries(existingBridge.meta).map(([key, value]) => ({ key, value }));
          setMetaFields(metaArray);
        }
        
        // Handle agents for queues
        if (bridgeType === 'queue' && existingBridge.agents) {
          setSelectedAgents(existingBridge.agents);
        }
        
      } else {
        // Create mode - initialize with defaults
        const defaultData = {
          name: '',
          enabled: true,
          environment_uuid: selectedEnvironments?.[0]?.uuid || ''
        };
        
        // Add bridge type specific defaults
        switch (bridgeType) {
          case 'extension':
            defaultData.number = '';
            defaultData.password = '';
            defaultData.caller_id_name = '';
            defaultData.caller_id_number = '';
            break;
          case 'queue':
            defaultData.number = '';
            defaultData.strategy = 'round_robin';
            defaultData.max_wait_time = 300;
            defaultData.caller_id_name = '';
            break;
          case 'ivr':
            defaultData.timeout = 5;
            defaultData.timeout_tries = 3;
            break;
          case 'conference':
            defaultData.number = '';
            defaultData.pin = '';
            defaultData.moderator_pin = '';
            break;
          case 'announcement':
            defaultData.file_uuid = '';
            break;
        }
        
        setFormData(defaultData);
        setMetaFields([]);
        setSelectedAgents([]);
      }
      
      setErrors({});
    }
  }, [open, existingBridge, bridgeType, selectedEnvironments]);

  // Load form dependencies (profile params, agents, announcements)
  useEffect(() => {
    const loadFormData = async () => {
      if (!open || !selectedEnvironments?.[0]) return;
      
      try {
        const environmentUuid = selectedEnvironments[0].uuid;
        
        // Profile params loading removed for simplicity - can be added later if needed
        
        // Load agents for queue management
        if (config.hasAgents && bridgeType === 'queue') {
          try {
            const agentsParams = new URLSearchParams({
              page: 1,
              per_page: 9999,
              search: JSON.stringify({
                enabled: true,
                environment_uuid: environmentUuid
              })
            });
            const agentsUrl = `/api/devices?${agentsParams.toString()}`;
            const agentsData = await apiService.get(agentsUrl, {}, 'fetching agents', false);
            setAgents(agentsData || []);
          } catch (error) {
            console.warn('Could not load agents:', error);
            setAgents([]);
          }
        }
        
        // Announcements loading removed for simplicity - can be added later if needed
        
      } catch (error) {
        console.error('Error loading form data:', error);
      }
    };

    loadFormData();
  }, [open, bridgeType, config, selectedEnvironments]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  // Meta field management (legacy pattern from new.js)
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

  // Agent management for queues
  const handleAgentToggle = (agent) => {
    setSelectedAgents(prev => {
      const isSelected = prev.some(a => a.uuid === agent.uuid);
      if (isSelected) {
        return prev.filter(a => a.uuid !== agent.uuid);
      } else {
        return [...prev, agent];
      }
    });
  };

  // Validation based on bridge type
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.environment_uuid) {
      newErrors.environment_uuid = 'Application is required';
    }
    
    // Bridge type specific validation
    switch (bridgeType) {
      case 'extension':
        if (!formData.number?.trim()) {
          newErrors.number = 'Device number is required';
        }
        if (!formData.password?.trim()) {
          newErrors.password = 'Password is required';
        }
        break;
      case 'queue':
        if (!formData.number?.trim()) {
          newErrors.number = 'Queue number is required';
        }
        if (!formData.strategy) {
          newErrors.strategy = 'Strategy is required';
        }
        break;
      case 'conference':
        if (!formData.number?.trim()) {
          newErrors.number = 'Conference number is required';
        }
        break;
      case 'announcement':
        if (!formData.file_uuid) {
          newErrors.file_uuid = 'Audio file is required';
        }
        break;
    }

    // Validate meta fields for duplicates
    const metaKeys = metaFields.map(field => field.key).filter(key => key.trim());
    const duplicateKeys = metaKeys.filter((key, index) => metaKeys.indexOf(key) !== index);
    
    if (duplicateKeys.length > 0) {
      newErrors.meta = 'Duplicate meta keys are not allowed';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) {
      return;
    }

    // Prepare data in legacy format
    const submitData = { ...formData };
    
    // Convert meta fields to object
    if (metaFields.length > 0) {
      const meta = {};
      metaFields.forEach(field => {
        if (field.key.trim() && field.value.trim()) {
          meta[field.key] = field.value;
        }
      });
      submitData.meta = meta;
    }
    
    // Add agents for queues
    if (bridgeType === 'queue' && selectedAgents.length > 0) {
      submitData.agents = selectedAgents.map(agent => agent.uuid);
    }

    onSave(submitData);
  };

  const isFormValid = formData.name && formData.environment_uuid;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconComponent />
          {existingBridge ? `Edit ${config.title}` : `Create New ${config.title}`}
        </Box>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            
            {/* Basic Information */}
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Basic Information</Typography>
              
              {/* Enabled Switch */}
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled}
                    onChange={(e) => handleChange('enabled', e.target.checked)}
                  />
                }
                label="Enabled"
                sx={{ mb: 2 }}
              />

              {/* Name and Environment */}
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextField
                  label="Name"
                  value={formData.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name}
                  placeholder={`Enter ${config.title.toLowerCase()} name`}
                />
                <FormControl fullWidth required error={!!errors.environment_uuid}>
                  <InputLabel>Application</InputLabel>
                  <Select
                    value={formData.environment_uuid || ''}
                    label="Application"
                    onChange={(e) => handleChange('environment_uuid', e.target.value)}
                  >
                    {selectedEnvironments?.map(env => (
                      <MenuItem key={env.uuid} value={env.uuid}>{env.name}</MenuItem>
                    ))}
                  </Select>
                  {errors.environment_uuid && (
                    <FormHelperText>{errors.environment_uuid}</FormHelperText>
                  )}
                </FormControl>
              </Box>

              {/* Bridge type specific fields */}
              {(bridgeType === 'extension' || bridgeType === 'queue' || bridgeType === 'conference') && (
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <TextField
                    label="Number"
                    value={formData.number || ''}
                    onChange={(e) => handleChange('number', e.target.value)}
                    required
                    fullWidth
                    error={!!errors.number}
                    helperText={errors.number}
                    placeholder={`Enter ${config.title.toLowerCase()} number`}
                  />
                  
                  {bridgeType === 'extension' && (
                    <SecretField
                      label="Password"
                      value={formData.password || ''}
                      onChange={(e) => handleChange('password', e.target.value)}
                      required
                      fullWidth
                      error={!!errors.password}
                      helperText={errors.password}
                      placeholder="Enter device password"
                    />
                  )}
                  
                  {bridgeType === 'queue' && (
                    <FormControl fullWidth required error={!!errors.strategy}>
                      <InputLabel>Strategy</InputLabel>
                      <Select
                        value={formData.strategy || ''}
                        label="Strategy"
                        onChange={(e) => handleChange('strategy', e.target.value)}
                      >
                        <MenuItem value="round_robin">Round Robin</MenuItem>
                        <MenuItem value="least_idle">Least Idle</MenuItem>
                        <MenuItem value="fewest_calls">Fewest Calls</MenuItem>
                        <MenuItem value="random">Random</MenuItem>
                      </Select>
                      {errors.strategy && <FormHelperText>{errors.strategy}</FormHelperText>}
                    </FormControl>
                  )}
                </Box>
              )}

              {/* Additional bridge type specific fields */}
              {bridgeType === 'extension' && (
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Caller ID Name"
                    value={formData.caller_id_name || ''}
                    onChange={(e) => handleChange('caller_id_name', e.target.value)}
                    fullWidth
                    placeholder="Display name for outbound calls"
                  />
                  <TextField
                    label="Caller ID Number"
                    value={formData.caller_id_number || ''}
                    onChange={(e) => handleChange('caller_id_number', e.target.value)}
                    fullWidth
                    placeholder="Number for outbound calls"
                  />
                </Box>
              )}

              {bridgeType === 'ivr' && (
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Timeout (seconds)"
                    value={formData.timeout || ''}
                    onChange={(e) => handleChange('timeout', parseInt(e.target.value) || 0)}
                    type="number"
                    fullWidth
                    inputProps={{ min: 1, max: 60 }}
                  />
                  <TextField
                    label="Timeout Tries"
                    value={formData.timeout_tries || ''}
                    onChange={(e) => handleChange('timeout_tries', parseInt(e.target.value) || 0)}
                    type="number"
                    fullWidth
                    inputProps={{ min: 1, max: 10 }}
                  />
                </Box>
              )}

              {bridgeType === 'conference' && (
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="PIN"
                    value={formData.pin || ''}
                    onChange={(e) => handleChange('pin', e.target.value)}
                    fullWidth
                    placeholder="Conference PIN (optional)"
                  />
                  <TextField
                    label="Moderator PIN"
                    value={formData.moderator_pin || ''}
                    onChange={(e) => handleChange('moderator_pin', e.target.value)}
                    fullWidth
                    placeholder="Moderator PIN (optional)"
                  />
                </Box>
              )}
            </Paper>

            {/* Queue Agents Management */}
            {bridgeType === 'queue' && (
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Queue Agents</Typography>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Selected Agents ({selectedAgents.length}):
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                    {selectedAgents.map(agent => (
                      <Chip
                        key={agent.uuid}
                        label={`${agent.name} (${agent.number})`}
                        onDelete={() => handleAgentToggle(agent)}
                        color="primary"
                        variant="outlined"
                      />
                    ))}
                  </Box>
                </Box>
                
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Available Agents:
                </Typography>
                <Grid container spacing={1}>
                  {agents.map(agent => {
                    const isSelected = selectedAgents.some(a => a.uuid === agent.uuid);
                    return (
                      <Grid size={{ xs: 6, sm: 4, md: 3 }} key={agent.uuid}>
                        <Button
                          variant={isSelected ? "contained" : "outlined"}
                          size="small"
                          fullWidth
                          onClick={() => handleAgentToggle(agent)}
                          sx={{ textTransform: 'none' }}
                        >
                          {agent.name} ({agent.number})
                        </Button>
                      </Grid>
                    );
                  })}
                </Grid>
              </Paper>
            )}

            {/* Meta Properties */}
            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Meta Properties</Typography>
                <Button onClick={addMetaField} startIcon={<AddIcon />} variant="outlined" size="small">
                  Add Property
                </Button>
              </Box>
              
              {errors.meta && (
                <Alert severity="error" sx={{ mb: 2 }}>{errors.meta}</Alert>
              )}
              
              {metaFields.map((field, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'flex-start' }}>
                  <TextField
                    label="Key"
                    value={field.key}
                    onChange={(e) => updateMetaField(index, 'key', e.target.value)}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Value"
                    value={field.value}
                    onChange={(e) => updateMetaField(index, 'value', e.target.value)}
                    fullWidth
                    size="small"
                  />
                  <IconButton onClick={() => removeMetaField(index)} color="error" size="small">
                    <DeleteIcon />
                  </IconButton>
                </Box>
              ))}
              
              {metaFields.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No meta properties defined. Click "Add Property" to add custom key-value pairs.
                </Typography>
              )}
            </Paper>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          disabled={!isFormValid || loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {existingBridge ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BridgeEditModal;