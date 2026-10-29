import { useEffect, useState } from 'react';
import {
  Box, Button, Checkbox, Chip, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, MenuItem, Slider, Stack, Tab, Tabs, TextField, Typography
} from '@mui/material';
import FieldSelect from './FieldSelect';
import WidgetPreview from './WidgetPreview';
import { ICON_NAMES } from './widgetPresentation';
import { applyTemplate, TEMPLATE_CATEGORIES, WIDGET_TEMPLATES, WIDGET_TYPES, templateTitle, withDefaults } from './widgetTemplates';
import { CALLS_METRICS, CDR_GROUPS, isCallsType } from './callsWidgets';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog as Dialog } from '../ui';

// Filtered against WIDGET_TEMPLATES: a category listing a key that no longer
// has a template used to throw on `.title` inside the map below and take the
// whole dashboard down with it, which is far too much damage for a typo.
// Identity widgets run on /api/identities through the report editor, never
// on Influx, so this editor offers neither their templates nor their type.
const TEMPLATE_KEYS = Object.entries(TEMPLATE_CATEGORIES)
  .filter(([category]) => category !== 'identities' && category !== 'liveNow')
  .flatMap(([, keys]) => keys)
  .filter((key) => WIDGET_TEMPLATES[key]);
// Time windows in minutes; their words are widgets.json editor.windows.<minutes>.
const WINDOWS = [60, 360, 1440, 10080];

/**
 * WidgetEditor — tabbed widget dialog (General / Appearance / Thresholds).
 * General now picks a live InfluxDB measurement/field/aggregation
 * (FieldSelect) instead of a fixed snapshot key.
 */
export default function WidgetEditor({ open, widget, initialDraft, saving, onClose, onSave }) {
  const { t } = useTranslation('widgets');
  const [tab, setTab] = useState(0);
  const [preview, setPreview] = useState(null);
  const [previewRun, setPreviewRun] = useState(0);
  const [draft, setDraft] = useState(() => withDefaults(initialDraft || widget || {}));

  useEffect(() => {
    if (open) {
      setDraft(withDefaults(initialDraft || widget || {}));
      setTab(0);
      setPreview(null);
    }
  }, [initialDraft, open, widget]);

  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setThreshold = (key, value) => setDraft((prev) => ({ ...prev, thresholds: { ...prev.thresholds, [key]: value } }));

  const isGauge = draft.type === 'gauge';
  const isCounter = draft.type === 'counter' || draft.type === 'stat';
  const isTable = draft.type === 'table';
  const isExplorer = draft.type === 'explorer';
  // Calls widgets read the calls chart, not a measurement: no field picker,
  // no thresholds, no Influx preview.
  const isCalls = isCallsType(draft.type);
  const isLive = draft.type === 'live_calls';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ 'data-testid': 'widget-editor', sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {widget?.uuid ? t('editor.titleEdit') : t('editor.titleAdd')}
      </DialogTitle>

      <DialogContent dividers>
        <Tabs value={tab} onChange={(_, next) => setTab(next)} variant="fullWidth" sx={{ mb: 2 }}>
          <Tab label={t('editor.tabGeneral')} />
          <Tab label={t('editor.tabAppearance')} />
          <Tab label={t('editor.tabThresholds')} disabled={isTable || isExplorer || isCalls} />
        </Tabs>

        {tab === 0 && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>{t('editor.quickStart')}</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {TEMPLATE_KEYS.map((key) => (
                  <Chip
                    key={key}
                    size="small"
                    variant="outlined"
                    color="primary"
                    label={templateTitle(key)}
                    onClick={() => setDraft((prev) => applyTemplate(key, { uuid: prev.uuid, dashboard_uuid: prev.dashboard_uuid }))}
                  />
                ))}
              </Box>
            </Box>
            <Divider />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth size="small" label={t('editor.title')} value={draft.title} onChange={(e) => set('title', e.target.value)} />
              <TextField fullWidth select size="small" label={t('editor.type')} value={draft.type} onChange={(e) => set('type', e.target.value)}>
                {WIDGET_TYPES.filter((type) => type !== 'query' && type !== 'identity' && type !== 'live').map((type) => (
                  <MenuItem key={type} value={type}>{t(`types.${type}`, { defaultValue: type })}</MenuItem>
                ))}
              </TextField>
            </Stack>
            {!isCalls && <FieldSelect widget={draft} onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))} />}
            {isCalls && !isLive && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                {draft.type === 'calls_stat' && (
                  <TextField fullWidth select size="small" label={t('editor.show')} value={draft.metric} onChange={(e) => set('metric', e.target.value)}>
                    {CALLS_METRICS.map((metric) => <MenuItem key={metric} value={metric}>{t(`metrics.${metric}`)}</MenuItem>)}
                  </TextField>
                )}
                {!(draft.type === 'calls_stat' && draft.metric === 'answered') && (
                  <TextField fullWidth select size="small" label={t('editor.splitBy')} value={draft.groupBy} onChange={(e) => set('groupBy', e.target.value)}>
                    {CDR_GROUPS.map((group) => <MenuItem key={group} value={group}>{t(`groups.${group}`)}</MenuItem>)}
                  </TextField>
                )}
              </Stack>
            )}
            {isLive && (
              <Typography variant="body2" color="text.secondary">{t('editor.liveHint')}</Typography>
            )}
            {!isTable && !isLive && (
              <TextField
                fullWidth select size="small" label={t('editor.window')}
                value={draft.minutes} onChange={(e) => set('minutes', Number(e.target.value))}
              >
                {WINDOWS.map((minutes) => <MenuItem key={minutes} value={minutes}>{t(`editor.windows.${minutes}`)}</MenuItem>)}
              </TextField>
            )}
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={2}>
            {(isCounter || isGauge) && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField fullWidth select size="small" label={t('editor.icon')} value={draft.icon} onChange={(e) => set('icon', e.target.value)}>
                  {ICON_NAMES.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                </TextField>
                <TextField
                  fullWidth size="small" label={t('editor.unit')} value={draft.unit} onChange={(e) => set('unit', e.target.value)}
                  placeholder={t('editor.unitPlaceholder')}
                />
              </Stack>
            )}
            {(isCounter || isGauge) && (
              <TextField
                fullWidth size="small" type="color" label={t('editor.accent')}
                value={/^#/.test(draft.color) ? draft.color : '#1976d2'}
                onChange={(e) => set('color', e.target.value)}
                helperText={t('editor.accentHint')}
              />
            )}
            {(isCounter || isGauge) && draft.color && (
              <Button size="small" onClick={() => set('color', '')} sx={{ alignSelf: 'flex-start' }}>{t('editor.themeColour')}</Button>
            )}
            {isGauge && (
              <Stack direction="row" spacing={2}>
                <TextField fullWidth size="small" type="number" label={t('editor.minimum')} value={draft.min} onChange={(e) => set('min', Number(e.target.value))} />
                <TextField fullWidth size="small" type="number" label={t('editor.maximum')} value={draft.max} onChange={(e) => set('max', Number(e.target.value))} />
              </Stack>
            )}
            {!isCounter && !isGauge && !isTable && (
              <Typography variant="body2" color="text.secondary">{t('editor.chartStyling')}</Typography>
            )}
            {isTable && (
              <Typography variant="body2" color="text.secondary">{t('editor.tableNoAppearance')}</Typography>
            )}
          </Stack>
        )}

        {tab === 2 && !isTable && !isExplorer && (
          <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">{t('editor.thresholdsHint')}</Typography>
            <Box>
              <Typography variant="body2" gutterBottom>{t('editor.warning')}</Typography>
              <Slider
                value={Number(draft.thresholds?.warning) || 0} valueLabelDisplay="auto"
                min={Number(draft.min) || 0} max={Number(draft.max) || 100}
                onChange={(_, value) => setThreshold('warning', value)}
                sx={{ color: 'warning.main' }}
              />
            </Box>
            <Box>
              <Typography variant="body2" gutterBottom>{t('editor.critical')}</Typography>
              <Slider
                value={Number(draft.thresholds?.critical) || 0} valueLabelDisplay="auto"
                min={Number(draft.min) || 0} max={Number(draft.max) || 100}
                onChange={(_, value) => setThreshold('critical', value)}
                sx={{ color: 'error.main' }}
              />
            </Box>
            <FormControlLabel
              control={<Checkbox checked={!!draft.inverse} onChange={(e) => set('inverse', e.target.checked)} />}
              label={t('editor.inverse')}
            />
          </Stack>
        )}
        {!isTable && !isExplorer && !isCalls && <Box sx={{ mt: 2 }}>
          <Button disabled={!draft.measurement || !draft.field} onClick={() => { setPreview({ ...draft }); setPreviewRun((run) => run + 1); }}>{t('editor.runPreview')}</Button>
          {preview && <>
            {JSON.stringify(preview) !== JSON.stringify(draft) && <Typography color="text.secondary">{t('editor.settingsChanged')}</Typography>}
            <WidgetPreview key={previewRun} widget={preview} />
          </>}
        </Box>}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('editor.cancel')}</Button>
        <Button variant="contained" disabled={saving || !draft.title.trim() || (!isTable && !isCalls && (!draft.measurement || !draft.field))} onClick={() => onSave(draft)}>
          {t('editor.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
