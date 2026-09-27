import { useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Grid,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Card,
  CardContent
} from '@mui/material';
import { 
  Add as AddIcon, 
  Clear as ClearIcon, 
  Create as CreateIcon,
  CheckCircle as CheckCircleIcon,
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import './SMSCreator.css';

const SMSCreator = ({
  currentEntry,
  setCurrentEntry,
  customerList,
  addToList,
  clearInputs,
  clearList,
  loading,
  error,
  errorsList = {},  // Field-level errors like { email: "email is already taken" }
  success,
  createdSchemas,
  createAllSchemas,
  uploadCSV,
  downloadLog,
  schemaStructure
}) => {
  const fileInputRef = useRef(null);

  const handleInputChange = (field, value) => {
    setCurrentEntry(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      uploadCSV(file);
    }
  };

  const renderField = (field) => {
    const { name, key, input, notes, value: defaultValue } = field;
    const fieldKey = key || name;
    const currentValue = currentEntry[fieldKey] || defaultValue || '';

    const commonProps = {
      fullWidth: true,
      label: name,
      placeholder: notes || `Enter ${name.toLowerCase()}`,
      value: currentValue,
      onChange: (e) => handleInputChange(fieldKey, e.target.value),
      variant: "outlined",
      size: "large"
    };

    // Determine grid size - for SMS forms, we'll use larger fields
    const gridSize = input === 'textarea' ? 12 : 4;

    switch (input) {
      case 'textarea':
        return (
          <Grid size={12} key={fieldKey}>
            <TextField
              {...commonProps}
              multiline
              rows={4}
            />
          </Grid>
        );
      
      case 'number':
        return (
          <Grid size={{ xs: 12, md: gridSize }} key={fieldKey}>
            <TextField
              {...commonProps}
              type="number"
            />
          </Grid>
        );
      
      case 'string':
      default:
        return (
          <Grid size={{ xs: 12, md: gridSize }} key={fieldKey}>
            <TextField {...commonProps} />
          </Grid>
        );
    }
  };

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
        Schema Creator
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

      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      {/* Main Form */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          {/* Schema Name Field */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Schema Name"
                placeholder="Enter schema name"
                value={currentEntry.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                variant="outlined"
                size="large"
                required
              />
            </Grid>
          </Grid>

          {/* Dynamic Fields */}
          {schemaStructure?.vml?.fields && (
            <>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                SMS Schema Fields
              </Typography>
              <Grid container spacing={3} sx={{ mb: 3 }}>
                {schemaStructure.vml.fields.map((field, index) => 
                  renderField(field, index)
                )}
              </Grid>
            </>
          )}

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 3 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={addToList}
              startIcon={<AddIcon />}
              size="large"
              disabled={!currentEntry.name}
            >
              Add to List
            </Button>
            
            <Button
              variant="outlined"
              color="secondary"
              onClick={clearInputs}
              startIcon={<ClearIcon />}
              size="large"
            >
              Clear Inputs
            </Button>
          </Box>

          {/* CSV Upload Section */}
          <Divider sx={{ my: 3 }} />
          
          <Box sx={{ textAlign: 'center' }}>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              ref={fileInputRef}
              style={{ display: 'none' }}
            />
            <Button
              variant="outlined"
              onClick={() => fileInputRef.current?.click()}
              startIcon={<CloudUploadIcon />}
              sx={{ mr: 2 }}
            >
              Upload CSV
            </Button>
            <Typography variant="caption" display="block" sx={{ mt: 1, color: 'var(--mui-palette-text-secondary)' }}>
              Upload a CSV file with column 'Name' and schema fields
            </Typography>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Create All Button */}
          <Box sx={{ textAlign: 'center' }}>
            <Button
              variant="contained"
              color="warning"
              onClick={createAllSchemas}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CreateIcon />}
              disabled={customerList.length === 0 || loading}
              size="large"
              sx={{ 
                fontSize: '1.2rem',
                py: 1.5,
                px: 4,
                bgcolor: '#ff9800',
                '&:hover': {
                  bgcolor: '#f57c00'
                }
              }}
            >
              Create
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Customers to Create List */}
      {customerList.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h5" component="h2" fontWeight="bold">
                Entries to Create: ({customerList.length})
              </Typography>
              <Button
                variant="outlined"
                color="error"
                onClick={clearList}
                startIcon={<ClearIcon />}
              >
                Clear List
              </Button>
            </Box>
            
            <List>
              {customerList.map((customer, index) => {
                const displayFields = Object.entries(customer)
                  .filter(([key]) => key !== 'name')
                  .map(([key, value]) => `${key}: ${value || 'N/A'}`)
                  .join(' | ');
                
                return (
                  <ListItem key={index} divider>
                    <ListItemText
                      primary={customer.name}
                      secondary={displayFields}
                    />
                  </ListItem>
                );
              })}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Created Schemas List */}
      {createdSchemas.length > 0 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h5" component="h2" fontWeight="bold">
                Created Schemas: ({createdSchemas.length})
              </Typography>
              <Button
                variant="contained"
                color="primary"
                onClick={downloadLog}
                startIcon={<DownloadIcon />}
              >
                Download Log
              </Button>
            </Box>
            
            <List>
              {createdSchemas.map((schema, index) => {
                const displayFields = Object.entries(schema)
                  .filter(([key]) => key !== 'name' && key !== 'id')
                  .map(([key, value]) => `${key}: ${value || 'N/A'}`)
                  .join(' | ');

                return (
                  <ListItem key={index} divider>
                    <ListItemIcon>
                      <CheckCircleIcon color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary={`Created: ${schema.name}`}
                      secondary={displayFields}
                    />
                  </ListItem>
                );
              })}
            </List>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default SMSCreator;