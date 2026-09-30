import { useState, useEffect, useMemo } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TableSortLabel, IconButton, Button, Chip, Tooltip, Typography,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, Select, MenuItem, InputLabel, Switch, FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Close as CloseIcon, EventNote as EventsIcon,
} from '@mui/icons-material';
import { useTemplates } from './Templates.js';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import { formatDate } from '../../utils/dateUtils';
import { getEnabledChipProps, getTypeChipColor } from '../../utils/chipStyles';
import { stripedTableRowSx, orEmpty } from '../shared/tableTheme.jsx';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import useCentralizedSearch from '../../hooks/useCentralizedSearch';
import MetaTagChips from '../common/MetaTagChips/MetaTagChips';
import { ConfirmDialog } from '../ui';

const Templates = () => {
  const { selectedCustomer } = useCustomerEnvironment();
  const { can } = usePermissions();
  const canWrite = can('templates', 'write');
  const { registerScreen, unregisterScreen } = useGlobalSearch();

  const {
    templates, loading, selectedTemplate,
    dialogOpen, deleteDialogOpen, templateToDelete,
    page, rowsPerPage, totalCount, sortBy, sortOrder,
    TEMPLATE_TYPES,
    handleOpenDialog, handleCloseDialog, handleSaveTemplate,
    handleOpenDeleteDialog, handleCloseDeleteDialog, handleDeleteTemplate,
    handlePageChange, handleRowsPerPageChange, handleSortChange,
    handleFiltersChange, fetchTemplates,
  } = useTemplates();

  // CentralizedSearch integration (same pattern as DIDs)
  const centralizedSearch = useCentralizedSearch({
    onFiltersChange: handleFiltersChange,
    onResetFilters: () => handleFiltersChange({ name: '', type: '', enabled: '', search: '' }),
    onRefresh: fetchTemplates,
  });

  // Search segments for CentralizedSearch and GlobalSearch
  const templateSegments = useMemo(() => [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'type', label: 'Type', type: 'select', data: TEMPLATE_TYPES.map(t => ({ uuid: t, name: t })) },
    { name: 'enabled', label: 'Status', type: 'select', data: [{ uuid: 'true', name: 'Enabled' }, { uuid: 'false', name: 'Disabled' }] },
    { name: 'meta', label: 'Tag', type: 'tag', url: '/api/templates?action=meta_keys' },
  ], [TEMPLATE_TYPES]);

  // Register with GlobalSearchContext
  useEffect(() => {
    registerScreen('Templates', templateSegments, {
      onSearch: (params) => {
        const newFilters = {};
        Object.entries(params).forEach(([key, value]) => {
          if (key === 'search[text]') {
            newFilters.search = value;
          } else {
            const match = key.match(/search\[(\w+)\]/);
            if (match) newFilters[match[1]] = value;
          }
        });
        handleFiltersChange(newFilters);
      },
      onClear: () => {
        handleFiltersChange({ name: '', type: '', enabled: '', search: '' });
      },
    });
    return () => unregisterScreen();
  }, [templateSegments, registerScreen, unregisterScreen, handleFiltersChange]);

  if (!selectedCustomer) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body1" color="text.secondary">Please select a customer to view templates.</Typography>
      </Box>
    );
  }

  const sortableColumns = [
    { id: 'created_at', label: 'Created At' },
    { id: 'updated_at', label: 'Updated At' },
    { id: 'enabled', label: 'Enabled', align: 'center' },
    { id: 'name', label: 'Name' },
    { id: 'type', label: 'Type' },
    { id: 'text', label: 'Content' },
    { id: 'meta', label: 'Tags' },
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        px: { xs: 0.5, sm: 1.5 },
        py: { xs: 0.5, sm: 1 },
        height: '100%',
        width: '100%'
      }}
    >
      {/* Header: Title + Search + Add Button on one line */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CentralizedSearch
            segments={templateSegments}
            currentSearchParams={centralizedSearch.currentSearchParams}
            onFilterChange={centralizedSearch.handleFilterChange}
            onQuickSearch={centralizedSearch.handleQuickSearch}
            onClearAllFilters={centralizedSearch.handleClearAllFilters}
            dateRange={centralizedSearch.dateRange}
            onDateRangeChange={centralizedSearch.handleDateRangeChange}
            onRefresh={centralizedSearch.handleRefresh}
            quickSearchText={centralizedSearch.quickSearchText}
            onQuickSearchChange={centralizedSearch.handleQuickSearchChange}
            placeholder="Search by name, or use field:value (e.g. type:sms)"
          />
        </Box>
        {canWrite && (
          <Tooltip title="Add Template">
            <IconButton
              onClick={() => handleOpenDialog()}
              disabled={loading}
              sx={{
                bgcolor: 'var(--accent-secondary)',
                color: '#fff',
                '&:hover': { bgcolor: 'var(--accent-secondary-hover, #E49728)' },
                width: 36, height: 36,
              }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Table Area */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' }}>
        <Paper
          elevation={3}
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0
          }}
        >
          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
            <TableContainer>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    {sortableColumns.map(col => (
                      <TableCell key={col.id} align={col.align || 'left'}>
                        <TableSortLabel
                          active={sortBy === col.id}
                          direction={sortBy === col.id ? sortOrder : 'asc'}
                          onClick={() => handleSortChange(col.id)}
                        >
                          {col.label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                    {canWrite && <TableCell align="center">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && templates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={sortableColumns.length + (canWrite ? 1 : 0)} align="center" sx={{ py: 4 }}>
                        <CircularProgress />
                      </TableCell>
                    </TableRow>
                  ) : templates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={sortableColumns.length + (canWrite ? 1 : 0)} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">No templates found</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    templates.map(t => (
                      <TableRow key={t.uuid} hover sx={{ ...stripedTableRowSx, cursor: 'pointer' }} onClick={() => handleOpenDialog(t)}>
                        <TableCell>
                          <Typography variant="body2">{formatDate(t.created_at)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{formatDate(t.updated_at)}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip {...getEnabledChipProps(t.enabled)} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{t.name}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={t.type} size="small" color={getTypeChipColor(t.type)} />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {orEmpty(t.text ? t.text.substring(0, 120) : null)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <MetaTagChips meta={t.meta} />
                        </TableCell>
                        {canWrite && (
                          <TableCell align="center" onClick={e => e.stopPropagation()}>
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                              <Tooltip title="Edit">
                                <IconButton size="small" onClick={() => handleOpenDialog(t)} disabled={loading}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton size="small" color="error" onClick={() => handleOpenDeleteDialog(t)} disabled={loading}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div" count={totalCount} page={page}
              onPageChange={handlePageChange} rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
              sx={{ borderTop: '1px solid var(--mui-palette-divider)' }}
            />
          </Box>
        </Paper>
      </Box>

      {/* Create / Edit Dialog */}
      <TemplateDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveTemplate}
        template={selectedTemplate}
        loading={loading}
        templateTypes={TEMPLATE_TYPES}
        canWrite={canWrite}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteTemplate}
        loading={loading}
        title="Delete Template"
        entityName={templateToDelete?.name}
      />
    </Box>
  );
};

/* ─── Template Create/Edit Dialog ───────────────────── */
const TemplateDialog = ({ open, onClose, onSave, template, loading, templateTypes, canWrite = true, zIndex }) => {
  const isEdit = !!template;
  const [formData, setFormData] = useState({ name: '', type: 'sms', text: '', enabled: true, notes: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name || '',
        type: template.type || 'sms',
        text: template.text || '',
        enabled: template.enabled !== undefined ? template.enabled : true,
        notes: template.notes || '',
      });
    } else {
      setFormData({ name: '', type: 'sms', text: '', enabled: true, notes: '' });
    }
    setErrors({});
  }, [template, open]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleSubmit = async () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.type) newErrors.type = 'Type is required';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    try {
      await onSave({
        name: formData.name,
        type: formData.type,
        text: formData.text,
        enabled: formData.enabled ? 'true' : 'false',
        notes: formData.notes,
      });
    } catch {
      // errors handled in hook
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth sx={zIndex ? { zIndex } : undefined}>
      <DialogTitle sx={{ pr: 6 }}>
        {isEdit ? 'Edit Template' : 'Add Template'}
        <IconButton onClick={onClose} disabled={loading}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'grey.500' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {isEdit && template?.uuid && (
            <TextField label="UUID" fullWidth value={template.uuid} disabled size="small"
              InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', backgroundColor: 'action.hover' } }} />
          )}
          <TextField label="Name" fullWidth required value={formData.name}
            onChange={e => handleChange('name', e.target.value)}
            error={!!errors.name} helperText={errors.name} disabled={loading} />
          <FormControl fullWidth required>
            <InputLabel>Type</InputLabel>
            <Select value={formData.type} label="Type" onChange={e => handleChange('type', e.target.value)} disabled={loading}
              MenuProps={zIndex ? { style: { zIndex: zIndex + 50 } } : undefined}>
              {templateTypes.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
              Template category (sms, voicemail, etc.)
            </Typography>
          </FormControl>
          <TextField label="Content (Mustache template)" fullWidth multiline minRows={6} maxRows={16}
            value={formData.text} onChange={e => handleChange('text', e.target.value)} disabled={loading}
            placeholder="Hello {{first_name}}, your voicemail is at {{voicemail_message_url}}"
            helperText={`${(formData.text || '').length} characters — Mustache template with {{variable}} placeholders`}
            InputProps={{ sx: { fontFamily: 'monospace', fontSize: '13px' } }} />
          <TextField label="Notes" fullWidth multiline rows={2} value={formData.notes}
            onChange={e => handleChange('notes', e.target.value)} disabled={loading} />
          <FormControlLabel
            control={<Switch checked={formData.enabled} onChange={e => handleChange('enabled', e.target.checked)} disabled={loading} />}
            label="Enabled"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading} variant="outlined">{canWrite ? 'Cancel' : 'Close'}</Button>
        {canWrite && (
          <Button onClick={handleSubmit} variant="contained" disabled={loading}
            startIcon={loading ? <CircularProgress size={18} /> : null}>
            {isEdit ? 'Update' : 'Create'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export { TemplateDialog };
export default Templates;
