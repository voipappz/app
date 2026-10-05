import { useState, useEffect, useMemo } from 'react';
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
  IconButton,
  Chip,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Skeleton,
  TableSortLabel,
  TextField,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  ContentCopy as DuplicateIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  FormatListNumbered as NumbersIcon,
  EventNote as EventsIcon,
} from '@mui/icons-material';
import { ConfirmDialog } from '../ui';
import { useCampaigns } from './Campaigns';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import LiveChartsPopout from '../Live/LiveChartsPopout.jsx';
import { CampaignChartsPanel } from '../Live/panels/EntityChartsPanels.jsx';
import { orEmpty, stripedTableRowSx } from '../shared/tableTheme.jsx';
import useCentralizedSearch from '../../hooks/useCentralizedSearch';
import MetaTagChips from '../common/MetaTagChips/MetaTagChips';
import CampaignDialog from './CampaignDialog/CampaignDialog';
import CampaignNumbersDialog from './CampaignNumbers/CampaignNumbers';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { usePermissions } from '../../hooks/usePermissions';
import RowEventsButton from '../shared/RowEventsButton/RowEventsButton.jsx';
import { formatDate } from '../../utils/dateUtils';
import { getEnabledChipProps, getStatusChipProps, getTypeChipColor } from '../../utils/chipStyles';
import HelpButton from '../common/HelpButton';
import { GUIDE_URLS } from '../../utils/guides';
import './Campaigns.css';

/**
 * Duplicate campaign dialog
 */
const DuplicateCampaignDialog = ({ open, onClose, onDuplicate, campaign, loading }) => {
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (open && campaign) {
      setNewName(`Copy of ${campaign.name}`);
    }
  }, [open, campaign]);

  const handleSubmit = () => {
    if (newName.trim() && campaign) {
      onDuplicate(campaign.uuid, newName.trim());
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Duplicate Campaign</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Creating a copy of <strong>{campaign?.name}</strong>
        </Typography>
        <TextField
          label="New Campaign Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          fullWidth
          size="small"
          autoFocus
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !newName.trim()}
          startIcon={loading ? <CircularProgress size={20} /> : null}
          sx={{ bgcolor: 'var(--accent-secondary)', '&:hover': { bgcolor: 'var(--accent-secondary-hover, #E49728)' } }}
        >
          Duplicate
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Campaigns Component
 * Main component for campaign management
 */
const Campaigns = () => {
  const { can } = usePermissions();
  const canWrite = can('campaigns', 'write');
  const { environments } = useCustomerEnvironment();
  const { registerScreen, unregisterScreen } = useGlobalSearch();
  const [numbersCampaign, setNumbersCampaign] = useState(null);

  const {
    campaigns,
    loading,
    selectedCampaign,
    dialogOpen,
    deleteDialogOpen,
    campaignToDelete,
    duplicateDialogOpen,
    campaignToDuplicate,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    handleOpenDialog,
    handleCloseDialog,
    handleSaveCampaign,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteCampaign,
    handleOpenDuplicateDialog,
    handleCloseDuplicateDialog,
    handleDuplicateCampaign,
    handleRunCampaign,
    handleStopCampaign,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    fetchCampaigns,
  } = useCampaigns();

  // CentralizedSearch
  const centralizedSearch = useCentralizedSearch({
    onFiltersChange: handleFiltersChange,
    onResetFilters: () => handleFiltersChange({}),
    onRefresh: fetchCampaigns,
  });

  const campaignSegments = useMemo(() => [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'type', label: 'Type', type: 'select', data: [{ uuid: 'call', name: 'Call' }, { uuid: 'sms', name: 'SMS' }] },
    { name: 'status', label: 'Status', type: 'select', data: [
      { uuid: 'create', name: 'Created' },
      { uuid: 'run', name: 'Running' },
      { uuid: 'pause', name: 'Paused' },
      { uuid: 'stop', name: 'Stopped' },
    ]},
    { name: 'enabled', label: 'Enabled', type: 'select', data: [{ uuid: 'true', name: 'Enabled' }, { uuid: 'false', name: 'Disabled' }] },
    { name: 'environment_uuid', label: 'Application', type: 'select', data: (environments || []).map(e => ({ uuid: e.uuid, name: e.name })) },
    { name: 'meta', label: 'Tag', type: 'tag', url: '/api/campaigns?action=meta_keys' },
  ], [environments]);

  useEffect(() => {
    registerScreen('Campaigns', campaignSegments, {
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
        handleFiltersChange({ name: '', type: '', status: '', enabled: '', environment_uuid: '' });
      },
    });
    return () => unregisterScreen();
  }, [campaignSegments, registerScreen, unregisterScreen, handleFiltersChange]);

  // Refresh on environment change
  useEffect(() => {
    const handleEnvironmentChange = () => fetchCampaigns();
    window.addEventListener('environmentChanged', handleEnvironmentChange);
    return () => window.removeEventListener('environmentChanged', handleEnvironmentChange);
  }, [fetchCampaigns]);

  return (
    <Box
      className="campaigns-container"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        px: { xs: 0.5, sm: 1.5 },
        py: { xs: 0.5, sm: 1 },
        height: '100%',
        width: '100%'
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CentralizedSearch
            segments={campaignSegments}
            currentSearchParams={centralizedSearch.currentSearchParams}
            onFilterChange={centralizedSearch.handleFilterChange}
            onQuickSearch={centralizedSearch.handleQuickSearch}
            onClearAllFilters={centralizedSearch.handleClearAllFilters}
            dateRange={centralizedSearch.dateRange}
            onDateRangeChange={centralizedSearch.handleDateRangeChange}
            onRefresh={centralizedSearch.handleRefresh}
            quickSearchText={centralizedSearch.quickSearchText}
            onQuickSearchChange={centralizedSearch.handleQuickSearchChange}
            placeholder="Search by name, or use field:value (e.g. enabled:true)"
          />
        </Box>
        {canWrite && (
          <Tooltip title="Add Campaign">
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleOpenDialog()}
              disabled={loading}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Table */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' }}>
        {/* Campaign live charts (relocated from the removed Home screen) */}
      <LiveChartsPopout title="Campaign Live Charts" Panel={CampaignChartsPanel} sx={{ mt: 1 }} />

      <Paper
          className="campaigns-content"
          elevation={3}
          sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
            <TableContainer>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === 'created_at'}
                        direction={sortBy === 'created_at' ? sortOrder : 'asc'}
                        onClick={() => handleSortChange('created_at')}
                      >
                        Created
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center">
                      <TableSortLabel
                        active={sortBy === 'enabled'}
                        direction={sortBy === 'enabled' ? sortOrder : 'asc'}
                        onClick={() => handleSortChange('enabled')}
                      >
                        Enabled
                      </TableSortLabel>
                    </TableCell>
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
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === 'status'}
                        direction={sortBy === 'status' ? sortOrder : 'asc'}
                        onClick={() => handleSortChange('status')}
                      >
                        Status
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === 'environment_name'}
                        direction={sortBy === 'environment_name' ? sortOrder : 'asc'}
                        onClick={() => handleSortChange('environment_name')}
                      >
                        Application
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Tags</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && campaigns.length === 0 ? (
                    Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}><Skeleton height={20} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                  ) : campaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                          No campaigns found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    campaigns.map((campaign) => {
                      const statusProps = getStatusChipProps(campaign.status);
                      const isRunning = campaign.status === 'run';

                      return (
                        <TableRow key={campaign.uuid} hover sx={stripedTableRowSx}>
                          <TableCell>
                            <Typography variant="body2">
                              {formatDate(campaign.created_at)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip {...getEnabledChipProps(campaign.enabled)} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {orEmpty(campaign.name)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={(campaign.type || 'call').toUpperCase()}
                              size="small"
                              color={getTypeChipColor(campaign.type)}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={statusProps.label}
                              size="small"
                              color={statusProps.color}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {orEmpty(campaign.environment?.name || campaign.environment_name)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <MetaTagChips meta={campaign.meta} />
                          </TableCell>
                          <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                              {/* Run / Stop toggle */}
                              {canWrite && (isRunning ? (
                                <Tooltip title="Stop Campaign">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleStopCampaign(campaign.uuid)}
                                    disabled={loading}
                                    color="error"
                                  >
                                    <StopIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Tooltip title="Run Campaign">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleRunCampaign(campaign.uuid)}
                                    disabled={loading}
                                    color="success"
                                  >
                                    <PlayIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ))}
                              <Tooltip title="Numbers">
                                <IconButton
                                  size="small"
                                  onClick={() => setNumbersCampaign(campaign)}
                                  disabled={loading}
                                  color="primary"
                                >
                                  <NumbersIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {canWrite && (
                                <Tooltip title="Edit">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleOpenDialog(campaign)}
                                    disabled={loading}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {canWrite && (
                                <Tooltip title="Duplicate">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleOpenDuplicateDialog(campaign)}
                                    disabled={loading}
                                  >
                                    <DuplicateIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <RowEventsButton subject="campaign" uuid={campaign.uuid} />
                              {canWrite && (
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleOpenDeleteDialog(campaign)}
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
      <CampaignDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveCampaign}
        campaign={selectedCampaign}
        loading={loading}
        canWrite={canWrite}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteCampaign}
        loading={loading}
        title="Delete Campaign"
        message={<Typography>Are you sure you want to delete campaign{' '}
        <strong>{(campaignToDelete)?.name}</strong>?</Typography>}
        description="This action cannot be undone. All campaign numbers will also be removed."
      />

      {/* Duplicate Dialog */}
      <DuplicateCampaignDialog
        open={duplicateDialogOpen}
        onClose={handleCloseDuplicateDialog}
        onDuplicate={handleDuplicateCampaign}
        campaign={campaignToDuplicate}
        loading={loading}
      />

      {/* Campaign Numbers Dialog */}
      <CampaignNumbersDialog
        open={!!numbersCampaign}
        onClose={() => setNumbersCampaign(null)}
        campaign={numbersCampaign}
        canWrite={canWrite}
      />
    </Box>
  );
};

export default Campaigns;
