import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  Tooltip
} from '@mui/material';
import {
  AttachMoney as TariffIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Upload as UploadIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import Papa from 'papaparse';
import { useTariffBridge } from './TariffBridge.js';
import { Z } from '../../../utils/zIndex.js';
import Bdi from '../../../i18n/Bdi.jsx';
import { formatNumber } from '../../../utils/numberUtils.js';

/**
 * TariffBridge Component
 * Dialog for creating/editing tariffs with rates management
 * Similar pattern to QueueBridge/AnnouncementBridge
 */
export const TariffBridge = ({
  open,
  onClose,
  onSave,
  tariff = null,
  mode = 'create',
  zIndex = Z.L3.DIALOG
}) => {
  const { t } = useTranslation('bridges');
  const {
    formData,
    formErrors,
    handleChange,
    schemes,
    schemesLoading,
    rates,
    ratesLoading,
    newRate,
    setNewRate,
    editingRate,
    setEditingRate,
    handleAddRate,
    handleDeleteRate,
    handleImportRates,
    handleClearRates,
    createTariff,
    updateTariff,
    loading,
    error,
    setError
  } = useTariffBridge(open, tariff, mode);

  // CSV import
  const fileInputRef = useRef(null);
  const [importCount, setImportCount] = useState(0);

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const count = handleImportRates(results.data);
        if (count) {
          setImportCount(count);
          setTimeout(() => setImportCount(0), 3000);
        }
      },
      error: (err) => {
        setError(t('tariff.errors.csvParse', { message: err.message }));
      }
    });

    // Reset file input
    event.target.value = '';
  };

  // Handle submit
  const handleSubmit = async () => {
    let result;
    if (mode === 'edit' && tariff) {
      result = await updateTariff(tariff.uuid || tariff.id);
    } else {
      result = await createTariff();
    }

    if (result) {
      onSave(result);
      onClose();
    }
  };

  // Check if form is valid
  const isFormValid = formData.name && formData.scheme;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      // ?? not ||, and not a default param: TariffSelect passes dialogZIndex
      // through as null when a caller omits it, and a default parameter only
      // fires on undefined — so `zIndex = Z.L3.DIALOG` alone left the dialog
      // with no z-index at all.
      sx={{ zIndex: zIndex ?? Z.L3.DIALOG }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TariffIcon />
            <Typography variant="h6">
              {mode === 'edit' ? t('tariff.titleEdit') : t('tariff.titleCreate')}
            </Typography>
          </Box>
          <Button onClick={onClose} size="small" sx={{ minWidth: 'auto' }}>
            <CloseIcon />
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* Tariff Fields */}
          {/* MUI v7 Grid sizes with `size`; the old `item xs md` props are
              ignored, which packed all four fields into one cramped row. */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField
                label={t('tariff.name')}
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                fullWidth
                size="small"
                error={!!formErrors.name}
                helperText={formErrors.name}
                placeholder={t('tariff.namePlaceholder')}
                disabled={loading}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl
                fullWidth
                size="small"
                required
                error={!!formErrors.scheme}
                disabled={loading || schemesLoading}
              >
                <InputLabel>{t('tariff.scheme')}</InputLabel>
                <Select
                  value={formData.scheme}
                  label={t('tariff.scheme')}
                  onChange={(e) => handleChange('scheme', e.target.value)}
                  MenuProps={{ style: { zIndex: Z.L3.MENU }, PaperProps: { sx: { zIndex: Z.L3.MENU } } }}
                >
                  {schemesLoading ? (
                    <MenuItem disabled>{t('tariff.loading')}</MenuItem>
                  ) : schemes.length === 0 ? (
                    <MenuItem disabled>{t('tariff.noSchemes')}</MenuItem>
                  ) : (
                    schemes.map(scheme => {
                      // Handle both string and object formats from API
                      const schemeValue = typeof scheme === 'string' ? scheme : (scheme?.scheme || scheme?.value || scheme?.name || String(scheme));
                      const schemeLabel = schemeValue.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                      return (
                        <MenuItem key={schemeValue} value={schemeValue}>
                          {schemeLabel}
                        </MenuItem>
                      );
                    })
                  )}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={12}>
              <TextField
                label={t('tariff.notes')}
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={2}
                placeholder={t('tariff.notesPlaceholder')}
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
                label={t('tariff.enabled')}
              />
            </Grid>
          </Grid>

          {/* Rates Section */}
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {t('tariff.ratesTitle')} {rates.length > 0 && `(${formatNumber(rates.length)})`}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <Tooltip title={t('tariff.importHint')}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<UploadIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  >
                    {t('tariff.importCsv')}
                  </Button>
                </Tooltip>
                {rates.length > 0 && (
                  <Tooltip title={t('tariff.clearHint')}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<ClearIcon />}
                      onClick={handleClearRates}
                      disabled={loading}
                    >
                      {t('tariff.clear')}
                    </Button>
                  </Tooltip>
                )}
              </Box>
            </Box>
            {importCount > 0 && (
              <Alert severity="success" sx={{ mb: 1 }}>
                {t('tariff.imported', { count: formatNumber(importCount) })}
              </Alert>
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('tariff.columns.name')}</TableCell>
                    <TableCell>{t('tariff.columns.price')}</TableCell>
                    <TableCell>{t('tariff.columns.value')}</TableCell>
                    <TableCell width={100}>{t('tariff.columns.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {/* Add New Rate Row */}
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder={t('tariff.rateNamePlaceholder')}
                        value={newRate.name}
                        onChange={(e) => setNewRate(prev => ({ ...prev, name: e.target.value }))}
                        fullWidth
                        disabled={loading}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="0.00"
                        type="number"
                        value={newRate.price}
                        onChange={(e) => setNewRate(prev => ({ ...prev, price: e.target.value }))}
                        fullWidth
                        disabled={loading}
                        inputProps={{ step: '0.01' }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder={t('tariff.valuePlaceholder')}
                        value={newRate.val}
                        onChange={(e) => setNewRate(prev => ({ ...prev, val: e.target.value }))}
                        fullWidth
                        disabled={loading}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleAddRate()}
                        disabled={loading || !newRate.name?.trim()}
                      >
                        <AddIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>

                  {/* Loading state */}
                  {ratesLoading && (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Rates list */}
                  {!ratesLoading && rates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                        {t('tariff.noRates')}
                      </TableCell>
                    </TableRow>
                  )}

                  {!ratesLoading && rates.map(rate => {
                    const rateId = rate.uuid || rate.id;
                    const isEditing = editingRate === rateId;

                    return (
                      <TableRow key={rateId}>
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={rate.name}
                              onChange={() => {
                                // Rate editing is handled by setEditingRate
                              }}
                              fullWidth
                            />
                          ) : (
                            rate.name
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              type="number"
                              value={rate.price}
                              onChange={() => {
                                // Rate editing is handled by setEditingRate
                              }}
                              fullWidth
                              inputProps={{ step: '0.01' }}
                            />
                          ) : (
                            <Bdi>{rate.price}</Bdi>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <TextField
                              size="small"
                              value={rate.val}
                              onChange={() => {
                                // Rate editing is handled by setEditingRate
                              }}
                              fullWidth
                            />
                          ) : (
                            rate.val ? <Bdi>{rate.val}</Bdi> : '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => setEditingRate(null)}
                            >
                              <CheckIcon />
                            </IconButton>
                          ) : (
                            <>
                              <IconButton
                                size="small"
                                onClick={() => setEditingRate(rateId)}
                                disabled={loading}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteRate(rateId)}
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
          {t('tariff.cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isFormValid || loading}
          startIcon={loading ? <CircularProgress size={20} /> : <TariffIcon />}
        >
          {loading
            ? (mode === 'edit' ? t('tariff.updating') : t('tariff.creating'))
            : mode === 'edit' ? t('tariff.update') : t('tariff.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TariffBridge;
