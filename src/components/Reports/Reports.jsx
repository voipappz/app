import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import useReports from './Reports'; // Custom hook
import ReportsDashboards from './ReportsDashboards.jsx';
import { reportsViewFor } from './reportsView';
import './Reports.css'; // Styles
import ReportDataHandler from '../../utils/reportDataHandler';
import { reportsApi } from '../../services/api/reportsApi';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import SettingsIcon from '@mui/icons-material/Settings';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Collapse from '@mui/material/Collapse';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HistoryIcon from '@mui/icons-material/History';
import TableViewIcon from '@mui/icons-material/TableView';
import BarChartIcon from '@mui/icons-material/BarChart';
import BuildIcon from '@mui/icons-material/Build';
import DownloadIcon from '@mui/icons-material/Download';
import { DataGrid } from '@mui/x-data-grid';
import { stripedDataGridSx } from '../shared/tableTheme.jsx';
import { linkedColumnUrl, ReportChart } from './ReportsPanel/ReportsPanel.jsx';
import ReportList from './ReportList/ReportList';
import DateRangePicker from './DateRangePicker/DateRangePicker';
import CreateReportDialog from './CreateReportDialog/CreateReportDialog';
import EditReportDialog from './EditReportDialog/EditReportDialog';
import ReportAuditDialog from './ReportAuditDialog/ReportAuditDialog.jsx';
import HelpButton from '../common/HelpButton';
import { GUIDE_URLS } from '../../utils/guides';
import SqlQueryEditor from './SqlQueryEditor/SqlQueryEditor';
import { usePermissions } from '../../hooks/usePermissions';



const Reports = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Screen view: 'visual' (Blazer-style dashboards, the landing view) or
  // 'editor' (report list + SQL editor). A ?report= deep link means the user
  // wants a specific report — land them in the editor, and switch there when
  // one is opened later (create, fork, a link from another screen).
  const [screenView, setScreenView] = useState(() => reportsViewFor(searchParams));
  const linkedReport = searchParams.get('report');
  useEffect(() => {
    if (linkedReport) setScreenView('editor');
  }, [linkedReport]);
  const { can } = usePermissions();
  const canWrite = can('reports', 'write');

  const {
    reports,
    selectedReportData,
    setSelectedReportData,
    allRows,
    hasNextPage,
    loadingReports,
    loadingReportData,
    loadingMore,
    errorReports,
    errorReportData,
    fetchReportData,
    fetchReportParams,
    saveReportParams,
    fetchSavedSegments,
    saveReportSegment,
    loadMoreData,
    dateRange,
    setDateRange,
    savedDateRange,
    setSavedDateRange,
    createReport,
    forkReport,
    updateReport,
    deleteReport,
    queryConfigs,
    reportDetail,
    customVariables,
    setCustomVariables,
    smartVariables,
    fetchReportDetail,
    // Dynamic field/group/order query builder
    queryUsesColumns,
    availableFields,
    availableGroups,
    availableOrders,
    selectedFields,
    setSelectedFields,
    groupByFields,
    setGroupByFields,
    orderByFields,
    setOrderByFields,
  } = useReports();


  const [columnSelectorAnchorEl, setColumnSelectorAnchorEl] = useState(null);
  const [visibleFieldKeys, setVisibleFieldKeys] = useState([]);
  const [allAvailableFields, setAllAvailableFields] = useState([]); // Stores { key: string, name: string }
  const [dataHandler, setDataHandler] = useState(null);

  // Chart state
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'chart'
  const [chartDataFields, setChartDataFields] = useState([]);

  // Flag to track if we've already fetched data for the current saved parameters
  const [hasFetchedWithSavedParams, setHasFetchedWithSavedParams] = useState(false);

  const [showQueryBuilder, setShowQueryBuilder] = useState(false);

  // Create Report Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const handleCreateDialogOpen = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const handleCreateDialogClose = useCallback(() => {
    setCreateDialogOpen(false);
  }, []);

  const handleCreateReport = useCallback(async (reportData) => {
    const created = await createReport(reportData);
    setCreateDialogOpen(false);
    const uuid = created?.uuid || created?.report?.uuid;
    if (uuid) {
      setSearchParams({ report: uuid }, { replace: true });
      fetchReportDetail(uuid);
      fetchReportParams(uuid);
      fetchSavedSegments(uuid);
      fetchReportData(uuid);
    }
  }, [createReport, fetchReportData, fetchReportDetail, fetchReportParams, fetchSavedSegments, setSearchParams]);

  // Edit Report Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);

  const handleEditDialogOpen = useCallback(() => {
    if (!selectedReportData?.report_uuid) return;
    const report = reports.find(r => r.uuid === selectedReportData.report_uuid);
    setEditingReport(report || { uuid: selectedReportData.report_uuid, name: selectedReportData.name });
    setEditDialogOpen(true);
  }, [selectedReportData, reports]);

  const handleEditDialogClose = useCallback(() => {
    setEditDialogOpen(false);
    setEditingReport(null);
  }, []);

  const handleUpdateReport = useCallback(async (reportUuid, reportData) => {
    await updateReport(reportUuid, reportData);
    // Update the selected report name in case it changed
    if (selectedReportData?.report_uuid === reportUuid && reportData.name) {
      setSelectedReportData(prev => ({ ...prev, name: reportData.name }));
    }
    // A saved SQL edit must immediately prove itself in the report view.  This
    // also prevents the pre-edit result from remaining on screen after Save.
    if (selectedReportData?.report_uuid === reportUuid) {
      await fetchReportData(reportUuid, savedDateRange || dateRange);
    }
  }, [updateReport, selectedReportData, setSelectedReportData, fetchReportData, savedDateRange, dateRange]);

  // Fork a saved report or queries.yml template and jump into the new copy.
  const [forking, setForking] = useState(false);
  const forkSourceReport = useCallback(async (sourceId) => {
    if (!sourceId || forking) return null;
    setForking(true);
    try {
      const created = await forkReport(sourceId);
      const uuid = created?.uuid || created?.report?.uuid;
      if (uuid) {
        setSearchParams({ report: uuid }, { replace: true });
        fetchReportDetail(uuid);
        fetchReportParams(uuid);
        fetchSavedSegments(uuid);
        fetchReportData(uuid);
      }
      return created;
    } catch (err) {
      console.error('Failed to fork report:', err);
      return null;
    } finally {
      setForking(false);
    }
  }, [forking, forkReport, fetchReportData, fetchReportDetail, fetchReportParams, fetchSavedSegments, setSearchParams]);

  const handleForkReport = useCallback(() => {
    forkSourceReport(selectedReportData?.report_uuid);
  }, [forkSourceReport, selectedReportData]);

  const selectedReportEntry = reports.find(r => r.uuid === selectedReportData?.report_uuid);

  const handleRunSelectedReport = useCallback(() => {
    if (!selectedReportData?.report_uuid) return;
    fetchReportData(selectedReportData.report_uuid, savedDateRange || dateRange);
  }, [selectedReportData, fetchReportData, savedDateRange, dateRange]);

  const handleDeleteReport = useCallback(async (reportUuid) => {
    if (!reportUuid) return;
    try {
      await deleteReport(reportUuid);
      if (selectedReportData?.report_uuid === reportUuid) {
        setSelectedReportData(null);
      }
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  }, [deleteReport, selectedReportData, setSelectedReportData]);

  // Export via backend — hits GET /api/reports/:id?action=export → returns { url }
  const handleExportBackend = useCallback(async () => {
    if (!selectedReportData?.report_uuid) return;
    try {
      // dateRange is a [start, end] tuple — convert to epoch seconds like fetchReportData does
      const [start, end] = (savedDateRange || dateRange) || [];
      const filters = {};
      if (start) filters.start_date = Math.floor(new Date(start).getTime() / 1000);
      if (end)   filters.end_date   = Math.floor(new Date(end).getTime()   / 1000);
      const res = await reportsApi.exportReport(selectedReportData.report_uuid, filters);
      const url = res?.url;
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedReportData.name || 'report'}.csv`;
        a.click();
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [selectedReportData, dateRange, savedDateRange]);

  // Handle infinite scroll
  const handleRowsScrollEnd = useCallback((params) => {
    if (!selectedReportData?.report_uuid || !hasNextPage || loadingMore) return;

    const { viewportEndRowIndex } = params;
    const totalRows = allRows.length;
    
    // Load more data when user scrolls close to the end (within 20 rows)
    if (viewportEndRowIndex >= totalRows - 20 && hasNextPage && !loadingMore) {
      loadMoreData(selectedReportData.report_uuid);
    }
  }, [selectedReportData?.report_uuid, hasNextPage, loadingMore, loadMoreData, allRows.length]);

  // Only numeric columns can be bars, and the label is the first NON-numeric
  // column — picking by position instead offered text columns as bars, which
  // coerce to 0 and then render as a full-height 100 (a flat series normalises
  // to the top of the scale). Same split ReportChart uses.
  const { chartLabelField, chartNumericFields } = useMemo(() => {
    const sample = (allRows && allRows[0]) || {};
    const isNum = (key) => {
      const v = sample[key];
      return v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
    };
    const label = allAvailableFields.find(f => !isNum(f.key)) || allAvailableFields[0];
    return {
      chartLabelField: label,
      chartNumericFields: allAvailableFields.filter(f => isNum(f.key) && f.key !== label?.key),
    };
  }, [allAvailableFields, allRows]);

  const detectedChartType = useMemo(() => {
    const detected = dataHandler?.detectChartType() || 'table';
    // The shared renderer represents Blazer's grouped variants with the same
    // composed line/bar primitives.
    return detected === 'line2' ? 'line' : detected === 'bar2' ? 'bar' : detected;
  }, [dataHandler]);

  const chartRows = useMemo(() => dataHandler?.getRows() || [], [dataHandler]);
  const chartColumns = useMemo(() => {
    const allKeys = allAvailableFields.map(field => field.key);
    if (['scatter', 'map'].includes(detectedChartType)) return allKeys;

    const target = allKeys.find(key => String(key).toLowerCase() === 'target');
    return [...new Set([chartLabelField?.key, ...chartDataFields, target].filter(Boolean))];
  }, [allAvailableFields, chartDataFields, chartLabelField, detectedChartType]);

  // Initialize chart configuration when data changes
  useEffect(() => {
    // Up to 3 numeric series by default; a report with none isn't chartable.
    setChartDataFields(chartNumericFields.slice(0, 3).map(f => f.key));
  }, [chartNumericFields]);

  // Effect to process report data with the new data handler
  useEffect(() => {
    if (!selectedReportData) {
      setDataHandler(null);
      setAllAvailableFields([]);
      setVisibleFieldKeys([]);
      return;
    }

    // Create data handler to analyze and process the report data
    const handler = ReportDataHandler.fromReportData(selectedReportData);
    setDataHandler(handler);

    // Auto-detect best chart type from result shape (Blazer-style)
    const detected = handler.detectChartType();
    if (detected && detected !== 'table') {
      setViewMode('chart');
    } else {
      setViewMode('table');
    }

    // Get processed fields
    const fields = handler.getFields();
    setAllAvailableFields(fields);

    // Handle visibility preferences
    const reportUuid = selectedReportData.report_uuid;
    if (fields.length > 0 && reportUuid) {
      const storedPreferences = localStorage.getItem(`report_cols_pref_${reportUuid}`);
      let initialVisibleKeys;

      if (storedPreferences) {
        try {
          const parsedPrefs = JSON.parse(storedPreferences);
          // Filter stored prefs to ensure they are still valid available fields
          initialVisibleKeys = parsedPrefs.filter(key => fields.some(f => f.key === key));
        } catch (e) {
          console.error("Error parsing column preferences from local storage", e);
        }
      }
      
      // If no valid stored preferences, default to all fields
      if (!initialVisibleKeys || initialVisibleKeys.length === 0) {
        initialVisibleKeys = fields.map(f => f.key);
      }
      
      setVisibleFieldKeys(initialVisibleKeys);
    } else {
      setVisibleFieldKeys([]);
    }
  }, [selectedReportData]);

  // Auto-fetch report data when saved parameters are loaded
  useEffect(() => {
    if (savedDateRange && selectedReportData?.report_uuid && !hasFetchedWithSavedParams) {
      fetchReportData(selectedReportData.report_uuid, savedDateRange);
      setHasFetchedWithSavedParams(true);
    }
  }, [savedDateRange, selectedReportData?.report_uuid, hasFetchedWithSavedParams, fetchReportData]);

  // Restore selected report from URL query param on mount
  useEffect(() => {
    const reportId = searchParams.get('report');
    if (reportId && reports.length > 0 && !selectedReportData) {
      const found = reports.find(r => r.uuid === reportId);
      if (found) {
        setSelectedReportData({ report_uuid: found.uuid, name: found.name });
        setHasFetchedWithSavedParams(false);
        fetchReportParams(found.uuid);
        fetchSavedSegments(found.uuid);
        fetchReportDetail(found.uuid);
      }
    }
  }, [reports, searchParams, selectedReportData, setSelectedReportData, fetchReportParams, fetchSavedSegments, fetchReportDetail]);

  const handleColumnSelectorOpen = (event) => {
    setColumnSelectorAnchorEl(event.currentTarget);
  };

  const handleColumnSelectorClose = () => {
    setColumnSelectorAnchorEl(null);
  };

  const handleToggleColumnVisibility = (fieldKey) => {
    const newVisibleFieldKeys = visibleFieldKeys.includes(fieldKey)
      ? visibleFieldKeys.filter(key => key !== fieldKey)
      : [...visibleFieldKeys, fieldKey];
    
    setVisibleFieldKeys(newVisibleFieldKeys);
    if (selectedReportData?.report_uuid) {
      localStorage.setItem(`report_cols_pref_${selectedReportData.report_uuid}`, JSON.stringify(newVisibleFieldKeys));
    }
  };


  if (loadingReports) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading reports list...</Typography>
      </Box>
    );
  }

  if (errorReports) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Error loading reports: {errorReports}</Alert>
      </Box>
    );
  }

  const handleReportSelect = (reportUuid) => {
    // When a new report is selected, set basic report data and fetch saved parameters
    const selectedReport = reports.find(r => r.uuid === reportUuid);
    if (selectedReport) {
      setSelectedReportData({ report_uuid: reportUuid, name: selectedReport.name });
    }
    setHasFetchedWithSavedParams(false); // Reset flag for new report
    fetchReportParams(reportUuid);
    // The user's saved field/group choices — these override the queries.yml
    // defaults, so they have to land before the selectors initialise.
    fetchSavedSegments(reportUuid);
    // Fetch report detail to detect custom Mustache variables
    fetchReportDetail(reportUuid);
    // Sync to URL so the view is bookmarkable/shareable
    setSearchParams({ report: reportUuid }, { replace: true });
  };

  
  const handleDateRangeChange = async (newRange) => {
    setDateRange(newRange);
    // Keep the control and export path on the range the user just selected.
    // Previously savedDateRange stayed truthy and masked this new value.
    setSavedDateRange(newRange);
    if (selectedReportData?.report_uuid) {
      // Virtual queries.yml templates have a name id rather than a persisted
      // UUID. They can run any range, but only saved reports can persist it.
      if (/^[0-9a-f-]{36}$/i.test(selectedReportData.report_uuid)) {
        await saveReportParams(selectedReportData.report_uuid, newRange);
      }
      fetchReportData(selectedReportData.report_uuid, newRange);
    }
  };

  let columns = [];
  let rows = [];
  const linkedColumns = selectedReportData?.linked_columns || selectedReportData?.table?.linked_columns || {};
  
  if (dataHandler && visibleFieldKeys.length > 0) {
    // Create columns using the data handler
    columns = visibleFieldKeys.map(key => {
      const fieldInfo = allAvailableFields.find(f => f.key === key) || { name: dataHandler.generateHeaderName(key) };
      return {
        field: key,
        headerName: fieldInfo.name,
        flex: 1,
        minWidth: 120,
        renderCell: (params) => {
          const displayValue = params.value;
          const url = linkedColumnUrl(linkedColumns[key], displayValue);
          return (
            <div title={String(displayValue !== null && displayValue !== undefined ? displayValue : "")}>
              {url ? (
                <a href={url}>{String(displayValue)}</a>
              ) : String(displayValue !== null && displayValue !== undefined ? displayValue : "")}
            </div>
          );
        },
      };
    });

    // Get processed rows using the data handler
    const allProcessedRows = dataHandler.getRows();

    // Filter rows to only include visible fields
    if (allProcessedRows.length > 0) {
      rows = allProcessedRows.map(row => {
        const filteredRow = { id: row.id };
        visibleFieldKeys.forEach(key => {
          filteredRow[key] = row[key];
        });
        return filteredRow;
      });
    } else {
      rows = [];
    }
  }


  // Blazer-style visual view — all categorized reports as dashboards.
  if (screenView === 'visual') {
    return (
      <Box className="reports-container" data-testid="reports-container"
        sx={{ p: { xs: 1, sm: 2, md: 3 }, height: '100%', overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Reports</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Chip label="Visual" color="primary" size="small" sx={{ fontWeight: 600 }} />
          <Chip label="Editor" variant="outlined" size="small" onClick={() => setScreenView('editor')} sx={{ cursor: 'pointer' }} />
        </Box>
        <ReportsDashboards />
      </Box>
    );
  }

  return (
    <Box
      className="reports-container"
      data-testid="reports-container"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        p: { xs: 1, sm: 2, md: 3 },
        gap: 2,
        height: '100%',
        width: '100%',
        // overflow: 'hidden'
      }}>
      {/* Reports List Sidebar */}
      <Paper 
        className="reports-sidebar"
        elevation={3} 
        sx={{ 
          width: { xs: '100%', md: '250px' }, 
          height: { xs: 'auto', md: '100%' },
          maxHeight: { xs: '200px', md: 'none' },
          p: 2, 
          overflowY: 'auto',
          flexShrink: 0
        }}>
        {/* Back to the Blazer-style visual dashboards */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <Chip label="Visual" variant="outlined" size="small" onClick={() => setScreenView('visual')} sx={{ cursor: 'pointer' }} />
          <Chip label="Editor" color="primary" size="small" sx={{ fontWeight: 600 }} />
        </Box>
        <ReportList
          reports={reports}
          loading={loadingReports}
          error={errorReports}
          selectedReportUuid={selectedReportData?.report_uuid}
          onSelect={handleReportSelect}
          onRun={handleReportSelect}
          onCreateClick={handleCreateDialogOpen}
          onFork={forkSourceReport}
          onDelete={handleDeleteReport}
          canWrite={canWrite}
        />
      </Paper>

      {/* Create Report Dialog */}
      <CreateReportDialog
        open={createDialogOpen}
        onClose={handleCreateDialogClose}
        onSave={handleCreateReport}
        queries={queryConfigs}
      />

      {/* Edit Report Dialog */}
      <EditReportDialog
        open={editDialogOpen}
        onClose={handleEditDialogClose}
        onSave={handleUpdateReport}
        report={editingReport}
        queries={queryConfigs}
      />

      <ReportAuditDialog
        open={auditDialogOpen}
        onClose={() => setAuditDialogOpen(false)}
        reportName={selectedReportEntry?.name || selectedReportData?.name}
      />

      {/* Report Data Display Area */}
      <Paper 
        className="report-content"
        elevation={3} 
        sx={{ 
          flexGrow: 1, 
          p: { xs: 1, sm: 2 }, 
          display: 'flex', 
          flexDirection: 'column', 
         overflow: 'auto !important',
          minHeight: {  md: 'auto' }
        }}>
        {loadingReportData && (
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              <Typography variant="body2" color="text.secondary">Loading report data...</Typography>
            </Box>
            <Box sx={{ mb: 2 }}>
              {[...Array(5)].map((_, index) => (
                <Skeleton
                  key={index}
                  variant="rectangular"
                  height={52}
                  sx={{ mb: 1, borderRadius: 1 }}
                  animation="wave"
                />
              ))}
            </Box>
          </Box>
        )}
        {errorReportData && !loadingReportData && (
          <Box sx={{ p: 3 }}>
            <Alert severity="error">Error loading report data: {errorReportData}</Alert>
          </Box>
        )}
        {!loadingReportData && !errorReportData && selectedReportData && (
          <>
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, sm: 'grow' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="h5" gutterBottom sx={{ mb: { xs: 1, sm: 0 } }}>
                    {selectedReportData.name || reports.find(r => r.uuid === selectedReportData.report_uuid)?.name || 'Report Details'}
                  </Typography>
                  <Chip size="small" variant="outlined"
                    label={detectedChartType === 'table' ? 'Table' : `${detectedChartType.replace(/\b\w/g, c => c.toUpperCase())} chart`} />
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 'auto' }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PlayArrowIcon />}
                    onClick={handleRunSelectedReport}
                    disabled={loadingReportData || !selectedReportData?.report_uuid}
                  >
                    Run
                  </Button>
                  {canWrite && selectedReportEntry?.editable !== false && (
                    <Button size="small" variant="outlined" aria-label="Edit report"
                      startIcon={<EditIcon />} onClick={handleEditDialogOpen}>Edit</Button>
                  )}
                  {canWrite && (
                    <Tooltip title={selectedReportEntry?.editable === false ? 'Fork template to edit' : 'Fork report (editable copy)'}>
                      <span>
                        <Button size="small" variant="outlined" aria-label="Fork report"
                          startIcon={<ContentCopyIcon />} onClick={handleForkReport} disabled={forking}>Fork</Button>
                      </span>
                    </Tooltip>
                  )}
                  <Button size="small" variant="outlined" aria-label="Report history"
                    startIcon={<HistoryIcon />} onClick={() => setAuditDialogOpen(true)}>History</Button>
                  <Tooltip title={showQueryBuilder ? 'Hide SQL editor' : 'SQL editor'}>
                    <ToggleButton
                      value="queryBuilder"
                      selected={showQueryBuilder}
                      onChange={() => setShowQueryBuilder(prev => !prev)}
                      size="small"
                      sx={{ mr: 1 }}
                    >
                      <BuildIcon fontSize="small" sx={{ mr: 0.5 }} /> SQL
                    </ToggleButton>
                  </Tooltip>
                  {allAvailableFields.length > 0 && (
                    <>
                      <ToggleButtonGroup
                        className="view-mode-toggle"
                        value={viewMode}
                        exclusive
                        onChange={(event, newMode) => newMode && setViewMode(newMode)}
                        size="small"
                      >
                        <ToggleButton value="table" aria-label="table view">
                          <TableViewIcon fontSize="small" sx={{ mr: 0.5 }} /> Table
                        </ToggleButton>
                        <ToggleButton value="chart" aria-label="chart view">
                          <BarChartIcon fontSize="small" sx={{ mr: 0.5 }} /> Chart
                        </ToggleButton>
                      </ToggleButtonGroup>
                      <Tooltip title="Export CSV">
                        <Button
                          onClick={handleExportBackend}
                          size="small"
                          variant="outlined"
                          startIcon={<DownloadIcon />}
                          disabled={!selectedReportData?.report_uuid}
                        >
                          Export
                        </Button>
                      </Tooltip>
                      <IconButton
                        className="column-selector-button"
                        onClick={handleColumnSelectorOpen}
                        size="small"
                        title="Select Columns"
                      >
                        <SettingsIcon />
                      </IconButton>
                    </>
                  )}
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 'auto' }}>
                <DateRangePicker
                  dateRange={savedDateRange || dateRange}
                  setDateRange={handleDateRangeChange}
                />
              </Grid>
            </Grid>
            {/* Custom Mustache variable inputs */}
            {Object.keys(customVariables).length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
                <Chip label="Parameters" size="small" color="primary" variant="outlined" />
                {Object.entries(customVariables).map(([varName, varValue]) => {
                  // A smart variable resolves to labelled options — pick "Sales"
                  // instead of typing a raw uuid. Everything else stays a text box.
                  const options = smartVariables[varName];
                  return options?.length ? (
                    <TextField
                      key={varName}
                      select
                      label={varName.replace(/_/g, ' ')}
                      value={varValue ?? ''}
                      onChange={(e) => setCustomVariables(prev => ({ ...prev, [varName]: e.target.value }))}
                      size="small"
                      variant="outlined"
                      sx={{ minWidth: 160, maxWidth: 260 }}
                    >
                      <MenuItem value="">
                        <em>Any</em>
                      </MenuItem>
                      {options.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label || opt.value}</MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <TextField
                      key={varName}
                      label={varName.replace(/_/g, ' ')}
                      value={varValue}
                      onChange={(e) => setCustomVariables(prev => ({ ...prev, [varName]: e.target.value }))}
                      size="small"
                      variant="outlined"
                      sx={{ minWidth: 120, maxWidth: 200 }}
                    />
                  );
                })}
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => {
                    if (selectedReportData?.report_uuid) {
                      fetchReportData(selectedReportData.report_uuid, savedDateRange || dateRange);
                    }
                  }}
                >
                  Run
                </Button>
              </Box>
            )}
            {/* Dynamic Field / Group / Order selectors for queries with {{{columns}}} */}
            {queryUsesColumns && availableFields.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
                {/* Fields — toggle chips */}
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 1 }}>
                    Fields
                  </Typography>
                  <Box sx={{ display: 'inline-flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {availableFields.map((f) => {
                      const isOn = selectedFields.includes(f);
                      return (
                        <Chip
                          key={f}
                          label={f.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          size="small"
                          color={isOn ? 'primary' : 'default'}
                          variant={isOn ? 'filled' : 'outlined'}
                          onClick={() =>
                            setSelectedFields(prev =>
                              prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
                            )
                          }
                        />
                      );
                    })}
                  </Box>
                </Box>

                <Divider sx={{ my: 1 }} />

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Group By — toggle chips */}
                  {availableGroups.length > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.5 }}>
                        Group By
                      </Typography>
                      {availableGroups.map((g) => {
                        const isOn = groupByFields.includes(g);
                        return (
                          <Chip
                            key={g}
                            label={String(g).replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            size="small"
                            color={isOn ? 'secondary' : 'default'}
                            variant={isOn ? 'filled' : 'outlined'}
                            onClick={() => {
                              const next = groupByFields.includes(g)
                                ? groupByFields.filter(x => x !== g)
                                : [...groupByFields, g];
                              setGroupByFields(next);
                              // Persist as a segment so it survives a reload
                              if (selectedReportData?.report_uuid) {
                                saveReportSegment(selectedReportData.report_uuid, 'group_columns', next);
                              }
                            }}
                          />
                        );
                      })}
                    </Box>
                  )}

                  {/* Order By — dropdown */}
                  {availableOrders.length > 0 && (
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel>Order By</InputLabel>
                      <Select
                        value={orderByFields[0] || ''}
                        label="Order By"
                        onChange={(e) => setOrderByFields(e.target.value ? [e.target.value] : [])}
                      >
                        <MenuItem value="">
                          <em>None</em>
                        </MenuItem>
                        {availableOrders.map((o) => (
                          <MenuItem key={o} value={o}>
                            {String(o).replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {/* Run button */}
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PlayArrowIcon />}
                    onClick={() => {
                      if (selectedReportData?.report_uuid) {
                        fetchReportData(selectedReportData.report_uuid, savedDateRange || dateRange);
                      }
                    }}
                  >
                    Run
                  </Button>
                </Box>
              </Paper>
            )}

            <Menu
              anchorEl={columnSelectorAnchorEl}
              open={Boolean(columnSelectorAnchorEl)}
              onClose={handleColumnSelectorClose}
              PaperProps={{ style: { maxHeight: 400, width: '30ch' } }}
            >
              {allAvailableFields.map((field) => (
                <MenuItem key={field.key} dense>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={visibleFieldKeys.includes(field.key)}
                        onChange={() => handleToggleColumnVisibility(field.key)}
                        size="small"
                      />
                    }
                    label={field.name}
                    sx={{ width: '100%' }}
                  />
                </MenuItem>
              ))}
            </Menu>

            {/* Inline Query Builder Panel */}
            <Collapse in={showQueryBuilder}>
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                {/* Seeded with the SELECTED report's SQL. Mounted with no props
                    it always showed the built-in `calls` sample, so the panel
                    contradicted the report and the table underneath it. The key
                    remounts the editor when a different report is picked. */}
                <SqlQueryEditor
                  key={reportDetail?.uuid || selectedReportData?.report_uuid || 'adhoc'}
                  initialStatement={reportDetail?.statement || ''}
                />
              </Paper>
            </Collapse>

            {/* Chart Configuration Controls */}
            {viewMode === 'chart' && ['line', 'bar', 'pie'].includes(detectedChartType) && allAvailableFields.length > 0 && (
              <Card className="chart-config-card" sx={{ mb: 2, overflow: 'auto !important' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                 
                  <Grid container spacing={2} alignItems="center">
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary' }}>
                        Label Field: <strong>{chartLabelField?.name || '—'}</strong> (automatically selected)
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 8 }}>
                      <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                        Data Fields (select chart series)
                      </Typography>
                      <Box className="chart-field-buttons" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                        {chartNumericFields.length === 0 && (
                          <Typography variant="caption" color="text.secondary">
                            This report has no numeric columns to chart — showing the table instead.
                          </Typography>
                        )}
                        {chartNumericFields.map((field) => {
                          const isSelected = chartDataFields.includes(field.key);
                          return (
                            <Button
                              key={field.key}
                              className={`chart-field-button ${isSelected ? 'selected' : ''}`}
                              variant={isSelected ? "contained" : "outlined"}
                              color={isSelected ? "primary" : "inherit"}
                              onClick={() => {
                                setChartDataFields(prev => {
                                  const newFields = prev.includes(field.key) 
                                    ? prev.filter(f => f !== field.key)
                                    : [...prev, field.key];
                                  return newFields;
                                });
                              }}
                              size="small"
                              sx={{ 
                                minWidth: '80px',
                                px: 1,
                                py: 0.5,
                                fontSize: '0.8rem',
                                textTransform: 'none',
                                fontWeight: isSelected ? 600 : 400,
                                borderWidth: '2px',
                                '&:hover': {
                                  borderWidth: '2px',
                                }
                              }}
                            >
                              {field.name}
                            </Button>
                          );
                        })}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Selected: {chartDataFields.length} field(s)
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            )}
            
            {(() => {
              // Render table if we have columns, even with 0 rows (show empty table with headers)
              const shouldRender = viewMode === 'table' && columns.length > 0;
              return shouldRender;
            })() ? (
              <Box 
                className="data-grid-container"
                sx={{ 
                  height: '100%', 
                  width: '100%', 
                  flexGrow: 1,
                  minHeight: 400,
                  position: 'relative',
                '& .MuiDataGrid-root': {
                  border: 'none',
                },
                '& .MuiDataGrid-cell': {
                  borderBottom: '1px solid var(--mui-palette-divider)',
                },
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: 'var(--mui-palette-surface-muted)',
                  borderBottom: '2px solid var(--mui-palette-divider)',
                },
                '& .MuiDataGrid-virtualScroller': {
                  backgroundColor: 'var(--mui-palette-background-paper)',
                }
              }}>
                <DataGrid
                  rows={rows}
                  columns={columns}
                  hideFooter
                  checkboxSelection={false}
                  disableSelectionOnClick
                  density="compact"
                  loading={loadingReportData}
                  onRowsScrollEnd={handleRowsScrollEnd}
                  rowBuffer={10}
                  columnBuffer={0}
                  localeText={{ noRowsLabel: 'No data found for the selected date range' }}
                  sx={{
                    ...stripedDataGridSx,
                    '& .MuiDataGrid-columnHeader': {
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    },
                    '& .MuiDataGrid-cell': {
                      fontSize: '0.875rem',
                    },
                  }}
                />
                {loadingMore && (
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    p: 2,
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    zIndex: 1
                  }}>
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">Loading more data...</Typography>
                  </Box>
                )}
              </Box>
            ) : (() => {
              const shouldRenderChart = viewMode === 'chart' && allAvailableFields.length > 0;
              return shouldRenderChart;
            })() ? (
              <Box 
                className="chart-container"
                sx={{ 
                  height: '100%', 
                  width: '100%', 
                  flexGrow: 1,
                  minHeight: '500px',
                  p: 1,
                  overflow: 'auto !important'
                }}
              >
                <ReportChart
                  chart={detectedChartType}
                  columns={chartColumns}
                  rows={chartRows}
                  height={500}
                />
              </Box>
            ) : viewMode === 'chart' ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No Data Available
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Please select a report with data to display the chart.
                </Typography>
              </Box>
            ) : (
               columns.length === 0 && visibleFieldKeys.length > 0 ?
               <Typography>No data to display for the selected columns, or all columns are hidden. Use the settings icon to select columns.</Typography> :
               <Typography>Select a report to view its data or this report type is not yet supported for display.</Typography>
            )}
          </>
        )}
        {!loadingReportData && !selectedReportData && !errorReportData && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
            <Typography variant="h6" color="text.secondary">
              Please select a report from the list to view details.
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default Reports;
