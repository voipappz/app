import { useEffect, useState } from 'react';
import { Button, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog as Dialog } from '../ui';
import { displayTitle } from './widgetTemplates';

// History windows a Live widget can show, in minutes.
export const LIVE_RANGES = [1440, 10080, 43200];

// The Live board's editor: a widget's name and, for history, its range. No
// query builder: what a widget shows is the template it was picked from.
export default function LiveWidgetEditor({ widget, saving, onClose, onSave }) {
  const { t } = useTranslation('widgets');
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(1440);
  useEffect(() => {
    if (!widget) return;
    setTitle(displayTitle(widget) || '');
    setMinutes(LIVE_RANGES.includes(Number(widget.minutes)) ? Number(widget.minutes) : 1440);
  }, [widget]);
  if (!widget) return null;
  const history = widget.type === 'identity';
  const save = () => {
    const named = title.trim() && title.trim() !== displayTitle(widget);
    onSave({ ...widget, ...(named ? { title: title.trim(), customTitle: true } : {}), ...(history ? { minutes } : {}) });
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('liveEditor.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField size="small" label={t('editor.title')} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          {history && (
            <TextField select size="small" label={t('liveEditor.range')} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {LIVE_RANGES.map((m) => <MenuItem key={m} value={m}>{t(`liveEditor.ranges.${m}`)}</MenuItem>)}
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('editor.cancel')}</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{t('editor.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}
