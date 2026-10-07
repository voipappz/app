import React from 'react';
import { Box } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import DateLocalizationProvider from '../../../i18n/DateLocalizationProvider';

/**
 * Date Range Filter Component
 *
 * Provides start and end date pickers for filtering data by date range.
 * Based on AngularJS pattern: <md-date-range st-date-select="{{datesearch.created_at}}"
 *                                             predicate="created_at">
 *
 * @param {Object} props
 * @param {string} props.field - API field name (e.g., 'created_at', 'updated_at')
 * @param {string} props.startLabel - Label for start date (default: 'Start Date')
 * @param {string} props.endLabel - Label for end date (default: 'End Date')
 * @param {Date|null} props.startValue - Current start date value
 * @param {Date|null} props.endValue - Current end date value
 * @param {function} props.onStartChange - Callback: (field, value) => void
 * @param {function} props.onEndChange - Callback: (field, value) => void
 * @param {Object} props.sx - Additional Material-UI sx props
 */
const DateRangeFilter = ({
  field,
  startLabel = 'Start Date',
  endLabel = 'End Date',
  startValue = null,
  endValue = null,
  onStartChange,
  onEndChange,
  sx = {}
}) => {
  const handleStartChange = (newValue) => {
    onStartChange(`${field}_start`, newValue);
  };

  const handleEndChange = (newValue) => {
    onEndChange(`${field}_end`, newValue);
  };

  return (
    <DateLocalizationProvider>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          ...sx
        }}
      >
        <DatePicker
          label={startLabel}
          value={startValue}
          onChange={handleStartChange}
          slotProps={{
            textField: {
              size: 'small',
              fullWidth: true,
              sx: {
                backgroundColor: 'background.paper',
              }
            },
          }}
        />
        <DatePicker
          label={endLabel}
          value={endValue}
          onChange={handleEndChange}
          minDate={startValue}
          slotProps={{
            textField: {
              size: 'small',
              fullWidth: true,
              sx: {
                backgroundColor: 'background.paper',
              }
            },
          }}
        />
      </Box>
    </DateLocalizationProvider>
  );
};

export default DateRangeFilter;
