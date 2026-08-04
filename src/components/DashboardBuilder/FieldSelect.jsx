import { Box, Checkbox, FormControlLabel, Paper, Radio, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { fieldsForType, isFieldSelected, isSingleField } from './widgetFields';

/**
 * FieldSelect — the checkbox list of selectable snapshot fields, modeled on
 * nimbus's DataExplorer "Identities" field list. Options are derived from the
 * live `/dashboard/snapshot` payload (see `widgetFields.js`), not from an
 * identity-schema endpoint (this backend has none).
 *
 * counter/gauge pick exactly one stat (radio); trend/table pick a set.
 */
export default function FieldSelect({ widget, options, onToggle }) {
  const { t } = useTranslation();
  const fields = fieldsForType(widget.type, options);
  const single = isSingleField(widget.type);
  const Control = single ? Radio : Checkbox;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {single
          ? t('dashboardBuilder.fields.pickOne', 'Metric')
          : t('dashboardBuilder.fields.pickMany', 'Fields')}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {t('dashboardBuilder.fields.hint', 'Read from the local snapshot — only fields this app actually produces are listed.')}
      </Typography>
      <Paper
        variant="outlined"
        data-testid="widget-field-select"
        sx={{ maxHeight: 220, overflowY: 'auto', p: 1, borderRadius: 2 }}
      >
        {fields.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            {t('dashboardBuilder.fields.none', 'No fields available.')}
          </Typography>
        ) : (
          fields.map((field) => (
            <FormControlLabel
              key={field.name}
              sx={{ display: 'flex', marginInline: 0, width: '100%' }}
              control={
                <Control
                  size="small"
                  checked={isFieldSelected(widget, field.name)}
                  onChange={() => onToggle(field.name)}
                  inputProps={{ 'aria-label': field.name }}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {t(`dashboardBuilder.metric.${field.name}`, humanize(field.name))}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }} noWrap>
                    {field.name} · {field.kind}
                  </Typography>
                </Box>
              }
            />
          ))
        )}
      </Paper>
    </Box>
  );
}

const humanize = (key) => String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
