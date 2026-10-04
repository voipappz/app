import { useMemo } from 'react';
import {
  Box, CircularProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TableSortLabel, Typography,
} from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { stripedTableRowSx } from '../tableTheme.jsx';
import { assertColumns, cardColumns, cellValue, muiAlign } from './columns';
import MobileCardList from './MobileCardList';

/**
 * ResponsiveTable — a table on desktop, a stack of cards on a phone.
 *
 *   <ResponsiveTable
 *     columns={columns}            // see ./columns.js
 *     rows={rows}
 *     getRowId={(r) => r.uuid}
 *     onRowClick={openDetail}
 *     loading={loading}
 *     emptyMessage={t('extensions:empty')}
 *     // desktop paging — the existing TablePagination props, unchanged
 *     page={page} rowsPerPage={rowsPerPage} count={total}
 *     onPageChange={setPage} onRowsPerPageChange={setRowsPerPage}
 *     // phone infinite scroll, optional
 *     hasNextPage={hasNext} loadingMore={loadingMore} onLoadMore={loadMore}
 *   />
 *
 * The desktop branch deliberately renders what the twenty-nine hand-rolled
 * screens already render -- TableContainer > Table, stripedTableRowSx on the
 * data rows, TablePagination underneath -- and forwards data-testid. So
 * adopting it is behaviour-preserving and the existing Playwright selectors
 * keep working, which is the only reason converting a screen is a small diff
 * rather than a rewrite.
 *
 * Sorting is reported, not performed: `sortBy`/`sortDirection`/`onSort` let the
 * screen keep asking the server to sort, which is what these screens do today.
 * A component that sorted locally would quietly disagree with the paging.
 */
const ResponsiveTable = ({
  columns,
  rows,
  getRowId,
  onRowClick,
  loading = false,
  emptyMessage = 'No results',
  endMessage,
  // sorting (server-side; this only renders the affordance)
  sortBy,
  sortDirection = 'asc',
  onSort,
  // desktop paging — passed straight to TablePagination
  page,
  rowsPerPage,
  count,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions = [10, 25, 50, 100],
  // phone infinite scroll
  hasNextPage,
  loadingMore,
  onLoadMore,
  // escape hatch for a screen with a genuinely bespoke card (Calls has one)
  renderCard,
  breakpoint = 'md',
  'data-testid': testId,
  sx,
}) => {
  assertColumns(columns);

  const isPhone = useMediaQuery((theme) => theme.breakpoints.down(breakpoint));
  const forCards = useMemo(() => cardColumns(columns), [columns]);
  const paginated = typeof onPageChange === 'function' && typeof count === 'number';

  if (loading && (!rows || rows.length === 0)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }} data-testid={testId}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (isPhone) {
    return (
      <Box data-testid={testId} sx={sx}>
        <MobileCardList
          columns={forCards}
          rows={rows}
          getRowId={getRowId}
          onRowClick={onRowClick}
          renderCard={renderCard}
          emptyMessage={emptyMessage}
          endMessage={endMessage}
          hasNextPage={hasNextPage}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
        />
        {/* Without cursor paging there is no sentinel, so the phone still
            needs the pager to reach page two. */}
        {paginated && !onLoadMore && (
          <TablePagination
            component="div"
            count={count}
            page={page}
            onPageChange={onPageChange}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={onRowsPerPageChange}
            rowsPerPageOptions={rowsPerPageOptions}
          />
        )}
      </Box>
    );
  }

  return (
    <Box data-testid={testId} sx={sx}>
      <TableContainer>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.id} align={muiAlign(column.align)} sx={column.width ? { width: column.width } : undefined}>
                  {column.sortable && onSort ? (
                    <TableSortLabel
                      active={sortBy === column.id}
                      direction={sortBy === column.id ? sortDirection : 'asc'}
                      onClick={() => onSort(column.id)}
                    >
                      {column.label}
                    </TableSortLabel>
                  ) : column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {(!rows || rows.length === 0) ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{emptyMessage}</Typography>
                </TableCell>
              </TableRow>
            ) : rows.map((row, index) => {
              const key = getRowId ? getRowId(row) : (row?.uuid ?? row?.id ?? index);
              return (
                <TableRow
                  key={key}
                  hover
                  sx={{ ...stripedTableRowSx, cursor: onRowClick ? 'pointer' : 'default' }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      align={muiAlign(column.align)}
                      // An action cell's buttons must not also fire the row click.
                      onClick={column.priority === 'action' ? (e) => e.stopPropagation() : undefined}
                    >
                      {cellValue(column, row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {paginated && (
        <TablePagination
          component="div"
          count={count}
          page={page}
          onPageChange={onPageChange}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={onRowsPerPageChange}
          rowsPerPageOptions={rowsPerPageOptions}
        />
      )}
    </Box>
  );
};

export default ResponsiveTable;
