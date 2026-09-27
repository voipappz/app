import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiService } from '../../../services/apiService';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import BridgeEditModal from '../BridgeEditModal/BridgeEditModal';
import {
  Box,
  Typography,
  TextField,
  Card,
  CardContent,
  Grid,
  Alert,
  CircularProgress,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormHelperText,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  CloudUpload as CloudUploadIcon,
  Create as CreateIcon,
  Clear as ClearIcon,
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';

// The API serves extensions at /api/devices and environments at /api/applications;
// every other resource type is still its plural.
const API_RESOURCE_PATHS = { extension: 'devices', environment: 'applications' };
const apiResourcePath = (type) => API_RESOURCE_PATHS[type] || `${type}s`;

/**
 * Enhanced Schema Form Component
 * Handles complex nested schema structures with object fields, multiple entries, 
 * and various input types as defined in the legacy VML structures
 */
const EnhancedSchemaForm = ({
  schemaType,
  schemaStructure,
  loading,
  error,
  errorsList = {},  // Field-level errors passed from parent
  bulk,             // Optional: when provided, render the batch UX panel for SMS-style bulk creation
  canWrite = true   // ACL: when false, hide/disable schema-creation controls
  // Note: onSubmit is not used here - EnhancedSchemaForm has its own handleSubmit
  // Note: VoIP resources props available for select_with_action fields
  // bridgeTypes = [],
  // voipResources = {},
  // onFetchVoipResources,
  // onFetchEnvironmentResources
}) => {
  const { selectedEnvironments, selectedCustomer, fetchEnvironments } = useCustomerEnvironment();
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [dynamicSelectData, setDynamicSelectData] = useState({});
  const [dynamicFields, setDynamicFields] = useState({}); // Store dynamically loaded fields (e.g., products for a plan)
  // Bridge editing modal state
  const [bridgeModalOpen, setBridgeModalOpen] = useState(false);
  const [bridgeModalType, setBridgeModalType] = useState(null);
  const [bridgeModalLoading, setBridgeModalLoading] = useState(false);
  // Resource list state - shows created resources for current schema type
  const [resourceList, setResourceList] = useState([]);
  const [resourceListLoading, setResourceListLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // Ref for the bulk CSV file input (only used when bulk prop is provided)
  const bulkFileInputRef = useRef(null);

  // AppDB - internal registry that tracks unique identifiers from each section
  // This enables cross-section linking (e.g., DID bridge_uuid -> extension username)
  // Pattern from legacy AngularJS: when bridge_type=extension, bridge_uuid options come from extension usernames
  const [appDB, setAppDB] = useState({});

  // Initialize form data based on schema structure
  useEffect(() => {
    if (schemaStructure && typeof schemaStructure === 'object') {
      const initialData = {};
      Object.entries(schemaStructure).forEach(([sectionKey, sectionData]) => {
        if (sectionData.fields) {
          if (sectionData.multiple) {
            initialData[sectionKey] = [];
          } else {
            const sectionFormData = {};
            sectionData.fields.forEach(field => {
              // Treat "0" as empty placeholder value to fix Edge browser issue
              const fieldValue = field.value;
              sectionFormData[field.key] = (fieldValue === '0' || fieldValue === 'a') ? '' : (fieldValue || '');
            });
            initialData[sectionKey] = sectionFormData;
          }
        }
      });
      setFormData(initialData);

      // Auto-expand required sections
      const expanded = {};
      Object.entries(schemaStructure).forEach(([key, section]) => {
        if (section.required && section.display !== false) {
          expanded[key] = true;
        }
      });
      setExpandedSections(expanded);
    }
  }, [schemaStructure]);

  // Resources are loaded on-demand when user selects a bridge type
  // No preloading - this prevents unnecessary API calls to conferences, queues, etc.

  // Load resource list for current schema type (e.g., extensions for Extension schema)
  const loadResourceList = async () => {
    if (!schemaType || !selectedEnvironments?.[0]) return;

    // Map schema type to API endpoint - comprehensive mapping for all VoIP resources
    const resourceTypeMap = {
      'extension': 'devices', // /api/devices (was /api/extensions)
      'ivr': 'ivrs',
      'queue': 'queues',
      'conference': 'conferences',
      'announcement': 'announcements',
      'did': 'dids',
      'vml': 'vmls',
      'call_condition': 'call_conditions',
      'user': 'users',
      'tariff': 'tariffs',
      'subscription': 'subscriptions',
      'service': 'services',
      'appz': 'applications' // Appz wizard creates environments, served at /api/applications
    };

    const resourceType = resourceTypeMap[schemaType.toLowerCase()];
    if (!resourceType) return;

    setResourceListLoading(true);
    try {
      const currentEnvironment = selectedEnvironments[0];
      const params = new URLSearchParams({
        page: '1',
        per_page: '100',
        'search[environment_uuid]': currentEnvironment.uuid
      });

      const url = `/api/${resourceType}?${params.toString()}`;
      const data = await apiService.get(url, {}, `loading ${resourceType}`, false);
      const items = Array.isArray(data) ? data : (data?.data || []);
      setResourceList(items);
    } catch (error) {
      console.error(`Error loading ${resourceType} list:`, error);
      setResourceList([]);
    } finally {
      setResourceListLoading(false);
    }
  };

  // Load resource list when schema type or environment changes
  useEffect(() => {
    loadResourceList();
  }, [schemaType, selectedEnvironments]);


  // Update appDB - extracts unique identifiers from each section for cross-section linking
  // This is called whenever form data changes to keep bridge_uuid dropdowns in sync
  const updateAppDB = useCallback((currentFormData) => {
    if (!schemaStructure || !currentFormData) return;

    const newAppDB = {};

    // Process each section to extract unique identifiers
    Object.entries(schemaStructure).forEach(([sectionKey, sectionData]) => {
      if (sectionData.read_only) return;

      // Get the unique identifier field for this section
      // extension -> username, queue -> name, announcement -> name, etc.
      const uniqueKeyField = sectionData.fields?.find(f => f.index === true)?.key
        || (sectionKey.includes('extension') ? 'username' : 'name');

      const sectionValue = currentFormData[sectionKey];
      const entries = [];

      if (sectionData.multiple && Array.isArray(sectionValue)) {
        // Multiple entries section
        sectionValue.forEach((entry) => {
          const uniqueValue = entry?.[uniqueKeyField];
          if (uniqueValue) {
            entries.push({ name: uniqueValue, val: uniqueValue });
          }
        });
      } else if (sectionValue && typeof sectionValue === 'object') {
        // Single entry section
        const uniqueValue = sectionValue[uniqueKeyField];
        if (uniqueValue) {
          entries.push({ name: uniqueValue, val: uniqueValue });
        }
      }

      if (entries.length > 0) {
        newAppDB[sectionKey] = entries;
      }
    });

    setAppDB(newAppDB);
  }, [schemaStructure]);

  // Update appDB whenever formData changes
  useEffect(() => {
    updateAppDB(formData);
  }, [formData, updateAppDB]);

  const formatTypeName = (type) => {
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/([A-Z_])/g, ' $1');
  };

  // Handle section expansion and lazy-load select data for that section
  const handleSectionToggle = async (sectionKey) => {
    const isExpanding = !expandedSections[sectionKey];

    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));

    // Lazy-load select data only when expanding a section for the first time
    if (isExpanding && schemaStructure[sectionKey]) {
      await loadSectionSelectData(sectionKey);
    }
  };

  // Load select data only for fields in a specific section (lazy loading)
  const loadSectionSelectData = async (sectionKey) => {
    const sectionData = schemaStructure[sectionKey];
    if (!sectionData || !sectionData.fields) return;

    const customerLevelResources = ['plans', 'tariffs', 'services', 'acls', 'customers'];
    const loadPromises = [];

    sectionData.fields.forEach((field) => {
      // Load data for both select and select_with_action fields that have data_url
      if ((field.input === 'select_with_action' || field.input === 'select') && field.data_url) {
        // Skip if already loaded
        if (dynamicSelectData[field.data_url]) return;

        const loadPromise = (async () => {
          try {
            const params = { ...(field.url_params || {}) };
            const shouldFilterByEnvironment = !customerLevelResources.includes(field.data_url);

            if (shouldFilterByEnvironment && selectedEnvironments?.[0]?.uuid) {
              params['search[environment_uuid]'] = selectedEnvironments[0].uuid;
            }

            const queryString = new URLSearchParams(params).toString();
            const url = `/api/${field.data_url}${queryString ? `?${queryString}` : ''}`;
            const data = await apiService.get(url, {}, `loading ${field.data_url}`, false);
            const arrayData = Array.isArray(data) ? data : (data?.data || []);

            setDynamicSelectData(prev => ({
              ...prev,
              [field.data_url]: arrayData
            }));
          } catch (error) {
            console.error(`[EnhancedSchemaForm] Error loading ${field.data_url}:`, error);
            setDynamicSelectData(prev => ({
              ...prev,
              [field.data_url]: []
            }));
          }
        })();

        loadPromises.push(loadPromise);
      }
    });

    await Promise.all(loadPromises);
  };

  // Handle field changes within a section
  // `parentKey` is set for fields rendered inside an `object` field, so the value
  // is written under that parent (entry.template.meta) instead of flattened onto
  // the entry — which is what makes vml[0][template][meta][key] possible.
  const handleFieldChange = (sectionKey, fieldKey, value, index = null, parentKey = null) => {
    setFormData(prev => {
      const newData = { ...prev };

      const write = (target) => {
        if (!parentKey) {
          target[fieldKey] = value;
          return;
        }
        target[parentKey] = { ...(typeof target[parentKey] === 'object' && target[parentKey] !== null ? target[parentKey] : {}) };
        target[parentKey][fieldKey] = value;
      };

      if (index !== null) {
        // Handle array of objects (multiple entries)
        if (!newData[sectionKey]) newData[sectionKey] = [];
        if (!newData[sectionKey][index]) newData[sectionKey][index] = {};
        newData[sectionKey][index] = { ...newData[sectionKey][index] };
        write(newData[sectionKey][index]);
      } else {
        // Handle single object or direct field
        if (!newData[sectionKey]) newData[sectionKey] = {};
        newData[sectionKey] = { ...newData[sectionKey] };
        write(newData[sectionKey]);
      }

      return newData;
    });

    // Clear field error when user starts typing
    if (errors[`${sectionKey}.${fieldKey}`]) {
      setErrors(prev => ({ 
        ...prev, 
        [`${sectionKey}.${fieldKey}`]: null 
      }));
    }
  };

  // Handle data URL and dependent fields (select_with_action)
  const handleSelectWithAction = async (field, sectionKey, fieldKey, value, index = null) => {
    handleFieldChange(sectionKey, fieldKey, value, index);

    if (field.action === 'set_data') {
      // Set data for dependent field - this is handled by static data array

      // Also fetch data for the selected bridge type to populate dependent select fields
      if (value && ['extension', 'queue', 'ivr', 'conference', 'announcement'].includes(value)) {
        try {
              const resourceType = apiResourcePath(value); // e.g., 'ivr' -> 'ivrs'

          // Add environment filtering like the legacy code
          const currentEnvironment = selectedEnvironments?.[0];
          const params = new URLSearchParams({
            page: 1,
            per_page: 9999,
            search: JSON.stringify({
              enabled: true,
              ...(currentEnvironment?.uuid && { environment_uuid: currentEnvironment.uuid })
            })
          });

          const url = `/api/${resourceType}?${params.toString()}`;
          apiService.get(url, {}, `fetching ${resourceType}`, false)
            .then(data => {
              setDynamicSelectData(prev => ({
                ...prev,
                [resourceType]: data || []
              }));
            })
            .catch(() => {
              // Silently ignore - resource may not be available
            });
        } catch (error) {
          console.error('Error in bridge resource fetching:', error);
        }
      }
    } else if (field.action === 'set_data_url_with_params') {
      // Fetch data from URL with parameters (e.g., products for a plan)
      try {
        const params = field.action_params || {};

        // Replace template variables in params (e.g., {{plan_uuid}} -> selected plan uuid)
        const processedParams = {};
        Object.keys(params).forEach(key => {
          const paramValue = params[key];
          if (typeof paramValue === 'string' && paramValue.includes('{{') && paramValue.includes('}}')) {
            // Replace template variable with actual value
            processedParams[key] = value;
          } else {
            processedParams[key] = paramValue;
          }
        });

        const queryString = new URLSearchParams(processedParams).toString();
        const url = `/api/${field.action_url}${queryString ? `?${queryString}` : ''}`;

        // Make the API call
        const data = await apiService.get(url, {}, `fetching ${field.action_url}`, false);

        // For subscription products, the server returns product fields that should be added to the form
        // Store these as dynamic fields to be rendered below the plan selector
        if (field.action_url === 'plans' && processedParams.action === 'products') {
          // Store product fields for this subscription entry
          const entryKey = index !== null ? `${sectionKey}.${index}` : sectionKey;
          setDynamicFields(prev => ({
            ...prev,
            [entryKey]: data // Assuming data contains fields structure for products
          }));
        }

        // Store the fetched data for use by dependent fields
        setDynamicSelectData(prev => ({
          ...prev,
          [field.action_url]: data || []
        }));

      } catch (error) {
        console.error('Error fetching dependent data:', error);
      }
    }
  };

  // Add new entry to multiple section
  const addObjectEntry = (sectionKey) => {
    const section = schemaStructure[sectionKey];
    const newEntry = {};
    
    section.fields.forEach(field => {
      newEntry[field.key] = field.value || '';
    });

    setFormData(prev => ({
      ...prev,
      [sectionKey]: [...(prev[sectionKey] || []), newEntry]
    }));
  };

  // Remove entry from multiple section
  const removeObjectEntry = (sectionKey, index) => {
    setFormData(prev => ({
      ...prev,
      [sectionKey]: prev[sectionKey].filter((_, i) => i !== index)
    }));

    // Also remove any dynamic fields associated with this entry (e.g., products for subscription)
    const entryKey = `${sectionKey}.${index}`;
    if (dynamicFields[entryKey]) {
      setDynamicFields(prev => {
        const newDynamicFields = { ...prev };
        delete newDynamicFields[entryKey];
        return newDynamicFields;
      });
    }
  };

  // Bridge modal handlers
  const handleCreateBridge = (bridgeType) => {
    setBridgeModalType(bridgeType);
    setBridgeModalOpen(true);
  };

  const handleBridgeModalSave = async (bridgeData) => {
    setBridgeModalLoading(true);

    try {
      const resourceType = apiResourcePath(bridgeModalType); // e.g., 'extension' -> 'devices'
      const url = `/api/${resourceType}`;

      // Create the bridge resource
      const newBridge = await apiService.post(url, bridgeData, `creating ${bridgeModalType}`);

      // Refresh the dynamic data for this bridge type
      if (newBridge && newBridge.uuid) {
        setDynamicSelectData(prev => ({
          ...prev,
          [resourceType]: [...(prev[resourceType] || []), newBridge]
        }));
      }
      
      setBridgeModalOpen(false);
      setBridgeModalType(null);
      
    } catch (error) {
      console.error(`Error creating ${bridgeModalType}:`, error);
      // Error handling is done by apiService, just keep modal open
    } finally {
      setBridgeModalLoading(false);
    }
  };

  const handleBridgeModalClose = () => {
    setBridgeModalOpen(false);
    setBridgeModalType(null);
    setBridgeModalLoading(false);
  };

  // All object entries are now rendered inline - no dialog needed

  // Render individual field based on input type
  const renderField = (field, sectionKey, value, index = null, parentKey = null) => {
    const fieldKey = field.key;
    const fieldId = index !== null ? `${sectionKey}.${index}.${fieldKey}` : `${sectionKey}.${fieldKey}`;
    const errorKey = `${sectionKey}.${fieldKey}`;

    // Fix Edge browser issue: Always use value from formData state, never fall back to field.value
    // Treat "0" and "a" as empty placeholders (legacy API pattern)
    const currentValue = value ?? '';
    const displayValue = (currentValue === '0' || currentValue === 'a') ? '' : currentValue;

    const commonProps = {
      fullWidth: true,
      label: field.name,
      placeholder: field.notes || `Enter ${field.name.toLowerCase()}`,
      value: displayValue,
      error: !!errors[errorKey],
      helperText: errors[errorKey],
      onChange: (e) => handleFieldChange(sectionKey, fieldKey, e.target.value, index, parentKey),
      variant: "outlined",
      size: "small"
    };

    switch (field.input) {
      case 'string':
      case 'text':
        return (
          <TextField
            key={fieldId}
            {...commonProps}
            type="text"
          />
        );

      case 'numeric':
      case 'number':
        return (
          <TextField
            key={fieldId}
            {...commonProps}
            type="number"
            inputProps={{ min: 0 }}
          />
        );

      case 'textarea':
        return (
          <TextField
            key={fieldId}
            {...commonProps}
            multiline
            rows={3}
          />
        );

      case 'select': {
        // Handle different data sources for select fields
        let selectOptions = [];
        let currentBridgeType = null;

        // Priority order for data sources:
        // 1. Static data from schema definition (field.data, field.resources, or field.select_options)
        // 2. Internal appDB reference (for Appz wizard cross-section linking)
        // 3. Dynamic reference fields (e.g., "#bridge_type") from API
        // 4. Direct data type references (e.g., "announcement") from API

        if (field.data && Array.isArray(field.data)) {
          // Static data from schema definition
          selectOptions = field.data;
        } else if (field.resources && Array.isArray(field.resources)) {
          // Resources field (used by announcement schema for predefined resources like MOH, Ringing)
          selectOptions = field.resources;
        } else if (field.select_options && Array.isArray(field.select_options)) {
          // Legacy format - select_options from server
          selectOptions = field.select_options;
        } else if (field.data_url && dynamicSelectData[field.data_url]) {
          // Data loaded from data_url (for fields with data_url but not select_with_action)
          const apiData = dynamicSelectData[field.data_url];
          selectOptions = Array.isArray(apiData) ? apiData : (apiData?.data || []);
        } else if (field.data_type && field.data_type.startsWith('#')) {
          // Reference to another field's value (for bridge routing)
          const referenceField = field.data_type.substring(1); // Remove '#'
          const referenceValue = index !== null
            ? formData[sectionKey]?.[index]?.[referenceField]
            : formData[sectionKey]?.[referenceField];

          if (referenceValue) {
            // First try to get options from appDB (internal form data)
            // This is the key for Appz wizard where DID bridge_uuid references extension username from the same form
            if (appDB[referenceValue]?.length > 0) {
              selectOptions = appDB[referenceValue];
            } else {
              // Fallback to API data
              const resourceType = referenceValue + 's'; // e.g., 'extension' -> 'extensions'
              selectOptions = dynamicSelectData[resourceType] || [];
            }
            currentBridgeType = referenceValue;
          }
        } else if (field.data_type) {
          // Direct data type reference for VoIP resources
          if (['announcement', 'extension', 'queue', 'ivr', 'conference'].includes(field.data_type)) {
            // First try appDB (internal form data)
            if (appDB[field.data_type]?.length > 0) {
              selectOptions = appDB[field.data_type];
            } else {
              // Fallback to API data
              const resourceType = apiResourcePath(field.data_type); // e.g., 'announcement' -> 'announcements'
              selectOptions = dynamicSelectData[resourceType] || [];
            }
            currentBridgeType = field.data_type;
          } else {
            // Other data types should come from server
            selectOptions = [];
          }
        }

        // Check if this is a bridge resource select field
        const isBridgeField = currentBridgeType && ['extension', 'queue', 'ivr', 'conference', 'announcement'].includes(currentBridgeType);

        // Fix Edge browser issue: Always use value from formData state, never fall back to field.value
        // Treat "0", "a", or any invalid value as empty string to prevent MUI warnings
        const currentValue = value ?? '';
        const normalizedValue = (currentValue === '0' || currentValue === 'a') ? '' : currentValue;

        // Lazy load select data for this field if not already loaded
        const needsDataLoad = field.data_type && !['string', 'numeric', 'textarea'].includes(field.data_type)
          && field.data_type.startsWith('#') === false
          && !dynamicSelectData[field.data_type + 's'];

        // Load data on focus for better performance
        const handleSelectFocus = async () => {
          if (needsDataLoad && field.data_type) {
            const resourceType = apiResourcePath(field.data_type);
            if (!dynamicSelectData[resourceType]) {
              try {
                const currentEnvironment = selectedEnvironments?.[0];
                const params = new URLSearchParams({
                  page: 1,
                  per_page: 9999,
                  search: JSON.stringify({
                    enabled: true,
                    ...(currentEnvironment?.uuid && { environment_uuid: currentEnvironment.uuid })
                  })
                });

                const url = `/api/${resourceType}?${params.toString()}`;
                const data = await apiService.get(url, {}, `loading ${resourceType}`, false);
                setDynamicSelectData(prev => ({
                  ...prev,
                  [resourceType]: data || []
                }));
              } catch (error) {
                console.error(`Error loading ${resourceType}:`, error);
              }
            }
          }
        };

        return (
          <Box key={fieldId} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <FormControl fullWidth size="small" error={!!errors[errorKey]}>
              <InputLabel>{field.name}</InputLabel>
              <Select
                value={normalizedValue}
                onChange={(e) => handleFieldChange(sectionKey, fieldKey, e.target.value, index)}
                onFocus={handleSelectFocus}
                label={field.name}
              >
                <MenuItem value="">Select...</MenuItem>
                {selectOptions.map((option, idx) => (
                  <MenuItem key={idx} value={option.uuid || option.val || option}>
                    {option.name || option.label || option}
                  </MenuItem>
                ))}
              </Select>
              {errors[errorKey] && <FormHelperText>{errors[errorKey]}</FormHelperText>}
            </FormControl>
            
            {/* Add "Create New" button for bridge fields */}
            {isBridgeField && canWrite && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => handleCreateBridge(currentBridgeType)}
                sx={{ 
                  minWidth: 'auto',
                  px: 2,
                  py: 1,
                  height: '40px',
                  mt: 0.5
                }}
                title={`Create new ${currentBridgeType}`}
              >
                New
              </Button>
            )}
          </Box>
        );
      }

      case 'select_with_action': {
        // Get options from data_url if available (e.g., plans list)
        let selectOptions = [];
        if (field.data_url && dynamicSelectData[field.data_url]) {
          // Ensure it's an array - API might return object with data property
          const apiData = dynamicSelectData[field.data_url];
          selectOptions = Array.isArray(apiData) ? apiData : (apiData?.data || []);
        } else if (field.data && Array.isArray(field.data)) {
          selectOptions = field.data;
        }

        // Get dynamic fields for this entry (e.g., products for selected plan)
        const entryKey = index !== null ? `${sectionKey}.${index}` : sectionKey;
        const dynamicProductFields = dynamicFields[entryKey];

        // Check if this field's data needs loading
        const needsDataLoad = field.data_url && !dynamicSelectData[field.data_url];

        // Fix Edge browser issue: Always use value from formData state, never fall back to field.value
        // Treat "0", "a", or any invalid value as empty string to prevent MUI warnings
        const currentValue = value ?? '';
        const normalizedValue = (currentValue === '0' || currentValue === 'a') ? '' : currentValue;

        // Lazy load data on focus
        const handleSelectFocus = async () => {
          if (needsDataLoad && field.data_url) {
            try {
              const customerLevelResources = ['plans', 'tariffs', 'services', 'acls', 'customers'];
              const params = { ...(field.url_params || {}) };
              const shouldFilterByEnvironment = !customerLevelResources.includes(field.data_url);

              if (shouldFilterByEnvironment && selectedEnvironments?.[0]?.uuid) {
                params['search[environment_uuid]'] = selectedEnvironments[0].uuid;
              }

              const queryString = new URLSearchParams(params).toString();
              const url = `/api/${field.data_url}${queryString ? `?${queryString}` : ''}`;
              const data = await apiService.get(url, {}, `loading ${field.data_url}`, false);
              const arrayData = Array.isArray(data) ? data : (data?.data || []);

              setDynamicSelectData(prev => ({
                ...prev,
                [field.data_url]: arrayData
              }));
            } catch (error) {
              console.error(`Error loading ${field.data_url}:`, error);
              setDynamicSelectData(prev => ({
                ...prev,
                [field.data_url]: []
              }));
            }
          }
        };

        return (
          <Box key={fieldId}>
            <FormControl fullWidth size="small" error={!!errors[errorKey]}>
              <InputLabel>{field.name}</InputLabel>
              <Select
                value={normalizedValue}
                onChange={(e) => {
                  handleSelectWithAction(field, sectionKey, fieldKey, e.target.value, index);
                }}
                onFocus={handleSelectFocus}
                label={field.name}
              >
                <MenuItem key="empty" value="">
                  {needsDataLoad && selectOptions.length === 0 ? 'Loading...' : 'Select...'}
                </MenuItem>
                {selectOptions.map((option, idx) => {
                  // Extract value: prefer uuid, then val, then id, then the name itself, then the whole object
                  const optionValue = option.uuid || option.val || option.id || option.name || option;
                  const optionLabel = option.name || option.label || option.uuid || option.val || option;

                  return (
                    <MenuItem key={idx} value={optionValue}>
                      {optionLabel}
                    </MenuItem>
                  );
                })}
              </Select>
              {errors[errorKey] && <FormHelperText>{errors[errorKey]}</FormHelperText>}
            </FormControl>

            {/* Render dynamic product fields if available */}
            {dynamicProductFields && (
              <Box sx={{ mt: 2, pl: 2, borderLeft: '3px solid #1976d2' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main' }}>
                  Product Details
                </Typography>
                <Grid container spacing={2}>
                  {Array.isArray(dynamicProductFields) ? (
                    // If products is an array of product items
                    dynamicProductFields.map((product, productIdx) => (
                      <Grid size={12} key={productIdx}>
                        <TextField
                          fullWidth
                          size="small"
                          label={product.name || `Product ${productIdx + 1}`}
                          value={formData[sectionKey]?.[index]?.[`product_${productIdx}`] || ''}
                          onChange={(e) => handleFieldChange(sectionKey, `product_${productIdx}`, e.target.value, index)}
                        />
                      </Grid>
                    ))
                  ) : dynamicProductFields.fields ? (
                    // If products has a fields structure like other sections
                    dynamicProductFields.fields.map((productField, productFieldIdx) => (
                      <Grid size={{ xs: 12, sm: 6 }} key={productFieldIdx}>
                        {renderField(
                          productField,
                          sectionKey,
                          formData[sectionKey]?.[index]?.[productField.key],
                          index
                        )}
                      </Grid>
                    ))
                  ) : null}
                </Grid>
              </Box>
            )}
          </Box>
        );
      }

      case 'multi_select':
        return (
          <FormControl key={fieldId} fullWidth size="small" error={!!errors[errorKey]}>
            <InputLabel>{field.name}</InputLabel>
            <Select
              multiple
              value={Array.isArray(value) ? value : []}
              onChange={(e) => handleFieldChange(sectionKey, fieldKey, e.target.value, index)}
              label={field.name}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((val) => (
                    <Chip key={val} label={val} size="small" />
                  ))}
                </Box>
              )}
            >
              {field.data && field.data.map((option, idx) => (
                <MenuItem key={idx} value={option.val || option}>
                  {option.name || option.label || option}
                </MenuItem>
              ))}
            </Select>
            {errors[errorKey] && <FormHelperText>{errors[errorKey]}</FormHelperText>}
          </FormControl>
        );

      case 'object':
        // Handle nested object fields
        return (
          <Card key={fieldId} variant="outlined" sx={{ mt: 1 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {field.name}
              </Typography>
              <Grid container spacing={2}>
                {field.fields && field.fields.map((subField, subIdx) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={subIdx}>
                    {renderField(subField, sectionKey, value?.[subField.key], index, field.key)}
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        );

      // Free-form key/value pairs (meta). The API stores these as hstore, so the
      // shape on the wire is <section>[i][meta][<key>]=<value>.
      case 'keyvalue': {
        const pairs = (currentValue && typeof currentValue === 'object') ? currentValue : {};
        const entries = Object.entries(pairs);
        const update = (next) => handleFieldChange(sectionKey, fieldKey, next, index, parentKey);
        return (
          <Box key={fieldId} sx={{ gridColumn: '1 / -1' }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 0.5, opacity: 0.8 }}>
              {field.name}{field.notes ? ` — ${field.notes}` : ''}
            </Typography>
            {entries.map(([k, v], i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                <TextField
                  size="small" label="Key" value={k} sx={{ flex: 1 }}
                  onChange={(e) => {
                    const next = {};
                    entries.forEach(([ek, ev], ei) => { next[ei === i ? e.target.value : ek] = ev; });
                    update(next);
                  }}
                />
                <TextField
                  size="small" label="Value" value={v ?? ''} sx={{ flex: 1 }}
                  onChange={(e) => update({ ...pairs, [k]: e.target.value })}
                />
                <IconButton
                  size="small"
                  onClick={() => {
                    const next = { ...pairs };
                    delete next[k];
                    update(next);
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button
              size="small" startIcon={<AddIcon />} sx={{ textTransform: 'none' }}
              onClick={() => update({ ...pairs, '': '' })}
            >
              Add property
            </Button>
          </Box>
        );
      }

      default:
        return (
          <TextField
            key={fieldId}
            {...commonProps}
            type="text"
          />
        );
    }
  };

  // Render section content
  const renderSection = (sectionKey, sectionData) => {
    const sectionValue = formData[sectionKey] || {};
    const isMultiple = sectionData.multiple;
    const isRequired = sectionData.required;
    const isReadOnly = sectionData.read_only;

    return (
      <Accordion
        key={sectionKey}
        expanded={expandedSections[sectionKey] || false}
        onChange={() => handleSectionToggle(sectionKey)}
        disabled={isReadOnly}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            <Typography variant="h6">
              {sectionData.obj_title || formatTypeName(sectionKey)}
            </Typography>
            {isRequired && (
              <Chip label="Required" size="small" color="error" />
            )}
            {isMultiple && (
              <Chip 
                label={`${Array.isArray(sectionValue) ? sectionValue.length : 0} entries`} 
                size="small" 
                color="primary" 
              />
            )}
            {isReadOnly && (
              <Chip label="Read Only" size="small" color="default" />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          {isMultiple ? (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Multiple {sectionData.obj_title || sectionKey} entries
                </Typography>
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => addObjectEntry(sectionKey)}
                  size="small"
                  variant="outlined"
                  disabled={isReadOnly}
                >
                  Add {sectionData.obj_title || 'Entry'}
                </Button>
              </Box>

              {Array.isArray(sectionValue) && sectionValue.length > 0 ? (
                <Box>
                  {sectionValue.map((entry, index) => (
                    <Paper key={index} sx={{ p: 2, mb: 2, border: '1px solid var(--mui-palette-divider)' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                          {sectionData.obj_title || 'Entry'} #{index + 1}
                        </Typography>
                        <IconButton
                          onClick={() => removeObjectEntry(sectionKey, index)}
                          size="small"
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                      <Grid container spacing={2}>
                        {sectionData.fields && sectionData.fields.map((field, fieldIndex) => {
                          // Determine grid size based on field type for better layout
                          let gridSize = 6; // Default: half width

                          if (field.input === 'textarea' || field.input === 'object') {
                            gridSize = 12; // Full width for large fields
                          } else if (field.input === 'numeric' || field.input === 'boolean') {
                            gridSize = 3; // Quarter width for small fields
                          } else if (field.input === 'select' || field.input === 'select_with_action') {
                            gridSize = 4; // Third width for dropdowns
                          }

                          return (
                            <Grid size={{ xs: 12, sm: gridSize, md: gridSize }}
                              key={fieldIndex}
                            >
                              {renderField(field, sectionKey, entry[field.key], index)}
                            </Grid>
                          );
                        })}
                      </Grid>
                    </Paper>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No {sectionData.obj_title || sectionKey} entries added yet.
                </Typography>
              )}
            </Box>
          ) : (
            <Grid container spacing={2}>
              {sectionData.fields && sectionData.fields.map((field, index) => {
                // Determine grid size based on field type for better layout
                let gridSize = 6; // Default: half width

                if (field.input === 'textarea' || field.input === 'object') {
                  gridSize = 12; // Full width for large fields
                } else if (field.input === 'numeric' || field.input === 'boolean') {
                  gridSize = 3; // Quarter width for small fields
                } else if (field.input === 'select' || field.input === 'select_with_action') {
                  gridSize = 4; // Third width for dropdowns
                }

                return (
                  <Grid size={{ xs: 12, sm: gridSize, md: gridSize }}
                    key={index}
                  >
                    {renderField(field, sectionKey, sectionValue[field.key])}
                  </Grid>
                );
              })}
            </Grid>
          )}
        </AccordionDetails>
      </Accordion>
    );
  };

  // Validate form - minimal validation, let server handle most validation
  // Legacy pattern: fields have default value "0" and server validates
  const validateForm = () => {
    const newErrors = {};

    // Only validate environment name for Appz wizard (required to create new environment)
    // We always use 'environment.name' since that's what the TextField sets
    if (schemaStructure.environment) {
      const environmentName = formData.environment?.name;

      if (!environmentName || environmentName.trim() === '' || environmentName === '0') {
        newErrors['environment.name'] = 'Application name is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Build the URLSearchParams payload from the current formData state.
  // Extracted so both handleSubmit (single create) and the bulk "Add to batch"
  // button can reuse the same flattening logic.
  // Flatten a value into the form-encoded shape the API reads. Nested objects
  // become nested brackets — vml[0][template][meta][crm_id] — which is how
  // Schema::Create receives a template document with its own meta.
  const appendValue = (params, prefix, value) => {
    if (value === undefined || value === null) {
      params.append(prefix, '');
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => appendValue(params, `${prefix}[${i}]`, item));
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => {
        if (key === '') return; // a half-typed meta row has no key yet
        appendValue(params, `${prefix}[${key}]`, item);
      });
      return;
    }
    params.append(prefix, value);
  };

  const buildPayload = () => {
    const submitFormData = new URLSearchParams();
    submitFormData.append('type', schemaType);

    // Get environment name from the environment section (required for Appz wizard)
    const environmentName = formData.environment?.name;
    if (environmentName) {
      submitFormData.append('environment_name', environmentName);
    }

    // Process all sections EXCEPT environment (already handled via environment_name above)
    Object.entries(schemaStructure).forEach(([sectionKey, sectionData]) => {
      if (sectionData.read_only) return;
      if (sectionKey === 'environment') return;

      const sectionFormData = formData[sectionKey];
      if (!sectionFormData) return;

      if (sectionData.multiple && Array.isArray(sectionFormData)) {
        sectionFormData.forEach((entry, index) => {
          Object.entries(entry).forEach(([fieldKey, value]) => {
            appendValue(submitFormData, `${sectionKey}[${index}][${fieldKey}]`, value);
          });

          const entryKey = `${sectionKey}.${index}`;
          const productFields = dynamicFields[entryKey];
          if (productFields?.fields) {
            productFields.fields.forEach((productField) => {
              const productValue = entry[productField.key] || productField.value || '';
              submitFormData.append(`${sectionKey}[${index}][${productField.key}]`, productValue);
            });
          }
        });
      } else if (typeof sectionFormData === 'object') {
        Object.entries(sectionFormData).forEach(([fieldKey, value]) => {
          appendValue(submitFormData, `${sectionKey}[0][${fieldKey}]`, value);
        });

        const productFields = dynamicFields[sectionKey];
        if (productFields?.fields) {
          productFields.fields.forEach((productField) => {
            const productValue = sectionFormData[productField.key] || productField.value || '';
            submitFormData.append(`${sectionKey}[0][${productField.key}]`, productValue);
          });
        }
      }
    });

    return submitFormData;
  };

  // Reset the form fields to their initial (schema-defined) values
  const resetForm = () => {
    const initialData = {};
    Object.entries(schemaStructure).forEach(([sectionKey, sectionData]) => {
      if (sectionData.fields) {
        if (sectionData.multiple) {
          initialData[sectionKey] = [];
        } else {
          const sectionFormData = {};
          sectionData.fields.forEach(field => {
            sectionFormData[field.key] = field.value || '';
          });
          initialData[sectionKey] = sectionFormData;
        }
      }
    });
    setFormData(initialData);
    setDynamicFields({});
  };

  // Handle the bulk "Add to batch" button: flatten current form values and push to bulk list
  const handleAddToBatch = () => {
    if (!bulk) return;

    // Build a plain object from the current payload for the batch entry
    const payload = buildPayload();
    const entry = {};
    for (const [key, value] of payload.entries()) {
      entry[key] = value;
    }

    // Derive a display name for the entry from environment name (primary) or first vml field
    entry.name = formData.environment?.name || entry['environment_name'] || '';

    bulk.addEntry(entry);

    // Reset the form so the user can fill in the next entry
    resetForm();
  };

  const handleSubmit = async () => {
    if (validateForm()) {
      try {
        // Build URLSearchParams for schema creation (API requires x-www-form-urlencoded)
        // Appz wizard ALWAYS creates a NEW environment - no environment_uuid needed
        // Following legacy pattern: sends 'environment_name' + resource data
        const submitFormData = buildPayload();

        await apiService.post('/api/schemas', submitFormData, {}, `creating ${schemaType}`);

        // Show success message
        setSubmitSuccess(`${formatTypeName(schemaType)} created successfully!`);
        setTimeout(() => setSubmitSuccess(null), 5000);

        // Refresh environments list to include newly created environment
        // This ensures the new environment appears in DID dialog dropdown
        if (selectedCustomer?.uuid && fetchEnvironments) {
          await fetchEnvironments(selectedCustomer.uuid);
        }

        // Refresh the resource list to show the newly created item
        await loadResourceList();

        // Reset form and dynamic fields for next entry
        resetForm();
      } catch (err) {
        console.error('Error creating schema:', err);
        // Show error to user
        setErrors({ submit: err.message || 'Failed to create schema' });
      }
    }
  };

  if (!schemaStructure) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ mb: 3 }}>
          Create {formatTypeName(schemaType)} Schema
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
              Error
            </Typography>
            <Typography variant="body2">{error}</Typography>
            {Object.keys(errorsList).length > 0 && (
              <Box sx={{ mt: 1 }}>
                {Object.entries(errorsList).map(([field, message]) => (
                  <Typography key={field} variant="body2" sx={{ color: 'error.dark' }}>
                    <strong>{field}:</strong> {message}
                  </Typography>
                ))}
              </Box>
            )}
          </Alert>
        )}

        {errors.submit && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setErrors(prev => ({ ...prev, submit: null }))}>
            {errors.submit}
          </Alert>
        )}

        {submitSuccess && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {submitSuccess}
          </Alert>
        )}

        {/* Environment Name - always a text field for entering environment name */}
        <TextField
          fullWidth
          label="Application Name"
          value={formData.environment?.name || ''}
          onChange={(e) => {
            setFormData(prev => ({
              ...prev,
              environment: { ...prev.environment, name: e.target.value }
            }));
          }}
          required
          error={!!errors['environment.name']}
          helperText={errors['environment.name'] || 'Enter application name'}
          sx={{ mb: 3 }}
          size="small"
        />

        {/* Schema Sections - skip environment since we handle it above */}
        <Box sx={{ mb: 3 }}>
          {Object.entries(schemaStructure)
            .filter(([sectionKey]) => sectionKey !== 'environment')
            .map(([sectionKey, sectionData]) => renderSection(sectionKey, sectionData))}
        </Box>

        {/* Submit Button */}
        {canWrite && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              Create Schema
            </Button>
          </Box>
        )}

        {/* Bulk "Add to batch" button — only rendered when bulk prop is provided */}
        {bulk && canWrite && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 2 }}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleAddToBatch}
            >
              Add to batch
            </Button>
          </Box>
        )}

        {/* All entries are now inline - no dialog needed */}
      </Paper>

      {/* Bulk batch panel — only rendered when bulk prop is provided */}
      {bulk && (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Batch Creation
          </Typography>

          <Divider sx={{ mb: 2 }} />

          {/* CSV upload */}
          <Box sx={{ mb: 3, textAlign: 'center' }}>
            <input
              type="file"
              accept=".csv"
              ref={bulkFileInputRef}
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  bulk.uploadCSV(file);
                  // Reset file input so the same file can be re-selected
                  e.target.value = '';
                }
              }}
            />
            <Button
              variant="outlined"
              startIcon={<CloudUploadIcon />}
              onClick={() => bulkFileInputRef.current?.click()}
              disabled={loading}
            >
              Upload CSV
            </Button>
            <Typography variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary' }}>
              Upload a CSV file with a &apos;name&apos; column and schema fields
            </Typography>
          </Box>

          {/* Batch list */}
          {bulk.customerList && bulk.customerList.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Entries to Create ({bulk.customerList.length})
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  startIcon={<ClearIcon />}
                  onClick={bulk.clearList}
                >
                  Clear list
                </Button>
              </Box>
              <List dense>
                {bulk.customerList.map((entry, idx) => {
                  const secondary = Object.entries(entry)
                    .filter(([k]) => k !== 'name')
                    .map(([k, v]) => `${k}: ${v || 'N/A'}`)
                    .join(' | ');
                  return (
                    <ListItem
                      key={idx}
                      divider
                      secondaryAction={
                        <IconButton
                          edge="end"
                          size="small"
                          color="error"
                          onClick={() => {
                            // Remove the entry at this index by rebuilding the list
                            const next = bulk.customerList.filter((_, i) => i !== idx);
                            bulk.clearList();
                            next.forEach(e => bulk.addEntry(e));
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      }
                    >
                      <ListItemText
                        primary={entry.name || entry['environment_name'] || `Entry ${idx + 1}`}
                        secondary={secondary || null}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Box>
          )}

          {/* Create All button */}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              color="warning"
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CreateIcon />}
              onClick={bulk.createAllSchemas}
              disabled={!canWrite || !bulk.customerList || bulk.customerList.length === 0 || loading}
              sx={{ fontSize: '1rem', py: 1, px: 3 }}
            >
              Create All ({bulk.customerList ? bulk.customerList.length : 0})
            </Button>

            {/* Download log button — shown only once schemas have been created */}
            {bulk.createdSchemas && bulk.createdSchemas.length > 0 && (
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={bulk.downloadLog}
              >
                Download log ({bulk.createdSchemas.length})
              </Button>
            )}
          </Box>

          {/* Created schemas summary */}
          {bulk.createdSchemas && bulk.createdSchemas.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                Created Schemas ({bulk.createdSchemas.length})
              </Typography>
              <List dense>
                {bulk.createdSchemas.map((schema, idx) => {
                  const secondary = Object.entries(schema)
                    .filter(([k]) => k !== 'name' && k !== 'id')
                    .map(([k, v]) => `${k}: ${v || 'N/A'}`)
                    .join(' | ');
                  return (
                    <ListItem key={idx} divider>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <CheckCircleIcon color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={`Created: ${schema.name || schema['environment_name'] || `Schema ${idx + 1}`}`}
                        secondary={secondary || null}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Box>
          )}
        </Paper>
      )}

      {/* Resource List - Shows existing resources of this type */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Existing {formatTypeName(schemaType)}s ({resourceList.length})
          </Typography>
          <Button
            size="small"
            startIcon={resourceListLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={loadResourceList}
            disabled={resourceListLoading}
          >
            Refresh
          </Button>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {resourceListLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : resourceList.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            No {formatTypeName(schemaType).toLowerCase()}s found for this environment. Create one above.
          </Typography>
        ) : (
          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Number/ID</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resourceList.map((item) => (
                  <TableRow key={item.uuid} hover>
                    <TableCell>{item.name || '-'}</TableCell>
                    <TableCell>{item.number || item.extension || item.uuid?.substring(0, 8) || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        label={item.enabled !== false ? 'Enabled' : 'Disabled'}
                        size="small"
                        color={item.enabled !== false ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Bridge Edit Modal */}
      <BridgeEditModal
        open={bridgeModalOpen}
        onClose={handleBridgeModalClose}
        onSave={handleBridgeModalSave}
        bridgeType={bridgeModalType}
        loading={bridgeModalLoading}
      />

    </Box>
  );
};

export default EnhancedSchemaForm;
