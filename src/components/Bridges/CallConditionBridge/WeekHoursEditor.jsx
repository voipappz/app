import { Box, Button, FormHelperText, IconButton, MenuItem, Select, Switch, Tooltip, Typography } from '@mui/material';
import { Add as AddIcon, Close as RemoveIcon, ContentCopy as CopyIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import Bdi from '../../../i18n/Bdi';
import { menuProps } from '../../../utils/zIndex.js';
import { DAYS, MAX_RANGES_PER_DAY, defaultRange, formatHour, weekRuns } from './callConditionSchedule';

const FROM_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const TO_HOURS = Array.from({ length: 24 }, (_, hour) => hour + 1);

// One whole-hour picker ("09:00").
export function HourSelect({ value, hours, onChange, label, layer, error }) {
  return (
    <Select
      size="small"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      SelectDisplayProps={{ 'aria-label': label }}
      error={error}
      MenuProps={menuProps(layer)}
      sx={{ minWidth: 92 }}
    >
      {hours.map((hour) => <MenuItem key={hour} value={hour}><Bdi>{formatHour(hour)}</Bdi></MenuItem>)}
    </Select>
  );
}

// "Sun–Thu 09:00–17:00 · Fri 09:00–13:00 · Sat Closed"
export function WeekSummary({ week }) {
  const { t } = useTranslation('callConditions');
  const runs = weekRuns(week);
  if (runs.length === 1 && !runs[0].open) {
    return <Typography variant="body2" color="text.secondary">{t('hours.closedAllWeek')}</Typography>;
  }
  const dayName = (day) => t(`days.short.${day}`);
  const text = runs.map((run) => {
    const days = run.from === run.to ? dayName(run.from) : t('hours.dayRun', { first: dayName(run.from), last: dayName(run.to) });
    const hours = run.open
      ? run.ranges.map((r) => t('hours.range', { from: formatHour(r.from), to: formatHour(r.to) })).join(', ')
      : t('hours.closed');
    return `${days} ${hours}`;
  }).join(' · ');
  return <Typography variant="body2" color="text.secondary" data-testid="week-summary">{text}</Typography>;
}

/**
 * The week as day rows, the way WhatsApp Business and Google show opening
 * hours: each day open or closed, with its hours; "+" splits a day into more
 * hours, and the copy button gives every day the same hours as this one.
 */
export default function WeekHoursEditor({ week, onChange, errors = {}, layer, onCopied }) {
  const { t } = useTranslation('callConditions');

  const setDay = (dayIndex, day) => onChange(week.map((d, i) => (i === dayIndex ? day : d)));
  const setRange = (dayIndex, rangeIndex, range) => {
    const day = week[dayIndex];
    setDay(dayIndex, { ...day, ranges: day.ranges.map((r, i) => (i === rangeIndex ? range : r)) });
  };
  const toggle = (dayIndex, open) => {
    const day = week[dayIndex];
    setDay(dayIndex, { open, ranges: open && day.ranges.length === 0 ? [defaultRange()] : day.ranges });
  };
  const addRange = (dayIndex) => {
    const day = week[dayIndex];
    const last = day.ranges[day.ranges.length - 1];
    const from = last ? Math.min(last.to + 1, 23) : 9;
    setDay(dayIndex, { ...day, ranges: [...day.ranges, { from, to: Math.min(from + 4, 24) }] });
  };
  const removeRange = (dayIndex, rangeIndex) => {
    const day = week[dayIndex];
    setDay(dayIndex, { ...day, ranges: day.ranges.filter((_, i) => i !== rangeIndex) });
  };
  const copyToAll = (dayIndex) => {
    const source = week[dayIndex];
    onChange(week.map(() => ({ open: source.open, ranges: source.ranges.map((r) => ({ ...r })) })));
    onCopied?.(dayIndex);
  };

  return (
    <Box role="list" sx={{ display: 'flex', flexDirection: 'column' }}>
      {DAYS.map((dayIndex) => {
        const day = week[dayIndex];
        const dayName = t(`days.short.${dayIndex}`);
        const error = errors[`day${dayIndex}`];
        return (
          <Box
            key={dayIndex}
            role="listitem"
            data-testid={`day-row-${dayIndex}`}
            // Day, switch, hours and copy share the line while one set of
            // hours fits (13rem); on a narrower screen the hours and the copy
            // button wrap under the day. A closed day's word always fits.
            sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1, py: 1, borderBottom: 1, borderColor: 'divider' }}
          >
            <Typography sx={{ width: 40, flexShrink: 0, pt: 1, fontWeight: 600 }}>{dayName}</Typography>
            <Switch
              checked={day.open}
              onChange={(event) => toggle(dayIndex, event.target.checked)}
              slotProps={{ input: { role: 'switch', 'aria-label': t('hours.openSwitch', { day: dayName }) } }}
              sx={{ flexShrink: 0 }}
            />
            <Box sx={{ flex: day.open ? '1 1 13rem' : '1 1 auto', minWidth: 0 }}>
              {!day.open ? (
                <Typography color="text.secondary" sx={{ pt: 1 }}>{t('hours.closed')}</Typography>
              ) : (
                <>
                  {day.ranges.map((range, rangeIndex) => (
                    <Box key={rangeIndex} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
                      <HourSelect value={range.from} hours={FROM_HOURS} layer={layer} label={t('hours.from')} error={Boolean(error)}
                        onChange={(from) => setRange(dayIndex, rangeIndex, { ...range, from })} />
                      <Typography component="span" aria-hidden>–</Typography>
                      <HourSelect value={range.to} hours={TO_HOURS} layer={layer} label={t('hours.to')} error={Boolean(error)}
                        onChange={(to) => setRange(dayIndex, rangeIndex, { ...range, to })} />
                      {day.ranges.length > 1 && (
                        <Tooltip title={t('hours.removeHours')}>
                          <IconButton size="small" aria-label={t('hours.removeHours')} onClick={() => removeRange(dayIndex, rangeIndex)}>
                            <RemoveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  ))}
                  {day.ranges.length < MAX_RANGES_PER_DAY && (
                    <Button size="small" startIcon={<AddIcon />} onClick={() => addRange(dayIndex)} sx={{ textTransform: 'none' }}>
                      {t('hours.addHours')}
                    </Button>
                  )}
                </>
              )}
              {error && <FormHelperText error>{t(error)}</FormHelperText>}
            </Box>
            <Tooltip title={t('hours.copyToAll', { day: dayName })}>
              <IconButton aria-label={t('hours.copyToAll', { day: dayName })} onClick={() => copyToAll(dayIndex)} sx={{ flexShrink: 0 }}>
                <CopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        );
      })}
    </Box>
  );
}
