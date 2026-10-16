import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, IconButton, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { endOfDay, startOfDay } from 'date-fns';
import EnhancedDateRangePicker from '../shared/EnhancedDateRangePicker/EnhancedDateRangePicker.jsx';
import { dayKey } from '../../utils/dateUtils';

// The Calls screen's date range picker, compact, speaking day keys
// (YYYY-MM-DD) in and out: that is what GET /api/conversations takes as
// from / to. Empty means all time, shown as "Select dates".
const atLocalMidnight = (day) => new Date(`${day}T00:00:00`);

export default function DateRangeControl({ from, to, onChange }) {
  const { t } = useTranslation('conversations');
  const dateRange = useMemo(
    () => (from && to ? [startOfDay(atLocalMidnight(from)), endOfDay(atLocalMidnight(to))] : [null, null]),
    [from, to]
  );
  const setDateRange = (range) => {
    const [start, end] = range || [];
    onChange(start && end ? { from: dayKey(start), to: dayKey(end) } : { from: '', to: '' });
  };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <EnhancedDateRangePicker compact dateRange={dateRange} setDateRange={setDateRange} />
      {from && to && (
        <Tooltip title={t('dateRange.clear')}>
          <IconButton size="small" aria-label={t('dateRange.clear')} onClick={() => onChange({ from: '', to: '' })}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
