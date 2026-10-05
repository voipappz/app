import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  IconButton,
  CircularProgress,
  Grid,
  Alert,
  FormControlLabel,
  Switch,
  MenuItem,
  Box,
  Typography,
  Chip,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { Close as CloseIcon, ContentCopy as ContentCopyIcon, ExpandMore as ExpandMoreIcon, Add as AddIcon } from '@mui/icons-material';
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import DynamicProfileEditor from '../../common/DynamicProfileEditor/DynamicProfileEditor';
import SchemaBuilder from '../../Appz/SchemaBuilder/SchemaBuilder';
import { nodesApi } from '../../../services/api/nodesApi';
import { customersApi } from '../../../services/api/customersApi';
import { formatDate } from '../../../utils/dateUtils';
import { usePermissions } from '../../../hooks/usePermissions';
import ToolDialog from '../../TopBar/ToolDialog.jsx';

// The Nodes screen (list, health, create / edit / delete, va.yaml import),
// opened from the Node field: the customer is where a node is chosen, so it is
// where nodes are managed. Writes stay root-only, as the API enforces.
const MonitoringNodes = lazy(() => import('../../Monitoring/MonitoringNodes.jsx'));

const CustomerEditDialog = ({
  open,
  onClose,
  onSave,
  customerData,
  loading
}) => {
  const isCreate = !customerData;

  const [formData, setFormData] = useState({
    name: '',
    enabled: true,
    notes: '',
    node_uuid: '',
    profile: {},
    uuid: '',
    created_at: '',
    updated_at: '',
  });

  // Meta edited as an array of {key, value} rows
  const [metaRows, setMetaRows] = useState([]);

  const [nodes, setNodes] = useState([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const { canAccess } = usePermissions();
  const [nodesManagerOpen, setNodesManagerOpen] = useState(false);

  const loadNodes = useCallback((isCancelled = () => false) => {
    setNodesLoading(true);
    return nodesApi.getNodes()
      .then(response => {
        if (!isCancelled()) {
          const list = Array.isArray(response) ? response : (response?.data || response?.items || []);
          setNodes(list);
        }
      })
      .catch(() => { if (!isCancelled()) setNodes([]); })
      .finally(() => { if (!isCancelled()) setNodesLoading(false); });
  }, []);

  // Fetch nodes when dialog opens
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    loadNodes(() => cancelled);
    return () => { cancelled = true; };
  }, [open, loadNodes]);

  // Whatever was added, renamed or deleted in the manager shows in the select.
  const closeNodesManager = () => { setNodesManagerOpen(false); loadNodes(); };

  // Both call sites hand us a row out of the customers list, which is a
  // projection — it can arrive with no profile, meta or node_uuid, and the
  // profile editor then renders every field blank as if the customer had none.
  // Open on the row we already have (instant), then replace it with the
  // authoritative record from GET /api/customers/:uuid. On failure we keep the
  // row, so a flaky request degrades to today's behaviour instead of an error.
  const [fullCustomer, setFullCustomer] = useState(null);

  useEffect(() => {
    if (!open || !customerData?.uuid) {
      setFullCustomer(null);
      return undefined;
    }
    let cancelled = false;
    customersApi.getCustomerByUuid(customerData.uuid)
      .then((full) => { if (!cancelled && full && full.uuid) setFullCustomer(full); })
      .catch(() => { /* keep the list row */ });
    return () => { cancelled = true; };
  }, [open, customerData?.uuid]);

  // Declared before the sync effect below, which reads it — a `const` read
  // above its declaration is a temporal-dead-zone crash, not a lint nit.
  const source = fullCustomer || customerData;

  // Sync form when the customer record changes
  useEffect(() => {
    if (source) {
      setFormData({
        name: source.name || '',
        enabled: source.enabled !== undefined ? source.enabled : true,
        notes: source.notes || '',
        node_uuid: source.node_uuid || '',
        profile: source.profile || {},
        uuid: source.uuid || '',
        created_at: source.created_at || '',
        updated_at: source.updated_at || '',
      });
      // Convert meta object → editable rows
      const meta = source.meta;
      if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
        setMetaRows(Object.entries(meta).map(([key, value]) => ({ key, value: String(value ?? '') })));
      } else {
        setMetaRows([]);
      }
    } else {
      setFormData({ name: '', enabled: true, notes: '', node_uuid: '', profile: {}, uuid: '', created_at: '', updated_at: '' });
      setMetaRows([]);
    }
    setErrors({});
    setApiError('');
    setSuccessMessage('');
  }, [source, open]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name?.trim()) newErrors.name = 'Customer name is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setApiError('');
    setSuccessMessage('');
    try {
      // Build meta object from rows (skip blank keys)
      const meta = {};
      metaRows.forEach(({ key, value }) => { if (key.trim()) meta[key.trim()] = value; });
      await onSave({ ...formData, meta });
      setSuccessMessage(isCreate ? 'Customer created successfully' : 'Customer updated successfully');
      setTimeout(() => onClose(), 1500);
    } catch (error) {
      setApiError(error.message || 'Failed to save customer');
    }
  };

  const handleClose = () => { if (!loading) onClose(); };

  return (
    <>
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      data-testid="customer-edit-dialog"
    >
      <DialogTitle sx={{ pr: 6 }}>
        {isCreate ? 'Create Customer' : 'Edit Customer'}
        <IconButton
          aria-label="close"
          onClick={handleClose}
          disabled={loading}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
        {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}

        <Grid container spacing={2} direction="column">

          {/* Read-only identity — UUID (with copy) always on top */}
          {!isCreate && formData.uuid && (
            <Grid size={12}>
              <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 70, fontWeight: 600 }}>UUID</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{formData.uuid}</Typography>
                  <Tooltip title="Copy UUID">
                    <IconButton size="small" onClick={() => navigator.clipboard?.writeText(formData.uuid)} sx={{ p: 0.25 }}>
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                {formData.created_at && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 70, fontWeight: 600 }}>Created</Typography>
                    <Typography variant="caption">{formatDate(formData.created_at)}</Typography>
                  </Box>
                )}
                {formData.updated_at && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 70, fontWeight: 600 }}>Updated</Typography>
                    <Typography variant="caption">{formatDate(formData.updated_at)}</Typography>
                  </Box>
                )}
              </Box>
            </Grid>
          )}

          {/* Enabled toggle */}
          <Grid size={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => handleChange('enabled', e.target.checked)}
                  disabled={loading}
                />
              }
              label="Enabled"
            />
          </Grid>

          {/* Name */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Customer Name"
              variant="outlined"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              error={!!errors.name}
              helperText={errors.name || ''}
              disabled={loading}
              required
              data-testid="customer-name-input"
            />
          </Grid>

          {/* Node selector */}
          <Grid size={12} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <TextField
              select
              fullWidth
              label="Node"
              variant="outlined"
              value={formData.node_uuid}
              onChange={(e) => handleChange('node_uuid', e.target.value)}
              disabled={loading || nodesLoading}
              helperText={nodesLoading ? 'Loading nodes...' : ''}
              data-testid="customer-node-select"
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {/* Every named node. GET /api/nodes sends no `type` (the API
                  dropped it), so the old filter on type listed nothing and the
                  saved node_uuid showed blank. No role filter for now. */}
              {nodes.filter(n => n.name).map((node) => (
                <MenuItem key={node.uuid} value={node.uuid}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{node.name}</Typography>
                    {node.type && <Chip label={node.type} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.68rem' }} />}
                  </Box>
                </MenuItem>
              ))}
            </TextField>
            {canAccess('nodes') && (
              <Button
                variant="outlined"
                onClick={() => setNodesManagerOpen(true)}
                sx={{ height: 56, flexShrink: 0, textTransform: 'none' }}
                data-testid="customer-manage-nodes"
              >
                Manage nodes
              </Button>
            )}
          </Grid>

          {/* Profile Editor — the customer's OWN keys only (23 fields).
              The API also returns namespaced defaults for all seven
              CUSTOMER_CHILD_TYPES (environment.*, campaign.*, ...) — 108 more —
              which buried the settings that actually apply here, the Security /
              login_otp_enabled toggle among them. Nothing reads those back at
              runtime, and a partial save merges rather than replaces, so
              hiding them changes no behaviour and loses no stored value. */}
          <Grid size={12}>
            <DynamicProfileEditor
              type="customer"
              profile={formData.profile}
              onChange={(profile) => handleChange('profile', profile)}
              disabled={loading}
              title="Profile Properties"
              grouped
              ownTypeOnly
            />
          </Grid>

          {/* Notes — always at the bottom of the form */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Notes"
              variant="outlined"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              disabled={loading}
              multiline
              rows={3}
              placeholder="Add notes about this customer..."
            />
          </Grid>

          {/* Create a new environment for this customer using the shared schema
              builder — the same wizard the Schema screen uses. Edit mode only. */}
          {!isCreate && (
            <Grid size={12}>
              <Accordion disableGutters elevation={0} sx={{ border: '1px solid var(--border-light, #e5e7eb)', borderRadius: 1, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AddIcon fontSize="small" />
                    <Typography sx={{ fontWeight: 600 }}>Create new application</Typography>
                    <Chip size="small" label="schema" variant="outlined" />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  <SchemaBuilder type="environment" />
                </AccordionDetails>
              </Accordion>
            </Grid>
          )}

        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading} variant="outlined">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={loading}
          data-testid="submit-customer-button"
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {isCreate ? 'Create Customer' : 'Update Customer'}
        </Button>
      </DialogActions>
    </Dialog>

    <ToolDialog title="Nodes" open={nodesManagerOpen} onClose={closeNodesManager}>
      <Suspense fallback={<CircularProgress sx={{ m: 'auto' }} />}>
        <Box sx={{ flex: 1, minHeight: 0, height: '100%', overflow: 'auto', p: 2 }}>
          <MonitoringNodes />
        </Box>
      </Suspense>
    </ToolDialog>
    </>
  );
};

export default CustomerEditDialog;
