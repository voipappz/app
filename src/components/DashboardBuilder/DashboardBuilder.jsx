import { useMemo, useRef, useState } from 'react';
import {
  Alert, AppBar, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, ListItemIcon, ListItemText,
  Menu, MenuItem, Paper, Stack, TextField, Toolbar, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BarChartIcon from '@mui/icons-material/BarChart';
import CloseIcon from '@mui/icons-material/Close';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import GridViewIcon from '@mui/icons-material/GridView';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import NumbersIcon from '@mui/icons-material/Numbers';
import PieChartIcon from '@mui/icons-material/PieChart';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SpeedIcon from '@mui/icons-material/Speed';
import StorageIcon from '@mui/icons-material/Storage';
import TableChartIcon from '@mui/icons-material/TableChart';
import { useTranslation } from 'react-i18next';
import { useDashboardBuilder } from './useDashboardBuilder';
import BuilderWidget from './BuilderWidget';
import EventViews from './EventViews';
import WidgetEditor from './WidgetEditor';
import { deriveFieldOptions } from './widgetFields';
import { withDefaults } from './widgetTemplates';
import { exportFilename, exportWidgets, parseImportedWidgets } from './widgetIo';

// This is the same explicit type chooser as the deleted Nimbus builder. The
// data source is intentionally different: every type is backed by DuckDB.
const TYPE_CHOICES = [
  { value: 'counter', label: 'Counter', icon: NumbersIcon },
  { value: 'table', label: 'Table', icon: TableChartIcon },
  { value: 'pie', label: 'Pie chart', icon: PieChartIcon },
  { value: 'line', label: 'Line chart', icon: ShowChartIcon },
  { value: 'bar', label: 'Bar chart', icon: BarChartIcon },
  { value: 'gauge', label: 'Gauge', icon: SpeedIcon },
  { value: 'stat', label: 'Stat', icon: QueryStatsIcon },
];

/**
 * Full-screen dashboard workspace recovered from nimbus-admin@1061991^.
 * Nimbus's Cable/Redis/Influx adapters are replaced by the local Deno → DuckDB
 * snapshot and normalized event view; the builder interaction model remains.
 */
export default function DashboardBuilder({
  open, onClose, onChange, snapshot, selectedDashboardId = 'default', onSelectDashboard,
}) {
  const { t } = useTranslation();
  const {
    dashboards, widgets, loading, saving, error, addDashboard, saveDashboardName,
    removeDashboard, addWidget, saveWidget, removeWidget, importWidgets, refresh,
  } = useDashboardBuilder(open, onChange, selectedDashboardId, onSelectDashboard);
  const [editing, setEditing] = useState(null);
  const [deleteWidgetTarget, setDeleteWidgetTarget] = useState(null);
  const [deleteDashboardOpen, setDeleteDashboardOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [dashboardMenuAnchor, setDashboardMenuAnchor] = useState(null);
  const [addMenuAnchor, setAddMenuAnchor] = useState(null);
  const [eventExplorerOpen, setEventExplorerOpen] = useState(false);
  const [duckdbFields, setDuckdbFields] = useState([]);
  const [ioError, setIoError] = useState(null);
  const fileInput = useRef(null);

  const currentDashboard = dashboards.find((dashboard) => dashboard.uuid === selectedDashboardId);
  const options = useMemo(() => {
    const base = deriveFieldOptions(snapshot);
    return { ...base, events: duckdbFields.length ? duckdbFields : base.events };
  }, [duckdbFields, snapshot]);

  const chooseWidgetType = (type) => {
    setAddMenuAnchor(null);
    setEditing(withDefaults({
      type,
      title: t(`dashboardBuilder.newType.${type}`, `New ${TYPE_CHOICES.find((choice) => choice.value === type)?.label || type}`),
    }));
  };

  const saveDraft = async (draft) => {
    const { uuid, ...definition } = draft;
    const ok = uuid ? await saveWidget(uuid, definition) : await addWidget(definition);
    if (ok) setEditing(null);
  };

  const duplicateWidget = async (widget) => {
    const definition = { ...widget };
    delete definition.uuid;
    delete definition.dashboard_uuid;
    delete definition.position;
    await addWidget({ ...definition, title: `${definition.title} ${t('dashboardBuilder.copySuffix', 'copy')}` });
  };

  const createDashboard = async () => {
    const name = newDashboardName.trim();
    if (!name) return;
    if (await addDashboard(name)) {
      setCreateOpen(false);
      setNewDashboardName('');
    }
  };

  const renameDashboard = async () => {
    const name = renameValue.trim();
    if (name && await saveDashboardName(selectedDashboardId, name)) setRenameOpen(false);
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
    <Dialog fullScreen open={open} onClose={onClose} PaperProps={{ 'data-testid': 'dashboard-builder' }}>
      <AppBar position="relative" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1, minHeight: { xs: 64, sm: 72 } }}>
          <IconButton edge="start" onClick={onClose} aria-label={t('common.buttons.close', 'Close')}><CloseIcon /></IconButton>
          <DashboardIcon color="primary" sx={{ ml: 0.5 }} />
          <Button
            color="inherit" endIcon={<KeyboardArrowDownIcon />} onClick={(event) => setDashboardMenuAnchor(event.currentTarget)}
            sx={{ minWidth: 0, maxWidth: 280, textTransform: 'none', fontSize: { xs: '1rem', sm: '1.2rem' }, fontWeight: 750 }}
          >
            <Typography component="span" noWrap>{currentDashboard?.name || t('dashboardBuilder.heading', 'Dashboard builder')}</Typography>
          </Button>
          <Tooltip title={t('dashboardBuilder.renameDashboard', 'Rename dashboard')}>
            <span><IconButton size="small" disabled={!currentDashboard || saving} onClick={() => { setRenameValue(currentDashboard?.name || ''); setRenameOpen(true); }}><EditOutlinedIcon fontSize="small" /></IconButton></span>
          </Tooltip>
          {saving && <Chip size="small" color="info" variant="outlined" label={t('dashboardBuilder.saving', 'Saving…')} />}

          <Box sx={{ flex: 1 }} />
          <Tooltip title={t('dashboardBuilder.events.open', 'DuckDB event views')}>
            <IconButton color={eventExplorerOpen ? 'primary' : 'default'} onClick={() => setEventExplorerOpen((value) => !value)} data-testid="builder-events-tab"><StorageIcon /></IconButton>
          </Tooltip>
          <Tooltip title={t('dashboardBuilder.export', 'Export JSON')}><span><IconButton disabled={!widgets.length} onClick={handleExport}><FileDownloadOutlinedIcon /></IconButton></span></Tooltip>
          <Tooltip title={t('dashboardBuilder.import', 'Import JSON')}><IconButton onClick={() => fileInput.current?.click()}><FileUploadOutlinedIcon /></IconButton></Tooltip>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={handleImport} />
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} data-testid="create-dashboard" sx={{ display: { xs: 'none', md: 'inline-flex' }, textTransform: 'none' }}>
            {t('dashboardBuilder.createDashboard', 'New dashboard')}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={(event) => setAddMenuAnchor(event.currentTarget)} data-testid="add-widget" sx={{ textTransform: 'none' }}>
            {t('dashboardBuilder.addWidget', 'Add widget')}
          </Button>
        </Toolbar>
      </AppBar>

      <Menu anchorEl={dashboardMenuAnchor} open={Boolean(dashboardMenuAnchor)} onClose={() => setDashboardMenuAnchor(null)} PaperProps={{ sx: { minWidth: 280 } }}>
        <MenuItem disabled><Typography variant="overline">{t('dashboardBuilder.selectDashboard', 'Select dashboard')}</Typography></MenuItem>
        <Divider />
        {dashboards.map((dashboard) => (
          <MenuItem key={dashboard.uuid} selected={dashboard.uuid === selectedDashboardId} onClick={() => { onSelectDashboard?.(dashboard.uuid); setDashboardMenuAnchor(null); }}>
            <ListItemIcon><DashboardIcon fontSize="small" color={dashboard.uuid === selectedDashboardId ? 'primary' : 'inherit'} /></ListItemIcon>
            <ListItemText primary={dashboard.name} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setDashboardMenuAnchor(null); setCreateOpen(true); }}>
          <ListItemIcon><AddIcon fontSize="small" color="primary" /></ListItemIcon>
          <ListItemText primary={t('dashboardBuilder.createDashboard', 'New dashboard')} />
        </MenuItem>
        {selectedDashboardId !== 'default' && (
          <MenuItem sx={{ color: 'error.main' }} onClick={() => { setDashboardMenuAnchor(null); setDeleteDashboardOpen(true); }}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText primary={t('dashboardBuilder.deleteDashboard', 'Delete dashboard')} />
          </MenuItem>
        )}
      </Menu>

      <Menu anchorEl={addMenuAnchor} open={Boolean(addMenuAnchor)} onClose={() => setAddMenuAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} PaperProps={{ sx: { minWidth: 230 } }}>
        <MenuItem disabled><Typography variant="overline">{t('dashboardBuilder.selectWidgetType', 'Select widget type')}</Typography></MenuItem>
        <Divider />
        {TYPE_CHOICES.map(({ value, label, icon: TypeIcon }) => (
          <MenuItem key={value} onClick={() => chooseWidgetType(value)} data-testid={`widget-type-${value}`}>
            <ListItemIcon sx={{ color: 'primary.main' }}><TypeIcon /></ListItemIcon>
            <ListItemText primary={t(`dashboardBuilder.type.${value}`, label)} />
          </MenuItem>
        ))}
      </Menu>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', bgcolor: 'background.default' }}>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto', p: { xs: 1.5, md: 2.5 } }} data-testid="builder-widgets-tab">
          <Paper elevation={0} sx={{ mb: 2, px: 2, py: 1.25, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Chip icon={<GridViewIcon />} size="small" variant="outlined" label={t('dashboardBuilder.count', '{{count}} widgets', { count: widgets.length })} />
            <Chip icon={<StorageIcon />} size="small" color="success" variant="outlined" label="DuckDB" />
            <Chip size="small" variant="outlined" label={t('dashboardBuilder.last24Hours', 'Last 24 hours')} />
            <Box sx={{ flex: 1 }} />
            {selectedDashboardId !== 'default' && <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleteDashboardOpen(true)}>{t('dashboardBuilder.deleteDashboard', 'Delete dashboard')}</Button>}
            <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={refresh} disabled={loading}>{t('dashboardBuilder.refresh', 'Refresh')}</Button>
          </Paper>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {ioError && <Alert severity="warning" onClose={() => setIoError(null)} sx={{ mb: 2 }}>{ioError}</Alert>}

          {loading ? (
            <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Box>
          ) : widgets.length === 0 ? (
            <Paper elevation={0} sx={{ p: { xs: 5, md: 9 }, textAlign: 'center', border: '2px dashed', borderColor: 'divider', borderRadius: 3 }}>
              <DashboardIcon sx={{ fontSize: 72, color: 'action.disabled', mb: 1.5 }} />
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>{t('dashboardBuilder.buildHeading', 'Build your dashboard')}</Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 520, mx: 'auto', mb: 3 }}>{t('dashboardBuilder.buildHint', 'Choose a widget type and connect it to the calls or events stored in DuckDB.')}</Typography>
              <Button size="large" variant="contained" startIcon={<AddIcon />} onClick={(event) => setAddMenuAnchor(event.currentTarget)}>{t('dashboardBuilder.addFirstWidget', 'Add your first widget')}</Button>
            </Paper>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
              {widgets.map((widget) => (
                <BuilderWidget
                  key={widget.uuid} widget={widget} snapshot={snapshot} saving={saving}
                  onEdit={setEditing} onDuplicate={duplicateWidget} onDelete={setDeleteWidgetTarget}
                />
              ))}
            </Box>
          )}
        </Box>

        {eventExplorerOpen && (
          <Paper
            square elevation={0} data-testid="dashboard-event-explorer"
            sx={{ width: { xs: '100%', md: 440 }, flexShrink: 0, borderInlineStart: '1px solid', borderColor: 'divider', overflow: 'auto', p: 2, position: { xs: 'absolute', md: 'relative' }, inset: { xs: 0, md: 'auto' }, zIndex: 2 }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <StorageIcon color="primary" />
              <Box sx={{ flex: 1 }}><Typography variant="h6" sx={{ fontWeight: 750 }}>{t('dashboardBuilder.events.heading', 'DuckDB event views')}</Typography></Box>
              <IconButton onClick={() => setEventExplorerOpen(false)}><CloseIcon /></IconButton>
            </Stack>
            <Divider sx={{ mb: 2 }} />
            <EventViews
              active={open && eventExplorerOpen} saving={saving} onFields={setDuckdbFields}
              onCreateWidget={async (draft) => { if (await addWidget(draft)) setEventExplorerOpen(false); }}
            />
          </Paper>
        )}
      </Box>

      <WidgetEditor open={Boolean(editing)} widget={editing?.uuid ? editing : null} initialDraft={editing} options={options} saving={saving} onClose={() => setEditing(null)} onSave={saveDraft} />

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('dashboardBuilder.createDashboard', 'New dashboard')}</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth size="small" sx={{ mt: 1 }} label={t('dashboardBuilder.dashboardName', 'Dashboard name')} value={newDashboardName} onChange={(event) => setNewDashboardName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void createDashboard()} /></DialogContent>
        <DialogActions><Button onClick={() => setCreateOpen(false)}>{t('common.buttons.cancel', 'Cancel')}</Button><Button variant="contained" disabled={!newDashboardName.trim() || saving} onClick={createDashboard}>{t('common.buttons.create', 'Create')}</Button></DialogActions>
      </Dialog>

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('dashboardBuilder.renameDashboard', 'Rename dashboard')}</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth size="small" sx={{ mt: 1 }} label={t('dashboardBuilder.dashboardName', 'Dashboard name')} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void renameDashboard()} /></DialogContent>
        <DialogActions><Button onClick={() => setRenameOpen(false)}>{t('common.buttons.cancel', 'Cancel')}</Button><Button variant="contained" disabled={!renameValue.trim() || saving} onClick={renameDashboard}>{t('common.buttons.save', 'Save')}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteWidgetTarget)} onClose={() => setDeleteWidgetTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('dashboardBuilder.deleteWidget', 'Delete widget')}</DialogTitle>
        <DialogContent><Typography>{t('dashboardBuilder.confirmDelete', 'Delete this widget?')} <b>{deleteWidgetTarget?.title}</b></Typography></DialogContent>
        <DialogActions><Button onClick={() => setDeleteWidgetTarget(null)}>{t('common.buttons.cancel', 'Cancel')}</Button><Button color="error" variant="contained" disabled={saving} onClick={async () => { if (await removeWidget(deleteWidgetTarget.uuid)) setDeleteWidgetTarget(null); }}>{t('common.buttons.delete', 'Delete')}</Button></DialogActions>
      </Dialog>

      <Dialog open={deleteDashboardOpen} onClose={() => setDeleteDashboardOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('dashboardBuilder.deleteDashboard', 'Delete dashboard')}</DialogTitle>
        <DialogContent><Typography>{t('dashboardBuilder.confirmDashboardDelete', 'Delete this dashboard and all its widgets?')}</Typography></DialogContent>
        <DialogActions><Button onClick={() => setDeleteDashboardOpen(false)}>{t('common.buttons.cancel', 'Cancel')}</Button><Button color="error" variant="contained" disabled={saving} onClick={async () => { if (await removeDashboard(selectedDashboardId)) setDeleteDashboardOpen(false); }}>{t('common.buttons.delete', 'Delete')}</Button></DialogActions>
      </Dialog>
    </Dialog>
  );
}
