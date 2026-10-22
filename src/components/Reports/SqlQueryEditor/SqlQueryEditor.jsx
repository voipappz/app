import { useState, useRef, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, CircularProgress, Alert, Chip, Tooltip,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import StorageIcon from '@mui/icons-material/Storage';
import ShieldIcon from '@mui/icons-material/Shield';
import { DataGrid } from '@mui/x-data-grid';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../../utils/numberUtils';
import { reportsApi } from '../../../services/api/reportsApi';

// The main BI tables + the Mustache variables the engine always provides.
const TABLES = ['calls', 'environments', 'extensions', 'ques', 'users', 'dids', 'event_store_events', 'subscriptions', 'providers'];
const VARIABLES = ['{{{environment_uuids}}}', '{{{start_time}}}', '{{{end_time}}}'];
const DEFAULT_QUERY = `SELECT calls.meta -> '_direction' AS direction, COUNT(*) AS calls
FROM calls
WHERE calls.environment_uuid IN ({{{environment_uuids}}})
AND calls.created_at > '{{{start_time}}}'
GROUP BY 1`;

/**
 * SqlQueryEditor — Blazer-style ad-hoc SQL over Postgres. The API enforces the
 * guardrails: a single read-only SELECT/WITH in a READ ONLY txn, with a timeout
 * and a row cap. Open to any authenticated account, NOT root-only — results are
 * scoped to the caller's tenant through the injected variables
 * (see POST /reports/run). Saved reports are how applications consume queries;
 * this editor is where they get written.
 *
 * onChange fires on every keystroke, for hosts whose Save button lives outside
 * this component (EditReportDialog saves every tab at once). onSave adds the
 * component's own "Save as report" button.
 */
const SqlQueryEditor = ({ onSave, onChange, initialStatement = '' }) => {
  const { t } = useTranslation('reports');
  const [query, setQuery] = useState(initialStatement || DEFAULT_QUERY);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);

  // Report the starting query too, not just edits: with no initialStatement the
  // editor shows DEFAULT_QUERY, and a host that never heard about it would save
  // an empty statement while displaying SQL. Runs once per mount — hosts remount
  // via `key` when they swap the statement.
  useEffect(() => {
    onChange?.(query);
  }, []);

  // Single place the query changes, so onChange hosts never miss an edit.
  const updateQuery = (next) => {
    setQuery((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      onChange?.(value);
      return value;
    });
  };

  const handleInsert = (text) => {
    const el = textareaRef.current?.querySelector('textarea');
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      updateQuery(query.slice(0, start) + text + query.slice(end));
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = start + text.length;
        el.focus();
      }, 0);
    } else {
      updateQuery((q) => q + ' ' + text);
    }
  };

  const handleRun = async () => {
    const q = query.trim();
    if (!q) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await reportsApi.runAdHoc(q);
      if (res?.meta?.error || res?.error) throw new Error(res.meta?.error || res.error);
      setResult(res);
    } catch (e) {
      setError(e.message || t('sql.failed'));
    } finally {
      setRunning(false);
    }
  };

  const cols = (result?.columns || []).map((c) => ({
    field: String(c), headerName: String(c), flex: 1, minWidth: 110,
  }));
  const rows = (result?.rows || []).map((r, i) => ({ id: i, ...r }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 420 }}>
      {/* Guard notice + helpers */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tooltip title={t('sql.guard')}>
          <Chip size="small" icon={<ShieldIcon sx={{ fontSize: 14 }} />} label={t('sql.readOnly')} color="warning" variant="outlined" />
        </Tooltip>
        <Typography variant="caption" color="text.secondary">{t('sql.tables')}</Typography>
        {TABLES.map((table) => (
          <Chip key={table} size="small" variant="outlined" icon={<StorageIcon sx={{ fontSize: 12 }} />}
            label={table} onClick={() => handleInsert(table)} sx={{ cursor: 'pointer', fontSize: '0.7rem' }} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">{t('sql.variables')}</Typography>
        {VARIABLES.map((v) => (
          <Chip key={v} size="small" variant="outlined" label={v}
            onClick={() => handleInsert(v)} sx={{ cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'monospace' }} />
        ))}
      </Box>

      {/* SQL editor: code, so left to right in every language */}
      <TextField
        ref={textareaRef}
        dir="ltr"
        fullWidth multiline rows={8}
        value={query}
        onChange={(e) => updateQuery(e.target.value)}
        placeholder={DEFAULT_QUERY}
        InputProps={{ sx: { fontFamily: 'Monaco, Menlo, Consolas, monospace', fontSize: 13, bgcolor: 'var(--mui-palette-surface-muted)' } }}
      />

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button variant="contained" size="small"
          startIcon={running ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
          onClick={handleRun} disabled={running || !query.trim()}>
          {t('sql.run')}
        </Button>
        {onSave && (
          <Button variant="outlined" size="small" startIcon={<SaveIcon />}
            onClick={() => onSave(query)} disabled={!query.trim()}>
            {t('sql.saveAsReport')}
          </Button>
        )}
        {result?.meta && (
          <Typography variant="caption" color="text.secondary">
            {result.meta.limit
              ? t('sql.countWithLimit', { n: formatNumber(result.meta.count), limit: formatNumber(result.meta.limit) })
              : t('sql.count', { n: formatNumber(result.meta.count) })}
          </Typography>
        )}
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {result && rows.length === 0 && <Alert severity="info">{t('sql.noRows')}</Alert>}
      {rows.length > 0 && (
        <Box sx={{ height: 300 }}>
          <DataGrid rows={rows} columns={cols} density="compact"
            pageSizeOptions={[25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            disableRowSelectionOnClick />
        </Box>
      )}
    </Box>
  );
};

export default SqlQueryEditor;
