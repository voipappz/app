import React from 'react';
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
  InputLabel
} from '@mui/material';
import { Create as CreateIcon } from '@mui/icons-material';
import './DynamicSchemaForm.css';

const DynamicSchemaForm = ({
  schemaType,
  schemaStructure,
  currentEntry,
  setCurrentEntry,
  loading,
  error,
  errorsList = {},  // Field-level errors like { email: "email is already taken" }
  success,
  onSubmit
}) => {
  const handleFieldChange = (fieldName, value) => {
    setCurrentEntry(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const formatTypeName = (type) => {
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/([A-Z])/g, ' $1');
  };

  const renderField = (field) => {
    const { name, key, input, notes, value: defaultValue, options } = field;
    const fieldKey = key || name;
    const currentValue = currentEntry[fieldKey] || defaultValue || '';

    const commonProps = {
      fullWidth: true,
      label: name,
      placeholder: notes || `Enter ${name.toLowerCase()}`,
      value: currentValue,
      onChange: (e) => handleFieldChange(fieldKey, e.target.value),
      variant: "outlined"
    };

    switch (input) {
      case 'select':
        return (
          <FormControl fullWidth key={fieldKey}>
            <InputLabel>{name}</InputLabel>
            <Select
              value={currentValue}
              onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
              label={name}
            >
              <MenuItem value="">Select...</MenuItem>
              {options && options.map((option, index) => (
                <MenuItem key={index} value={option.value || option}>
                  {option.label || option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      
      case 'textarea':
        return (
          <TextField
            key={fieldKey}
            {...commonProps}
            multiline
            rows={4}
          />
        );
      
      case 'number':
        return (
          <TextField
            key={fieldKey}
            {...commonProps}
            type="number"
          />
        );
      
      case 'string':
      default:
        return (
          <TextField
            key={fieldKey}
            {...commonProps}
          />
        );
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 4 }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading schema structure...</Typography>
      </Box>
    );
  }

  // Handle form submission
  const handleSubmit = () => {
    if (onSubmit) {
      onSubmit(currentEntry);
    }
  };

  if (error && !schemaStructure) {
    return (
      <Alert severity="error" sx={{ m: 3 }}>
        {error}
      </Alert>
    );
  }

  if (!schemaStructure) {
    return (
      <Box sx={{ textAlign: 'center', p: 4 }}>
        <Typography variant="h6" color="text.secondary">
          Please select a schema type from the list to create.
        </Typography>
      </Box>
    );
  }

  const fields = schemaStructure?.vml?.fields || [];

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography 
        variant="h3" 
        component="h1" 
        sx={{ 
          textAlign: 'center', 
          mb: 4, 
          fontWeight: 'bold',
          color: 'var(--mui-palette-text-primary)'
        }}
      >
        Create {formatTypeName(schemaType)} Schema
      </Typography>

      <Card sx={{ mb: 4 }}>
        <CardContent>
          {/* Success/Error Messages */}
          {success && (
            <Alert severity="success" sx={{ mb: 3 }}>
              {success}
            </Alert>
          )}
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

          {/* Environment Name Field - always text field */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Application Name"
                placeholder="Enter application name"
                value={currentEntry.environment_name || currentEntry.name || ''}
                onChange={(e) => handleFieldChange('environment_name', e.target.value)}
                variant="outlined"
                required
                helperText="Enter the name for the application"
              />
            </Grid>
          </Grid>

          {/* Dynamic Fields */}
          {fields.length > 0 && (
            <>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Schema Fields
              </Typography>
              <Grid container spacing={3} sx={{ mb: 3 }}>
                {fields.map((field, index) => (
                  <Grid size={{ xs: 12, md: 6 }} key={field.key || field.name || index}>
                    {renderField(field)}
                  </Grid>
                ))}
              </Grid>
            </>
          )}

          {/* Submit Button */}
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmit}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CreateIcon />}
              disabled={loading || (!currentEntry.name && !currentEntry.environment_name)}
              size="large"
              sx={{
                fontSize: '1.2rem',
                py: 1.5,
                px: 4
              }}
            >
              {loading ? 'Creating...' : `Create ${formatTypeName(schemaType)} Schema`}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default DynamicSchemaForm;