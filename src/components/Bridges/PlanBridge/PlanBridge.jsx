import React, { useRef, useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Autocomplete
} from '@mui/material';
import { tariffsApi } from '../../../services/api/tariffsApi';
import {
  EventNote as PlanIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Upload as UploadIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import Papa from 'papaparse';
import { usePlanBridge } from './PlanBridge.js';
import { Z } from '../../../utils/zIndex.js';

/**
 * PlanBridge Component
 * Dialog for creating/editing plans with items management
 * Similar pattern to TariffBridge
 */
export const PlanBridge = ({
  open,
  onClose,
  onSave,
  plan = null,
  mode = 'create'
}) => {
  const {
    formData,
    formErrors,
    handleChange,
    PERIODS,
    items,
    setItems,
    itemsLoading,
    editingItem,
    setEditingItem,
    handleDeleteItem,
    handleImportItems,
    handleClearItems,
    createPlan,
    updatePlan,
    loading,
    error,
    setError
  } = usePlanBridge(open, plan, mode);

  // CSV import
  const fileInputRef = useRef(null);
  const [importCount, setImportCount] = useState(0);

  // Tariffs for the Value picker — a plan item's `val` is a tariff uuid.
  const [tariffs, setTariffs] = useState([]);
  useEffect(() => {
    if (!open) return;
    tariffsApi.getTariffs({ per_page: 9999 })
      .then((res) => setTariffs(Array.isArray(res) ? res : (res?.data || [])))
      .catch(() => setTariffs([]));
  }, [open]);

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const count = handleImportItems(results.data);
        if (count) {
          setImportCount(count);
          setTimeout(() => setImportCount(0), 3000);
        }
      },
      error: (err) => {
        setError(`CSV parse error: ${err.message}`);
      }
    });

    // Reset file input
    event.target.value = '';
  };

  // Handle submit
  const handleSubmit = async () => {
    let result;
    if (mode === 'edit' && plan) {
      result = await updatePlan(plan.uuid || plan.id);
    } else {
      result = await createPlan();
    }

    if (result) {
      onSave(result);
      onClose();
    }
  };

  // Check if form is valid
  const isFormValid = formData.name && formData.period && formData.interval >= 1;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{ zIndex: Z.L3.DIALOG }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PlanIcon />
            <Typography variant="h6">
              {mode === 'edit' ? 'Edit Plan' : 'Create Plan'}
            </Typography>
          </Box>
          <Button onClick={onClose} size="small" sx={{ minWidth: 'auto' }}>
            <CloseIcon />
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* Plan Fields — Name, then billing cadence (Period + Interval), Notes, Enabled */}
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField
                label="Name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                fullWidth
                size="small"
                error={!!formErrors.name}
                helperText={formErrors.name}
                placeholder="Enter plan name"
                disabled={loading}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl
                fullWidth
                size="small"
                required
                error={!!formErrors.period}
                disabled={loading}
              >
                <InputLabel>Period</InputLabel>
                <Select
                  value={formData.period}
                  label="Period"
                  onChange={(e) => handleChange('period', e.target.value)}
                  MenuProps={{ style: { zIndex: Z.L3.MENU }, PaperProps: { sx: { zIndex: Z.L3.MENU } } }}
                >
                  {PERIODS.map(period => (
                    <MenuItem key={period} value={period}>
                      {period.charAt(0).toUpperCase() + period.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Interval"
                type="number"
                value={formData.interval}
                onChange={(e) => handleChange('interval', parseInt(e.target.value) || 1)}
                required
                fullWidth
                size="small"
                error={!!formErrors.interval}
                helperText={formErrors.interval || 'e.g., 1 = every period'}
                placeholder="1"
                disabled={loading}
                inputProps={{ min: 1 }}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Notes"
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={2}
                placeholder="Optional notes"
                disabled={loading}
              />
            </Grid>
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
          </Grid>

          {/* Items Section */}
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                Plan Items {items.length > 0 && `(${items.length})`}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <Tooltip title="Import items from CSV (columns: name, val)">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<UploadIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  >
                    Import CSV
                  </Button>
                </Tooltip>
                {items.length > 0 && (
                  <Tooltip title="Clear all items">
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<ClearIcon />}
                      onClick={handleClearItems}
                      disabled={loading}
                    >
                      Clear
                    </Button>
                  </Tooltip>
                )}
              </Box>
            </Box>
            {importCount > 0 && (
              <Alert severity="success" sx={{ mb: 1 }}>
                Successfully imported {importCount} items from CSV
              </Alert>
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Value</TableCell>
                    <TableCell width={100}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {/* Add a tariff — pick one and it's added immediately. */}
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell colSpan={3}>
                      <Autocomplete
                        size="small"
                        options={tariffs.filter((t) => !items.some((i) => i.val === t.uuid))}
                        getOptionLabel={(o) => o?.name || ''}
                        isOptionEqualToValue={(o, v) => o?.uuid === v?.uuid}
                        value={null}
                        blurOnSelect
                        disabled={loading}
                        slotProps={{ popper: { style: { zIndex: Z.L3.MENU } } }}
                        onChange={(e, t) => {
                          if (!t) return;
                          setItems((prev) => [
                            ...prev,
                            { id: `temp_${Date.now()}`, name: t.name, val: t.uuid }
                          ]);
                        }}
                        renderInput={(params) => (
                          <TextField {...params} placeholder="+ Add tariff" />
                        )}
                      />
                    </TableCell>
                  </TableRow>

                  {/* Loading state */}
                  {itemsLoading && (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Items list */}
                  {!itemsLoading && items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                        No items added yet. Add items using the form above.
                      </TableCell>
                    </TableRow>
                  )}

                  {!itemsLoading && items.map(item => {
                    const itemId = item.uuid || item.id;
                    const isEditing = editingItem === itemId;

                    return (
                      <TableRow key={itemId}>
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={item.name}
                              onChange={() => {}}
                              fullWidth
                            />
                          ) : (
                            item.name
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={item.val}
                              onChange={() => {}}
                              fullWidth
                            />
                          ) : (
                            item.tariff?.name || item.val || '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => setEditingItem(null)}
                            >
                              <CheckIcon />
                            </IconButton>
                          ) : (
                            <>
                              <IconButton
                                size="small"
                                onClick={() => setEditingItem(itemId)}
                                disabled={loading}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteItem(itemId)}
                                disabled={loading}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isFormValid || loading}
          startIcon={loading ? <CircularProgress size={20} /> : <PlanIcon />}
        >
          {loading
            ? `${mode === 'edit' ? 'Updating' : 'Creating'}...`
            : mode === 'edit' ? 'Update Plan' : 'Create Plan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PlanBridge;
