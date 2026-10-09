import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  IconButton,
  Chip,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Skeleton,
  TableSortLabel,
  Alert
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Business as BusinessIcon,
  Add as AddIcon,
  EventNote as EventsIcon
} from '@mui/icons-material';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmDialog } from '../ui';
import { useProviders } from './Providers';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate } from '../../utils/dateUtils';
import { getTypeChipColor } from '../../utils/chipStyles';
import TariffSelect from '../common/TariffSelect/TariffSelect';
import DynamicProfileEditor from '../common/DynamicProfileEditor/DynamicProfileEditor';
import CreateProviderDialog from './CreateProviderDialog.jsx';
import { providersApi } from '../../services/api/providersApi';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import useCentralizedSearch from '../../hooks/useCentralizedSearch';
import { orEmpty, stripedTableRowSx } from '../shared/tableTheme.jsx';
import MetaTagChips from '../common/MetaTagChips/MetaTagChips';
import EventsCountBadge from '../common/EventsCountBadge/EventsCountBadge.jsx';
import HelpButton from '../common/HelpButton';
import { GUIDE_URLS } from '../../utils/guides';
import './Providers.css';
import SecretField from '../common/SecretField.jsx';

/**
 * ProviderDialog Component
 * Dialog for creating/editing providers with integrated tariff management
 */
const ProviderDialog = ({ open, onClose, onSave, provider, loading, allTariffs, allTariffsLoading, onRefreshTariffs, providerTypes, llmServices, canWrite = true }) => {
  const [formData, setFormData] = useState({
    name: '',
    notes: '',
    profile: {},
    type: 'sip',
    tariff_uuid: ''
  });
  const [metaFields, setMetaFields] = useState([]);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setSaveError('');
    if (provider) {
      // Handle profile - could be object or string
      let profileData = {};
      if (provider.profile) {
        if (typeof provider.profile === 'object') {
          profileData = provider.profile;
        } else if (typeof provider.profile === 'string') {
          try {
            profileData = JSON.parse(provider.profile);
          } catch {
            profileData = {};
          }
        }
      }
      setFormData({
        name: provider.name || '',
        notes: provider.notes || '',
        profile: profileData,
        type: provider.type || 'sip',
        tariff_uuid: provider.tariff_uuid || ''
      });

      // Handle meta fields - could be object or string
      if (provider.meta) {
        if (typeof provider.meta === 'object') {
          const metaArray = Object.entries(provider.meta).map(([key, value]) => ({ key, value: String(value) }));
          setMetaFields(metaArray);
        } else if (typeof provider.meta === 'string') {
          try {
            const parsedMeta = JSON.parse(provider.meta);
            const metaArray = Object.entries(parsedMeta).map(([key, value]) => ({ key, value: String(value) }));
            setMetaFields(metaArray);
          } catch {
            setMetaFields([]);
          }
        }
      } else {
        setMetaFields([]);
      }

    } else {
      setFormData({
        name: '',
        notes: '',
        profile: {},
        type: 'sip',
        tariff_uuid: ''
      });
      setMetaFields([]);
    }
  }, [provider, open]);

  const handleChange = (field, value) => {
    if (field === 'type') {
      setFormData(prev => ({ ...prev, type: value, profile: {} }));
      return;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Meta field management (like DID screen)
  const addMetaField = () => {
    setMetaFields(prev => [...prev, { key: '', value: '' }]);
  };

  const removeMetaField = (index) => {
    setMetaFields(prev => prev.filter((_, i) => i !== index));
  };

  const updateMetaField = (index, field, value) => {
    setMetaFields(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const handleSubmit = async () => {
    const submitData = { ...formData };
    setSaveError('');

    // Convert meta fields to object
    if (metaFields.length > 0) {
      const meta = {};
      metaFields.forEach(field => {
        if (field.key.trim()) {
          meta[field.key] = field.value;
        }
      });
      submitData.meta = meta;
    }

    try {
      await onSave(submitData);
    } catch (error) {
      setSaveError(error.response?.data?.message || error.message || 'Failed to save provider');
    }
  };

  const isFormValid = formData.name && formData.type;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{provider ? 'Edit Provider' : 'Create New Provider'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
          {/* Provider Basic Info */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Provider Name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              fullWidth
              placeholder="e.g., VoIP Provider Inc."
              helperText="Display name for this provider"
            />
            <FormControl fullWidth required>
              <InputLabel>Type</InputLabel>
              <Select
                value={formData.type}
                label="Type"
                onChange={(e) => handleChange('type', e.target.value)}
              >
                {/* providersApi.getProviderTypes normalizes the server's catalog
                    object into { value, label, … }. Tolerate a bare string too,
                    so an older server's response still renders. */}
                {(providerTypes || []).map((t) => {
                  const value = typeof t === 'string' ? t : t.value;
                  const label = typeof t === 'string' ? t.toUpperCase() : (t.label || value);
                  return <MenuItem key={value} value={value}>{label}</MenuItem>;
                })}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                Provider category (SIP, TTS, LLM, etc.)
              </Typography>
            </FormControl>
            {/* LLM-specific fields: service selector and API key */}
            {formData.type === 'llm' && llmServices && llmServices.length > 0 && (
              <>
                <FormControl fullWidth required>
                  <InputLabel>LLM Service</InputLabel>
                  <Select
                    value={formData.profile?.service || 'openai'}
                    label="LLM Service"
                    onChange={(e) => handleChange('profile', { ...formData.profile, service: e.target.value })}
                  >
                    {llmServices.map((svc) => (
                      <MenuItem key={svc.service} value={svc.service}>{svc.label}</MenuItem>
                    ))}
                  </Select>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                    AI service provider
                  </Typography>
                </FormControl>
                <TextField
                  label="Model"
                  value={formData.profile?.model || ''}
                  onChange={(e) => handleChange('profile', { ...formData.profile, model: e.target.value })}
                  fullWidth
                  placeholder={llmServices.find(s => s.service === (formData.profile?.service || 'openai'))?.default_model || ''}
                  helperText={`Leave empty for default: ${llmServices.find(s => s.service === (formData.profile?.service || 'openai'))?.default_model || ''}`}
                />
                <SecretField
                  label="API Key"
                  value={formData.profile?.api_key || ''}
                  onChange={(e) => handleChange('profile', { ...formData.profile, api_key: e.target.value })}
                  fullWidth
                  required
                  placeholder="sk-..."
                  helperText="Your API key for the selected service"
                  InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
                />
                <TextField
                  label="System Prompt"
                  value={formData.profile?.system_prompt || ''}
                  onChange={(e) => handleChange('profile', { ...formData.profile, system_prompt: e.target.value })}
                  fullWidth
                  multiline
                  rows={3}
                  placeholder="You are a helpful assistant..."
                  helperText="Default system prompt for this provider (optional)"
                />
              </>
            )}
            {/* Meta Properties - Key-Value pairs like DID screen */}
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">Meta Properties</Typography>
                <Button onClick={addMetaField} startIcon={<AddIcon />} variant="outlined" size="small">
                  Add Property
                </Button>
              </Box>
              {metaFields.map((field, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                  <TextField
                    label="Key"
                    value={field.key}
                    onChange={(e) => updateMetaField(index, 'key', e.target.value)}
                    size="small"
                    disabled={loading}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="Value"
                    value={field.value}
                    onChange={(e) => updateMetaField(index, 'value', e.target.value)}
                    size="small"
                    disabled={loading}
                    sx={{ flex: 2 }}
                  />
                  <IconButton onClick={() => removeMetaField(index)} color="error" size="small">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              {metaFields.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No meta properties defined. Click "Add Property" to add custom configuration key-value pairs.
                </Typography>
              )}
            </Box>

            {/* Profile Editor - Dynamic fields from API (all provider fields
                live under the profile.yml 'provider' key, sectioned per sub-type). */}
            {saveError && <Alert severity="error">{saveError}</Alert>}
            <DynamicProfileEditor
              type="provider"
              profile={formData.profile}
              onChange={(profile) => handleChange('profile', profile)}
              disabled={loading}
              title="Profile Properties"
              // Secrets arrive masked (****last4). Reveal decrypts a single key
              // server-side and writes a provider.profile.reveal audit event —
              // only offered here, and only for a provider that already exists.
              onReveal={provider?.uuid
                ? async (key) => {
                    const res = await providersApi.revealProviderSecret(provider.uuid, key);
                    return res?.[key];
                  }
                : null}
            />
            <TextField
              label="Notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              fullWidth
              multiline
              rows={2}
              placeholder="Additional notes about this provider"
            />
          </Box>

          {/* Default Tariff Selection with TariffSelect (includes inline creation) */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6" color="primary">Default Tariff</Typography>
            <TariffSelect
              value={formData.tariff_uuid}
              onChange={(value) => handleChange('tariff_uuid', value)}
              tariffs={allTariffs}
              loading={allTariffsLoading}
              disabled={loading}
              label="Default Tariff"
              onTariffCreated={() => {
                // Refresh tariffs list after creation
                if (onRefreshTariffs) {
                  onRefreshTariffs();
                }
              }}
              onTariffUpdated={() => {
                // Refresh tariffs list after update
                if (onRefreshTariffs) {
                  onRefreshTariffs();
                }
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Rate plan applied to this provider's traffic. Select an existing tariff or create a new one.
            </Typography>
          </Box>

        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canWrite || !isFormValid || loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {provider ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Providers Component
 * Main component for providers management with sidebar list and wide table
 */
const Providers = () => {
  const { can } = usePermissions();
  const canWrite = can('providers', 'write');
  const { registerScreen, unregisterScreen } = useGlobalSearch();

  const {
    providers,
    loading,
    dialogLoading,
    selectedProvider,
    dialogOpen,
    deleteDialogOpen,
    providerToDelete,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    allTariffs,
    allTariffsLoading,
    providerTypes,
    llmServices,
    handleOpenDialog,
    handleCloseDialog,
    handleSaveProvider,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteProvider,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    handleResetFilters,
    fetchProviders,
    fetchAllTariffs
  } = useProviders();

  const navigate = useNavigate();
  // Creation uses the selected type's server-provided fields.
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Register search segments with GlobalSearchContext
  const providerSegments = useMemo(() => [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'type', label: 'Type', type: 'select',
      // providersApi.getProviderTypes returns { value, label, … }; a bare string
      // is still accepted so an older server's response renders.
      data: (providerTypes || []).map(t => (
        typeof t === 'string'
          ? { uuid: t, name: t.toUpperCase() }
          : { uuid: t.value, name: t.label || t.value }
      )) },
    { name: 'enabled', label: 'Status', type: 'select', data: [{ uuid: 'true', name: 'Enabled' }, { uuid: 'false', name: 'Disabled' }] },
    { name: 'meta', label: 'Tag', type: 'tag', url: '/api/providers?action=meta_keys' },
  ], [providerTypes]);

  // Bridge CentralizedSearch parsed filters to the hook's handleFiltersChange
  const handleCentralizedFiltersChange = useCallback((filters) => {
    const mapped = {};
    if (filters.name !== undefined) mapped.search = filters.name || '';
    if (filters.search !== undefined) mapped.search = filters.search || '';
    if (filters.type !== undefined) mapped.type = filters.type || '';
    if (filters.enabled !== undefined) mapped.enabled = filters.enabled || '';
    if (Object.keys(mapped).length > 0) handleFiltersChange(mapped);
  }, [handleFiltersChange]);

  const {
    dateRange,
    quickSearchText,
    currentSearchParams,
    handleFilterChange,
    handleQuickSearch,
    handleQuickSearchChange,
    handleClearAllFilters,
    handleDateRangeChange,
    handleRefresh,
  } = useCentralizedSearch({
    onFiltersChange: handleCentralizedFiltersChange,
    onResetFilters: handleResetFilters,
    onRefresh: fetchProviders,
  });

  useEffect(() => {
    registerScreen('providers', providerSegments, {
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
        handleFiltersChange({ search: '', type: '', enabled: '' });
      },
    });
    return () => unregisterScreen();
  }, [providerSegments, registerScreen, unregisterScreen, handleFiltersChange]);

  // Listen for environment change events to refresh data
  useEffect(() => {
    const handleEnvironmentChange = () => {
      console.log('🔄 Environment changed, refreshing Providers data...');
      fetchProviders();
    };

    window.addEventListener('environmentChanged', handleEnvironmentChange);

    return () => {
      window.removeEventListener('environmentChanged', handleEnvironmentChange);
    };
  }, [fetchProviders]);

  return (
    <Box
      className="providers-container"
      sx={{
        px: { xs: 0.5, sm: 1.5 },
        py: { xs: 0.5, sm: 1 },
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'var(--theme-bg-secondary, #f5f5f5)'
      }}
    >
      {/* Main Content Area - Full width, no sidebar */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

        {/* Header: Title + Search + Add Button on one line */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <CentralizedSearch
              segments={providerSegments}
              currentSearchParams={currentSearchParams}
              onFilterChange={handleFilterChange}
              onQuickSearch={handleQuickSearch}
              onClearAllFilters={handleClearAllFilters}
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              onRefresh={handleRefresh}
              quickSearchText={quickSearchText}
              onQuickSearchChange={handleQuickSearchChange}
              placeholder="Search by name, or use field:value (e.g. enabled:true)"
            />
          </Box>
          {canWrite && (
            <Tooltip title="Add Provider">
              <IconButton
                size="small"
                color="primary"
                onClick={() => setCreateDialogOpen(true)}
                disabled={loading}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>


        {/* Provider report charts — fixed Events-style strip with report swap */}

        {/* Providers Table */}
        <Paper
          className="providers-content"
          elevation={1}
          sx={{
            flexGrow: 1,
            overflow: 'hidden',
            borderRadius: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {/* Providers Table */}
          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
            <TableContainer>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === 'name'}
                        direction={sortBy === 'name' ? sortOrder : 'asc'}
                        onClick={() => handleSortChange('name')}
                      >
                        Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === 'type'}
                        direction={sortBy === 'type' ? sortOrder : 'asc'}
                        onClick={() => handleSortChange('type')}
                      >
                        Type
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Tariff</TableCell>
                    <TableCell>Profile</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === 'created_at'}
                        direction={sortBy === 'created_at' ? sortOrder : 'asc'}
                        onClick={() => handleSortChange('created_at')}
                      >
                        Created
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Tags</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && (!providers || providers.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <CircularProgress />
                      </TableCell>
                    </TableRow>
                  ) : (!providers || providers.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                          No providers found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    providers.map((provider) => {
                      const providerId = provider.id || provider.uuid;

                      return (
                        <TableRow key={providerId} hover sx={{ ...stripedTableRowSx }}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <BusinessIcon color="action" />
                              <Typography variant="body2" fontWeight={600}>
                                {provider.name}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={provider.type}
                              size="small"
                              color={getTypeChipColor(provider.type)}
                            />
                          </TableCell>
                          <TableCell>
                            {provider.tariff_uuid ? (
                              <Button
                                variant="text"
                                size="small"
                                onClick={() => navigate(`/tariffs?uuid=${provider.tariff_uuid}`)}
                                sx={{ textTransform: 'none', p: 0, minWidth: 0 }}
                              >
                                {provider.tariff_name || provider.tariff_uuid}
                              </Button>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            {provider.profile && typeof provider.profile === 'object'
                              ? Object.entries(provider.profile).map(([k, v]) => `${k}: ${v}`).join(', ') || '-'
                              : provider.profile || '-'}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                              {orEmpty(provider.notes)}
                            </Typography>
                          </TableCell>
                          <TableCell>{formatDate(provider.created_at)}</TableCell>
                          <TableCell>
                            <MetaTagChips meta={provider.meta} />
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                              {canWrite && (
                                <Tooltip title="Edit">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleOpenDialog(provider)}
                                    disabled={loading}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {canWrite && (
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleOpenDeleteDialog(provider)}
                                    disabled={loading}
                                    color="error"
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            <TablePagination
              component="div"
              count={totalCount}
              page={page}
              onPageChange={handlePageChange}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
              sx={{ borderTop: '1px solid var(--mui-palette-divider)' }}
            />
          </Box>
        </Paper>

      </Box>

      {/* Create/Edit Dialog */}
      {/* Creation shows only the selected type's server-provided fields. */}
      <CreateProviderDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSave={async (data) => { await handleSaveProvider(data); setCreateDialogOpen(false); }}
        loading={dialogLoading}
        providerTypes={providerTypes}
        allTariffs={allTariffs}
        canWrite={canWrite}
      />

      <ProviderDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveProvider}
        provider={selectedProvider}
        loading={dialogLoading}
        allTariffs={allTariffs}
        allTariffsLoading={allTariffsLoading}
        onRefreshTariffs={fetchAllTariffs}
        providerTypes={providerTypes}
        llmServices={llmServices}
        canWrite={canWrite}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteProvider}
        loading={dialogLoading}
        title="Delete Provider"
        message={<Typography>Are you sure you want to delete provider{' '}
          <strong>{(providerToDelete)?.name}</strong>?</Typography>}
        description="This action cannot be undone and will affect all associated tariffs."
      />
    </Box>
  );
};

export default Providers;
