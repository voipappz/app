import React, { useState, useEffect } from 'react';
import {
  Autocomplete,
  TextField,
  Button,
  CircularProgress,
  Box,
  Typography,
  Paper
} from '@mui/material';
import {
  Phone as PhoneIcon,
  Add as AddIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import Bdi from '../../../i18n/Bdi';
import { useNumberSelector } from './NumberSelector.js';

/**
 * NumberSelector Component
 * Autocomplete selector for phone numbers with async search
 *
 * Based on legacy AngularJS patterns from:
 * - /opt/src/va-voipbox-admin/src/scripts/directives/directives.js (select2ajax directive)
 *
 * Features:
 * - Real-time search with 250ms debounce
 * - Environment-scoped filtering
 * - Inline "Number not found" with "+ Add this number" button
 * - Display: phone number (E.164)
 * - Value: UUID
 */
export const NumberSelector = ({
  value, // bridge_uuid
  onChange, // (uuid, displayNumber) => void
  environmentUuid,
  label,
  placeholder,
  required = false,
  error = null,
  helperText = null,
  disabled = false
}) => {
  const { t } = useTranslation('routes');
  const {
    numbers,
    loading,
    displayValue,
    debouncedSearch,
    createNumber,
    error: hookError
  } = useNumberSelector(value, environmentUuid);

  const [inputValue, setInputValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Update input value when display value changes
  useEffect(() => {
    if (displayValue) {
      setInputValue(displayValue.number || '');
    }
  }, [displayValue]);

  // Handle selection change
  const handleChange = (event, newValue) => {
    if (newValue === null) {
      // Cleared selection
      onChange(null, '');
      setInputValue('');
    } else if (typeof newValue === 'string') {
      // User typed - don't do anything special, they can click the button
      setInputValue(newValue);
    } else {
      // Selected from dropdown
      onChange(newValue.uuid, newValue.number);
      setInputValue(newValue.number || '');
    }
  };

  // Handle input change (typing)
  const handleInputChange = (event, newInputValue, reason) => {
    setInputValue(newInputValue);

    // Trigger search on type
    if (reason === 'input') {
      debouncedSearch(newInputValue);
    }
  };

  // Handle inline create number
  const handleAddNumber = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!inputValue || !environmentUuid || isCreating) {
      return;
    }

    setIsCreating(true);
    try {
      const created = await createNumber(inputValue, environmentUuid);
      onChange(created.uuid, created.number);
      setInputValue(created.number);
    } catch (err) {
      console.error('Error creating number:', err);
      // Error is handled by hook
    } finally {
      setIsCreating(false);
    }
  };

  // Check if input matches any existing number
  const inputMatchesExisting = numbers.some(n =>
    n.number === inputValue || n.number === inputValue.trim()
  );

  // Show "Number not found" when:
  // - User has typed something
  // - Not loading
  // - No exact match in results
  const showNotFound = inputValue.length > 0 && !loading && !inputMatchesExisting && numbers.length === 0;

  return (
    <Autocomplete
      value={displayValue}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      options={numbers}
      getOptionLabel={(option) => {
        if (typeof option === 'string') return option;
        return option.number || '';
      }}
      loading={loading}
      freeSolo
      disabled={disabled || !environmentUuid}
      filterOptions={(x) => x} // Disable client-side filtering (we do server-side)
      PaperComponent={({ children, ...props }) => (
        <Paper {...props}>
          {children}
          {/* Inline "Number not found" with Add button - like legacy admin */}
          {showNotFound && (
            <Box
              sx={{
                p: 1.5,
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {t('numberSelector.notFound')}
              </Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={isCreating ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
                onClick={handleAddNumber}
                disabled={isCreating || !inputValue}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {isCreating ? t('numberSelector.adding') : t('numberSelector.addThis')}
              </Button>
            </Box>
          )}
        </Paper>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label ?? t('numberSelector.label')}
          placeholder={placeholder ?? t('numberSelector.placeholder')}
          required={required}
          error={!!error || !!hookError}
          helperText={helperText || error || hookError || (!environmentUuid ? t('numberSelector.selectApplication') : '')}
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <>
                <SearchIcon sx={{ me: 1, color: 'action.active' }} />
                {params.InputProps.startAdornment}
              </>
            ),
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.uuid}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhoneIcon sx={{ color: 'action.active', fontSize: 20 }} />
            <Box>
              <Typography variant="body2"><Bdi>{option.number}</Bdi></Typography>
              {option.name && (
                <Typography variant="caption" color="text.secondary">
                  {option.name}
                </Typography>
              )}
            </Box>
          </Box>
        </li>
      )}
      noOptionsText={
        loading
          ? t('numberSelector.searching')
          : inputValue.length < 1
          ? t('numberSelector.typeToSearch')
          : null // We show our custom "Number not found" UI instead
      }
    />
  );
};

export default NumberSelector;
