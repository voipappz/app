import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  TextField,
  FormControl,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Typography,
  IconButton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Divider,
  Grid,
  CircularProgress,
  Alert,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  ContentCopy as ContentCopyIcon
} from '@mui/icons-material';
import { useState, useEffect, useCallback } from 'react';
import { subscriptionsApi } from '../../../services/api/subscriptionsApi';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import PlanSelect from '../../common/PlanSelect/PlanSelect.jsx';
import { parseServerErrors, is406Error } from '../../../utils/formValidation';

/**
 * MetaEditor Component
 * Key-value pairs editor for subscription metadata
 */
const MetaEditor = ({ meta, onChange, disabled }) => {
  const [metaItems, setMetaItems] = useState([]);

  useEffect(() => {
    // Convert meta object to array format for editing
    if (meta && typeof meta === 'object') {
      const items = Object.entries(meta).map(([key, value]) => ({ key, value }));
      setMetaItems(items.length > 0 ? items : [{ key: '', value: '' }]);
    } else {
      setMetaItems([{ key: '', value: '' }]);
    }
  }, [meta]);

  const handleMetaChange = (index, field, value) => {
    const updatedItems = [...metaItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setMetaItems(updatedItems);
    
    // Convert back to object format and call onChange
    const metaObject = {};
    updatedItems.forEach(item => {
      if (item.key.trim()) {
        metaObject[item.key.trim()] = item.value;
      }
    });
    onChange(metaObject);
  };

  const addMetaItem = () => {
    setMetaItems([...metaItems, { key: '', value: '' }]);
  };

  const removeMetaItem = (index) => {
    if (metaItems.length > 1) {
      const updatedItems = metaItems.filter((_, i) => i !== index);
      setMetaItems(updatedItems);
      
      // Update meta object
      const metaObject = {};
      updatedItems.forEach(item => {
        if (item.key.trim()) {
          metaObject[item.key.trim()] = item.value;
        }
      });
      onChange(metaObject);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Meta Data
      </Typography>
      {metaItems.map((item, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField
            label="Key"
            value={item.key}
            onChange={(e) => handleMetaChange(index, 'key', e.target.value)}
            size="small"
            disabled={disabled}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Value"
            value={item.value}
            onChange={(e) => handleMetaChange(index, 'value', e.target.value)}
            size="small"
            disabled={disabled}
            sx={{ flex: 1 }}
          />
          <IconButton
            onClick={() => removeMetaItem(index)}
            disabled={disabled || metaItems.length === 1}
            size="small"
            color="error"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button
        startIcon={<AddIcon />}
        onClick={addMetaItem}
        disabled={disabled}
        size="small"
        variant="outlined"
      >
        Add Meta Field
      </Button>
    </Box>
  );
};

/**
 * BillingEditor Component
 * Balance only. A subscription has no tariff of its own — pricing comes from its
 * PLAN's tariff items, resolved server-side on every call — so showing a Tariff
 * field here framed it as a property of the subscription and invited the
 * question of how to change it. Edit the plan's tariffs instead. Balance is
 * topped up via POST /api/subscriptions/:uuid/credit (Add Balance).
 */
const BillingEditor = ({ balance, type, isEdit }) => {
  // Balance only exists once the subscription does, and the tariff is the
  // plan's — so on create there is nothing here but a heading. Render nothing.
  if (!isEdit) return null;

  const balanceHelper = type === 'prepaid'
    ? 'Remaining credit in units. Use "Add balance" to top up.'
    : 'Current-period usage in units (read-only, invoiced at period close).';
  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Billing
      </Typography>
      <Grid container spacing={2} direction="column">
        <Grid size={12}>
            <TextField
              label={type === 'prepaid' ? 'Balance (credit)' : 'Balance (usage)'}
              value={balance ?? 0}
              size="small"
              fullWidth
              InputProps={{ readOnly: true }}
              helperText={balanceHelper}
            />
        </Grid>
      </Grid>
    </Box>
  );
};

/**
 * TransactionsViewer Component
 * Shows the subscription's period invoices from GET /api/subscriptions/:id/transactions.
 * Each row is one billing period: amount (signed units), the period window and the
 * fee/usage breakdown from meta.fee_units / meta.usage_units.
 */
export const TransactionsViewer = ({ subscriptionUuid }) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTransactions = useCallback(async () => {
    if (!subscriptionUuid) return;
    setLoading(true);
    try {
      const result = await subscriptionsApi.getSubscriptionTransactions(subscriptionUuid);
      setTransactions(Array.isArray(result) ? result : result?.data || []);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [subscriptionUuid]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const formatAmount = (amount) => {
    const num = parseInt(amount, 10);
    if (isNaN(num)) return '0 units';
    return `${num >= 0 ? '+' : '-'}${Math.abs(num)} units`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const formatPeriod = (tx) =>
    tx.period_start || tx.period_end
      ? `${formatDate(tx.period_start)} → ${formatDate(tx.period_end)}`
      : '-';

  const formatBreakdown = (meta) => {
    if (!meta) return '-';
    const parts = [];
    if (meta.fee_units !== undefined && meta.fee_units !== null) parts.push(`fee ${meta.fee_units}`);
    if (meta.usage_units !== undefined && meta.usage_units !== null) parts.push(`usage ${meta.usage_units}`);
    return parts.length ? parts.join(' + ') : '-';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">Transactions (period invoices)</Typography>
        <IconButton onClick={fetchTransactions} size="small" title="Refresh" disabled={loading}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : transactions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No transactions yet — a row is added each time a billing period closes.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Period</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Breakdown</TableCell>
              <TableCell>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transactions.map((tx, index) => {
              // amount is signed integer UNITS. Negative = period charge/bill.
              const amountUnits = parseInt(tx.amount ?? 0, 10);
              const isCredit = amountUnits >= 0;
              return (
                <TableRow key={tx.uuid || index}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="caption">{formatDate(tx.created_at)}</Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="caption">{formatPeriod(tx)}</Typography>
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
                    <Typography variant="caption" color="text.secondary">
                      {formatBreakdown(tx.meta)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {tx.notes || '-'}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Box>
  );
};

/**
 * SubscriptionDialog Component
 * Create/Edit subscription dialog with all fields based on research findings
 */
const SubscriptionDialog = ({
  open,
  onClose,
  onSave,
  subscription,
  loading,
  plans,
  plansLoading,
  statuses,
  environments,
  onRefreshPlans,
  canWrite = true
}) => {
  const { selectedEnvironments } = useCustomerEnvironment();
  const selectedEnvironment = selectedEnvironments?.[0] || null;
  
  const [formData, setFormData] = useState({
    name: '',
    enabled: true,
    type: 'postpaid',
    begins_at: new Date().toISOString().split('T')[0],
    ends_at: '',
    status: 'active',
    environment_uuid: '',
    plan_uuid: '',
    tariff_uuid: '',
    meta: {},
    notes: ''
  });

  const [errors, setErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (subscription) {
      // Edit mode - populate form with existing data
      // Handle nested objects from API: subscription.environment.uuid, subscription.plan.uuid,
      // subscription.tariff.uuid
      setFormData({
        name: subscription.name || '',
        enabled: subscription.enabled !== undefined ? subscription.enabled : true,
        type: subscription.type || 'postpaid',
        begins_at: subscription.begins_at ? subscription.begins_at.split('T')[0] : new Date().toISOString().split('T')[0],
        ends_at: subscription.ends_at ? subscription.ends_at.split('T')[0] : '',
        status: subscription.status || 'active',
        // Handle nested environment object from API
        environment_uuid: subscription.environment?.uuid || subscription.environment_uuid || selectedEnvironment?.uuid || '',
        // Handle nested plan object from API
        plan_uuid: subscription.plan?.uuid || subscription.plan_uuid || '',
        // Handle nested tariff object from API
        tariff_uuid: subscription.tariff?.uuid || subscription.tariff_uuid || '',
        meta: subscription.meta || {},
        notes: subscription.notes || ''
      });
    } else {
      // Create mode - reset form
      setFormData({
        name: '',
        enabled: true,
        type: 'postpaid',
        begins_at: new Date().toISOString().split('T')[0],
        ends_at: '',
        status: 'active',
        environment_uuid: selectedEnvironment?.uuid || '',
        plan_uuid: '',
        tariff_uuid: '',
        meta: {},
        notes: ''
      });
    }
    setErrors({});
    setSubmitAttempted(false);
    setApiError('');
  }, [subscription, open, selectedEnvironment]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.environment_uuid) {
      newErrors.environment_uuid = 'Application is required';
    }

    if (!formData.plan_uuid) {
      newErrors.plan_uuid = 'Plan is required';
    }

    if (formData.ends_at && formData.begins_at && formData.ends_at < formData.begins_at) {
      newErrors.ends_at = 'End date cannot be before the begin date';
    }
    if (!formData.begins_at) {
      newErrors.begins_at = 'Begin date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    setApiError('');

    if (!validateForm()) {
      return;
    }

    try {
      // The API's subscription surface is PLAN-only — the tariff is inherited
      // from the plan server-side and never sent from here.
      const { tariff_uuid: _ignored, ...planOnly } = formData;
      await onSave(planOnly);
    } catch (error) {
      console.error('Save error:', error);
      // Parse 406 validation errors from server
      if (is406Error(error)) {
        const serverErrors = parseServerErrors(error);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(prev => ({ ...prev, ...serverErrors }));
        }
      }
      setApiError(error?.response?.data?.message || error?.message || 'Failed to save subscription');
    }
  };

  const isFormValid = formData.name.trim() && formData.environment_uuid && formData.plan_uuid;

  if (plansLoading) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {subscription ? 'Edit Subscription' : 'Create New Subscription'}
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Loading data...</Typography>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {subscription ? 'Edit Subscription' : 'Create New Subscription'}
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pb: 1 }}>
        {apiError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {apiError}
          </Alert>
        )}
        <Box component="form" autoComplete="off" noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
          {/* UUID Field - Read Only with copy (only shown in edit mode) */}
          {subscription?.uuid && (
            <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 70, fontWeight: 600 }}>UUID</Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{subscription.uuid}</Typography>
                <Tooltip title="Copy UUID">
                  <IconButton size="small" onClick={() => navigator.clipboard?.writeText(subscription.uuid)} sx={{ p: 0.25 }}>
                    <ContentCopyIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          )}

          {/* Enabled Toggle - right after UUID */}
          <FormControlLabel
            control={
              <Switch
                checked={formData.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
              />
            }
            label="Enabled"
          />

          {/* Basic Information - Vertical Layout */}
          <Box>
            <Typography variant="h6" gutterBottom>
              Basic Information
            </Typography>
            <Grid container spacing={2} direction="column">
              <Grid size={12}>
                <TextField
                  label="Name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                  fullWidth
                  error={!!errors.name || (submitAttempted && !formData.name?.trim())}
                  helperText={errors.name || (submitAttempted && !formData.name?.trim() ? 'Name is required' : '')}
                  placeholder="Enter subscription name"
                  autoComplete="off"
                />
              </Grid>
              <Grid size={12}>
                <FormControl fullWidth required error={!!errors.environment_uuid || (submitAttempted && !formData.environment_uuid)}>
                  <InputLabel required>Application</InputLabel>
                  <Select
                    value={formData.environment_uuid}
                    label="Application"
                    onChange={(e) => handleChange('environment_uuid', e.target.value)}
                  >
                    {environments?.map(env => (
                      <MenuItem key={env.uuid} value={env.uuid}>
                        {env.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {(errors.environment_uuid || (submitAttempted && !formData.environment_uuid)) && (
                    <Typography variant="caption" color="error">
                      {errors.environment_uuid || 'Application is required'}
                    </Typography>
                  )}
                </FormControl>
              </Grid>
              <Grid size={12}>
                <PlanSelect
                  value={formData.plan_uuid}
                  onChange={(value) => handleChange('plan_uuid', value)}
                  plans={plans}
                  loading={plansLoading}
                  disabled={loading}
                  error={!!errors.plan_uuid}
                  helperText={errors.plan_uuid || 'Billing plan for this subscription'}
                  label="Plan"
                  required
                  onPlanCreated={onRefreshPlans}
                  onPlanUpdated={onRefreshPlans}
                />
              </Grid>
              <Grid size={12}>
                <FormControl fullWidth required>
                  <InputLabel required>Type</InputLabel>
                  <Select
                    value={formData.type}
                    label="Type"
                    onChange={(e) => handleChange('type', e.target.value)}
                  >
                    <MenuItem value="prepaid">Prepaid</MenuItem>
                    <MenuItem value="postpaid">Postpaid</MenuItem>
                  </Select>
                  <FormHelperText>
                    {formData.type === 'prepaid'
                      ? 'Prepaid — balance is remaining credit; top up with "Add balance".'
                      : 'Postpaid — balance accumulates current-period usage and is invoiced at period close.'}
                  </FormHelperText>
                </FormControl>
              </Grid>
              <Grid size={12}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={formData.status}
                    label="Status"
                    onChange={(e) => handleChange('status', e.target.value)}
                  >
                    {statuses?.map(status => (
                      <MenuItem key={status.value || status} value={status.value || status}>
                        {status.label || status}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>Subscription lifecycle status</FormHelperText>
                </FormControl>
              </Grid>
            </Grid>
          </Box>

          {/* Dates - Vertical Layout */}
          <Box>
            <Typography variant="h6" gutterBottom>
              Subscription Period
            </Typography>
            <Grid container spacing={2} direction="column">
              <Grid size={12}>
                <TextField
                  label="Begin Date"
                  type="date"
                  value={formData.begins_at}
                  onChange={(e) => handleChange('begins_at', e.target.value)}
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  error={!!errors.begins_at || (submitAttempted && !formData.begins_at)}
                  helperText={errors.begins_at || (submitAttempted && !formData.begins_at ? 'Begin date is required' : '')}
                />
              </Grid>
              <Grid size={12}>
                <TextField
                  label="End Date"
                  type="date"
                  value={formData.ends_at}
                  onChange={(e) => handleChange('ends_at', e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  error={!!errors.ends_at}
                  helperText={errors.ends_at
                    || "Leave empty and the backend computes it from Begin Date + the plan's period. Set it to end the subscription on a specific date."}
                />
              </Grid>
            </Grid>
          </Box>

          <Divider />

          {/* Billing — balance; the tariff is the plan's */}
          <BillingEditor
            balance={subscription?.balance}
            type={formData.type}
            isEdit={!!subscription}
          />

          {/* Period invoices — GET /api/subscriptions/:id/transactions (edit mode only) */}
          {subscription?.uuid && (
            <>
              <Divider />
              <TransactionsViewer subscriptionUuid={subscription.uuid} />
            </>
          )}

          <Divider />

          {/* Meta Editor */}
          <MetaEditor
            meta={formData.meta}
            onChange={(meta) => handleChange('meta', meta)}
            disabled={loading}
          />

          <Divider />

          {/* Notes */}
          <TextField
            label="Notes"
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Additional notes about the subscription"
          />

        </Box>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canWrite || !isFormValid || loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {subscription ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SubscriptionDialog;