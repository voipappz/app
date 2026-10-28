import { useState } from 'react';
import {
  Box, Button, ButtonBase, Checkbox, Chip, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel,
  FormHelperText, IconButton, InputLabel, MenuItem, Paper, Select, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import {
  Add as AddIcon, ArrowDownward as DownIcon, ArrowUpward as UpIcon, DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog as Dialog } from '../../ui';
import { menuProps } from '../../../utils/zIndex.js';
import { DestinationFields, useTargetText } from './DestinationPicker';
import { HourSelect } from './WeekHoursEditor';
import { DAYS, emptyTarget, formatHour, newRuleId, ruleProblem } from './callConditionSchedule';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const FROM_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const TO_HOURS = Array.from({ length: 24 }, (_, hour) => hour + 1);
const OPERATORS = ['IS', 'PREFIX', 'IN'];

const newRule = () => ({ id: newRuleId(), kind: 'caller', operator: 'PREFIX', value: '', target: emptyTarget() });

// What a new rule of each kind starts with.
const KIND_DEFAULTS = {
  caller: { operator: 'PREFIX', value: '' },
  dialled: { operator: 'IS', value: '' },
  time: { days: [1, 2, 3, 4, 5], allDay: false, from: 12, to: 13 },
  month: { months: [] },
};

// Consecutive days read as a run: "Sun–Thu", not "Sun, Mon, Tue, Wed, Thu".
const daysText = (t, days) => {
  if (days.length === 7) return t('sentence.everyDay');
  const sorted = [...days].sort((a, b) => a - b);
  const runs = [];
  sorted.forEach((day) => {
    const last = runs[runs.length - 1];
    if (last && last[1] === day - 1) last[1] = day;
    else runs.push([day, day]);
  });
  return runs.map(([first, last]) => {
    if (first === last) return t(`days.short.${first}`);
    if (last === first + 1) return `${t(`days.short.${first}`)}, ${t(`days.short.${last}`)}`;
    return t('hours.dayRun', { first: t(`days.short.${first}`), last: t(`days.short.${last}`) });
  }).join(', ');
};

// A number kept left to right inside a Hebrew sentence (the text form of <Bdi>).
const isolated = (text) => `\u2066${text}\u2069`;

// The card's sentence: "If the caller's number starts with +97250".
export const describeRule = (t, rule) => {
  switch (rule.kind) {
    case 'caller':
    case 'dialled':
      return t(`sentence.${rule.kind}${rule.operator}`, { value: isolated(rule.value) });
    case 'time': {
      const hours = rule.allDay
        ? t('sentence.allDay')
        : t('hours.range', { from: formatHour(rule.from), to: formatHour(rule.to) });
      return t('sentence.time', { days: daysText(t, rule.days), hours });
    }
    case 'month':
      return t('sentence.month', { months: [...rule.months].sort((a, b) => a - b).map((m) => t(`months.${m}`)).join(', ') });
    default:
      return t('rules.kept');
  }
};

function RuleDialog({ rule, onSave, onClose, types, destinations, environmentUuid, layer }) {
  const { t } = useTranslation('callConditions');
  const [draft, setDraft] = useState(rule);
  const [tried, setTried] = useState(false);
  const problem = ruleProblem(draft);
  const set = (changes) => setDraft((prev) => ({ ...prev, ...changes }));

  const changeKind = (kind) => {
    if (!kind || kind === draft.kind) return;
    setDraft((prev) => ({ id: prev.id, isNew: prev.isNew, target: prev.target, kind, ...KIND_DEFAULTS[kind] }));
  };
  const toggleIn = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const save = () => {
    setTried(true);
    if (!problem) onSave(draft);
  };
  const fieldError = (key) => (tried && problem === key ? t(key) : null);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" sx={{ zIndex: layer.DIALOG }}>
      <DialogTitle>{rule.isNew ? t('ruleDialog.titleNew') : t('ruleDialog.titleEdit')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography variant="overline" color="text.secondary">{t('ruleDialog.when')}</Typography>
          <ToggleButtonGroup exclusive value={draft.kind} onChange={(_, kind) => changeKind(kind)} size="small" sx={{ flexWrap: 'wrap' }}>
            {Object.keys(KIND_DEFAULTS).map((kind) => (
              <ToggleButton key={kind} value={kind} sx={{ textTransform: 'none' }}>{t(`ruleDialog.kinds.${kind}`)}</ToggleButton>
            ))}
          </ToggleButtonGroup>

          {(draft.kind === 'caller' || draft.kind === 'dialled') && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <FormControl sx={{ minWidth: 140 }}>
                <InputLabel>{t(`ruleDialog.kinds.${draft.kind}`)}</InputLabel>
                <Select value={draft.operator} label={t(`ruleDialog.kinds.${draft.kind}`)} onChange={(e) => set({ operator: e.target.value })} MenuProps={menuProps(layer)}>
                  {OPERATORS.map((op) => <MenuItem key={op} value={op}>{t(`ruleDialog.operator.${op}`)}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                label={t('ruleDialog.value')}
                value={draft.value}
                onChange={(e) => set({ value: e.target.value })}
                inputProps={{ inputMode: 'tel', dir: 'ltr' }}
                error={Boolean(fieldError('errors.valueRequired'))}
                helperText={fieldError('errors.valueRequired') || (draft.operator === 'IN' ? t('ruleDialog.valueListHelp') : ' ')}
                sx={{ flex: 1, minWidth: 180 }}
              />
            </Box>
          )}

          {draft.kind === 'time' && (
            <>
              <Box>
                <Typography variant="body2" sx={{ mb: 0.5 }}>{t('ruleDialog.days')}</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {DAYS.map((day) => (
                    <Chip
                      key={day}
                      label={t(`days.short.${day}`)}
                      color={draft.days.includes(day) ? 'primary' : 'default'}
                      variant={draft.days.includes(day) ? 'filled' : 'outlined'}
                      onClick={() => set({ days: toggleIn(draft.days, day) })}
                      aria-pressed={draft.days.includes(day)}
                    />
                  ))}
                </Box>
                {fieldError('errors.daysRequired') && <FormHelperText error>{fieldError('errors.daysRequired')}</FormHelperText>}
              </Box>
              <FormControlLabel
                control={<Checkbox checked={draft.allDay} onChange={(e) => set({ allDay: e.target.checked })} />}
                label={t('ruleDialog.allDay')}
              />
              {!draft.allDay && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <HourSelect value={draft.from} hours={FROM_HOURS} layer={layer} label={t('hours.from')} onChange={(from) => set({ from })} />
                  <Typography component="span" aria-hidden>–</Typography>
                  <HourSelect value={draft.to} hours={TO_HOURS} layer={layer} label={t('hours.to')} onChange={(to) => set({ to })}
                    error={Boolean(fieldError('errors.endBeforeStart'))} />
                </Box>
              )}
              {fieldError('errors.endBeforeStart') && <FormHelperText error>{fieldError('errors.endBeforeStart')}</FormHelperText>}
            </>
          )}

          {draft.kind === 'month' && (
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>{t('ruleDialog.months')}</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {MONTHS.map((month) => (
                  <Chip
                    key={month}
                    label={t(`months.${month}`)}
                    color={draft.months.includes(month) ? 'primary' : 'default'}
                    variant={draft.months.includes(month) ? 'filled' : 'outlined'}
                    onClick={() => set({ months: toggleIn(draft.months, month) })}
                    aria-pressed={draft.months.includes(month)}
                  />
                ))}
              </Box>
              {fieldError('errors.monthsRequired') && <FormHelperText error>{fieldError('errors.monthsRequired')}</FormHelperText>}
            </Box>
          )}

          <Typography variant="overline" color="text.secondary">{t('ruleDialog.goesTo')}</Typography>
          <DestinationFields
            target={draft.target}
            onChange={(target) => set({ target })}
            types={types}
            destinations={destinations}
            environmentUuid={environmentUuid}
            layer={layer}
            error={tried && problem === 'errors.destinationRequired' ? 'errors.destinationRequired' : null}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('ruleDialog.cancel')}</Button>
        <Button variant="contained" onClick={save}>{t('ruleDialog.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Rules checked before business hours, as cards that read as sentences:
 * "If the caller's number starts with +97250 → Queue · VIP". Tap a card to
 * change it; the arrows set the order they are checked in.
 */
export default function MoreRules({ rules, onChange, errors = {}, types, destinations, environmentUuid, layer }) {
  const { t } = useTranslation('callConditions');
  const targetText = useTargetText();
  const [editing, setEditing] = useState(null); // index, or 'new'

  const move = (index, step) => {
    const next = [...rules];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  };
  const remove = (index) => onChange(rules.filter((_, i) => i !== index));
  const saveRule = (rule) => {
    const { isNew, ...clean } = rule;
    onChange(isNew ? [...rules, clean] : rules.map((r, i) => (i === editing ? clean : r)));
    setEditing(null);
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700}>{t('rules.title')}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{t('rules.hint')}</Typography>

      {rules.map((rule, index) => {
        const destination = targetText(rule.target, destinations);
        const kept = rule.kind === 'kept';
        return (
          <Paper key={rule.id} variant="outlined" data-testid="rule-card" data-problem={errors[`rule${index}`] ? true : undefined}
            sx={{ display: 'flex', alignItems: 'center', mb: 1, borderColor: errors[`rule${index}`] ? 'error.main' : 'divider' }}>
            <ButtonBase
              disabled={kept}
              onClick={() => setEditing(index)}
              sx={{ flex: 1, minWidth: 0, display: 'block', textAlign: 'start', p: 1.5 }}
            >
              <Typography variant="body2" color={kept ? 'text.secondary' : 'text.primary'}>
                {describeRule(t, rule)}
              </Typography>
              <Typography variant="body2" fontWeight={600}>{t('rules.goesTo', { destination: destination || '—' })}</Typography>
            </ButtonBase>
            <Box sx={{ display: 'flex', flexShrink: 0 }}>
              <Tooltip title={t('rules.moveUp')}>
                <span><IconButton size="small" aria-label={t('rules.moveUp')} disabled={index === 0} onClick={() => move(index, -1)}><UpIcon fontSize="small" /></IconButton></span>
              </Tooltip>
              <Tooltip title={t('rules.moveDown')}>
                <span><IconButton size="small" aria-label={t('rules.moveDown')} disabled={index === rules.length - 1} onClick={() => move(index, 1)}><DownIcon fontSize="small" /></IconButton></span>
              </Tooltip>
              <Tooltip title={t('rules.delete')}>
                <IconButton size="small" aria-label={t('rules.delete')} onClick={() => remove(index)}><DeleteIcon fontSize="small" /></IconButton>
              </Tooltip>
            </Box>
          </Paper>
        );
      })}

      <Button startIcon={<AddIcon />} onClick={() => setEditing('new')} sx={{ textTransform: 'none' }}>{t('rules.add')}</Button>

      {editing !== null && (
        <RuleDialog
          rule={editing === 'new' ? { ...newRule(), isNew: true } : rules[editing]}
          onSave={saveRule}
          onClose={() => setEditing(null)}
          types={types}
          destinations={destinations}
          environmentUuid={environmentUuid}
          layer={layer}
        />
      )}
    </Box>
  );
}
