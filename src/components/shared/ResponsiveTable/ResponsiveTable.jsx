import {
  Box, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, TableSortLabel, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { stripedTableRowSx } from '../tableTheme.jsx';
import MobileRecordCard from './MobileRecordCard.jsx';
import { denseTableSx } from './density';

// A table described as data: the same striped MUI table on a desktop, one card
// per row on a phone (see MobileRecordCard for where each column goes).
//
// A column: { id, label, render(row), sortable, align: 'start' | 'center' | 'end',
//             width, priority: 'primary' | 'secondary' | 'meta' | 'action' | 'desktopOnly',
//             cardLabel, hideBelow: 'lg' | 'xl' }
// `align` is logical: 'start' is left in English and right in Hebrew.
// `width` is a preferred width for a short column; text columns leave it out
// and flex. `dense` (the default) applies the sizing in density.js.
// `hideBelow` drops a less important column from the table on a screen
// narrower than that breakpoint (a tablet, a small laptop), so the rest fit
// without scrolling sideways; the cards still show it.
// Between a phone and the cards' cut-off the cards sit two to a row.
const CELL_ALIGN = { start: 'left', center: 'center', end: 'right' };

// A clickable row opens from the keyboard too: focusable, Enter or Space.
export const keyboardOpen = (open) => ({
  tabIndex: 0,
  onKeyDown: (event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } },
});

export default function ResponsiveTable({
  columns,
  rows,
  getRowId,
  onRowClick,
  selectedRowId,
  rowSx,
  loading = false,
  skeletonRows = 8,
  emptyMessage,
  sortBy,
  sortDirection = 'asc',
  onSort,
  page,
  rowsPerPage,
  count,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions,
  cardsBelow = 'md',
  dense = true,
  'data-testid': testId,
}) {
  const theme = useTheme(); // MUI's default theme outside a ThemeProvider
  const showCards = useMediaQuery(theme.breakpoints.down(cardsBelow));
  const hidden = {
    lg: useMediaQuery(theme.breakpoints.down('lg')),
    xl: useMediaQuery(theme.breakpoints.down('xl')),
  };
  const tableColumns = columns.filter((column) => !hidden[column.hideBelow]);
  const cell = (column, row) => (column.render ? column.render(row) : row[column.id]);
  const showSkeleton = loading && rows.length === 0;

  const pagination = onPageChange && (
    <TablePagination
      component="div"
      count={count}
      page={page}
      onPageChange={onPageChange}
      rowsPerPage={rowsPerPage}
      onRowsPerPageChange={onRowsPerPageChange}
      rowsPerPageOptions={rowsPerPageOptions}
      sx={{ borderTop: '1px solid var(--mui-palette-divider)' }}
    />
  );

  const emptyText = (
    <Typography variant="body2" color="text.secondary">{emptyMessage}</Typography>
  );

  if (showCards) {
    return (
      <Box data-testid={testId}>
        <Box sx={{ p: 1, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 1 }}>
          {showSkeleton && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} variant="rounded" height={96} sx={{ mb: 1 }} />)}
          {!loading && rows.length === 0 && <Box sx={{ textAlign: 'center', py: 4, gridColumn: '1 / -1' }}>{emptyText}</Box>}
          {rows.map((row) => (
            <MobileRecordCard
              key={getRowId(row)}
              row={row}
              columns={columns.filter((column) => column.priority !== 'desktopOnly')}
              selected={selectedRowId === getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            />
          ))}
        </Box>
        {pagination}
      </Box>
    );
  }

  return (
    <Box data-testid={testId}>
      <TableContainer sx={{ width: '100%' }}>
        <Table stickyHeader size={dense ? 'small' : 'medium'} sx={dense ? denseTableSx : undefined}>
          <TableHead>
            <TableRow>
              {tableColumns.map((column) => (
                <TableCell key={column.id} align={CELL_ALIGN[column.align]} sx={column.width ? { width: column.width } : undefined}>
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
            {showSkeleton && Array.from({ length: skeletonRows }, (_, i) => (
              <TableRow key={i}>
                {tableColumns.map((column) => <TableCell key={column.id}><Skeleton height={20} /></TableCell>)}
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={tableColumns.length} align="center"><Box sx={{ py: 4 }}>{emptyText}</Box></TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow
                key={getRowId(row)}
                hover
                selected={selectedRowId === getRowId(row)}
                sx={{ ...stripedTableRowSx, cursor: onRowClick ? 'pointer' : undefined, ...rowSx }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                {...(onRowClick ? keyboardOpen(() => onRowClick(row)) : {})}
              >
                {tableColumns.map((column) => (
                  <TableCell key={column.id} align={CELL_ALIGN[column.align]}>{cell(column, row)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {pagination}
    </Box>
  );
}
