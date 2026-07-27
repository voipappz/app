// PostgrestTable — a generic, drop-in table over any PostgREST table/view,
// using the OPTIONAL /rest/v1 data plane. A tenant fork renders one line:
//
//   <PostgrestTable table="calls" />
//   <PostgrestTable table="agents" columns={['name', 'extension']} order="name.asc" />
//
// Server-side paging (exact counts) + header-click sorting. Columns default to
// the first row's keys. This is a building block, not a feature page — for a
// full feature (filters, drawers, i18n copy) follow the Calls blueprint.
import {
  Alert, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TableSortLabel, Box,
} from '@mui/material';
import { usePostgrestTable } from './usePostgrestTable';

function cellText(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function PostgrestTable({ table, columns, select = '*', perPage: initialPerPage = 20, order: initialOrder = '' }) {
  const { rows, total, page, setPage, perPage, setPerPage, order, setOrder, loading, error } =
    usePostgrestTable(table, { perPage: initialPerPage, select, order: initialOrder });

  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const [orderCol, orderDir = 'asc'] = order.split('.');

  const sortBy = (col) => {
    const dir = orderCol === col && orderDir === 'asc' ? 'desc' : 'asc';
    setOrder(`${col}.${dir}`);
    setPage(0);
  };

  if (error) return <Alert severity="warning">{`${table}: ${error.message}`}</Alert>;

  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {cols.map((col) => (
                <TableCell key={col} sortDirection={orderCol === col ? orderDir : false}>
                  <TableSortLabel
                    active={orderCol === col}
                    direction={orderCol === col ? orderDir : 'asc'}
                    onClick={() => sortBy(col)}
                  >
                    {col}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={cols.length || 1} align="center">
                  <Box sx={{ py: 3 }}><CircularProgress size={22} /></Box>
                </TableCell>
              </TableRow>
            ) : rows.map((row, i) => (
              <TableRow key={row.id ?? row.uuid ?? i} hover>
                {cols.map((col) => <TableCell key={col}>{cellText(row[col])}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={perPage}
        onRowsPerPageChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 20, 50, 100]}
      />
    </Paper>
  );
}
