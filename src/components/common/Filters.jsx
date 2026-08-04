import { useCallback } from 'react';
import {
  Box, Paper, Stack, Select, MenuItem, TextField, IconButton, Button, Switch,
  FormControl, InputLabel, OutlinedInput, Chip, Typography, Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { useTranslation } from 'react-i18next';
import { newFilter, STRING_OPS, NUMERIC_OPS } from './filterModel';

/**
 * Filters — a reusable, controlled filter builder, ported from the
 * va-voipbox-portal `report-filters` UX: pick a field, it adds a typed input
 * row; filters AND together. Used by Calls and Reports.
 *
 * props:
 *   fields:  [{ name, label, type:'string'|'numeric'|'select'|'multiselect'|'time'|'boolean', options? }]
 *   value:   active filters (see filterModel.newFilter shape)
 *   onChange(nextFilters)
 */
export default function Filters({ fields, value, onChange }) {
  const { t } = useTranslation();
  const filters = value || [];
  const fieldOf = useCallback((name) => fields.find((f) => f.name === name), [fields]);
  const labelOf = (name) => fieldOf(name)?.label || name;

  const add = (name) => { const f = fieldOf(name); if (f) onChange([...filters, newFilter(f)]); };
  const removeAt = (i) => onChange(filters.filter((_, idx) => idx !== i));
  const patchAt = (i, patch) => onChange(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const renderInput = (f, i) => {
    const field = fieldOf(f.name) || {};
    switch (f.type) {
      case 'string':
        return (
          <>
            <Select size="small" value={f.op} onChange={(e) => patchAt(i, { op: e.target.value })} sx={{ minWidth: { xs: 96, sm: 110 } }}>
              {STRING_OPS.map((op) => <MenuItem key={op} value={op}>{t(`filters.op.${op}`, op)}</MenuItem>)}
            </Select>
            <TextField size="small" value={f.value} onChange={(e) => patchAt(i, { value: e.target.value })} placeholder={labelOf(f.name)} sx={{ flex: 1, minWidth: { xs: 120, sm: 140 } }} />
          </>
        );
      case 'numeric':
        return (
          <>
            <Select size="small" value={f.op} onChange={(e) => patchAt(i, { op: e.target.value })} sx={{ minWidth: 80 }}>
              {NUMERIC_OPS.map((op) => <MenuItem key={op} value={op}>{op}</MenuItem>)}
            </Select>
            <TextField size="small" type="number" value={f.value} onChange={(e) => patchAt(i, { value: e.target.value })} sx={{ flex: 1, minWidth: 120 }} />
          </>
        );
      case 'select':
        return (
          <Select size="small" value={f.value} displayEmpty onChange={(e) => patchAt(i, { value: e.target.value })} sx={{ flex: 1, minWidth: { xs: 130, sm: 160 } }}>
            <MenuItem value=""><em>{t('filters.any', 'Any')}</em></MenuItem>
            {(field.options || []).map((o) => <MenuItem key={o} value={o}>{t(`filters.value.${o}`, o)}</MenuItem>)}
          </Select>
        );
      case 'multiselect':
        return (
          <FormControl size="small" sx={{ flex: 1, minWidth: { xs: 140, sm: 200 } }}>
            <Select
              multiple value={f.value} onChange={(e) => patchAt(i, { value: e.target.value })}
              input={<OutlinedInput />} renderValue={(sel) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{sel.map((v) => <Chip key={v} size="small" label={t(`filters.value.${v}`, v)} />)}</Box>
              )}
            >
              {(field.options || []).map((o) => <MenuItem key={o} value={o}>{t(`filters.value.${o}`, o)}</MenuItem>)}
            </Select>
          </FormControl>
        );
      case 'time':
        // Two datetime-local inputs are ~200px each natively — they must be
        // allowed to stack rather than force the filter panel wider than a phone.
        return (
          <Stack direction="row" spacing={1} sx={{ flex: 1, minWidth: 0, flexWrap: 'wrap', rowGap: 1 }}>
            <TextField size="small" type="datetime-local" label={t('filters.from', 'From')} InputLabelProps={{ shrink: true }}
              sx={{ flex: '1 1 150px', minWidth: 0 }}
              value={f.value.from} onChange={(e) => patchAt(i, { value: { ...f.value, from: e.target.value } })} />
            <TextField size="small" type="datetime-local" label={t('filters.to', 'To')} InputLabelProps={{ shrink: true }}
              sx={{ flex: '1 1 150px', minWidth: 0 }}
              value={f.value.to} onChange={(e) => patchAt(i, { value: { ...f.value, to: e.target.value } })} />
          </Stack>
        );
      case 'boolean':
        return <Switch checked={Boolean(f.value)} onChange={(e) => patchAt(i, { value: e.target.checked })} />;
      default:
        return null;
    }
  };

  return (
    <Paper elevation={0} sx={{ p: 1.5, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: filters.length ? 1.5 : 0, flexWrap: 'wrap' }}>
        <FilterAltIcon fontSize="small" color="action" />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{t('filters.add', 'Add filter')}</InputLabel>
          <Select label={t('filters.add', 'Add filter')} value="" onChange={(e) => add(e.target.value)}>
            {fields.map((f) => <MenuItem key={f.name} value={f.name}>{f.label}</MenuItem>)}
          </Select>
        </FormControl>
        {/* No auto margin: pushing this to the trailing edge parked it under
            the phone dock, which is anchored there and 340px wide. */}
        {filters.length > 0 && (
          <Button size="small" onClick={() => onChange([])}>{t('filters.clear', 'Clear all')}</Button>
        )}
      </Stack>

      {filters.map((f, i) => (
        <Stack key={`${f.name}-${i}`} direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
          <Tooltip title={t('filters.remove', 'Remove')}>
            <IconButton size="small" onClick={() => removeAt(i)}><CloseIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: { xs: 0, sm: 90 } }}>{labelOf(f.name)}</Typography>
          {renderInput(f, i)}
        </Stack>
      ))}
    </Paper>
  );
}
