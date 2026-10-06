import { useEffect, useMemo } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TableSortLabel, IconButton, Button, Chip, Tooltip, Typography,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  ContentCopy as DuplicateIcon, EventNote as EventsIcon,
} from '@mui/icons-material';
import { useTariffs } from './Tariffs.js';
import { TariffBridge } from '../Bridges/TariffBridge/TariffBridge.jsx';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';
import { usePermissions } from '../../hooks/usePermissions';
import RowEventsButton from '../shared/RowEventsButton/RowEventsButton.jsx';
import { useGlobalSearch } from '../../context/GlobalSearchContext';
import { formatDate } from '../../utils/dateUtils';
import { getEnabledChipProps } from '../../utils/chipStyles';
import { stripedTableRowSx, orEmpty } from '../shared/tableTheme.jsx';
import CentralizedSearch from '../shared/CentralizedSearch/CentralizedSearch.jsx';
import useCentralizedSearch from '../../hooks/useCentralizedSearch';
import MetaTagChips from '../common/MetaTagChips/MetaTagChips';
import { ConfirmDialog } from '../ui';

const EMPTY_FILTERS = { name: '', scheme: '', enabled: '', search: '' };

/**
 * Tariffs — the rate books subscriptions bill against.
 *
 * Tariffs were only reachable through the picker embedded in other dialogs
 * (TariffSelect / PlanBridge), so there was no way to see what existed, or to
 * reach one that wasn't already attached to something. This is the list screen;
 * create/edit (including the rate table) reuses TariffBridge, the same dialog
 * those pickers open, so there is one editor rather than two.
 *
 * Tariffs are customer-scoped, NOT environment-scoped — the API ignores
 * environment_uuid for this model, so the screen deliberately does not filter
 * by the selected application.
 */
const Tariffs = () => {
  const { selectedCustomer } = useCustomerEnvironment();
  const { can } = usePermissions();
  const canWrite = can('tariffs', 'write');
  const { registerScreen, unregisterScreen } = useGlobalSearch();

  const {
    tariffs, loading, selectedTariff, dialogMode, schemes,
    dialogOpen, deleteDialogOpen, tariffToDelete,
    page, rowsPerPage, totalCount, sortBy, sortOrder,
    handleOpenDialog, handleCloseDialog, handleSaved,
    handleOpenDeleteDialog, handleCloseDeleteDialog, handleDeleteTariff,
    handleDuplicateTariff,
    handlePageChange, handleRowsPerPageChange, handleSortChange,
    handleFiltersChange, fetchTariffs,
  } = useTariffs();

  const centralizedSearch = useCentralizedSearch({
    onFiltersChange: handleFiltersChange,
    onResetFilters: () => handleFiltersChange(EMPTY_FILTERS),
    onRefresh: fetchTariffs,
  });

  const tariffSegments = useMemo(() => [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'scheme', label: 'Scheme', type: 'select', data: schemes.map(s => ({ uuid: s, name: s })) },
    { name: 'enabled', label: 'Status', type: 'select', data: [{ uuid: 'true', name: 'Enabled' }, { uuid: 'false', name: 'Disabled' }] },
  ], [schemes]);

  useEffect(() => {
    registerScreen('Tariffs', tariffSegments, {
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
      onClear: () => handleFiltersChange(EMPTY_FILTERS),
    });
    return () => unregisterScreen();
  }, [tariffSegments, registerScreen, unregisterScreen, handleFiltersChange]);

  const sortableColumns = useMemo(() => [
    { id: 'created_at', label: 'Created At' },
    { id: 'updated_at', label: 'Updated At' },
    { id: 'enabled', label: 'Enabled', align: 'center' },
    { id: 'name', label: 'Name' },
    { id: 'scheme', label: 'Scheme' },
    { id: 'notes', label: 'Notes' },
    { id: 'meta', label: 'Tags' },
  ], []);

  if (!selectedCustomer) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body1" color="text.secondary">
          Please select a customer to view tariffs.
        </Typography>
      </Box>
    );
  }

  const colSpan = sortableColumns.length + 1;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        px: { xs: 0.5, sm: 1.5 },
        py: { xs: 0.5, sm: 1 },
        height: '100%',
        width: '100%',
      }}
    >
      {/* Header: Search + Add */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CentralizedSearch
            segments={tariffSegments}
            currentSearchParams={centralizedSearch.currentSearchParams}
            onFilterChange={centralizedSearch.handleFilterChange}
            onQuickSearch={centralizedSearch.handleQuickSearch}
            onClearAllFilters={centralizedSearch.handleClearAllFilters}
            dateRange={centralizedSearch.dateRange}
            onDateRangeChange={centralizedSearch.handleDateRangeChange}
            onRefresh={centralizedSearch.handleRefresh}
            quickSearchText={centralizedSearch.quickSearchText}
            onQuickSearchChange={centralizedSearch.handleQuickSearchChange}
            placeholder="Search by name, or use field:value (e.g. scheme:flat)"
          />
        </Box>
        {canWrite && (
          <Tooltip title="Add Tariff">
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

      {/* Table */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0, mt: 1 }}>
        <Paper elevation={3} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <TableContainer sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
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
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && tariffs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : tariffs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">No tariffs found</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  tariffs.map(t => (
                    <TableRow
                      key={t.uuid}
                      hover
                      sx={{ ...stripedTableRowSx, cursor: 'pointer' }}
                      onClick={() => handleOpenDialog(t)}
                    >
                      <TableCell><Typography variant="body2">{formatDate(t.created_at)}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{formatDate(t.updated_at)}</Typography></TableCell>
                      <TableCell align="center"><Chip {...getEnabledChipProps(t.enabled)} /></TableCell>
                      <TableCell><Typography variant="body2" fontWeight={600}>{t.name}</Typography></TableCell>
                      <TableCell>
                        {t.scheme ? <Chip label={t.scheme} size="small" variant="outlined" /> : orEmpty(null)}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 320 }}>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {orEmpty(t.notes)}
                        </Typography>
                      </TableCell>
                      <TableCell><MetaTagChips meta={t.meta} /></TableCell>
                      <TableCell align="center" onClick={e => e.stopPropagation()}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                          <Tooltip title={canWrite ? 'Edit rates' : 'View rates'}>
                            <IconButton size="small" onClick={() => handleOpenDialog(t)} disabled={loading}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {canWrite && (
                            <Tooltip title="Duplicate">
                              <IconButton size="small" onClick={() => handleDuplicateTariff(t)} disabled={loading}>
                                <DuplicateIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <RowEventsButton subject="tariff" uuid={t.uuid} />
                          {canWrite && (
                            <Tooltip title="Delete">
                              <IconButton size="small" color="error" onClick={() => handleOpenDeleteDialog(t)} disabled={loading}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
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
            sx={{ borderTop: '1px solid var(--mui-palette-divider)', flexShrink: 0 }}
          />
        </Paper>
      </Box>

      {/* Create / Edit — the same dialog the tariff pickers open, so the rate
          editor lives in exactly one place. */}
      <TariffBridge
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaved}
        tariff={selectedTariff}
        mode={dialogMode}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteTariff}
        loading={loading}
        title="Delete Tariff"
        message={<Typography>Delete <strong>{tariffToDelete?.name}</strong>?</Typography>}
        description="Subscriptions and plans still pointing at it will lose their rates."
      />
    </Box>
  );
};

export default Tariffs;
