import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import BarChartIcon from '@mui/icons-material/BarChart';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import TableViewIcon from '@mui/icons-material/TableView';
import ReportChart from './ReportChart';
import { reportToCsv } from './reportData';
import useReportsWorkspace from './useReportsWorkspace';

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function presetRange(preset, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  if (preset === 'd7') start.setDate(start.getDate() - 6);
  if (preset === 'd30') start.setDate(start.getDate() - 29);
  return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
}

function safeFilename(value) {
  return String(value || 'report').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'report';
}

function downloadReport(result) {
  const csv = reportToCsv(result);
  if (!csv) return;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(result.name)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ReportsWorkspace() {
  const { t } = useTranslation();
  const {
    reports,
    selectedReport,
    result,
    loadingReports,
    loadingResult,
    reportsError,
    resultError,
    selectReport,
    refreshReport,
  } = useReportsWorkspace();
  const [filters, setFilters] = useState(() => ({ ...presetRange('d7'), groupBy: 'day' }));
  const [preset, setPreset] = useState('d7');
  const [view, setView] = useState('table');
  const validRange = Boolean(filters.startDate && filters.endDate && filters.startDate <= filters.endDate);

  const chartReport = useMemo(() => result ? {
    ...result,
    chart: view === 'chart' ? 'bar' : 'table',
  } : null, [result, view]);

  const choosePreset = (value) => {
    if (!value) return;
    setPreset(value);
    setFilters((current) => ({ ...current, ...presetRange(value) }));
  };

  const chooseReport = (report) => {
    void selectReport(report, filters).then((effectiveFilters) => {
      if (effectiveFilters) {
        setFilters(effectiveFilters);
        setPreset(null);
      }
    });
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '260px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
      <Paper variant="outlined" sx={{ minWidth: 0, maxHeight: { xs: 240, md: 'calc(100vh - 190px)' }, overflowY: 'auto' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, px: 2, pt: 2, pb: 1 }}>
          {t('usageReports.availableReports')}
        </Typography>

        {loadingReports && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={24} /></Box>
        )}
        {reportsError && <Alert severity="error" sx={{ m: 1 }}>{t('usageReports.listError')}</Alert>}
        {!loadingReports && !reportsError && reports.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
            {t('usageReports.noReports')}
          </Typography>
        )}
        <List dense disablePadding sx={{ pb: 1 }}>
          {reports.map((report) => (
            <ListItem key={report.uuid} disablePadding>
              <ListItemButton
                selected={selectedReport?.uuid === report.uuid}
                onClick={() => chooseReport(report)}
                data-testid={`report-${report.uuid}`}
              >
                <ListItemText primary={report.name || t('usageReports.untitledReport')} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, minWidth: 0, minHeight: 360 }}>
        {!selectedReport ? (
          <Box sx={{ minHeight: 300, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'text.secondary' }}>
            <Box>
              <AssessmentOutlinedIcon sx={{ fontSize: 48, opacity: 0.45 }} />
              <Typography sx={{ mt: 1 }}>{t('usageReports.selectPrompt')}</Typography>
            </Box>
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {selectedReport.name || t('usageReports.untitledReport')}
                </Typography>
                {result && (
                  <Typography variant="caption" color="text.secondary">
                    {t('usageReports.rowCount', { count: result.rows.length })}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={view}
                  onChange={(_event, value) => value && setView(value)}
                  aria-label={t('usageReports.view')}
                >
                  <ToggleButton value="table" aria-label={t('usageReports.table')}><TableViewIcon fontSize="small" /></ToggleButton>
                  <ToggleButton value="chart" aria-label={t('usageReports.chart')}><BarChartIcon fontSize="small" /></ToggleButton>
                </ToggleButtonGroup>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  disabled={!result?.rows?.length}
                  onClick={() => downloadReport(result)}
                >
                  {t('usageReports.downloadCsv')}
                </Button>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 1.5, mb: 2, bgcolor: 'action.hover', borderRadius: 1.5 }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={preset}
                onChange={(_event, value) => choosePreset(value)}
                aria-label={t('usageReports.dateRange')}
                sx={{ alignSelf: 'flex-start', maxWidth: '100%' }}
              >
                <ToggleButton value="today">{t('usageReports.period.today')}</ToggleButton>
                <ToggleButton value="d7">{t('usageReports.period.d7')}</ToggleButton>
                <ToggleButton value="d30">{t('usageReports.period.d30')}</ToggleButton>
              </ToggleButtonGroup>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(150px, 1fr)) minmax(120px, .7fr) auto' }, gap: 1.5, alignItems: 'start' }}>
                <TextField
                  size="small"
                  type="date"
                  label={t('usageReports.startDate')}
                  value={filters.startDate}
                  onChange={(event) => {
                    setPreset(null);
                    setFilters((current) => ({ ...current, startDate: event.target.value }));
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  type="date"
                  label={t('usageReports.endDate')}
                  value={filters.endDate}
                  onChange={(event) => {
                    setPreset(null);
                    setFilters((current) => ({ ...current, endDate: event.target.value }));
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={!validRange}
                  helperText={!validRange ? t('usageReports.invalidDateRange') : ' '}
                />
                <FormControl size="small">
                  <InputLabel id="report-group-by-label">{t('usageReports.groupBy')}</InputLabel>
                  <Select
                    labelId="report-group-by-label"
                    label={t('usageReports.groupBy')}
                    value={filters.groupBy}
                    onChange={(event) => setFilters((current) => ({ ...current, groupBy: event.target.value }))}
                  >
                    <MenuItem value="day">{t('usageReports.group.day')}</MenuItem>
                    <MenuItem value="week">{t('usageReports.group.week')}</MenuItem>
                    <MenuItem value="month">{t('usageReports.group.month')}</MenuItem>
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  startIcon={<RefreshIcon />}
                  disabled={!validRange || loadingResult}
                  onClick={() => void refreshReport(filters)}
                  sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
                >
                  {t('usageReports.runReport')}
                </Button>
              </Box>
            </Box>

            {resultError && <Alert severity="error" sx={{ mb: 2 }}>{t('usageReports.runError')}</Alert>}
            {loadingResult && (
              <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center' }}>
                <Box sx={{ textAlign: 'center' }}>
                  <CircularProgress size={30} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {t('usageReports.loadingReport')}
                  </Typography>
                </Box>
              </Box>
            )}
            {!loadingResult && chartReport && chartReport.rows.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>
                {t('usageReports.noData')}
              </Typography>
            )}
            {!loadingResult && chartReport?.rows?.length > 0 && <ReportChart report={chartReport} height={360} />}
          </>
        )}
      </Paper>
    </Box>
  );
}
