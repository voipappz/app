import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { currentDateFnsLocale } from '../../../i18n/formatLocale';
import { Box, Button, ButtonGroup, IconButton, Popover, TextField, Tooltip, Typography } from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { addDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { primaryButtonStyle, secondaryButtonStyle } from '../../../theme/buttonStyles';
import { formatDateRangeDisplay } from './datePresets';
import useEnhancedDateRangePicker from './useEnhancedDateRangePicker';
import './EnhancedDateRangePicker.css';

// Inline quick ranges (the reports date-selector design).
const QUICK_RANGES = [
  { key: 'day', range: () => [startOfDay(new Date()), endOfDay(new Date())] },
  { key: 'yesterday', range: () => [startOfDay(addDays(new Date(), -1)), endOfDay(addDays(new Date(), -1))] },
  { key: 'week', range: () => [startOfWeek(new Date()), endOfWeek(new Date())] },
  { key: 'month', range: () => [startOfMonth(new Date()), endOfMonth(new Date())] },
];

const EnhancedDateRangePicker = ({ dateRange, setDateRange }) => {
  const { t } = useTranslation();
  // The popover opens under the calendar icon, toward the page's end side.
  const endSide = useTheme().direction === 'rtl' ? 'left' : 'right';
  const isRangeActive = (qr) => {
    if (!dateRange?.[0] || !dateRange?.[1]) return false;
    const [s, e] = qr.range();
    return new Date(dateRange[0]).toDateString() === s.toDateString()
      && new Date(dateRange[1]).toDateString() === e.toDateString();
  };
  const {
    anchorEl,
    open,
    tempStart,
    tempEnd,
    selectedPreset,
    presets,
    setTempStart,
    setTempEnd,
    handleOpen,
    handleClose,
    handlePresetSelect,
    handleApply,
    handleCancel,
  } = useEnhancedDateRangePicker(dateRange, setDateRange);

  const displayText = formatDateRangeDisplay(dateRange, {
    presetName: (preset) => t(`datePicker.preset.${preset.key}`),
    emptyText: t('datePicker.selectDates'),
    locale: currentDateFnsLocale(),
  });

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {/* Inline purple quick ranges — the reports date-selector design. */}
        <ButtonGroup variant="contained" disableElevation sx={{ borderRadius: '8px', overflow: 'hidden' }}>
          {QUICK_RANGES.map((qr) => {
            const active = isRangeActive(qr);
            return (
              <Button
                key={qr.key}
                onClick={() => setDateRange(qr.range())}
                sx={{
                  bgcolor: active ? '#3f4fb5' : '#5c6bc0',
                  color: '#fff',
                  fontWeight: active ? 700 : 500,
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  px: 1.25, py: 0.35, minWidth: 0,
                  '&:hover': { bgcolor: '#3f4fb5' },
                  '&:not(:last-child)': { borderRight: '1px solid rgba(255,255,255,0.3)' },
                }}
              >
                {t(`datePicker.quick.${qr.key}`)}
              </Button>
            );
          })}
        </ButtonGroup>
        {/* Custom range — a single calendar icon opens the popover (no duplicate
            date trigger). Tooltip shows the current range. */}
        <Tooltip title={displayText || t('datePicker.customRange')}>
          <IconButton size="small" onClick={handleOpen} sx={{ color: 'var(--accent-primary)', p: 0.5 }}>
            <CalendarTodayIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: endSide }}
        transformOrigin={{ vertical: 'top', horizontal: endSide }}
        PaperProps={{
          sx: {
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            mt: 1,
            overflow: 'hidden',
          }
        }}
      >
        <Box className="enhanced-date-picker-popover">
          {/* Presets sidebar */}
          <Box className="enhanced-date-picker-presets">
            {presets.map((preset) => (
              <Box
                key={preset.label}
                className={`enhanced-date-picker-preset-item ${selectedPreset === preset.label ? 'selected' : ''}`}
                onClick={() => handlePresetSelect(preset)}
              >
                {t(`datePicker.preset.${preset.key}`)}
              </Box>
            ))}
          </Box>

          {/* Custom date inputs */}
          <Box className="enhanced-date-picker-custom">
            <Typography
              variant="subtitle2"
              sx={{ fontFamily: 'var(--font-family)', fontWeight: 600, color: 'var(--theme-text-primary)' }}
            >
              {t('datePicker.customRangeTitle')}
            </Typography>

            <Box className="enhanced-date-picker-inputs">
              <TextField
                size="small"
                label={t('datePicker.start')}
                type="date"
                value={tempStart}
                onChange={(e) => setTempStart(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.85rem',
                    borderRadius: '6px',
                    '& fieldset': { borderColor: 'var(--theme-border)' },
                    '&:hover fieldset': { borderColor: 'var(--accent-primary)' },
                    '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' },
                  },
                  '& .MuiInputLabel-root': {
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.85rem',
                    '&.Mui-focused': { color: 'var(--accent-primary)' },
                  },
                }}
              />
              <Typography variant="body2" sx={{ color: 'var(--theme-text-secondary)' }}>{t('datePicker.to')}</Typography>
              <TextField
                size="small"
                label={t('datePicker.end')}
                type="date"
                value={tempEnd}
                onChange={(e) => setTempEnd(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.85rem',
                    borderRadius: '6px',
                    '& fieldset': { borderColor: 'var(--theme-border)' },
                    '&:hover fieldset': { borderColor: 'var(--accent-primary)' },
                    '&.Mui-focused fieldset': { borderColor: 'var(--accent-primary)' },
                  },
                  '& .MuiInputLabel-root': {
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.85rem',
                    '&.Mui-focused': { color: 'var(--accent-primary)' },
                  },
                }}
              />
            </Box>

            <Box className="enhanced-date-picker-actions">
              <Button
                size="small"
                onClick={handleCancel}
                sx={{ ...secondaryButtonStyle, px: 2, py: 0.5 }}
              >
                {t('datePicker.cancel')}
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleApply}
                disabled={!tempStart || !tempEnd}
                sx={{ ...primaryButtonStyle, px: 2, py: 0.5 }}
              >
                {t('datePicker.apply')}
              </Button>
            </Box>
          </Box>
        </Box>
      </Popover>
    </>
  );
};

export default EnhancedDateRangePicker;
