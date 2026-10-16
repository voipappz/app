import { useTranslation } from 'react-i18next';
import { Box, Button, ButtonGroup } from '@mui/material';
import { subDays } from 'date-fns';
import { dayKey } from '../../utils/dateUtils';
import DateRangeControl from './DateRangeControl.jsx';

/** Calendar-day ranges match the Conversations API's from/to contract. */
export default function HistoryPeriod({ range, onChange }) {
  const { t } = useTranslation('conversations');
  const today = dayKey(new Date());
  return <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
    <ButtonGroup size="small" aria-label={t('period.label')}>
      {[1, 7, 30].map((days) => {
        const from = dayKey(subDays(new Date(), days - 1));
        const active = range.from === from && range.to === today;
        return <Button key={days} aria-pressed={active} variant={active ? 'contained' : 'outlined'}
          onClick={() => onChange({ from, to: today })} sx={{ textTransform: 'none', minHeight: 36 }}>
          {t(days === 1 ? 'period.today' : `period.days${days}`)}
        </Button>;
      })}
    </ButtonGroup>
    <DateRangeControl from={range.from || ''} to={range.to || ''} onChange={onChange} />
  </Box>;
}
