import React from 'react';
import { Box, Button, TextField, Typography, ButtonGroup } from '@mui/material';
import { addDays, endOfDay, format, startOfDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import './DateRangePicker.css';

const DateRangePicker = ({ dateRange, setDateRange }) => {
  const { t } = useTranslation('reports');
  // `key` is the range's identity; its words come from reports.json.
  const quickDateRanges = [
    {
      key: 'today',
      range: () => [startOfDay(new Date()), endOfDay(new Date())],
    },
    {
      key: 'days7',
      range: () => [startOfDay(addDays(new Date(), -6)), endOfDay(new Date())],
    },
    {
      key: 'days30',
      range: () => [startOfDay(addDays(new Date(), -29)), endOfDay(new Date())],
    },
  ];

  // Native `new Date('YYYY-MM-DD')` is parsed as UTC and can move a selected
  // day in non-UTC time zones. Build a local calendar date explicitly.
  const parseLocalDate = (value) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const handleQuickDateSelect = (quickRange) => {
    const range = quickRange.range();
    setDateRange(range);
  };

  const isDateRangeSelected = (quickRange) => {
    if (!dateRange[0] || !dateRange[1]) return false;
    
    const range = quickRange.range();
    const currentStart = new Date(dateRange[0]);
    const currentEnd = new Date(dateRange[1]);
    const quickStart = new Date(range[0]);
    const quickEnd = new Date(range[1]);
    
    return (
      currentStart.toDateString() === quickStart.toDateString() &&
      currentEnd.toDateString() === quickEnd.toDateString()
    );
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <ButtonGroup variant="outlined" size="small" sx={{ borderRadius: '8px', overflow: 'hidden' }}>
          {quickDateRanges.map((quickRange) => {
            const isSelected = isDateRangeSelected(quickRange);
            return (
              <Button
                key={quickRange.key}
                onClick={() => handleQuickDateSelect(quickRange)}
                variant={isSelected ? 'contained' : 'outlined'}
                sx={{
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  px: 1.25,
                  py: 0.35,
                  ...(isSelected && { fontWeight: 700 }),
                }}
              >
                {t(`range.${quickRange.key}`)}
              </Button>
            );
          })}
        </ButtonGroup>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label={t('range.from')}
              type="date"
              value={dateRange?.[0] ? format(new Date(dateRange[0]), 'yyyy-MM-dd') : ''}
              onChange={(e) => {
                if (e.target.value) {
                  const newStartDate = startOfDay(parseLocalDate(e.target.value));
                  const currentEnd = dateRange?.[1] ? endOfDay(new Date(dateRange[1])) : endOfDay(newStartDate);
                  setDateRange([newStartDate, currentEnd < newStartDate ? endOfDay(newStartDate) : currentEnd]);
                }
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 145 }}
            />

          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            {t('range.between')}
          </Typography>

            <TextField
              size="small"
              label={t('range.to')}
              type="date"
              value={dateRange?.[1] ? format(new Date(dateRange[1]), 'yyyy-MM-dd') : ''}
              onChange={(e) => {
                if (e.target.value) {
                  const newEndDate = endOfDay(parseLocalDate(e.target.value));
                  const currentStart = dateRange?.[0] ? startOfDay(new Date(dateRange[0])) : startOfDay(newEndDate);
                  setDateRange([currentStart > newEndDate ? startOfDay(newEndDate) : currentStart, newEndDate]);
                }
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 145 }}
            />
        </Box>
    </Box>
  );
};

export default DateRangePicker;
