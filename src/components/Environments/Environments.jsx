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
  TableSortLabel
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  EventNote as EventsIcon,
} from '@mui/icons-material';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ConfirmDialog } from '../ui';
import { useEnvironments } from './Environments';
import { usePermissions } from '../../hooks/usePermissions';
import RowEventsButton from '../shared/RowEventsButton/RowEventsButton.jsx';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import EnvironmentDialog from './EnvironmentDialog/EnvironmentDialog';
import { formatDate } from '../../utils/dateUtils';
import { getEnabledChipProps } from '../../utils/chipStyles';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import LiveChartsPopout from '../Live/LiveChartsPopout.jsx';
import { EnvironmentChartsPanel } from '../Live/panels/EntityChartsPanels.jsx';
import useCentralizedSearch from '../../hooks/useCentralizedSearch';
import { stripedTableRowSx } from '../shared/tableTheme.jsx';
import './Environments.css';


/**
 * Environments Component
 * Main component for environments management with sidebar list and wide table
 */
const Environments = () => {
  const { can } = usePermissions();
  const canWrite = can('environments', 'write');
  const { registerScreen, unregisterScreen } = useGlobalSearch();

  const {
    environments,
    loading,
    selectedEnvironment,
    dialogOpen,
    deleteDialogOpen,
    environmentToDelete,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    handleOpenDialog,
    handleCloseDialog,
    handleSaveEnvironment,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteEnvironment,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    handleResetFilters,
    fetchEnvironments
  } = useEnvironments();

  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(null);

  // Register search segments with GlobalSearchContext
  const envSegments = useMemo(() => [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'enabled', label: 'Status', type: 'select', data: [{ uuid: 'true', name: 'Active' }, { uuid: 'false', name: 'Inactive' }] },
    { name: 'meta', label: 'Tag', type: 'tag', url: '/api/applications?action=meta_keys' },
  ], []);

  // Bridge CentralizedSearch filter events to the hook's filter state
  const handleCentralizedFiltersChange = useCallback((filters) => {
    const mapped = {};
    if (filters.name !== undefined) mapped.search = filters.name;
    if (filters.search !== undefined) mapped.search = filters.search;
    if (filters.enabled !== undefined) mapped.enabled = filters.enabled;
    if (Object.keys(mapped).length > 0) handleFiltersChange(mapped);
  }, [handleFiltersChange]);

  const handleCentralizedReset = useCallback(() => {
    handleResetFilters();
  }, [handleResetFilters]);

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
    onResetFilters: handleCentralizedReset,
    onRefresh: fetchEnvironments,
  });

  useEffect(() => {
    registerScreen('environments', envSegments, {
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
        handleFiltersChange({ search: '', enabled: '' });
      },
    });
    return () => unregisterScreen();
  }, [envSegments, registerScreen, unregisterScreen, handleFiltersChange]);

  // Listen for environment change events to refresh data
  useEffect(() => {
    const handleEnvironmentChange = () => {
      console.log('🔄 Environment changed, refreshing Environments data...');
      fetchEnvironments();
    };

    window.addEventListener('environmentChanged', handleEnvironmentChange);

    return () => {
      window.removeEventListener('environmentChanged', handleEnvironmentChange);
    };
  }, [fetchEnvironments]);

  const handleSelectEnvironment = (environmentId) => {
    setSelectedEnvironmentId(environmentId);
  };

  return (
    <Box
      className="environments-container"
      sx={{
        px: { xs: 0.5, sm: 1.5 },
        py: { xs: 0.5, sm: 1 },
        height: '100%',
        display: 'flex',
        overflow: 'hidden',
        backgroundColor: 'var(--mui-palette-surface-muted)'
      }}
    >
      {/* Application live charts (relocated from the removed Home screen) */}
      <LiveChartsPopout title="Application Live Charts" Panel={EnvironmentChartsPanel} sx={{ mt: 1 }} />

      {/* Environments Table Area - Full width, no sidebar */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>

        {/* Header: Search + Add Button on one line */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <CentralizedSearch
              segments={envSegments}
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
            <Tooltip title="Add Application">
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

        {/* Environments Table */}
        <Paper
          className="environments-content"
          elevation={3}
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {/* Environments Table */}
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
                    <TableCell align="center">
                      <TableSortLabel
                        active={sortBy === 'enabled'}
                        direction={sortBy === 'enabled' ? sortOrder : 'asc'}
                        onClick={() => handleSortChange('enabled')}
                      >
                        Status
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === 'created_at'}
                        direction={sortBy === 'created_at' ? sortOrder : 'asc'}
                        onClick={() => handleSortChange('created_at')}
                      >
                        Created
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && (!environments || environments.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <CircularProgress />
                      </TableCell>
                    </TableRow>
                  ) : (!environments || environments.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                          No environments found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    environments.map((env) => {
                      const envId = env.id || env.uuid;
                      const isSelected = selectedEnvironmentId === envId;

                      return (
                        <TableRow
                          key={envId}
                          hover
                          selected={isSelected}
                          sx={{
                            ...stripedTableRowSx,
                            cursor: 'pointer',
                            '&.Mui-selected': {
                              bgcolor: '#e3f2fd !important'
                            }
                          }}
                          onClick={() => handleSelectEnvironment(envId)}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {env.name}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip {...getEnabledChipProps(env.enabled)} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {formatDate(env.created_at)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                              {canWrite && (
                                <Tooltip title="Edit application">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleOpenDialog(env)}
                                    disabled={loading}
                                    data-testid="edit-environment-button"
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <RowEventsButton subject="environment" uuid={env.uuid} />
                              {canWrite && (
                                <Tooltip title="Delete application">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleOpenDeleteDialog(env)}
                                    disabled={loading}
                                    color="error"
                                    data-testid="delete-environment-button"
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
      <EnvironmentDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveEnvironment}
        environment={selectedEnvironment}
        loading={loading}
        canWrite={canWrite}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteEnvironment}
        loading={loading}
        title="Delete Application"
        message={<Typography>Are you sure you want to delete environment{' '}
          <strong>{(environmentToDelete)?.name}</strong>?</Typography>}
        description="This action cannot be undone and will affect all resources in this environment."
        data-testid="delete-confirmation-dialog"
      />
    </Box>
  );
};

export default Environments;
