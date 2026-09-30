import { alpha } from '@mui/material/styles';
import { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Chip,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  IconButton,
  useMediaQuery
} from '@mui/material';
import {
  Upload as UploadIcon,
  CloudUpload as CloudUploadIcon,
  Visibility as VisibilityIcon,
  Edit as EditIcon,
  Download as DownloadIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import Papa from 'papaparse';

/**
 * ImportCSVDialog - Reusable CSV import dialog component
 *
 * @param {Object} props
 * @param {boolean} props.open - Dialog open state
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.onImport - Import handler (receives: file, environmentUuid) => Promise
 * @param {string} props.title - Dialog title
 * @param {string} props.entityName - Entity name for messages (e.g., "Routes", "Extensions")
 * @param {Array} props.environments - Optional list of environments for selection
 * @param {string} props.selectedEnvironment - Pre-selected environment UUID
 * @param {boolean} props.requireEnvironment - Whether environment selection is required
 * @param {Function} props.onSuccess - Optional callback after successful import
 * @param {string} props.formatHint - Optional hint showing expected CSV format
 * @param {boolean} props.showTemplateOption - Whether to show the "Use Template" button
 * @param {Array} props.templateHeaders - Array of column headers for the template
 * @param {Array} props.templateData - Array of objects representing template rows
 */
const ImportCSVDialog = ({
  open,
  onClose,
  onImport,
  title = 'Import from CSV',
  entityName = 'records',
  environments = [],
  selectedEnvironment = '',
  requireEnvironment = true,
  onSuccess,
  formatHint = '',
  showTemplateOption = false,
  templateHeaders = [],
  templateData = [],
  // Optional per-row rules: validateRow(row) -> { column: message } marks bad
  // cells and holds Import until they are fixed; prepareRow(row) -> row fills
  // defaults (e.g. a generated password) on every row loaded or added.
  validateRow = null,
  prepareRow = (row) => row,
}) => {
  const isNarrow = useMediaQuery((t) => t.breakpoints.down('sm'));
  const [importFile, setImportFile] = useState(null);
  const [environmentUuid, setEnvironmentUuid] = useState(selectedEnvironment);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [csvPreviewData, setCsvPreviewData] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const fileInputRef = useRef(null);

  const handleClose = () => {
    setImportFile(null);
    setEnvironmentUuid(selectedEnvironment);
    setError(null);
    setSuccess(null);
    setCsvPreviewData(null);
    setCsvHeaders([]);
    setShowPreview(false);
    setEditingCell(null);
    onClose();
  };

  const parseCSVFile = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`);
          setCsvPreviewData(null);
          setCsvHeaders([]);
          setShowPreview(false);
          return;
        }

        const headers = results.meta.fields || [];
        setCsvHeaders(headers);
        setCsvPreviewData(results.data.map(prepareRow));
        setShowPreview(true);
        setError(null);
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
        setCsvPreviewData(null);
        setCsvHeaders([]);
        setShowPreview(false);
      }
    });
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
        setError('Only CSV files are allowed');
        setImportFile(null);
        setCsvPreviewData(null);
        setCsvHeaders([]);
        setShowPreview(false);
        return;
      }
      setImportFile(file);
      setError(null);
      parseCSVFile(file);
    }
  };

  const handleFileDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
        setError('Only CSV files are allowed');
        setImportFile(null);
        setCsvPreviewData(null);
        setCsvHeaders([]);
        setShowPreview(false);
        return;
      }
      setImportFile(file);
      setError(null);
      parseCSVFile(file);
    }
  };

  const handleCellEdit = (rowIndex, columnName, newValue) => {
    const updatedData = [...csvPreviewData];
    updatedData[rowIndex] = {
      ...updatedData[rowIndex],
      [columnName]: newValue
    };
    setCsvPreviewData(updatedData);
  };

  // Row add/delete. Without these the editor could only retype cells that
  // already existed, so a 2-row template couldn't become a real import and a
  // bad row couldn't be dropped without going back to a spreadsheet.
  const handleAddRow = () => {
    const blank = prepareRow(Object.fromEntries(csvHeaders.map((h) => [h, ''])));
    setCsvPreviewData([...(csvPreviewData || []), blank]);
    setEditingCell({ row: (csvPreviewData || []).length, column: csvHeaders[0] });
  };

  const handleDeleteRow = (rowIndex) => {
    setCsvPreviewData((csvPreviewData || []).filter((_, i) => i !== rowIndex));
    setEditingCell(null);
  };

  const handleCellClick = (rowIndex, columnName) => {
    setEditingCell({ row: rowIndex, column: columnName });
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const rowErrors = (csvPreviewData || []).map((row) => (validateRow ? validateRow(row) : {}));
  const badRows = rowErrors.filter((errors) => Object.keys(errors).length > 0).length;

  const handleImportSubmit = async () => {
    if (requireEnvironment && !environmentUuid) {
      setError('Choose an application');
      return;
    }
    if (badRows) {
      setError(`Fix the ${badRows === 1 ? 'row' : `${badRows} rows`} marked in red first`);
      return;
    }
    if (!importFile && !csvPreviewData) {
      setError('Please select a CSV file');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let fileToUpload = importFile;

      // If user edited the CSV data, convert it back to a CSV file
      if (csvPreviewData && showPreview) {
        const csvString = Papa.unparse(csvPreviewData, {
          header: true,
          columns: csvHeaders
        });
        const blob = new Blob([csvString], { type: 'text/csv' });
        fileToUpload = new File([blob], importFile.name, { type: 'text/csv' });
      }

      const result = await onImport(fileToUpload, environmentUuid);

      // An importer that reports per row ({ added, existing, failed }) is taken
      // at its word: rows that failed keep the dialog open with their reasons.
      const failed = Array.isArray(result?.failed) ? result.failed : [];
      if (result?.added?.length || !failed.length) onSuccess?.(result);
      if (failed.length) {
        setError(`${result?.message || `${failed.length} failed`}. ${failed.map((f) => `Line ${f.line}${f.username ? ` (${f.username})` : ''}: ${f.error}`).join(' · ')}`);
        return;
      }
      setSuccess(result?.message ? `${entityName}: ${result.message}` : `${entityName} imported`);

      // Close dialog after 2 seconds on success
      setTimeout(() => {
        handleClose();
      }, 2000);

    } catch (err) {
      console.error('CSV import error:', err);
      setError(err.message || `Failed to import ${entityName}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeFile = () => {
    setShowPreview(false);
    setCsvPreviewData(null);
    setCsvHeaders([]);
    setImportFile(null);
    setError(null);
  };

  // Save the template as a real .csv. "Use Template" only seeds the in-dialog
  // editor, which doesn't help when the rows are prepared elsewhere (a
  // spreadsheet export, someone else filling it in) — this gives a file with
  // the exact header row the importer expects, since headers that don't match
  // import zero rows without reporting an error.
  const handleDownloadTemplate = () => {
    if (!templateHeaders.length) return;
    const csvString = Papa.unparse(templateData.length ? templateData : [], {
      header: true,
      columns: templateHeaders,
    });
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entityName.toLowerCase().replace(/\s+/g, '-')}-template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadTemplate = () => {
    if (templateHeaders.length > 0 && templateData.length > 0) {
      setCsvHeaders(templateHeaders);
      setCsvPreviewData(templateData.map(prepareRow));
      setShowPreview(true);
      // Create a fake file object for the import submission
      const csvString = Papa.unparse(templateData, {
        header: true,
        columns: templateHeaders
      });
      const blob = new Blob([csvString], { type: 'text/csv' });
      const templateFile = new File([blob], 'template.csv', { type: 'text/csv' });
      setImportFile(templateFile);
      setError(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={showPreview ? "lg" : "sm"}
      fullWidth
      // The preview is an editable grid one column per CSV field — inside a
      // margined dialog on a phone there's no room to read a cell, let alone
      // tap one. Go full screen there and let the grid scroll.
      fullScreen={isNarrow}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        {/* Environment Selection */}
        {requireEnvironment && environments.length > 0 && (
          <FormControl fullWidth sx={{ mb: 3, mt: 1 }}>
            <InputLabel>Application</InputLabel>
            <Select
              value={environmentUuid}
              onChange={(e) => setEnvironmentUuid(e.target.value)}
              label="Application"
              disabled={loading}
            >
              <MenuItem value="">Select Application...</MenuItem>
              {environments.map((env) => (
                <MenuItem key={env.uuid} value={env.uuid}>
                  {env.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* CSV Preview Section */}
        {showPreview && csvPreviewData && csvPreviewData.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                <VisibilityIcon sx={{ fontSize: 18, verticalAlign: 'text-bottom', mr: 0.5 }} />
                CSV Preview
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip
                  label={`${csvPreviewData.length} row${csvPreviewData.length !== 1 ? 's' : ''}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  label={`${csvHeaders.length} column${csvHeaders.length !== 1 ? 's' : ''}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                <EditIcon sx={{ fontSize: 12, verticalAlign: 'text-bottom' }} /> Click any cell to edit
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={handleChangeFile}
              >
                Change File
              </Button>
            </Box>

            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ maxHeight: 300, overflow: 'auto' }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.100', minWidth: 50 }}>#</TableCell>
                    {csvHeaders.map((header, index) => (
                      <TableCell
                        key={index}
                        sx={{ fontWeight: 600, bgcolor: 'grey.100', minWidth: 120 }}
                      >
                        {header}
                      </TableCell>
                    ))}
                    <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.100', width: 48 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {csvPreviewData.map((row, rowIndex) => (
                    <TableRow key={rowIndex} hover>
                      <TableCell sx={{ bgcolor: 'grey.50', fontWeight: 500 }}>
                        {rowIndex + 1}
                      </TableCell>
                      {csvHeaders.map((header, colIndex) => {
                        const isEditing =
                          editingCell?.row === rowIndex &&
                          editingCell?.column === header;
                        const cellError = rowErrors[rowIndex]?.[header];

                        return (
                          <TableCell
                            key={colIndex}
                            onClick={() => handleCellClick(rowIndex, header)}
                            title={cellError || undefined}
                            data-invalid={cellError ? 'true' : undefined}
                            sx={{
                              cursor: 'pointer',
                              bgcolor: cellError ? (t) => alpha(t.palette.error.main, 0.08) : undefined,
                              boxShadow: cellError ? (t) => `inset 0 0 0 1px ${t.palette.error.main}` : undefined,
                              '&:hover': { bgcolor: 'action.hover' }
                            }}
                          >
                            {isEditing ? (
                              <TextField
                                value={row[header] || ''}
                                onChange={(e) => handleCellEdit(rowIndex, header, e.target.value)}
                                onBlur={handleCellBlur}
                                autoFocus
                                size="small"
                                fullWidth
                                variant="standard"
                              />
                            ) : (
                              <Typography variant="body2" color={cellError ? 'error' : undefined}>
                                {row[header] || (cellError ? cellError : '-')}
                              </Typography>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell sx={{ width: 48 }}>
                        <Tooltip title="Remove row">
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteRow(rowIndex)}
                            data-testid={`delete-row-${rowIndex}`}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={handleAddRow}
                disabled={loading || !csvHeaders.length}
                data-testid="add-row"
              >
                Add Row
              </Button>
              <Typography variant="caption" color="text.secondary">
                {(csvPreviewData || []).length} row{(csvPreviewData || []).length === 1 ? '' : 's'} will be imported
              </Typography>
              {badRows > 0 && (
                <Typography variant="caption" color="error" data-testid="bad-rows">
                  · {badRows} {badRows === 1 ? 'row needs' : 'rows need'} fixing
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* Format Hint */}
        {formatHint && !showPreview && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2" component="div">
              <strong>Format:</strong> {formatHint}
            </Typography>
          </Alert>
        )}

        {/* File Drop Zone */}
        {!showPreview && (
          <Box>
            <Box
              sx={{
                border: '2px dashed',
                borderColor: importFile ? 'success.main' : 'grey.400',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: loading ? 'not-allowed' : 'pointer',
                backgroundColor: importFile ? 'success.lighter' : 'grey.50',
                '&:hover': {
                  borderColor: loading ? 'grey.400' : 'primary.main',
                  backgroundColor: loading ? 'grey.50' : 'primary.lighter'
                },
                transition: 'all 0.2s ease'
              }}
              onClick={() => !loading && fileInputRef.current?.click()}
              onDrop={handleFileDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                disabled={loading}
              />
              <CloudUploadIcon sx={{ fontSize: 48, color: importFile ? 'success.main' : 'grey.500', mb: 1 }} />
              <Typography variant="body1" color={importFile ? 'success.main' : 'text.secondary'}>
                {importFile ? importFile.name : 'Drop CSV file here or click to select'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Allowed extensions: .csv
              </Typography>
            </Box>

            {/* Use Template Button */}
            {showTemplateOption && templateHeaders.length > 0 && templateData.length > 0 && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Or start with a ready-made template:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                  <Button
                    variant="outlined"
                    onClick={handleLoadTemplate}
                    disabled={loading}
                    startIcon={<EditIcon />}
                  >
                    Use Template
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={handleDownloadTemplate}
                    disabled={loading}
                    startIcon={<DownloadIcon />}
                    data-testid="download-template"
                  >
                    Download Template
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* Progress Indicator */}
        {loading && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
              Importing...
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleImportSubmit}
          disabled={(requireEnvironment && !environmentUuid) || !importFile || loading || badRows > 0}
          startIcon={loading ? <CircularProgress size={20} /> : <UploadIcon />}
        >
          {loading ? 'Importing...' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportCSVDialog;
