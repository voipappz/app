import { useEffect, useState } from 'react';
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, MenuItem, Slider, Stack, Tab, Tabs, TextField, Typography
} from '@mui/material';
import FieldSelect from './FieldSelect';
import WidgetPreview from './WidgetPreview';
import { ICON_NAMES } from './widgetPresentation';
import { applyTemplate, TEMPLATE_CATEGORIES, WIDGET_TEMPLATES, WIDGET_TYPES, withDefaults } from './widgetTemplates';

// Filtered against WIDGET_TEMPLATES: a category listing a key that no longer
// has a template used to throw on `.title` inside the map below and take the
// whole dashboard down with it, which is far too much damage for a typo.
const TEMPLATE_KEYS = Object.values(TEMPLATE_CATEGORIES).flat().filter((key) => WIDGET_TEMPLATES[key]);
const WINDOWS = [
  { label: 'Last hour', minutes: 60 },
  { label: 'Last 6 hours', minutes: 360 },
  { label: 'Last 24 hours', minutes: 1440 },
  { label: 'Last 7 days', minutes: 10080 }
];

/**
 * WidgetEditor — tabbed widget dialog (General / Appearance / Thresholds).
 * General now picks a live InfluxDB measurement/field/aggregation
 * (FieldSelect) instead of a fixed snapshot key.
 */
export default function WidgetEditor({ open, widget, initialDraft, saving, onClose, onSave }) {
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ 'data-testid': 'widget-editor', sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {widget?.uuid ? 'Edit widget' : 'Add widget'}
      </DialogTitle>

      <DialogContent dividers>
        <Tabs value={tab} onChange={(_, next) => setTab(next)} variant="fullWidth" sx={{ mb: 2 }}>
          <Tab label="General" />
          <Tab label="Appearance" />
          <Tab label="Thresholds" disabled={isTable} />
        </Tabs>

        {tab === 0 && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Quick start</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {TEMPLATE_KEYS.map((key) => (
                  <Chip
                    key={key}
                    size="small"
                    variant="outlined"
                    color="primary"
                    label={WIDGET_TEMPLATES[key].title}
                    onClick={() => setDraft((prev) => applyTemplate(key, { uuid: prev.uuid, dashboard_uuid: prev.dashboard_uuid }))}
                  />
                ))}
              </Box>
            </Box>
            <Divider />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth size="small" label="Title" value={draft.title} onChange={(e) => set('title', e.target.value)} />
              <TextField fullWidth select size="small" label="Type" value={draft.type} onChange={(e) => set('type', e.target.value)}>
                {WIDGET_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </TextField>
            </Stack>
            <FieldSelect widget={draft} onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))} />
            {!isTable && (
              <TextField
                fullWidth select size="small" label="Time window"
                value={draft.minutes} onChange={(e) => set('minutes', Number(e.target.value))}
              >
                {WINDOWS.map((w) => <MenuItem key={w.minutes} value={w.minutes}>{w.label}</MenuItem>)}
              </TextField>
            )}
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={2}>
            {(isCounter || isGauge) && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField fullWidth select size="small" label="Icon" value={draft.icon} onChange={(e) => set('icon', e.target.value)}>
                  {ICON_NAMES.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                </TextField>
                <TextField
                  fullWidth size="small" label="Unit" value={draft.unit} onChange={(e) => set('unit', e.target.value)}
                  placeholder="calls, %, sec"
                />
              </Stack>
            )}
            {(isCounter || isGauge) && (
              <TextField
                fullWidth size="small" type="color" label="Accent colour"
                value={/^#/.test(draft.color) ? draft.color : '#1976d2'}
                onChange={(e) => set('color', e.target.value)}
                helperText="Pick a colour, or fall back to the theme."
              />
            )}
            {(isCounter || isGauge) && draft.color && (
              <Button size="small" onClick={() => set('color', '')} sx={{ alignSelf: 'flex-start' }}>Use theme colour</Button>
            )}
            {isGauge && (
              <Stack direction="row" spacing={2}>
                <TextField fullWidth size="small" type="number" label="Minimum" value={draft.min} onChange={(e) => set('min', Number(e.target.value))} />
                <TextField fullWidth size="small" type="number" label="Maximum" value={draft.max} onChange={(e) => set('max', Number(e.target.value))} />
              </Stack>
            )}
            {!isCounter && !isGauge && !isTable && (
              <Typography variant="body2" color="text.secondary">Chart widgets take their styling from the theme.</Typography>
            )}
            {isTable && (
              <Typography variant="body2" color="text.secondary">The recent calls table has no appearance options.</Typography>
            )}
          </Stack>
        )}

        {tab === 2 && !isTable && (
          <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">Values past these limits tint the tile amber, then red.</Typography>
            <Box>
              <Typography variant="body2" gutterBottom>Warning</Typography>
              <Slider
                value={Number(draft.thresholds?.warning) || 0} valueLabelDisplay="auto"
                min={Number(draft.min) || 0} max={Number(draft.max) || 100}
                onChange={(_, value) => setThreshold('warning', value)}
                sx={{ color: 'warning.main' }}
              />
            </Box>
            <Box>
              <Typography variant="body2" gutterBottom>Critical</Typography>
              <Slider
                value={Number(draft.thresholds?.critical) || 0} valueLabelDisplay="auto"
                min={Number(draft.min) || 0} max={Number(draft.max) || 100}
                onChange={(_, value) => setThreshold('critical', value)}
                sx={{ color: 'error.main' }}
              />
            </Box>
            <FormControlLabel
              control={<Checkbox checked={!!draft.inverse} onChange={(e) => set('inverse', e.target.checked)} />}
              label="Inverse — lower values are worse"
            />
          </Stack>
        )}
        {!isTable && <Box sx={{ mt: 2 }}>
          <Button disabled={!draft.measurement || !draft.field} onClick={() => { setPreview({ ...draft }); setPreviewRun((run) => run + 1); }}>Run preview</Button>
          {preview && <>
            {JSON.stringify(preview) !== JSON.stringify(draft) && <Typography color="text.secondary">Settings changed. Run preview again to update the results.</Typography>}
            <WidgetPreview key={previewRun} widget={preview} />
          </>}
        </Box>}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={saving || !draft.title.trim() || (!isTable && (!draft.measurement || !draft.field))} onClick={() => onSave(draft)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
