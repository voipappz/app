import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, ButtonBase, Typography } from '@mui/material';
import { formatOnlyDate } from '../../utils/dateUtils';
import { historyActivity } from './historyActivity';

const categories = ['answered', 'missed', 'other'];
const colors = { answered: 'success.main', missed: 'warning.main', other: 'text.disabled' };
const dateLabel = (day) => formatOnlyDate(`${day}T00:00:00`);

export default function ConversationActivity({ items, selected, range, onRangeChange }) {
  const { t } = useTranslation('conversations');
  const [open, setOpen] = useState(true);
  const bins = historyActivity(items, selected, range);
  const total = bins.reduce((sum, bin) => sum + bin.total, 0);
  const max = Math.max(1, ...bins.map((bin) => bin.total));
  return <Box sx={{ borderBottom: 1, borderColor: 'divider', py: 1 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{t('activity.title')}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t('activity.callCount', { count: total })}</Typography>
      <Button size="small" aria-expanded={open} onClick={() => setOpen((value) => !value)} sx={{ marginInlineStart: 'auto', textTransform: 'none', minHeight: 36 }}>{t(open ? 'activity.hide' : 'activity.show')}</Button>
    </Box>
    {open && <>
      {bins.length > 0 ? <>
        <Box role="group" aria-label={t('activity.title')} sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5, height: 68, borderBottom: 1, borderColor: 'divider', mt: 1 }}>
          {bins.map((bin) => {
            const label = t('activity.bucket', { from: dateLabel(bin.from), to: dateLabel(bin.to), count: bin.total, answered: bin.answered, missed: bin.missed, other: bin.other });
            return <ButtonBase key={bin.from} title={label} aria-label={label} disabled={!bin.total}
              onClick={() => onRangeChange({ from: bin.from, to: bin.to })}
              sx={{ flex: 1, minWidth: 0, alignItems: 'flex-end', '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}>
              <Box aria-hidden sx={{ display: 'flex', flexDirection: 'column-reverse', width: '100%', maxWidth: 36, height: `${bin.total / max * 100}%`, minHeight: bin.total ? 3 : 0 }}>
                {categories.map((key) => <Box key={key} sx={{ bgcolor: colors[key], flex: bin[key] }} />)}
              </Box>
            </ButtonBase>;
          })}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, color: 'text.secondary' }}><Typography variant="caption">{dateLabel(bins[0].from)}</Typography><Typography variant="caption">{dateLabel(bins[bins.length - 1].to)}</Typography></Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, my: 0.5 }}>
          {categories.map((key) => <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors[key] }} /><Typography variant="caption" color="text.secondary">{t(`activity.${key}`)} {bins.reduce((sum, bin) => sum + bin[key], 0)}</Typography></Box>)}
        </Box>
      </> : <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>{t('activity.empty')}</Typography>}
      <Typography variant="caption" color="text.secondary">{t('activity.hint')}</Typography>
    </>}
  </Box>;
}
