import { useEffect, useState } from 'react';
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, MenuItem, Slider, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import FieldSelect from './FieldSelect';
import { ICON_NAMES } from './widgetPresentation';
import { retargetType, toggleField } from './widgetFields';
import { applyTemplate, TEMPLATE_CATEGORIES, WIDGET_TEMPLATES, WIDGET_TYPES, withDefaults } from './widgetTemplates';

const TEMPLATE_KEYS = Object.values(TEMPLATE_CATEGORIES).flat();

/**
 * WidgetEditor — nimbus's tabbed widget dialog (General / Appearance /
 * Thresholds) plus its quick-start template chips. Nimbus's fourth "Redis Data"
 * tab is gone: there is no Redis here, and the metric is picked from the field
 * select instead of typed as a free-text path.
 */
export default function WidgetEditor({ open, widget, options, saving, onClose, onSave }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [draft, setDraft] = useState(() => withDefaults(widget || {}));

  useEffect(() => {
    if (open) {
      setDraft(withDefaults(widget || {}));
      setTab(0);
    }
  }, [open, widget]);

  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setThreshold = (key, value) =>
    setDraft((prev) => ({ ...prev, thresholds: { ...prev.thresholds, [key]: value } }));

  const isGauge = draft.type === 'gauge';
  const isCounter = draft.type === 'counter';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ 'data-testid': 'widget-editor', sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {widget?.uuid
          ? t('dashboardBuilder.editor.edit', 'Edit widget')
          : t('dashboardBuilder.editor.add', 'Add widget')}
      </DialogTitle>

      <DialogContent dividers>
        <Tabs value={tab} onChange={(_, next) => setTab(next)} variant="fullWidth" sx={{ mb: 2 }}>
          <Tab label={t('dashboardBuilder.editor.general', 'General')} />
          <Tab label={t('dashboardBuilder.editor.appearance', 'Appearance')} />
          <Tab label={t('dashboardBuilder.editor.thresholds', 'Thresholds')} />
        </Tabs>

        {tab === 0 && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                {t('dashboardBuilder.editor.templates', 'Quick start')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {TEMPLATE_KEYS.map((key) => (
                  <Chip
                    key={key}
                    size="small"
                    variant="outlined"
                    color="primary"
                    label={t(`dashboardBuilder.template.${key}`, WIDGET_TEMPLATES[key].title)}
                    onClick={() => setDraft((prev) => applyTemplate(key, {
                      uuid: prev.uuid, position: prev.position,
                    }))}
                  />
                ))}
              </Box>
            </Box>
            <Divider />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth size="small" label={t('dashboardBuilder.widgetTitle', 'Title')}
                value={draft.title} onChange={(e) => set('title', e.target.value)}
              />
              <TextField
                fullWidth select size="small" label={t('dashboardBuilder.editor.type', 'Type')}
                value={draft.type}
                onChange={(e) => setDraft((prev) => retargetType(prev, e.target.value, options))}
              >
                {WIDGET_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>{t(`dashboardBuilder.type.${type}`, type)}</MenuItem>
                ))}
              </TextField>
            </Stack>
            <FieldSelect
              widget={draft} options={options}
              onToggle={(name) => setDraft((prev) => toggleField(prev, name))}
            />
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={2}>
            {(isCounter || isGauge) && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  fullWidth select size="small" label={t('dashboardBuilder.editor.icon', 'Icon')}
                  value={draft.icon} onChange={(e) => set('icon', e.target.value)}
                >
                  {ICON_NAMES.map((name) => (
                    <MenuItem key={name} value={name}>{name}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  fullWidth size="small" label={t('dashboardBuilder.editor.unit', 'Unit')}
                  value={draft.unit} onChange={(e) => set('unit', e.target.value)}
                  placeholder={t('dashboardBuilder.editor.unitHint', 'calls, %, sec')}
                />
              </Stack>
            )}
            {(isCounter || isGauge) && (
              <TextField
                fullWidth size="small" type="color"
                label={t('dashboardBuilder.editor.color', 'Accent colour')}
                value={/^#/.test(draft.color) ? draft.color : '#1976d2'}
                onChange={(e) => set('color', e.target.value)}
                helperText={t('dashboardBuilder.editor.colorHint', 'Pick a colour, or fall back to the theme.')}
              />
            )}
            {(isCounter || isGauge) && draft.color && (
              <Button size="small" onClick={() => set('color', '')} sx={{ alignSelf: 'flex-start' }}>
                {t('dashboardBuilder.editor.clearColor', 'Use theme colour')}
              </Button>
            )}
            {isGauge && (
              <Stack direction="row" spacing={2}>
                <TextField
                  fullWidth size="small" type="number" label={t('dashboardBuilder.editor.min', 'Minimum')}
                  value={draft.min} onChange={(e) => set('min', Number(e.target.value))}
                />
                <TextField
                  fullWidth size="small" type="number" label={t('dashboardBuilder.editor.max', 'Maximum')}
                  value={draft.max} onChange={(e) => set('max', Number(e.target.value))}
                />
              </Stack>
            )}
            {!isCounter && !isGauge && (
              <Typography variant="body2" color="text.secondary">
                {t('dashboardBuilder.editor.noAppearance', 'Trend and table widgets take their styling from the theme.')}
              </Typography>
            )}
          </Stack>
        )}

        {tab === 2 && (
          <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">
              {t('dashboardBuilder.editor.thresholdHint', 'Values past these limits tint the tile amber, then red.')}
            </Typography>
            <Box>
              <Typography variant="body2" gutterBottom>{t('dashboardBuilder.editor.warning', 'Warning')}</Typography>
              <Slider
                value={Number(draft.thresholds?.warning) || 0} valueLabelDisplay="auto"
                min={Number(draft.min) || 0} max={Number(draft.max) || 100}
                onChange={(_, value) => setThreshold('warning', value)}
                sx={{ color: 'warning.main' }}
              />
            </Box>
            <Box>
              <Typography variant="body2" gutterBottom>{t('dashboardBuilder.editor.critical', 'Critical')}</Typography>
              <Slider
                value={Number(draft.thresholds?.critical) || 0} valueLabelDisplay="auto"
                min={Number(draft.min) || 0} max={Number(draft.max) || 100}
                onChange={(_, value) => setThreshold('critical', value)}
                sx={{ color: 'error.main' }}
              />
            </Box>
            <FormControlLabel
              control={<Checkbox checked={!!draft.inverse} onChange={(e) => set('inverse', e.target.checked)} />}
              label={t('dashboardBuilder.editor.inverse', 'Inverse — lower values are worse')}
            />
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('common.buttons.cancel', 'Cancel')}</Button>
        <Button
          variant="contained" disabled={saving || !draft.title.trim()}
          onClick={() => onSave(draft)}
        >
          {t('common.buttons.save', 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
