import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableSortLabel,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  TextField,
  MenuItem,
  Button,
  IconButton,
  CircularProgress,
  InputAdornment,
  Chip,
  Paper
} from '@mui/material';
import {
  AddCircleOutline as CreditIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { orEmpty, stripedTableRowSx } from '../shared/tableTheme.jsx';
import { transactionsApi } from '../../services/api/transactionsApi';
import { apiService } from '../../services/apiService';

/**
 * Transactions Page — Full transaction history with subscription filter,
 * date range, type filter, credit/topup, and pagination.
 */
const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Server-side sort (column-header clicks refetch with order_by/order_type)
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Filters
  const [subscriptionUuid, setSubscriptionUuid] = useState('');
  const [subscriptions, setSubscriptions] = useState([]);

  // Credit form
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditData, setCreditData] = useState({ amount: '', description: '', subscription_uuid: '' });
  const [creditLoading, setCreditLoading] = useState(false);

  // Fetch subscriptions for filter
  useEffect(() => {
    apiService.get('/api/subscriptions?per_page=200', {}, 'fetching subscriptions', false)
      .then(data => {
        const list = Array.isArray(data) ? data : data?.data || [];
        setSubscriptions(list);
      })
      .catch(() => setSubscriptions([]));
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        per_page: rowsPerPage,
        order_by: sortBy,
        order_type: sortOrder,
      };
      if (subscriptionUuid) {
        params.subscription_uuid = subscriptionUuid;
      }
      const result = await transactionsApi.getTransactions(params);
      const list = Array.isArray(result) ? result : result?.data || [];
      setTransactions(list);
      setTotal(result?.total ? parseInt(result.total, 10) : list.length);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, subscriptionUuid, sortBy, sortOrder]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleSortChange = (field) => {
    const newOrder = sortBy === field ? (sortOrder === 'asc' ? 'desc' : 'asc') : 'asc';
    setSortBy(field);
    setSortOrder(newOrder);
    setPage(0);
  };

  const handleAddCredit = async () => {
    if (!creditData.amount || !creditData.subscription_uuid) return;
    setCreditLoading(true);
    try {
      // Amounts are integer UNITS (no currency). Send the value as-is.
      const amountUnits = Math.round(parseFloat(creditData.amount));
      await transactionsApi.createTransaction({
        subscription_uuid: creditData.subscription_uuid,
        type: 'topup',
        amount: amountUnits,
        notes: creditData.description || 'Manual credit'
      });
      setCreditData({ amount: '', description: '', subscription_uuid: '' });
      setShowCreditForm(false);
      fetchTransactions();
    } catch (err) {
      console.error('Failed to create transaction:', err);
    } finally {
      setCreditLoading(false);
    }
  };

  // Amounts are integer UNITS (not currency). Format as a signed unit count.
  const formatAmount = (amount) => {
    const num = parseInt(amount, 10);
    if (isNaN(num)) return '0 units';
    return `${num >= 0 ? '+' : '-'}${Math.abs(num)} units`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleString(); } catch { return dateStr; }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Transactions</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={fetchTransactions} disabled={loading} title="Refresh">
            <RefreshIcon />
          </IconButton>
          <Button
            startIcon={<CreditIcon />}
            onClick={() => setShowCreditForm(!showCreditForm)}
            variant="outlined"
            color="success"
          >
            Add Credit
          </Button>
        </Box>
      </Box>

      {/* Credit Form */}
      {showCreditForm && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Add Manual Credit</Typography>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <TextField
              select
              label="Subscription"
              value={creditData.subscription_uuid}
              onChange={(e) => setCreditData(prev => ({ ...prev, subscription_uuid: e.target.value }))}
              size="small"
              sx={{ minWidth: 250 }}
            >
              <MenuItem value="" disabled>Select subscription...</MenuItem>
              {subscriptions.map(s => (
                <MenuItem key={s.uuid} value={s.uuid}>{s.name || s.uuid}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Amount (units)"
              type="number"
              value={creditData.amount}
              onChange={(e) => setCreditData(prev => ({ ...prev, amount: e.target.value }))}
              size="small"
              sx={{ width: 150 }}
            />
            <TextField
              label="Description"
              value={creditData.description}
              onChange={(e) => setCreditData(prev => ({ ...prev, description: e.target.value }))}
              size="small"
              sx={{ flex: 1, minWidth: 200 }}
              placeholder="e.g. Manual topup"
            />
            <Button
              variant="contained"
              color="success"
              onClick={handleAddCredit}
              disabled={creditLoading || !creditData.amount || !creditData.subscription_uuid}
              sx={{ height: 40 }}
            >
              {creditLoading ? <CircularProgress size={18} /> : 'Add'}
            </Button>
            <Button onClick={() => { setShowCreditForm(false); setCreditData({ amount: '', description: '', subscription_uuid: '' }); }} sx={{ height: 40 }}>
              Cancel
            </Button>
          </Box>
        </Paper>
      )}

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
        <TextField
          select
          label="Subscription"
          value={subscriptionUuid}
          onChange={(e) => { setSubscriptionUuid(e.target.value); setPage(0); }}
          size="small"
          sx={{ minWidth: 250 }}
        >
          <MenuItem value="">All Subscriptions</MenuItem>
          {subscriptions.map(s => (
            <MenuItem key={s.uuid} value={s.uuid}>{s.name || s.uuid}</MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'created_at'}
                  direction={sortBy === 'created_at' ? sortOrder : 'asc'}
                  onClick={() => handleSortChange('created_at')}
                >
                  Date
                </TableSortLabel>
              </TableCell>
              <TableCell>Subscription</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortBy === 'amount'}
                  direction={sortBy === 'amount' ? sortOrder : 'asc'}
                  onClick={() => handleSortChange('amount')}
                >
                  Amount
                </TableSortLabel>
              </TableCell>
              <TableCell>Description</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">No transactions found.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx, index) => {
                // amount is signed integer UNITS (negative = period charge/bill).
                const amountUnits = parseInt(tx.amount ?? 0, 10);
                const isCredit = amountUnits >= 0;
                const meta = tx.meta || {};
                const periodLabel = (tx.period_start && tx.period_end)
                  ? `${formatDate(tx.period_start)} → ${formatDate(tx.period_end)}`
                  : null;
                const breakdown = (meta.fee_units != null || meta.usage_units != null)
                  ? `fee ${meta.fee_units || 0} + usage ${meta.usage_units || 0}`
                  : null;
                return (
                  <TableRow key={tx.uuid || index} hover sx={stripedTableRowSx}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2">{formatDate(tx.created_at)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                        {orEmpty(tx.subscription?.name || tx.subscription_uuid)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={tx.entry_type || (isCredit ? 'credit' : 'debit')}
                        size="small"
                        color={isCredit ? 'success' : 'error'}
                        sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontFamily: 'monospace',
                          color: isCredit ? 'success.main' : 'error.main'
                        }}
                      >
                        {formatAmount(amountUnits)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {orEmpty(tx.notes || tx.description)}
                      </Typography>
                      {periodLabel && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {periodLabel}{breakdown ? ` · ${breakdown}` : ''}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </TableContainer>
    </Box>
  );
};

export default Transactions;
