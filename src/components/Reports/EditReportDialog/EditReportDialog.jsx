import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Paper,
  Chip,
  CircularProgress,
  Tooltip,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
} from '@mui/material';
import SqlQueryEditor from '../SqlQueryEditor/SqlQueryEditor';
import { reportsApi } from '../../../services/api/reportsApi';
import { ResponsiveDialog as Dialog, useConfirm } from '../../ui';
import { useTranslation } from 'react-i18next';
import { displayTypeName } from '../reportWords';

/**
 * EditReportDialog — edit a saved report: its identity, its SQL, and its
 * per-report guardrails, in three tabs (the UserDialog pattern).
 *
 * The query tab reuses SqlQueryEditor, the same editor CreateReportDialog uses,
 * so the SQL can actually be RUN against Postgres before saving. This replaced a
 * hand-rolled Monaco editor plus a client-side keyword scan that called itself
 * "Validate" — it could not catch a bad column or a syntax error, and the API
 * already enforces a single read-only SELECT server-side.
 */
const EditReportDialog = ({ open, onClose, onSave, report, queries }) => {
  const { t } = useTranslation('reports');
  const confirm = useConfirm();
  const [tabValue, setTabValue] = useState(0);
  const [name, setName] = useState('');
  const [type, setType] = useState('table');
  const [enabled, setEnabled] = useState(true);
  const [notes, setNotes] = useState('');
  const [selectedQueryId, setSelectedQueryId] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // SqlQueryEditor seeds its own state from initialStatement, so it has to be
  // remounted when the statement arrives (async) or a template replaces it.
  const [sqlSeedKey, setSqlSeedKey] = useState(0);
  // What the report actually resolves to: columns, filter params and grouping.
  // These come from queries.yml (the definition) or a saved segment (the user's
  // override) — not from the report row — so they are shown, not edited here.
  const [resolved, setResolved] = useState({ fields: [], params: [], groupColumns: [] });
  // Guardrail overrides (empty = engine defaults)
  const [rowLimit, setRowLimit] = useState('');
  const [timeoutMs, setTimeoutMs] = useState('');
  const [cacheTtl, setCacheTtl] = useState('');
  // Snapshot of the loaded values, to detect unsaved edits on close.
  const [snapshot, setSnapshot] = useState(null);
  // Display types come from the server (Report::TYPES), not a hardcoded list, so
  // a type added there appears here with no admin change.
  const [types, setTypes] = useState([]);
  // SqlQueryEditor reports its starting query on mount (it substitutes a sample
  // when the report has no statement). That first report is the baseline, not an
  // edit, so it gets folded into the snapshot instead of marking the form dirty.
  const awaitingSqlBaseline = useRef(false);

  const current = useMemo(
    () => JSON.stringify({ name, type, enabled, notes, selectedQueryId, sqlQuery, rowLimit, timeoutMs, cacheTtl }),
    [name, type, enabled, notes, selectedQueryId, sqlQuery, rowLimit, timeoutMs, cacheTtl]
  );
  const isDirty = snapshot !== null && snapshot !== current;

  const handleSqlChange = useCallback((value) => {
    setSqlQuery(value);
    if (awaitingSqlBaseline.current) {
      awaitingSqlBaseline.current = false;
      setSnapshot((s) => {
        if (!s) return s;
        return JSON.stringify({ ...JSON.parse(s), sqlQuery: value });
      });
    }
  }, []);

  useEffect(() => {
    if (!open || types.length) return;
    reportsApi.getTypes()
      .then((list) => setTypes(Array.isArray(list) ? list : []))
      .catch((e) => console.error('Failed to fetch report types:', e));
  }, [open, types.length]);

  // Load report details when dialog opens
  useEffect(() => {
    if (!open || !report?.uuid) return;

    setLoading(true);
    setError(null);
    setTabValue(0);

    // Via reportsApi, not raw fetch: this used to send no Authorization header
    // at all, so it always 401'd, fell into the catch below and opened the
    // dialog half-populated from the list row.
    const fetchDetail = async () => {
      const apply = (src, resolvedLists) => {
        setName(src.name || '');
        setType(src.type || 'table');
        setEnabled(src.enabled !== false);
        setNotes(src.notes || '');
        setSelectedQueryId(src.query || '');
        setSqlQuery(src.statement || '');
        setRowLimit(src.meta?.row_limit || '');
        setTimeoutMs(src.meta?.timeout_ms || '');
        setCacheTtl(src.meta?.cache_ttl || '');
        setResolved(resolvedLists);
        awaitingSqlBaseline.current = true;
        setSqlSeedKey((k) => k + 1);
        setSnapshot(JSON.stringify({
          name: src.name || '',
          type: src.type || 'table',
          enabled: src.enabled !== false,
          notes: src.notes || '',
          selectedQueryId: src.query || '',
          sqlQuery: src.statement || '',
          rowLimit: src.meta?.row_limit || '',
          timeoutMs: src.meta?.timeout_ms || '',
          cacheTtl: src.meta?.cache_ttl || '',
        }));
      };

      try {
        const detail = await reportsApi.getReport(report.uuid);
        if (!detail) throw new Error('Report detail not returned');
        // Serialized as plain strings or as { field, name } depending on the list
        const names = (list) => (list || []).map((e) => e?.name ?? e).filter(Boolean);
        apply(detail, {
          fields: names(detail.fields),
          params: names(detail.params),
          groupColumns: names(detail.group_columns),
        });
      } catch (err) {
        console.error('Failed to load report detail:', err);
        // Say so — a silent fallback looks like the report simply has no query
        // or params, which is indistinguishable from a load failure.
        setError(t('edit.partialLoad'));
        apply(report, { fields: [], params: [], groupColumns: [] });
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [open, report]);

  // When query template changes, load its SQL
  const handleQuerySelect = useCallback((queryId) => {
    setSelectedQueryId(queryId);
    if (!queryId) return;
    const query = (queries || []).find((q) => q.uuid === queryId || q.name === queryId);
    if (query?.statement) {
      setSqlQuery(query.statement);
      setSqlSeedKey((k) => k + 1);
    }
  }, [queries]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError(t('edit.nameRequired'));
      setTabValue(0);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updateData = {
        name: name.trim(),
        type,
        enabled,
        notes: notes.trim(),
      };

      if (selectedQueryId) {
        updateData.query = selectedQueryId;
      }
      if (sqlQuery.trim()) {
        updateData.statement = sqlQuery.trim();
      }
      // Limits/TTL — always sent so clearing a field resets to engine defaults
      updateData.meta = {
        ...(String(rowLimit).trim() ? { row_limit: String(rowLimit).trim() } : {}),
        ...(String(timeoutMs).trim() ? { timeout_ms: String(timeoutMs).trim() } : {}),
        ...(String(cacheTtl).trim() ? { cache_ttl: String(cacheTtl).trim() } : {}),
      };

      await onSave?.(report.uuid, updateData);
      setSnapshot(null);
      onClose?.();
    } catch (err) {
      console.error('Error updating report:', err);
      const body = err?.response?.data || err?.body || err?.responseText;
      const msg = typeof body === 'string' ? body : body?.message || err.message;
      setError(msg || t('edit.updateFailed'));
    } finally {
      setSaving(false);
    }
  }, [name, type, enabled, notes, selectedQueryId, sqlQuery, rowLimit, timeoutMs, cacheTtl, report, onSave, onClose, t]);

  const handleClose = useCallback(async () => {
    if (isDirty && !(await confirm({ title: t('edit.discardTitle'), confirmLabel: t('edit.discard'), description: null,
                                     message: t('edit.discardMessage') }))) return;
    setError(null);
    setSnapshot(null);
    onClose?.();
  }, [confirm, isDirty, onClose, t]);

  const resolvedRows = [
    { label: t('edit.columns'), items: resolved.fields, hint: t('edit.columnsHint') },
    { label: t('edit.params'), items: resolved.params, hint: t('edit.paramsHint') },
    { label: t('edit.groupBy'), items: resolved.groupColumns, hint: t('edit.groupByHint') },
  ];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth PaperProps={{ sx: { minHeight: '60vh' } }}>
      <DialogTitle sx={{ pb: 1 }}>
        {t('edit.title')}
        {isDirty && (
          <Chip label={t('edit.unsaved')} size="small" color="warning" variant="outlined" sx={{ ms: 1, height: 20, fontSize: 11 }} />
        )}
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} aria-label={t('edit.tabsLabel')}>
          <Tab label={t('edit.tabReport')} />
          <Tab label={t('edit.tabQuery')} />
          <Tab label={t('edit.tabLimits')} />
        </Tabs>
      </Box>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* Tab 0: Report — identity and what it resolves to */}
            {tabValue === 0 && (
              <>
                <TextField
                  label={t('edit.name')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  fullWidth
                  required
                  size="small"
                />

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    {/* "Display", not "Chart Type" — Table is one of the options */}
                    <InputLabel>{t('edit.display')}</InputLabel>
                    <Select value={type} label={t('edit.display')} onChange={(e) => setType(e.target.value)}>
                      {/* The report's own type stays selectable even if the
                          server list hasn't arrived, so opening the dialog never
                          silently blanks it. */}
                      {(types.length ? types : [type].filter(Boolean)).map((displayType) => (
                        <MenuItem key={displayType} value={displayType}>
                          {displayTypeName(t, displayType)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControlLabel
                    control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
                    label={t('edit.enabled')}
                  />
                </Box>

                <TextField
                  label={t('edit.notes')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  fullWidth
                  size="small"
                  multiline
                  rows={2}
                />

                {/* What this report resolves to. The dialog used to show only the
                    SQL, so the columns, filter params and grouping it actually
                    runs with were invisible while editing it. */}
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
                    {t('edit.resolved')}
                  </Typography>
                  {resolvedRows.map(({ label, items, hint }) => (
                    <Box key={label} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', mb: 0.75, flexWrap: 'wrap' }}>
                      <Tooltip title={hint}>
                        <Typography variant="caption" sx={{ minWidth: 100, color: 'text.secondary', fontWeight: 600 }}>
                          {label}
                        </Typography>
                      </Tooltip>
                      {items.length === 0 ? (
                        <Typography variant="caption" color="text.disabled">{t('edit.none')}</Typography>
                      ) : (
                        items.map((v) => (
                          <Chip key={v} label={v} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                        ))
                      )}
                    </Box>
                  ))}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {t('edit.resolvedNote')}
                  </Typography>
                </Paper>
              </>
            )}

            {/* Tab 1: Query — template + the shared editor, which can Run it */}
            {tabValue === 1 && (
              <>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('edit.template')}</InputLabel>
                  <Select
                    value={selectedQueryId}
                    label={t('edit.template')}
                    onChange={(e) => handleQuerySelect(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>{t('edit.custom')}</em>
                    </MenuItem>
                    {(queries || []).map((query) => (
                      <MenuItem key={query.uuid} value={query.uuid || query.name}>
                        {query.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <SqlQueryEditor
                  key={sqlSeedKey}
                  initialStatement={sqlQuery}
                  onChange={handleSqlChange}
                />
              </>
            )}

            {/* Tab 2: Limits — per-report guardrail overrides (empty = defaults) */}
            {tabValue === 2 && (
              <>
                <Typography variant="caption" color="text.secondary">
                  {t('edit.limitsNote')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <TextField label={t('limits.rowLimit')} size="small" type="number" value={rowLimit}
                    onChange={(e) => setRowLimit(e.target.value)} placeholder="10000" sx={{ width: 130 }} />
                  <TextField label={t('limits.timeout')} size="small" type="number" value={timeoutMs}
                    onChange={(e) => setTimeoutMs(e.target.value)} placeholder="15000" sx={{ width: 140 }} />
                  <TextField label={t('limits.cacheTtl')} size="small" type="number" value={cacheTtl}
                    onChange={(e) => setCacheTtl(e.target.value)} placeholder="60" sx={{ width: 140 }} />
                </Box>
              </>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>{t('edit.cancel')}</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving || loading || !name.trim()}>
          {saving ? t('edit.saving') : t('edit.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditReportDialog;
