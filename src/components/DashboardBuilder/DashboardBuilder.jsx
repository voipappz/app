import { useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Drawer, IconButton,
  Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import { useTranslation } from 'react-i18next';
import { useDirection } from '../../context/DirectionContext';
import { useDashboardBuilder } from './useDashboardBuilder';
import WidgetEditor from './WidgetEditor';
import { deriveFieldOptions } from './widgetFields';
import { resolveIcon } from './widgetPresentation';
import { withDefaults } from './widgetTemplates';
import { exportFilename, exportWidgets, parseImportedWidgets } from './widgetIo';

/** One saved definition: icon, title, what it reads, edit + delete. */
function WidgetRow({ widget, saving, onEdit, onDelete, t }) {
  const Icon = resolveIcon(widget.icon);
  const reads = widget.type === 'counter' || widget.type === 'gauge'
    ? [widget.metric]
    : (widget.fields || []);

  return (
    <Paper elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Icon fontSize="small" sx={{ color: /^#/.test(widget.color || '') ? widget.color : (widget.color || 'text.secondary') }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{widget.title || widget.uuid}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {t(`dashboardBuilder.type.${widget.type}`, widget.type)} · {reads.filter(Boolean).join(', ') || '—'}
          </Typography>
        </Box>
        <Tooltip title={t('dashboardBuilder.editWidget', 'Edit widget')}>
          <span>
            <IconButton size="small" color="primary" disabled={saving} onClick={() => onEdit(widget)}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('dashboardBuilder.deleteWidget', 'Delete widget')}>
          <span>
            <IconButton size="small" color="error" disabled={saving} onClick={() => onDelete(widget.uuid)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

/**
 * DashboardBuilder — edits the LOCAL widget definitions (deno-api → DuckDB).
 * A definition says what to show; values always come from the local snapshot
 * projection, whose live payload also feeds the editor's field select.
 */
export default function DashboardBuilder({ open, onClose, onChange, snapshot }) {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  const {
    widgets, loading, saving, error, addWidget, saveWidget, removeWidget, importWidgets,
  } = useDashboardBuilder(open, onChange);
  const [editing, setEditing] = useState(null); // { widget } | null
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [ioError, setIoError] = useState(null);
  const fileInput = useRef(null);

  const options = useMemo(() => deriveFieldOptions(snapshot), [snapshot]);

  const handleSave = async (draft) => {
    const { uuid, ...definition } = draft;
    const ok = uuid ? await saveWidget(uuid, definition) : await addWidget(definition);
    if (ok) setEditing(null);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(exportWidgets(widgets), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename();
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await importWidgets(parseImportedWidgets(await file.text()));
      setIoError(null);
    } catch {
      setIoError(t('dashboardBuilder.importFailed', 'Could not read that dashboard file.'));
    }
  };

  return (
    <Drawer
      anchor={isRTL ? 'left' : 'right'}
      open={open}
      onClose={onClose}
      PaperProps={{ 'data-testid': 'dashboard-builder', sx: { width: { xs: '100%', sm: 420 }, p: 2 } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
          {t('dashboardBuilder.heading', 'Dashboard builder')}
        </Typography>
        {saving && <CircularProgress size={18} sx={{ mx: 1 }} />}
        <IconButton onClick={onClose} aria-label={t('common.buttons.close', 'Close')}><CloseIcon /></IconButton>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('dashboardBuilder.hint', 'Widgets are computed from this app’s local call events. Without widgets the default tiles show.')}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {ioError && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setIoError(null)}>{ioError}</Alert>}

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button
          variant="contained" startIcon={<AddIcon />} disabled={saving}
          onClick={() => setEditing({})} data-testid="add-widget"
        >
          {t('dashboardBuilder.addWidget', 'Add widget')}
        </Button>
        <Tooltip title={t('dashboardBuilder.export', 'Export JSON')}>
          <span>
            <IconButton onClick={handleExport} disabled={saving || widgets.length === 0}>
              <FileDownloadOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('dashboardBuilder.import', 'Import JSON')}>
          <span>
            <IconButton onClick={() => fileInput.current?.click()} disabled={saving}>
              <FileUploadOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <input
          ref={fileInput} type="file" accept="application/json,.json"
          hidden onChange={handleImport} data-testid="import-widgets"
        />
      </Stack>
      <Divider sx={{ mb: 2 }} />

      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>
      ) : widgets.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          {t('dashboardBuilder.empty', 'No widgets defined yet.')}
        </Typography>
      ) : (
        <Stack spacing={1.5} sx={{ overflowY: 'auto' }}>
          {widgets.map((widget) => (
            confirmDelete === widget.uuid ? (
              <Paper key={widget.uuid} elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'error.main', borderRadius: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {t('dashboardBuilder.confirmDelete', 'Delete this widget?')} <b>{widget.title || widget.uuid}</b>
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" color="error" variant="contained" disabled={saving}
                    onClick={async () => { await removeWidget(widget.uuid); setConfirmDelete(null); }}>
                    {t('common.buttons.delete', 'Delete')}
                  </Button>
                  <Button size="small" onClick={() => setConfirmDelete(null)}>{t('common.buttons.cancel', 'Cancel')}</Button>
                </Stack>
              </Paper>
            ) : (
              <WidgetRow
                key={widget.uuid} widget={withDefaults(widget)} saving={saving} t={t}
                onEdit={() => setEditing(widget)} onDelete={setConfirmDelete}
              />
            )
          ))}
        </Stack>
      )}

      {widgets.length > 0 && (
        <Chip
          size="small" variant="outlined" sx={{ mt: 2, alignSelf: 'flex-start' }}
          label={t('dashboardBuilder.count', '{{count}} widget(s)', { count: widgets.length })}
        />
      )}

      <WidgetEditor
        open={!!editing} widget={editing?.uuid ? editing : null} options={options} saving={saving}
        onClose={() => setEditing(null)} onSave={handleSave}
      />
    </Drawer>
  );
}
